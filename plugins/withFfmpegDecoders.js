const {
  withDangerousMod,
  withGradleProperties,
  createRunOncePlugin,
} = require('expo/config-plugins');
const { patchExpoVideo } = require('../scripts/patch-expo-video-ffmpeg');

function setGradleProperty(modResults, key, value) {
  const existing = modResults.find((item) => item.key === key);
  if (existing) {
    existing.value = value;
  } else {
    modResults.push({ type: 'property', key, value });
  }
}

/**
 * Adds NextLib FFmpeg soft-decoders to expo-video.
 * Ships both 32-bit and 64-bit ARM so Android TV boxes can install the APK.
 * Drops x86 / x86_64 emulator ABIs that only bloat sideload builds.
 */
function withFfmpegDecoders(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      patchExpoVideo(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);

  config = withGradleProperties(config, (cfg) => {
    setGradleProperty(
      cfg.modResults,
      'reactNativeArchitectures',
      'armeabi-v7a,arm64-v8a',
    );
    // Many TV firmwares fail install when native libs are not extracted.
    setGradleProperty(cfg.modResults, 'expo.useLegacyPackaging', 'true');
    return cfg;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withFfmpegDecoders,
  'with-ffmpeg-decoders',
  '1.2.0',
);
