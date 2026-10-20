/**
 * Keep the native cold-start splash black with the MrDiv logo.
 * The checked-in android/ tree once shipped Expo's default grid icon on white.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android/app/src/main/res');
const SRC = path.join(ROOT, 'assets/splash-icon.png');

const SIZES = {
  'drawable-mdpi': 288,
  'drawable-hdpi': 432,
  'drawable-xhdpi': 576,
  'drawable-xxhdpi': 864,
  'drawable-xxxhdpi': 1152,
};

function writeIfChanged(filePath, contents) {
  const next = contents.endsWith('\n') ? contents : `${contents}\n`;
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === next) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next);
  return true;
}

function main() {
  if (!fs.existsSync(RES) || !fs.existsSync(SRC)) {
    console.warn('[sync-android-splash] android res or splash asset missing; skip');
    return;
  }

  writeIfChanged(
    path.join(RES, 'values/colors.xml'),
    `<resources>
  <color name="splashscreen_background">#000000</color>
  <color name="iconBackground">#000000</color>
  <color name="colorPrimary">#E50914</color>
</resources>`,
  );

  writeIfChanged(
    path.join(RES, 'drawable/splashscreen.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background" />
  <item>
    <bitmap
      android:gravity="center"
      android:src="@drawable/splashscreen_logo" />
  </item>
</layer-list>`,
  );

  writeIfChanged(
    path.join(RES, 'drawable/ic_launcher_background.xml'),
    `<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background" />
  <item>
    <bitmap
      android:gravity="center"
      android:src="@drawable/splashscreen_logo" />
  </item>
</layer-list>`,
  );

  const stylesPath = path.join(RES, 'values/styles.xml');
  if (fs.existsSync(stylesPath)) {
    let styles = fs.readFileSync(stylesPath, 'utf8');
    if (!styles.includes('@drawable/splashscreen')) {
      styles = styles.replace(
        /<style name="Theme\.App\.SplashScreen"[\s\S]*?<\/style>/,
        `<style name="Theme.App.SplashScreen" parent="AppTheme">
    <item name="android:windowBackground">@drawable/splashscreen</item>
  </style>`,
      );
      writeIfChanged(stylesPath, styles);
    }
  }

  const py = `
from PIL import Image
from pathlib import Path
src = Image.open(${JSON.stringify(SRC)}).convert('RGBA')
sizes = ${JSON.stringify(SIZES)}
root = Path(${JSON.stringify(RES)})
for folder, size in sizes.items():
    out = root / folder / 'splashscreen_logo.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    src.resize((size, size), Image.Resampling.LANCZOS).save(out, 'PNG')
    print(out.name, size)
`;
  execFileSync('python3', ['-c', py], { cwd: ROOT, stdio: 'inherit' });
  console.log('[sync-android-splash] ok');
}

main();
