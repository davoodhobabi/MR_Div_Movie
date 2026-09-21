#!/usr/bin/env bash
# Build a debug APK (Metro-connected) and install on a USB device when present.
#
#   ./scripts/install-debug.sh
#   ./scripts/install-debug.sh --no-install   # only build → Desktop

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DO_INSTALL=1
if [[ "${1:-}" == "--no-install" ]]; then
  DO_INSTALL=0
fi

export JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk-17/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

node scripts/patch-expo-video-ffmpeg.js
node scripts/fetch-catalog.cjs
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties

(
  cd android
  ./gradlew assembleDebug --no-daemon
)

APK_SRC="android/app/build/outputs/apk/debug/app-debug.apk"
APK_DST="$HOME/Desktop/MrDiv_Movie-debug.apk"
cp "$APK_SRC" "$APK_DST"
ls -lh "$APK_SRC" "$APK_DST"

if [[ "$DO_INSTALL" -eq 1 ]]; then
  if ! adb devices | awk 'NR>1 && $2=="device"{found=1} END{exit !found}'; then
    echo "No adb device. Enable USB debugging, accept the RSA prompt, then rerun."
    echo "Or install manually: $APK_DST"
    exit 2
  fi
  adb install -r "$APK_SRC"
  adb shell monkey -p com.dmovie.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
  echo "Installed. Run: npm start   (dev-client / Metro)"
fi

echo "DONE_DEBUG $APK_DST"
