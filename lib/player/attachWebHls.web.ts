import Hls from 'hls.js';

export async function attachWebHls(
  video: HTMLVideoElement,
  url: string,
  seekTo: number,
): Promise<() => void> {
  const native = video.canPlayType('application/vnd.apple.mpegurl');
  if (native === 'probably' || native === 'maybe') {
    if (seekTo > 1) {
      const onReady = () => {
        video.currentTime = seekTo;
        video.removeEventListener('loadedmetadata', onReady);
      };
      video.addEventListener('loadedmetadata', onReady);
    }
    return () => {};
  }
  if (!Hls.isSupported()) return () => {};

  video.removeAttribute('src');
  video.load();
  const hls = new Hls();
  hls.loadSource(url);
  hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    if (seekTo > 1) video.currentTime = seekTo;
    void video.play().catch(() => {});
  });
  return () => {
    hls.destroy();
  };
}
