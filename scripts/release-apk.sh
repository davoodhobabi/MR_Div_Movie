#!/usr/bin/env bash
# Build a versioned release APK to ~/Desktop/MrDiv_Movie-<version>.apk
#
#   ./scripts/release-apk.sh              # build current version
#   ./scripts/release-apk.sh bump         # bump patch, then build
#   ./scripts/release-apk.sh bump minor   # bump minor, then build
#   ./scripts/release-apk.sh bump 1.2.0   # set exact version, then build
#   ./scripts/release-apk.sh bump --no-build patch

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DO_BUILD=1
DO_BUMP=0
BUMP_MODE="patch"

while [[ $# -gt 0 ]]; do
  case "$1" in
    bump) DO_BUMP=1; shift ;;
    --no-build) DO_BUILD=0; shift ;;
    patch|minor|major)
      DO_BUMP=1
      BUMP_MODE="$1"
      shift
      ;;
    [0-9]*.[0-9]*.[0-9]*)
      DO_BUMP=1
      BUMP_MODE="$1"
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$DO_BUMP" -eq 1 ]]; then
  MODE="$BUMP_MODE" node <<'NODE'
const fs = require('fs');
const path = require('path');

const mode = process.env.MODE;
const root = process.cwd();

function parse(v) {
  const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error('Invalid version: ' + v);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}
function fmt(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

const appPath = path.join(root, 'app.json');
const pkgPath = path.join(root, 'package.json');
const gradlePath = path.join(root, 'android/app/build.gradle');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const current = parse(app.expo?.version || pkg.version || '0.0.0');

let next;
if (/^\d+\.\d+\.\d+$/.test(mode)) next = parse(mode);
else if (mode === 'major') next = { major: current.major + 1, minor: 0, patch: 0 };
else if (mode === 'minor') next = { major: current.major, minor: current.minor + 1, patch: 0 };
else if (mode === 'patch') next = { major: current.major, minor: current.minor, patch: current.patch + 1 };
else throw new Error('Usage: patch | minor | major | x.y.z');

const version = fmt(next);
const prevCode = Number(app.expo?.android?.versionCode || 0);
const versionCode = Math.max(
  prevCode + 1,
  next.major * 10000 + next.minor * 100 + next.patch,
);

app.expo.version = version;
app.expo.android = app.expo.android || {};
app.expo.android.versionCode = versionCode;
pkg.version = version;
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
  fs.writeFileSync(gradlePath, gradle);
}

console.log(`bumped ${fmt(current)} → ${version} (code ${versionCode})`);
NODE
fi

VERSION="$(node -e "console.log(require('./app.json').expo.version)")"
VERSION_CODE="$(node -e "console.log(require('./app.json').expo.android.versionCode)")"
echo "==> version $VERSION (code $VERSION_CODE)"

# Keep android/app/build.gradle in sync even without bump
if [[ -f android/app/build.gradle ]]; then
  perl -i -pe "s/versionCode\\s+\\d+/versionCode $VERSION_CODE/" android/app/build.gradle
  perl -i -pe "s/versionName\\s+\\\"[^\\\"]+\\\"/versionName \\\"$VERSION\\\"/" android/app/build.gradle
fi

if [[ "$DO_BUILD" -eq 0 ]]; then
  exit 0
fi

export JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk-17/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

node scripts/patch-expo-video-ffmpeg.js
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties

(
  cd android
  ./gradlew assembleRelease --no-daemon
)

APK_SRC="android/app/build/outputs/apk/release/app-release.apk"
APK_DST="$HOME/Desktop/MrDiv_Movie-${VERSION}.apk"
cp "$APK_SRC" "$APK_DST"
ls -lh "$APK_SRC" "$APK_DST"
echo "DONE_RELEASE $APK_DST"
