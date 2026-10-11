/**
 * Download a Linux x86_64 static ffmpeg into host/vendor/ffmpeg for cPanel remux.
 * Usage: node scripts/ensure-host-ffmpeg.cjs
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'host', 'vendor');
const DEST = path.join(VENDOR, 'ffmpeg');
const URL =
  process.env.FFMPEG_STATIC_URL ||
  'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-linux-x64';

function download(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    const get = (href, redirects = 0) => {
      https
        .get(href, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirects < 5
          ) {
            res.resume();
            get(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP_${res.statusCode}`));
            res.resume();
            return;
          }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
        })
        .on('error', reject);
    };
    get(url);
  });
}

async function main() {
  fs.mkdirSync(VENDOR, { recursive: true });
  if (fs.existsSync(DEST) && fs.statSync(DEST).size > 1_000_000) {
    console.log('ffmpeg already present:', DEST);
    return;
  }
  const tmp = `${DEST}.download`;
  console.log('Downloading static ffmpeg (linux-x64)...');
  console.log(URL);
  await download(URL, tmp);
  fs.renameSync(tmp, DEST);
  try {
    fs.chmodSync(DEST, 0o755);
  } catch {
    // Windows / non-posix
  }
  const size = fs.statSync(DEST).size;
  console.log(`saved ${DEST} (${Math.round(size / 1024 / 1024)}MB)`);
  try {
    execFileSync(DEST, ['-version'], { stdio: 'inherit', timeout: 10000 });
  } catch {
    console.warn(
      'Note: binary is linux-x64; -version may fail on macOS — that is OK for cPanel deploy.',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
