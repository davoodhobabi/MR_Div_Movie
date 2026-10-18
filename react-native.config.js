/** VLC is iOS-only in this app (VideoPlayer.ios.tsx). Keep it out of the Android APK. */
module.exports = {
  dependencies: {
    '@lunarr/vlc-player': {
      platforms: {
        android: null,
      },
    },
  },
};
