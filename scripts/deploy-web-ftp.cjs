/**
 * Export the Expo web SPA and upload it over FTP.
 *
 * Usage:
 *   node scripts/deploy-web-ftp.cjs
 *   node scripts/deploy-web-ftp.cjs --skip-export
 *
 * Needs .deploy-ftp.json (see .deploy-ftp.example.json).
 *
 * Each run exports the web app, uploads the bundle and static files,
 * uploads host/server.js, then touches tmp/restart.txt so Passenger reloads.
 *
 * Disk quota on this host is tight: old entry-*.js files are deleted BEFORE
 * the new ~17MB bundle is uploaded. Do not use the base64 part-loader path.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, '.deploy-ftp.json');
const CLARITY_ID = 'ypeknhok6c';

const args = new Set(process.argv.slice(2));
const skipExport = args.has('--skip-export');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error('Missing .deploy-ftp.json (copy .deploy-ftp.example.json)');
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!cfg.host || !cfg.user || !cfg.password) {
    throw new Error('FTP host/user/password required in .deploy-ftp.json');
  }
  return {
    host: cfg.host,
    port: Number(cfg.port || 21),
    user: cfg.user,
    password: String(cfg.password),
    remoteDir: cfg.remoteDir || '/',
  };
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function readBundleMeta() {
  const htmlPath = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error('dist/index.html missing — run export first');
  }
  const html = fs.readFileSync(htmlPath);
  if (!html.includes(CLARITY_ID)) {
    throw new Error(`dist/index.html missing Clarity id ${CLARITY_ID}`);
  }
  const match = html.toString('utf8').match(/entry-[a-f0-9]+\.js/);
  if (!match) {
    throw new Error('dist/index.html has no entry-*.js script');
  }
  const name = match[0];
  const bundlePath = path.join(ROOT, 'dist', '_expo', 'static', 'js', 'web', name);
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Missing web bundle: ${bundlePath}`);
  }
  return {
    htmlPath,
    name,
    bundlePath,
    size: fs.statSync(bundlePath).size,
  };
}

const py = `
import json, sys, time
from io import BytesIO
from pathlib import Path
from ftplib import FTP

cfg = json.loads(sys.argv[1])
meta = json.loads(sys.argv[2])
root = "/" + str(cfg["remoteDir"]).strip("/")
name = meta["name"]
bundle = Path(meta["bundlePath"])
total = int(meta["size"])
html = Path(meta["htmlPath"]).read_bytes()
extras = meta.get("extras") or []

def connect():
    ftp = FTP()
    ftp.connect(cfg["host"], int(cfg["port"]), timeout=180)
    ftp.login(cfg["user"], cfg["password"])
    ftp.set_pasv(True)
    welcome = (ftp.getwelcome() or "").splitlines()[0]
    print("welcome", welcome, flush=True)
    return ftp

def ensure_cwd(ftp, relative=""):
    ftp.cwd(root)
    for part in [p for p in relative.strip("/").split("/") if p]:
        try:
            ftp.cwd(part)
        except Exception:
            ftp.mkd(part)
            ftp.cwd(part)

def progress(label):
    sent = {"n": 0}
    def tick(block):
        sent["n"] += len(block)
        mb = sent["n"] // (1024 * 1024)
        prev = (sent["n"] - len(block)) // (1024 * 1024)
        if mb != prev:
            print(label, sent["n"], flush=True)
    return tick

last = None
for attempt in range(1, 7):
    try:
        print(f"attempt {attempt}", flush=True)
        ftp = connect()
        ensure_cwd(ftp, "dist/_expo/static/js/web")
        for item in list(ftp.nlst()):
            if item in (".", ".."):
                continue
            if item.startswith("entry-") and item.endswith(".js") and item != name:
                ftp.delete(item)
                print("deleted", item, flush=True)
            if item.startswith(".pureftpd"):
                try:
                    ftp.delete(item)
                    print("deleted", item, flush=True)
                except Exception:
                    pass
        try:
            existing = ftp.size(name)
        except Exception:
            existing = None
        if existing is not None and existing != total:
            ftp.delete(name)
            print("deleted partial", existing, flush=True)
        elif existing == total:
            print("bundle already complete", existing, flush=True)
        else:
            with bundle.open("rb") as fh:
                ftp.storbinary(f"STOR {name}", fh, blocksize=256 * 1024, callback=progress("sent"))
            remote = ftp.size(name)
            print("remote", remote, remote == total, flush=True)
            if remote != total:
                raise SystemExit("bundle size mismatch")

        ensure_cwd(ftp, "dist")
        ftp.storbinary("STOR index.html", BytesIO(html))
        print("index", ftp.size("index.html"), flush=True)

        for extra in extras:
            remote_rel = extra["remote"]
            parent, _, filename = remote_rel.rpartition("/")
            ensure_cwd(ftp, parent)
            local_path = Path(extra["local"])
            payload_size = local_path.stat().st_size
            try:
                current = ftp.size(filename)
            except Exception:
                current = None
            if current == payload_size:
                print("skip", remote_rel, flush=True)
                continue
            with local_path.open("rb") as fh:
                ftp.storbinary(
                    f"STOR {filename}",
                    fh,
                    blocksize=256 * 1024,
                    callback=progress(remote_rel) if payload_size > 1024 * 1024 else None,
                )
            print("put", remote_rel, ftp.size(filename), flush=True)

        # Passenger watches this file and reloads the Node app.
        ensure_cwd(ftp, "tmp")
        stamp = str(int(time.time())).encode()
        ftp.storbinary("STOR restart.txt", BytesIO(stamp))
        print("restart touched", flush=True)

        ftp.quit()
        print("done", flush=True)
        break
    except SystemExit:
        raise
    except Exception as err:
        last = err
        print("fail", type(err).__name__, err, flush=True)
        time.sleep(2 * attempt)
else:
    raise SystemExit(f"all attempts failed: {last}")
`;

function collectExtras(entryName) {
  const extras = [];
  const dist = path.join(ROOT, 'dist');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name === 'index.html' || entry.name === entryName || entry.name === '.DS_Store') {
        continue;
      }
      const rel = path.relative(dist, full).split(path.sep).join('/');
      extras.push({ local: full, remote: `dist/${rel}` });
    }
  };
  if (fs.existsSync(dist)) walk(dist);
  const server = path.join(ROOT, 'host', 'server.js');
  if (fs.existsSync(server)) extras.push({ local: server, remote: 'server.js' });
  return extras;
}

function main() {
  if (!skipExport) {
    console.log('==> expo export -p web');
    run('npx', ['expo', 'export', '-p', 'web']);
  } else {
    console.log('==> skip export (using existing dist/)');
  }

  const meta = readBundleMeta();
  const extras = collectExtras(meta.name);
  const cfg = loadConfig();
  console.log(
    `==> FTP ${cfg.user}@${cfg.host}:${cfg.port}${cfg.remoteDir} → ${meta.name} (${meta.size} bytes)`,
  );

  const result = spawnSync(
    'python3',
    [
      '-c',
      py,
      JSON.stringify(cfg),
      JSON.stringify({
        htmlPath: meta.htmlPath,
        name: meta.name,
        bundlePath: meta.bundlePath,
        size: meta.size,
        extras,
      }),
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  console.log('==> verify http://movie.mr-div.ir/');
  const curl = spawnSync(
    'curl',
    ['-sS', '-m', '20', 'http://movie.mr-div.ir/'],
    { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 },
  );
  if (curl.status === 0 && curl.stdout) {
    const live = curl.stdout.match(/entry-[a-f0-9]+\.js/);
    const clarity = curl.stdout.includes(CLARITY_ID);
    console.log('live entry', live ? live[0] : '(missing)');
    console.log('clarity', clarity ? CLARITY_ID : '(missing)');
    if (!live || live[0] !== meta.name) {
      console.error('Homepage still points at a different entry bundle.');
      process.exit(1);
    }
    if (!clarity) {
      console.error('Homepage lost Clarity id.');
      process.exit(1);
    }
  } else {
    console.warn('Could not verify homepage; FTP upload finished anyway.');
  }
  console.log('deploy ok');
}

main();
