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
 * Adds NextLib FFmpeg soft-decoders to expo-video and keeps release APKs
 * to 64-bit phones only (drops 32-bit / emulator ABIs that bloat size).
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
    setGradleProperty(cfg.modResults, 'reactNativeArchitectures', 'arm64-v8a');
    return cfg;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withFfmpegDecoders,
  'with-ffmpeg-decoders',
  '1.1.1',
);
