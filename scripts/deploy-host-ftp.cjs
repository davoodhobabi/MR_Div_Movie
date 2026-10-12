/**
 * Upload host/ to the cPanel FTP from .deploy-ftp.json (gitignored).
 * Usage: node scripts/deploy-host-ftp.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, '.deploy-ftp.json');

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
    localDir: path.resolve(ROOT, cfg.localDir || 'host'),
  };
}

const py = `
import json, os, sys
from ftplib import FTP
from pathlib import Path

cfg = json.loads(sys.argv[1])
local = Path(cfg["localDir"])
if not local.is_dir():
    raise SystemExit(f"localDir missing: {local}")

ftp = FTP()
ftp.connect(cfg["host"], int(cfg["port"]), timeout=60)
ftp.login(cfg["user"], cfg["password"])
ftp.set_pasv(True)
print("cwd", ftp.pwd(), "welcome", (ftp.getwelcome() or "").splitlines()[0])

def ensure_dir(remote):
    parts = [p for p in remote.replace("\\\\", "/").split("/") if p]
    ftp.cwd("/")
    for part in parts:
        try:
            ftp.cwd(part)
        except Exception:
            ftp.mkd(part)
            ftp.cwd(part)

remote_root = cfg["remoteDir"] or "/"
if remote_root != "/":
    ensure_dir(remote_root)
else:
    ftp.cwd("/")

uploaded = 0
failed = []
for dirpath, dirnames, filenames in os.walk(local):
    rel = os.path.relpath(dirpath, local)
    parts = [] if rel == "." else rel.split(os.sep)
    if "vendor" in parts:
        continue
    remote = remote_root if rel == "." else f"{remote_root.rstrip('/')}/{rel.replace(os.sep, '/')}"
    ensure_dir(remote)
    for name in filenames:
        if name == ".DS_Store":
            continue
        local_file = Path(dirpath) / name
        label = f"{rel}/{name}" if rel != "." else name
        if local_file.stat().st_size > 1500 * 1024:
            print("skip-large", label, local_file.stat().st_size)
            continue
        last_err = None
        for attempt in range(1, 5):
            try:
                with open(local_file, "rb") as fh:
                    ftp.storbinary(f"STOR {name}", fh, blocksize=256 * 1024)
                last_err = None
                break
            except Exception as err:
                last_err = err
                print("retry", attempt, label, err)
                try:
                    ftp.close()
                except Exception:
                    pass
                ftp = FTP()
                ftp.connect(cfg["host"], int(cfg["port"]), timeout=120)
                ftp.login(cfg["user"], cfg["password"])
                ftp.set_pasv(True)
                ensure_dir(remote)
        if last_err is not None:
            failed.append((dirpath, name, remote, label))
            print("failed", label)
            continue
        uploaded += 1
        print("put", label)

for dirpath, name, remote, label in list(failed):
    local_file = Path(dirpath) / name
    ensure_dir(remote)
    try:
        with open(local_file, "rb") as fh:
            ftp.storbinary(f"STOR {name}", fh, blocksize=64 * 1024)
        uploaded += 1
        print("put-retry", label)
        failed = [item for item in failed if item[3] != label]
    except Exception as err:
        print("still-failed", label, err)

ftp.quit()
print(f"uploaded {uploaded} files")
if failed:
    raise SystemExit(1)
`;

function syncWebDist() {
  const dist = path.join(ROOT, 'dist');
  const dest = path.join(ROOT, 'host', 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.warn('dist/index.html missing; web bundle was not refreshed');
    return;
  }
  const jsDir = path.join(dest, '_expo', 'static', 'js', 'web');
  fs.rmSync(jsDir, { recursive: true, force: true });
  fs.cpSync(dist, dest, { recursive: true });
  splitLargeBundles(dest);
  console.log('sync dist → host/dist');
}

/** Pure-FTPd on this host resets once a single file passes ~2MB, and rejects some extensions. */
function splitLargeBundles(hostDist) {
  const jsDir = path.join(hostDist, '_expo', 'static', 'js', 'web');
  const htmlPath = path.join(hostDist, 'index.html');
  if (!fs.existsSync(jsDir) || !fs.existsSync(htmlPath)) return;
  let html = fs.readFileSync(htmlPath, 'utf8');
  const entries = fs
    .readdirSync(jsDir)
    .filter((name) => /^entry-[a-f0-9]+\.js$/.test(name));
  for (const name of entries) {
    const src = `/_expo/static/js/web/${name}`;
    const filePath = path.join(jsDir, name);
    if (!html.includes(src)) {
      fs.unlinkSync(filePath);
      continue;
    }
    const data = fs.readFileSync(filePath);
    const chunkSize = 600 * 1024;
    const partCount = Math.ceil(data.length / chunkSize);
    const stem = name.replace(/\.js$/, '');
    for (let i = 0; i < partCount; i += 1) {
      const partName = `${stem}.p${String(i).padStart(2, '0')}.js`;
      const slice = data.subarray(i * chunkSize, (i + 1) * chunkSize);
      fs.writeFileSync(path.join(jsDir, partName), Buffer.from(slice).toString('base64'));
    }
    fs.unlinkSync(filePath);
    const loader = `<script>(function(){var c=${partCount};var p="/_expo/static/js/web/${stem}.p";var o=[];function step(i){if(i>=c){var s=document.createElement("script");s.src=URL.createObjectURL(new Blob(o,{type:"text/javascript"}));document.body.appendChild(s);return;}fetch(p+String(i).padStart(2,"0")+".js").then(function(r){if(!r.ok)throw new Error("part");return r.text()}).then(function(t){var b=atob(t),u=new Uint8Array(b.length);for(var n=0;n<b.length;n++)u[n]=b.charCodeAt(n);o.push(u);step(i+1)}).catch(function(){setTimeout(function(){step(i)},1500)})}step(0)})();</script>`;
    html = html.replace(`<script src="${src}" defer></script>`, loader);
    fs.writeFileSync(htmlPath, html);
    console.log('split', name, 'into', partCount, 'parts');
  }
}

function touchPassengerRestart() {
  const restart = path.join(ROOT, 'host', 'tmp', 'restart.txt');
  fs.mkdirSync(path.dirname(restart), { recursive: true });
  fs.writeFileSync(restart, `${Date.now()}\n`);
  console.log('touch', 'host/tmp/restart.txt');
}

syncHostSources();
syncWebDist();
touchPassengerRestart();
const cfg = loadConfig();
console.log(
  `Deploy ${cfg.localDir} → ftp://${cfg.user}@${cfg.host}:${cfg.port}${cfg.remoteDir}`,
);
const result = spawnSync('python3', ['-c', py, JSON.stringify(cfg)], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  process.exit(result.status || 1);
}
