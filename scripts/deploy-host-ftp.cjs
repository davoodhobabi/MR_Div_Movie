/**
 * Upload host/ to the cPanel FTP from .deploy-ftp.json (gitignored).
 * Usage: node scripts/deploy-host-ftp.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, '.deploy-ftp.json');

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
for dirpath, dirnames, filenames in os.walk(local):
    rel = os.path.relpath(dirpath, local)
    remote = remote_root if rel == "." else f"{remote_root.rstrip('/')}/{rel.replace(os.sep, '/')}"
    ensure_dir(remote)
    for name in filenames:
        if name == ".DS_Store":
            continue
        local_file = Path(dirpath) / name
        with open(local_file, "rb") as fh:
            ftp.storbinary(f"STOR {name}", fh)
        uploaded += 1
        print("put", f"{rel}/{name}" if rel != "." else name)

ftp.quit()
print(f"uploaded {uploaded} files")
`;

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
