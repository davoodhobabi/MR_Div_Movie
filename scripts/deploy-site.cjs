/**
 * Full cPanel deploy for movie.mr-div.ir.
 *
 * One command does everything needed for a successful live update:
 *   1. Sync host Node handlers from lib/catalog
 *   2. Ensure linux ffmpeg binary in host/vendor (optional)
 *   3. Ensure stable APKs in public/downloads (android.apk + android-tv.apk)
 *   4. Expo web export → dist/
 *   5. FTP: SPA bundle, static assets, downloads/*.apk, host Node files, restart.txt
 *   6. Verify homepage entry hash, Clarity, health, download endpoints
 *
 * Usage:
 *   node scripts/deploy-site.cjs
 *   node scripts/deploy-site.cjs --skip-export
 *   node scripts/deploy-site.cjs --skip-apks
 *   node scripts/deploy-site.cjs --skip-ffmpeg
 *   node scripts/deploy-site.cjs --skip-verify
 *
 * Needs .deploy-ftp.json (see .deploy-ftp.example.json).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, '.deploy-ftp.json');
const CLARITY_ID = 'ypeknhok6c';
const SITE_ORIGIN = 'https://movie.mr-div.ir';

const args = new Set(process.argv.slice(2));
const skipExport = args.has('--skip-export');
const skipApks = args.has('--skip-apks');
const skipFfmpeg = args.has('--skip-ffmpeg');
const skipVerify = args.has('--skip-verify');

const HOST_NODE_FILES = [
  'server.js',
  'package.json',
  'mkvSubtitles.js',
  'mediaStream.cjs',
  'mediaHls.cjs',
  'folderListingProxy.cjs',
  'imdbPoster.cjs',
];

function die(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    die('Missing .deploy-ftp.json (copy .deploy-ftp.example.json)');
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!cfg.host || !cfg.user || !cfg.password) {
    die('FTP host/user/password required in .deploy-ftp.json');
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
    maxBuffer: 64 * 1024 * 1024,
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function syncHostSources() {
  const pairs = [
    ['lib/catalog/mediaStream.cjs', 'host/mediaStream.cjs'],
    ['lib/catalog/mediaHls.cjs', 'host/mediaHls.cjs'],
    ['lib/catalog/folderListingProxy.cjs', 'host/folderListingProxy.cjs'],
    ['lib/catalog/imdbPoster.cjs', 'host/imdbPoster.cjs'],
  ];
  for (const [from, to] of pairs) {
    const src = path.join(ROOT, from);
    const dst = path.join(ROOT, to);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, dst);
    console.log('sync', from, '→', to);
  }
}

function latestMatching(dir, re) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((name) => re.test(name))
    .map((name) => {
      const full = path.join(dir, name);
      return { full, mtime: fs.statSync(full).mtimeMs, size: fs.statSync(full).size };
    })
    .filter((item) => item.size > 1_000_000)
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.full || null;
}

function ensureSiteApks() {
  const publicDownloads = path.join(ROOT, 'public', 'downloads');
  fs.mkdirSync(publicDownloads, { recursive: true });
  const targets = [
    path.join(publicDownloads, 'android.apk'),
    path.join(publicDownloads, 'android-tv.apk'),
  ];

  const source =
    latestMatching(path.join(ROOT, 'releases', 'android'), /MrDiv_Movie-.*-phone\.apk$/) ||
    latestMatching(path.join(ROOT, 'releases', 'tv'), /MrDiv_Movie-.*-tv\.apk$/) ||
    latestMatching(path.join(ROOT, 'releases', 'tv'), /MrDiv_Movie-.*-android-tv\.apk$/) ||
    (fs.existsSync(path.join(ROOT, 'host', 'downloads', 'MrDiv_Movie.apk'))
      ? path.join(ROOT, 'host', 'downloads', 'MrDiv_Movie.apk')
      : null) ||
    (fs.existsSync(path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'))
      ? path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
      : null);

  for (const target of targets) {
    if (fs.existsSync(target) && fs.statSync(target).size > 1_000_000) {
      console.log('apk ready', path.relative(ROOT, target), fs.statSync(target).size);
      continue;
    }
    if (!source) {
      die(
        `Missing ${path.relative(ROOT, target)}. Build first (./scripts/release-apk.sh) or pass --skip-apks.`,
      );
    }
    fs.copyFileSync(source, target);
    console.log('apk copy', path.relative(ROOT, source), '→', path.relative(ROOT, target));
  }

  const distDownloads = path.join(ROOT, 'host', 'dist', 'downloads');
  const hostDownloads = path.join(ROOT, 'host', 'downloads');
  fs.mkdirSync(distDownloads, { recursive: true });
  fs.mkdirSync(hostDownloads, { recursive: true });
  for (const name of ['android.apk', 'android-tv.apk']) {
    const src = path.join(publicDownloads, name);
    fs.copyFileSync(src, path.join(distDownloads, name));
    fs.copyFileSync(src, path.join(hostDownloads, name));
  }
}

function ensureFfmpeg() {
  run('node', ['scripts/ensure-host-ffmpeg.cjs']);
}

function readBundleMeta() {
  const htmlPath = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(htmlPath)) {
    die('dist/index.html missing — export failed or --skip-export without dist/');
  }
  const html = fs.readFileSync(htmlPath);
  if (!html.includes(CLARITY_ID)) {
    die(`dist/index.html missing Clarity id ${CLARITY_ID}`);
  }
  const match = html.toString('utf8').match(/entry-[a-f0-9]+\.js/);
  if (!match) {
    die('dist/index.html has no entry-*.js script');
  }
  const name = match[0];
  const bundlePath = path.join(ROOT, 'dist', '_expo', 'static', 'js', 'web', name);
  if (!fs.existsSync(bundlePath)) {
    die(`Missing web bundle: ${bundlePath}`);
  }
  return {
    htmlPath,
    name,
    bundlePath,
    size: fs.statSync(bundlePath).size,
  };
}

function collectUploadFiles(entryName) {
  const files = [];
  const seen = new Set();

  const add = (local, remote) => {
    if (!fs.existsSync(local) || !fs.statSync(local).isFile()) return;
    if (seen.has(remote)) return;
    seen.add(remote);
    files.push({
      local,
      remote,
      size: fs.statSync(local).size,
    });
  };

  const walkDist = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDist(full);
        continue;
      }
      if (entry.name === '.DS_Store') continue;
      if (entry.name === 'index.html') continue;
      if (entry.name === entryName) continue;
      if (skipApks && entry.name.endsWith('.apk')) continue;
      const rel = path.relative(path.join(ROOT, 'dist'), full).split(path.sep).join('/');
      add(full, `dist/${rel}`);
    }
  };

  walkDist(path.join(ROOT, 'dist'));

  for (const name of HOST_NODE_FILES) {
    add(path.join(ROOT, 'host', name), name);
  }

  const ffmpeg = path.join(ROOT, 'host', 'vendor', 'ffmpeg');
  if (!skipFfmpeg && fs.existsSync(ffmpeg)) {
    add(ffmpeg, 'vendor/ffmpeg');
  }

  return files.sort((a, b) => a.size - b.size);
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
files = meta.get("files") or []

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

def progress(label, size):
    sent = {"n": 0, "t": time.time()}
    def tick(block):
        sent["n"] += len(block)
        now = time.time()
        if size >= 1024 * 1024 and (now - sent["t"] >= 2 or sent["n"] >= size):
            pct = 100.0 * sent["n"] / size if size else 0
            print(f"{label} {sent['n']}/{size} ({pct:.1f}%)", flush=True)
            sent["t"] = now
    return tick

def put_file(ftp, local_path, remote_rel, size):
    parent, _, filename = remote_rel.rpartition("/")
    ensure_cwd(ftp, parent)
    try:
        current = ftp.size(filename)
    except Exception:
        current = None
    if current == size:
        print("skip", remote_rel, size, flush=True)
        return ftp
    if current is not None and current != size:
        try:
            ftp.delete(filename)
            print("deleted partial", remote_rel, current, flush=True)
        except Exception:
            pass
    with local_path.open("rb") as fh:
        ftp.storbinary(
            f"STOR {filename}",
            fh,
            blocksize=256 * 1024,
            callback=progress(remote_rel, size),
        )
    remote = ftp.size(filename)
    print("put", remote_rel, remote, flush=True)
    if remote != size:
        raise RuntimeError(f"size mismatch {remote_rel}: remote={remote} local={size}")
    return ftp

last = None
for attempt in range(1, 8):
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
            existing = None
        if existing == total:
            print("bundle already complete", existing, flush=True)
        else:
            with bundle.open("rb") as fh:
                ftp.storbinary(
                    f"STOR {name}",
                    fh,
                    blocksize=256 * 1024,
                    callback=progress("bundle", total),
                )
            remote = ftp.size(name)
            print("remote bundle", remote, remote == total, flush=True)
            if remote != total:
                raise RuntimeError("bundle size mismatch")

        ensure_cwd(ftp, "dist")
        ftp.storbinary("STOR index.html", BytesIO(html))
        print("index", ftp.size("index.html"), flush=True)

        for item in files:
            local_path = Path(item["local"])
            remote_rel = item["remote"]
            size = int(item["size"])
            # Reconnect before each large payload — Pure-FTPd / BitNinja drop long sessions.
            if size > 2 * 1024 * 1024:
                try:
                    ftp.quit()
                except Exception:
                    try:
                        ftp.close()
                    except Exception:
                        pass
                ftp = connect()
            ftp = put_file(ftp, local_path, remote_rel, size)

        ensure_cwd(ftp, "tmp")
        stamp = str(int(time.time())).encode()
        ftp.storbinary("STOR restart.txt", BytesIO(stamp))
        print("restart touched", flush=True)

        ftp.quit()
        print("ftp done", flush=True)
        break
    except Exception as err:
        last = err
        print("fail", type(err).__name__, err, flush=True)
        time.sleep(min(30, 2 * attempt))
else:
    raise SystemExit(
        f"all FTP attempts failed: {last}\\n"
        "If you see EOFError with an empty FTP banner, BitNinja is blocking this IP — "
        "whitelist it in cPanel / BitNinja, then re-run."
    )
`;

function ftpUpload(cfg, meta, files) {
  console.log(
    `==> FTP ${cfg.user}@${cfg.host}:${cfg.port}${cfg.remoteDir} → ${meta.name} (${meta.size} bytes), ${files.length} extras`,
  );
  for (const file of files) {
    console.log(
      `   - ${file.remote} (${Math.round(file.size / 1024)} KB)`,
    );
  }

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
        files,
      }),
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function curl(args) {
  return spawnSync('curl', ['-sS', '-m', '30', ...args], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function verify(meta, apkSizes) {
  console.log(`==> verify ${SITE_ORIGIN}/`);

  const home = curl([SITE_ORIGIN + '/']);
  if (home.status !== 0 || !home.stdout) {
    die('Homepage verify failed (curl).');
  }
  const live = home.stdout.match(/entry-[a-f0-9]+\.js/);
  const clarity = home.stdout.includes(CLARITY_ID);
  console.log('live entry', live ? live[0] : '(missing)');
  console.log('clarity', clarity ? CLARITY_ID : '(missing)');
  if (!live || live[0] !== meta.name) {
    die(`Homepage still points at ${live ? live[0] : 'missing'}; expected ${meta.name}`);
  }
  if (!clarity) {
    die('Homepage lost Clarity id.');
  }

  const health = curl([SITE_ORIGIN + '/health']);
  if (health.status === 0 && health.stdout) {
    console.log('health', health.stdout.trim().slice(0, 200));
  } else {
    console.warn('health endpoint unreachable (continuing)');
  }

  for (const [route, size] of Object.entries(apkSizes)) {
    if (!size) continue;
    const url = SITE_ORIGIN + route;
    const head = curl(['-I', '-L', url]);
    const body = `${head.stdout || ''}\n${head.stderr || ''}`;
    const lengthMatch = body.match(/content-length:\s*(\d+)/i);
    const statusMatch = body.match(/HTTP\/[\d.]+\s+(\d+)/i);
    const status = statusMatch ? Number(statusMatch[1]) : null;
    const length = lengthMatch ? Number(lengthMatch[1]) : null;
    console.log('download', route, 'status', status, 'length', length, 'expected', size);
    if (status && status >= 400) {
      die(`Download ${route} returned HTTP ${status}`);
    }
    if (length != null && length !== size) {
      die(`Download ${route} size mismatch: live=${length} local=${size}`);
    }
  }

  console.log('verify ok');
}

function main() {
  console.log('==> deploy-site');
  const cfg = loadConfig();

  console.log('==> sync host sources');
  syncHostSources();

  if (!skipFfmpeg) {
    console.log('==> ensure host ffmpeg');
    ensureFfmpeg();
  } else {
    console.log('==> skip ffmpeg');
  }

  if (!skipApks) {
    console.log('==> ensure site APKs');
    ensureSiteApks();
  } else {
    console.log('==> skip APKs');
  }

  if (!skipExport) {
    console.log('==> expo export -p web');
    run('npx', ['expo', 'export', '-p', 'web']);
  } else {
    console.log('==> skip export (using existing dist/)');
  }

  // Expo copies public/ into dist/; refresh APKs into dist/downloads after export too.
  if (!skipApks) {
    const distDownloads = path.join(ROOT, 'dist', 'downloads');
    fs.mkdirSync(distDownloads, { recursive: true });
    for (const name of ['android.apk', 'android-tv.apk']) {
      const src = path.join(ROOT, 'public', 'downloads', name);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(distDownloads, name));
      }
    }
  }

  const meta = readBundleMeta();
  const files = collectUploadFiles(meta.name);
  ftpUpload(cfg, meta, files);

  if (!skipVerify) {
    const apkSizes = {};
    if (!skipApks) {
      for (const [route, name] of [
        ['/downloads/android.apk', 'android.apk'],
        ['/downloads/android-tv.apk', 'android-tv.apk'],
      ]) {
        const local = path.join(ROOT, 'public', 'downloads', name);
        if (fs.existsSync(local)) apkSizes[route] = fs.statSync(local).size;
      }
    }
    verify(meta, apkSizes);
  } else {
    console.log('==> skip verify');
  }

  console.log('deploy ok — site is live');
}

main();
