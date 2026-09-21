/**
 * Patches expo-video for:
 * 1) NextLib FFmpeg software decoders (HEVC/MKV etc.)
 * 2) Never hide the video surface (expo-video alpha=0 waits for an aspect match
 *    that `contain` + non-16:9 files never satisfy → permanent black screen)
 * 3) In-place fullscreen on the same PlayerView (no second Activity / surface switch;
 *    FFmpeg only paints on a keyframe after a surface change)
 *
 * Used by the Expo config plugin and by postinstall.
 */
const fs = require('fs');
const path = require('path');

const NEXTLIB =
  'io.github.anilbeesetti:nextlib-media3ext:1.8.0-0.9.0';

const MARKER = 'DMovie FFmpeg / NextLib soft-decode';
const FS_MARKER = 'DMovie fullscreen TextureView fix';

function patchBuildGradle(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes(`implementation "${NEXTLIB}"`)) {
    return false;
  }
  if (src.includes('nextlib-media3ext')) {
    src = src.replace(
      /implementation "io\.github\.anilbeesetti:nextlib-media3ext:[^"]+"/,
      `implementation "${NEXTLIB}"`,
    );
    fs.writeFileSync(filePath, src);
    return true;
  }
  if (!src.includes('media3-exoplayer')) {
    throw new Error(`Unexpected expo-video build.gradle at ${filePath}`);
  }
  src = src.replace(
    /implementation "androidx\.media3:media3-datasource-okhttp:\$\{androidxMedia3Version\}"/,
    `implementation "androidx.media3:media3-datasource-okhttp:\${androidxMedia3Version}"\n\n  // ${MARKER}\n  implementation "${NEXTLIB}"`,
  );
  if (!src.includes('nextlib-media3ext')) {
    throw new Error('Failed to inject nextlib dependency into expo-video build.gradle');
  }
  fs.writeFileSync(filePath, src);
  return true;
}

function patchVideoPlayerKt(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');

  if (!src.includes('NextRenderersFactory')) {
    if (!src.includes('DefaultRenderersFactory(context)')) {
      throw new Error(`Unexpected VideoPlayer.kt at ${filePath}`);
    }

    src = src.replace(
      'import androidx.media3.exoplayer.DefaultRenderersFactory\n',
      'import androidx.media3.exoplayer.DefaultRenderersFactory\n' +
        'import androidx.media3.exoplayer.SeekParameters\n' +
        'import io.github.anilbeesetti.nextlib.media3ext.ffdecoder.NextRenderersFactory\n',
    );

    src = src.replace(
      `  // This improves the performance of playing DRM-protected content
  private var renderersFactory = DefaultRenderersFactory(context)
    .forceEnableMediaCodecAsynchronousQueueing()
    .setEnableDecoderFallback(true)`,
      `  // ${MARKER}: prefer FFmpeg soft-decode so HEVC/MKV profiles MediaCodec rejects still play
  private var renderersFactory = NextRenderersFactory(context)
    .forceEnableMediaCodecAsynchronousQueueing()
    .setEnableDecoderFallback(true)
    .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)`,
    );

    if (!src.includes('.build().also {') && src.includes('.build()\n')) {
      src = src.replace(
        `    }.build()

  internal val firstFrameEventGenerator`,
        `    }.build().also { exo ->
      // Soft-decode / surface switches need the previous keyframe, not the next (long GOPs).
      // ExoPlayer must be touched on its application looper (main), not the JS thread.
      android.os.Handler(context.mainLooper).post {
        exo.setSeekParameters(SeekParameters.PREVIOUS_SYNC)
      }
    }

  internal val firstFrameEventGenerator`,
      );
    }

    // Upgrade older patches that called setSeekParameters on the JS thread.
    if (
      src.includes('it.setSeekParameters(SeekParameters.PREVIOUS_SYNC)') &&
      !src.includes('Handler(context.mainLooper)')
    ) {
      src = src.replace(
        `    }.build().also {
      // Soft-decode / surface switches need the previous keyframe, not the next (long GOPs).
      it.setSeekParameters(SeekParameters.PREVIOUS_SYNC)
    }`,
        `    }.build().also { exo ->
      // Soft-decode / surface switches need the previous keyframe, not the next (long GOPs).
      // ExoPlayer must be touched on its application looper (main), not the JS thread.
      android.os.Handler(context.mainLooper).post {
        exo.setSeekParameters(SeekParameters.PREVIOUS_SYNC)
      }
    }`,
      );
    }

    if (!src.includes('NextRenderersFactory')) {
      throw new Error('Failed to patch VideoPlayer.kt renderers factory');
    }
    fs.writeFileSync(filePath, src);
    return true;
  }

  if (src.includes('EXTENSION_RENDERER_MODE_ON')) {
    src = src.replaceAll(
      'EXTENSION_RENDERER_MODE_ON',
      'EXTENSION_RENDERER_MODE_PREFER',
    );
    fs.writeFileSync(filePath, src);
    return true;
  }

  return false;
}

function patchFullscreenLayout(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes('app:surface_type="texture_view"')) {
    return false;
  }
  if (!src.includes('android:id="@+id/player_view"')) {
    throw new Error(`Unexpected fullscreen layout at ${filePath}`);
  }
  src = src.replace(
    /app:use_controller="true"\s*\/>/,
    `app:use_controller="true"\n    app:surface_type="texture_view"\n    app:keep_content_on_player_reset="true" />`,
  );
  if (!src.includes('surface_type="texture_view"')) {
    throw new Error('Failed to patch fullscreen PlayerView surface_type');
  }
  fs.writeFileSync(filePath, src);
  return true;
}

const FS_FORCE_MARKER = 'DMovie fullscreen TextureView fix v2';

function ensureFullscreenImports(src) {
  let out = src;
  if (!out.includes('import android.view.TextureView')) {
    out = out.replace(
      'import android.view.View\n',
      'import android.view.TextureView\nimport android.view.View\n',
    );
  }
  if (!out.includes('import android.view.ViewTreeObserver')) {
    out = out.replace(
      'import android.view.View\n',
      'import android.view.View\nimport android.view.ViewTreeObserver\n',
    );
  }
  if (!out.includes('import androidx.media3.common.Player')) {
    out = out.replace(
      'import androidx.media3.ui.PlayerView\n',
      'import androidx.media3.common.Player\nimport androidx.media3.ui.PlayerView\n',
    );
  }
  if (!out.includes('import androidx.media3.exoplayer.ExoPlayer')) {
    out = out.replace(
      'import androidx.media3.ui.PlayerView\n',
      'import androidx.media3.exoplayer.ExoPlayer\n' +
        'import androidx.media3.exoplayer.SeekParameters\n' +
        'import androidx.media3.ui.PlayerView\n',
    );
  } else if (!out.includes('import androidx.media3.exoplayer.SeekParameters')) {
    out = out.replace(
      'import androidx.media3.exoplayer.ExoPlayer\n',
      'import androidx.media3.exoplayer.ExoPlayer\nimport androidx.media3.exoplayer.SeekParameters\n',
    );
  }
  return out;
}

const FS_HELPERS = `
  private fun bindPlayerWhenSurfaceReady(player: ExoPlayer) {
    val attach = Runnable {
      PlayerView.switchTargetView(player, videoView.playerView, playerView)
      videoPlayer?.hasBeenDisconnectedFromVideoView()
      playerView.videoSurfaceView?.alpha = 1f
      playerView.setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
      (playerView.videoSurfaceView as? TextureView)?.let { texture ->
        if (texture.isAvailable) {
          player.setVideoTextureView(texture)
        }
      }
      forcePreviousKeyframeFrame(player)
    }

    playerView.post {
      if (playerView.width > 0 && playerView.height > 0) {
        attach.run()
        return@post
      }
      playerView.viewTreeObserver.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
        override fun onGlobalLayout() {
          if (playerView.width <= 0 || playerView.height <= 0) return
          playerView.viewTreeObserver.removeOnGlobalLayoutListener(this)
          attach.run()
        }
      })
    }
  }

  private fun clearFirstFrameWait(player: ExoPlayer) {
    firstFrameRetry?.let { playerView.removeCallbacks(it) }
    firstFrameRetry = null
    firstFrameListener?.let { player.removeListener(it) }
    firstFrameListener = null
  }

  private fun forcePreviousKeyframeFrame(player: ExoPlayer) {
    clearFirstFrameWait(player)
    val pos = player.currentPosition.coerceAtLeast(0L)
    player.setSeekParameters(SeekParameters.PREVIOUS_SYNC)
    val target = if (pos > 80L) pos - 80L else 0L
    player.seekTo(target)
    player.playWhenReady = true

    val listener = object : Player.Listener {
      override fun onRenderedFirstFrame() {
        clearFirstFrameWait(player)
      }
    }
    firstFrameListener = listener
    player.addListener(listener)

    val retry = Runnable {
      firstFrameListener?.let { player.removeListener(it) }
      firstFrameListener = null
      firstFrameRetry = null
      val now = player.currentPosition.coerceAtLeast(0L)
      player.setSeekParameters(SeekParameters.PREVIOUS_SYNC)
      player.seekTo(if (now > 160L) now - 160L else 0L)
      player.playWhenReady = true
    }
    firstFrameRetry = retry
    playerView.postDelayed(retry, 400)
  }
`;

function patchFullscreenActivity(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes(FS_FORCE_MARKER)) {
    return false;
  }

  src = ensureFullscreenImports(src);

  if (!src.includes('firstFrameRetry')) {
    src = src.replace(
      '  private var captioningChangeListener: CaptioningManager.CaptioningChangeListener? = null\n',
      '  private var captioningChangeListener: CaptioningManager.CaptioningChangeListener? = null\n' +
        '  private var firstFrameRetry: Runnable? = null\n' +
        '  private var firstFrameListener: Player.Listener? = null\n',
    );
  }

  if (!src.includes('clearFirstFrameWait')) {
    src = src.replace(
      '  override fun onDestroy() {\n    super.onDestroy()',
      '  override fun onDestroy() {\n    videoPlayer?.player?.let { clearFirstFrameWait(it) }\n    super.onDestroy()',
    );
  }

  const stockNeedle =
    `    videoPlayer = videoView.videoPlayer
    videoPlayer?.player?.let {
      PlayerView.switchTargetView(it, videoView.playerView, playerView)
      videoPlayer?.hasBeenDisconnectedFromVideoView() // The video player is disconnected. We are only using the ExoPlayer it contained
    }`;

  const bindBlock =
    `    videoPlayer = videoView.videoPlayer
    // ${FS_FORCE_MARKER}
    // Do not replace TextureView.surfaceTextureListener (PlayerView owns it).
    // After the surface switch, FFmpeg only paints on a keyframe — force a real seek.
    videoPlayer?.player?.let { player ->
      bindPlayerWhenSurfaceReady(player)
    }`;

  const legacyNeedleRe =
    /    videoPlayer = videoView\.videoPlayer\n(?:    \/\/[^\n]*\n)*    videoPlayer\?\.player\?\.let \{ player ->[\s\S]*?\n    \}\n\n    videoViewId\?\.let/;

  if (src.includes(stockNeedle)) {
    src = src.replace(stockNeedle, bindBlock);
  } else if (legacyNeedleRe.test(src)) {
    src = src.replace(legacyNeedleRe, `${bindBlock}\n\n    videoViewId?.let`);
  } else {
    throw new Error('Failed to locate FullscreenPlayerActivity switchTargetView block');
  }

  if (!src.includes(FS_FORCE_MARKER)) {
    src = src.replace(
      /\n  override fun onPostCreate\(savedInstanceState: Bundle\?\) \{/,
      `\n${FS_HELPERS}\n  override fun onPostCreate(savedInstanceState: Bundle?) {`,
    );
  }

  if (!src.includes(FS_FORCE_MARKER)) {
    throw new Error('Failed to inject FullscreenPlayerActivity force-keyframe helpers');
  }

  fs.writeFileSync(filePath, src);
  return true;
}

const FIRST_FRAME_MARKER = 'DMovie first-frame: surface size only';
const INPLACE_FS_MARKER = 'DMovie in-place fullscreen (no surface switch)';
const SURFACE_ALPHA_MARKER = 'DMovie never hide video surface';

function patchFirstFrameGenerator(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes(FIRST_FRAME_MARKER)) {
    return false;
  }

  const needle = `  private fun isPlayerSurfaceLayoutValid(): Boolean {
    // Sometimes the video size announced by the track will is 1px off the render size.
    val epsilon = 0.05
    val player = videoPlayerReference.get()?.player ?: run {
      return false
    }
    val currentPlayerView = currentViewReference.get() ?: run {
      return false
    }
    val surfaceWidth = player.surfaceSize.width
    val surfaceHeight = player.surfaceSize.height
    val sourceWidth = player.videoSize.width
    val sourceHeight = player.videoSize.height
    val sourcePixelWidthHeightRatio = player.videoSize.pixelWidthHeightRatio

    if (surfaceWidth == 0 || surfaceHeight == 0) {
      return false
    }

    val surfaceAspectRatio = surfaceWidth.toFloat() / surfaceHeight
    val trackAspectRatio = sourceWidth.toFloat() / sourceHeight * sourcePixelWidthHeightRatio

    val videoSizeIsUnknown = sourceWidth == 0 || sourceHeight == 0
    val hasFillContentFit = currentPlayerView.playerView.resizeMode == ContentFit.FILL.toResizeMode()
    val hasCorrectRatio = abs(trackAspectRatio - surfaceAspectRatio) < epsilon

    return (hasCorrectRatio || hasFillContentFit || videoSizeIsUnknown)
  }`;

  const replacement = `  private fun isPlayerSurfaceLayoutValid(): Boolean {
    // ${FIRST_FRAME_MARKER}
    // \`contain\` letterboxes, so the TextureView ratio often never matches the video.
    // Waiting for that match keeps videoSurfaceView.alpha at 0 forever (audio + black picture).
    val player = videoPlayerReference.get()?.player ?: return false
    if (currentViewReference.get() == null) return false
    val surfaceWidth = player.surfaceSize.width
    val surfaceHeight = player.surfaceSize.height
    return surfaceWidth > 0 && surfaceHeight > 0
  }`;

  if (!src.includes(needle)) {
    throw new Error('Failed to locate FirstFrameEventGenerator aspect-ratio check');
  }
  fs.writeFileSync(filePath, src.replace(needle, replacement));
  return true;
}

function patchVideoViewSurfaceAlpha(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes(SURFACE_ALPHA_MARKER)) {
    return false;
  }

  const applyNeedle = `  fun applySurfaceViewVisibility() {
    if (useExoShutter != true && shouldHideSurfaceView) {
      playerView.videoSurfaceView?.alpha = 0f
    } else {
      playerView.videoSurfaceView?.alpha = 1f
    }
  }`;
  const applyReplacement = `  fun applySurfaceViewVisibility() {
    // ${SURFACE_ALPHA_MARKER}
    playerView.videoSurfaceView?.alpha = 1f
  }`;

  if (!src.includes(applyNeedle)) {
    throw new Error('Failed to locate VideoView.applySurfaceViewVisibility');
  }
  src = src.replace(applyNeedle, applyReplacement);

  src = src.replace(
    `    // Start with the SurfaceView being transparent to avoid any flickers when the prop value is delivered.
    this.playerView.setShutterBackgroundColor(Color.TRANSPARENT)
    this.playerView.videoSurfaceView?.alpha = 0f`,
    `    // ${SURFACE_ALPHA_MARKER}: FFmpeg frames must be visible immediately.
    this.playerView.setShutterBackgroundColor(Color.TRANSPARENT)
    this.playerView.videoSurfaceView?.alpha = 1f
    shouldHideSurfaceView = false`,
  );

  if (!src.includes(SURFACE_ALPHA_MARKER)) {
    throw new Error('Failed to patch VideoView surface alpha');
  }
  fs.writeFileSync(filePath, src);
  return true;
}

function ensureVideoViewFullscreenImports(src) {
  let out = src;
  if (!out.includes('import android.content.pm.ActivityInfo')) {
    out = out.replace(
      'import android.app.Activity\n',
      'import android.app.Activity\nimport android.content.pm.ActivityInfo\n',
    );
  }
  if (!out.includes('import android.view.WindowInsets\n')) {
    out = out.replace(
      'import android.view.View\n',
      'import android.view.View\nimport android.view.WindowInsets\nimport android.view.WindowInsetsController\n',
    );
  }
  return out;
}

const INPLACE_FS_METHODS = `
  private var orientationBeforeFullscreen: Int = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT

  private fun applyFullscreenSystemUi(hide: Boolean) {
    val window = currentActivity.window
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val controller = window.insetsController ?: return
      if (hide) {
        controller.systemBarsBehavior =
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
      } else {
        controller.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
      }
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = if (hide) {
        (
          View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          )
      } else {
        View.SYSTEM_UI_FLAG_VISIBLE
      }
    }
  }

`;

function patchVideoViewInPlaceFullscreen(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  src = ensureVideoViewFullscreenImports(src);

  const injectHelpers = () => {
    if (src.includes('private fun applyFullscreenSystemUi')) {
      return;
    }
    if (!src.includes('  fun applySurfaceViewVisibility() {')) {
      throw new Error('Failed to inject in-place fullscreen helpers');
    }
    src = src.replace(
      '  fun applySurfaceViewVisibility() {',
      `${INPLACE_FS_METHODS}  fun applySurfaceViewVisibility() {`,
    );
  };

  if (src.includes(INPLACE_FS_MARKER)) {
    const before = src;
    injectHelpers();
    if (src === before) {
      return false;
    }
    fs.writeFileSync(filePath, src);
    return true;
  }

  const enterNeedle = `  fun enterFullscreen() {
    val intent = Intent(context, FullscreenPlayerActivity::class.java)
    intent.putExtra(VideoManager.INTENT_PLAYER_KEY, videoViewId)
    intent.putExtra(FullscreenPlayerActivity.INTENT_FULLSCREEN_OPTIONS_KEY, fullscreenOptions)
    // Set before starting the activity to avoid entering PiP unintentionally
    isInFullscreen = true
    currentActivity.startActivity(intent)

    // Disable the enter transition
    if (Build.VERSION.SDK_INT >= 34) {
      currentActivity.overrideActivityTransition(Activity.OVERRIDE_TRANSITION_OPEN, 0, 0)
    } else {
      @Suppress("DEPRECATION")
      currentActivity.overridePendingTransition(0, 0)
    }
    onFullscreenEnter(Unit)
    pipParams = pipParams.copy(blocksAppFromEntering = true)
  }`;

  const enterReplacement = `  fun enterFullscreen() {
    // ${INPLACE_FS_MARKER}
    // A second Activity / PlayerView destroys the Surface. FFmpeg then waits for the
    // next IDR frame (often many seconds) — or never unhides the view. Stay on this PlayerView.
    if (isInFullscreen) {
      exitFullscreen()
      return
    }
    isInFullscreen = true
    orientationBeforeFullscreen = currentActivity.requestedOrientation
    currentActivity.requestedOrientation = fullscreenOptions.orientation.toActivityOrientation()
    applyFullscreenSystemUi(true)
    playerView.findViewById<ImageButton>(androidx.media3.ui.R.id.exo_fullscreen)
      .setImageResource(androidx.media3.ui.R.drawable.exo_icon_fullscreen_exit)
    onFullscreenEnter(Unit)
    pipParams = pipParams.copy(blocksAppFromEntering = true)
  }`;

  if (!src.includes(enterNeedle)) {
    throw new Error('Failed to locate VideoView.enterFullscreen');
  }
  src = src.replace(enterNeedle, enterReplacement);

  const exitNeedle = `  fun exitFullscreen() {
    // Fullscreen uses a different PlayerView instance, because of that we need to manually update the non-fullscreen player icon after exiting
    val fullScreenButton: ImageButton = playerView.findViewById(androidx.media3.ui.R.id.exo_fullscreen)
    fullScreenButton.setImageResource(androidx.media3.ui.R.drawable.exo_icon_fullscreen_enter)
    attachPlayer()
    onFullscreenExit(Unit)
    isInFullscreen = false
    pipParams = pipParams.copy(blocksAppFromEntering = false)
  }`;

  const exitReplacement = `  fun exitFullscreen() {
    if (!isInFullscreen) {
      return
    }
    applyFullscreenSystemUi(false)
    currentActivity.requestedOrientation = orientationBeforeFullscreen
    val fullScreenButton: ImageButton = playerView.findViewById(androidx.media3.ui.R.id.exo_fullscreen)
    fullScreenButton.setImageResource(androidx.media3.ui.R.drawable.exo_icon_fullscreen_enter)
    onFullscreenExit(Unit)
    isInFullscreen = false
    pipParams = pipParams.copy(blocksAppFromEntering = false)
  }`;

  if (!src.includes(exitNeedle)) {
    throw new Error('Failed to locate VideoView.exitFullscreen');
  }
  src = src.replace(exitNeedle, exitReplacement);

  injectHelpers();

  if (!src.includes(INPLACE_FS_MARKER) || !src.includes('private fun applyFullscreenSystemUi')) {
    throw new Error('Failed to inject in-place fullscreen');
  }
  fs.writeFileSync(filePath, src);
  return true;
}

function patchVideoModuleExitFullscreen(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  if (src.includes('view.exitFullscreen()')) {
    return false;
  }
  const needle = `  AsyncFunction("exitFullscreen") { view: T ->
    VideoManager.finishFullscreenPlayer(view.videoViewId)
  }.runOnQueue(Queues.MAIN)`;
  const replacement = `  AsyncFunction("exitFullscreen") { view: T ->
    view.exitFullscreen()
  }.runOnQueue(Queues.MAIN)`;
  if (!src.includes(needle)) {
    throw new Error('Failed to locate VideoModule exitFullscreen');
  }
  fs.writeFileSync(filePath, src.replace(needle, replacement));
  return true;
}

function patchExpoVideo(projectRoot) {
  const videoRoot = path.join(projectRoot, 'node_modules', 'expo-video', 'android');
  const gradle = path.join(videoRoot, 'build.gradle');
  const playerKt = path.join(
    videoRoot,
    'src/main/java/expo/modules/video/player/VideoPlayer.kt',
  );
  const videoViewKt = path.join(
    videoRoot,
    'src/main/java/expo/modules/video/VideoView.kt',
  );
  const videoModuleKt = path.join(
    videoRoot,
    'src/main/java/expo/modules/video/VideoModule.kt',
  );
  const firstFrameKt = path.join(
    videoRoot,
    'src/main/java/expo/modules/video/player/FirstFrameEventGenerator.kt',
  );
  const fsLayout = path.join(
    videoRoot,
    'src/main/res/layout/fullscreen_player_activity.xml',
  );
  const fsActivity = path.join(
    videoRoot,
    'src/main/java/expo/modules/video/FullscreenPlayerActivity.kt',
  );

  if (!fs.existsSync(gradle) || !fs.existsSync(playerKt)) {
    console.warn('[patch-expo-video-ffmpeg] expo-video android sources not found; skip');
    return { gradle: false, player: false, fullscreen: false };
  }

  const gradleChanged = patchBuildGradle(gradle);
  const playerChanged = patchVideoPlayerKt(playerKt);
  const firstFrameChanged = fs.existsSync(firstFrameKt)
    ? patchFirstFrameGenerator(firstFrameKt)
    : false;
  const surfaceChanged = fs.existsSync(videoViewKt)
    ? patchVideoViewSurfaceAlpha(videoViewKt)
    : false;
  const inplaceChanged = fs.existsSync(videoViewKt)
    ? patchVideoViewInPlaceFullscreen(videoViewKt)
    : false;
  const moduleChanged = fs.existsSync(videoModuleKt)
    ? patchVideoModuleExitFullscreen(videoModuleKt)
    : false;
  const layoutChanged = fs.existsSync(fsLayout)
    ? patchFullscreenLayout(fsLayout)
    : false;
  const activityChanged = fs.existsSync(fsActivity)
    ? patchFullscreenActivity(fsActivity)
    : false;

  console.log(
    `[patch-expo-video-ffmpeg] gradle=${gradleChanged ? 'patched' : 'ok'} player=${playerChanged ? 'patched' : 'ok'} firstFrame=${firstFrameChanged ? 'patched' : 'ok'} surface=${surfaceChanged ? 'patched' : 'ok'} inplaceFs=${inplaceChanged ? 'patched' : 'ok'} module=${moduleChanged ? 'patched' : 'ok'} fsLayout=${layoutChanged ? 'patched' : 'ok'} fsActivity=${activityChanged ? 'patched' : 'ok'}`,
  );
  return {
    gradle: gradleChanged,
    player: playerChanged,
    fullscreen: layoutChanged || activityChanged || inplaceChanged,
  };
}

module.exports = { patchExpoVideo, NEXTLIB, MARKER };

if (require.main === module) {
  patchExpoVideo(path.resolve(__dirname, '..'));
}
