const {
  withAndroidStyles,
  withMainActivity,
  createRunOncePlugin,
} = require('expo/config-plugins');

const NAV_COLOR = '#07080C';
const MARKER = 'WindowCompat.setDecorFitsSystemWindows';

function withAndroidNavInset(config) {
  config = withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults;
    const appTheme = styles.resources?.style?.find(
      (item) => item.$.name === 'AppTheme',
    );
    if (!appTheme) return cfg;

    const items = appTheme.item || [];
    const setItem = (name, value, extra = {}) => {
      const existing = items.find((entry) => entry.$.name === name);
      if (existing) {
        existing._ = value;
        Object.assign(existing.$, extra);
        return;
      }
      items.push({ $: { name, ...extra }, _: value });
    };

    setItem('android:navigationBarColor', NAV_COLOR);
    setItem(
      'android:windowOptOutEdgeToEdgeEnforcement',
      'true',
      { 'tools:targetApi': '35' },
    );
    appTheme.item = items;
    return cfg;
  });

  config = withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    if (!src.includes('import androidx.core.view.WindowCompat')) {
      src = src.replace(
        'import android.os.Bundle',
        `import android.graphics.Color
import android.os.Bundle

import androidx.core.view.WindowCompat`,
      );
    }

    src = src.replace(
      'super.onCreate(null)',
      `super.onCreate(null)
    WindowCompat.setDecorFitsSystemWindows(window, true)
    window.navigationBarColor = Color.parseColor("${NAV_COLOR}")`,
    );

    cfg.modResults.contents = src;
    return cfg;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withAndroidNavInset,
  'with-android-nav-inset',
  '1.0.0',
);
