#!/usr/bin/env bash
# Build a standalone iOS Simulator app and copy a zip to ~/Desktop.
# A real-device .ipa needs an Apple signing identity (none on this Mac).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LANG=en_US.UTF-8
export PATH="${HOME}/.local/node/bin:${PATH}"
export NODE_BINARY="${NODE_BINARY:-${HOME}/.local/node/bin/node}"

VERSION="$(node -e "console.log(require('./app.json').expo.version)")"
IOS="$ROOT/ios"
APP="$IOS/DerivedData/Build/Products/Release-iphonesimulator/MrDivMovie.app"
ZIP="$HOME/Desktop/MrDiv_Movie-${VERSION}-ios-simulator.zip"

echo "==> iOS simulator Release $VERSION"

(
  cd "$IOS"
  xcodebuild -workspace MrDivMovie.xcworkspace -scheme MrDivMovie -configuration Release \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$IOS/DerivedData" \
    CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES build
)

if [[ ! -x "$APP/MrDivMovie" ]]; then
  echo "Build finished but app binary is missing: $APP" >&2
  exit 1
fi

rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
ls -lh "$APP" "$ZIP"
echo "DONE_IOS $ZIP"
