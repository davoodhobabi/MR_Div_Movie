const {
  withAndroidManifest,
  AndroidConfig,
  createRunOncePlugin,
} = require('expo/config-plugins');

/**
 * Dual phone + Android TV support without switching to react-native-tvos.
 * - leanback / touchscreen optional so phones still install
 * - LEANBACK_LAUNCHER so the app appears in the TV launcher
 * - banner for the Android TV row
 * - unlock activity orientation so TV can run landscape
 */
function ensureUsesFeature(manifest, name, required) {
  if (!manifest['uses-feature']) manifest['uses-feature'] = [];
  const list = manifest['uses-feature'];
  const existing = list.find((item) => item.$?.['android:name'] === name);
  if (existing) {
    existing.$['android:required'] = required;
    return;
  }
  list.push({
    $: {
      'android:name': name,
      'android:required': required,
    },
  });
}

function withAndroidTv(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    ensureUsesFeature(manifest, 'android.software.leanback', 'false');
    ensureUsesFeature(manifest, 'android.hardware.touchscreen', 'false');

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:banner'] = '@drawable/tv_banner';

    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:screenOrientation'] = 'fullUser';

    const filters = activity['intent-filter'] || [];
    const hasLeanback = filters.some((filter) => {
      const cats = filter.category || [];
      return cats.some(
        (c) => c.$?.['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER',
      );
    });
    if (!hasLeanback) {
      filters.push({
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } },
        ],
      });
      activity['intent-filter'] = filters;
    }

    return cfg;
  });
}

module.exports = createRunOncePlugin(withAndroidTv, 'with-android-tv', '1.0.0');
