/**
 * Remux remote MKV (etc.) to fragmented MP4 via ffmpeg so Safari/iPhone
 * can play SoftSub sources in a plain <video> element (stream copy, no re-encode).
 *
 * GET /api/media-stream?url=<https media url>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const STREAM_PATH = '/api/media-stream';
const ALLOWED_HOST = /^dls\d*\.aparatchi-dlcenter\.top$/i;
const STORAGE_HOST = /\.hashuresport\.com$/i;
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function requestUrl(req) {
  const raw = req.url || '/';
  if (/^https?:\/\//i.test(raw)) return new URL(raw);
  const host = req.headers.host || 'localhost';
  return new URL(raw, `http://${host}`);
}

function allowedTarget(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (!ALLOWED_HOST.test(url.hostname) && !STORAGE_HOST.test(url.hostname)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function vendorFfmpegPath() {
  return path.join(__dirname, '..', '..', 'host', 'vendor', 'ffmpeg');
}

function hostVendorFfmpegPath() {
  // When this file is copied next to server.js as host/mediaStream.cjs
  return path.join(__dirname, 'vendor', 'ffmpeg');
}

function tryRun(candidate) {
  try {
    if (candidate.includes(path.sep)) {
      if (!fs.existsSync(candidate)) return false;
      try {
        fs.chmodSync(candidate, 0o755);
      } catch {
        // noexec homes still fail the spawn below
      }
    }
    const result = spawnSync(candidate, ['-version'], {
      encoding: 'utf8',
      timeout: 8000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/** cPanel home directories are often mounted noexec; /tmp usually is not. */
function materializeRunnable(candidate) {
  if (!candidate.includes(path.sep) || !fs.existsSync(candidate)) return null;
  const dest = path.join(os.tmpdir(), 'dmovie-ffmpeg');
  try {
    fs.copyFileSync(candidate, dest);
    fs.chmodSync(dest, 0o755);
  } catch {
    return null;
  }
  return tryRun(dest) ? dest : null;
}

function findFfmpeg() {
  const files = [];
  if (process.env.FFMPEG_PATH) files.push(process.env.FFMPEG_PATH);
  files.push(hostVendorFfmpegPath(), vendorFfmpegPath());
  for (const candidate of files) {
    if (tryRun(candidate)) return candidate;
    const copied = materializeRunnable(candidate);
    if (copied) return copied;
  }
  for (const candidate of [
    'ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
  ]) {
    if (tryRun(candidate)) return candidate;
  }
  return null;
}

let cachedFfmpeg = undefined;

function getFfmpegPath() {
  if (cachedFfmpeg !== undefined) return cachedFfmpeg;
  cachedFfmpeg = findFfmpeg();
  // FTP uploads often drop the executable bit on vendor/ffmpeg.
  if (cachedFfmpeg && cachedFfmpeg.includes(`${path.sep}vendor${path.sep}`)) {
    try {
      fs.chmodSync(cachedFfmpeg, 0o755);
    } catch {
      // ignore
    }
  }
  return cachedFfmpeg;
}

function ffmpegAvailable() {
  return Boolean(getFfmpegPath());
}

function parseStreams(stderr) {
  const text = String(stderr || '');
  const lines = text.split('\n');
  const video = [];
  const audioTracks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match =
      /Stream #\d+:(\d+)(?:\[[^\]]+\])?(?:\(([^)]+)\))?: (Video|Audio): (\w+)/i.exec(
        lines[i],
      );
    if (!match) continue;
    const kind = match[3].toLowerCase();
    const codec = match[4].toLowerCase();
    if (kind === 'video') {
      video.push(codec);
      continue;
    }
    let title = '';
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^\s*Stream #/.test(lines[j]) || /^Output #/.test(lines[j])) break;
      const titleMatch = /^\s*title\s*:\s*(.+)$/i.exec(lines[j]);
      if (titleMatch) title = titleMatch[1].trim();
    }
    audioTracks.push({
      index: audioTracks.length,
      codec,
      language: (match[2] || '').trim(),
      title,
      default: /\(default\)/i.test(lines[i]),
    });
  }
  const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const duration = durationMatch
    ? Number(durationMatch[1]) * 3600 +
      Number(durationMatch[2]) * 60 +
      Number(durationMatch[3])
    : 0;
  return {
    video: video[0] || null,
    audio: audioTracks[0]?.codec || null,
    audioTracks,
    duration,
  };
}

function probeStreams(ffmpeg, target) {
  return new Promise((resolve) => {
    const child = spawn(
      ffmpeg,
      ['-hide_banner', '-nostdin', '-probesize', '1000000', '-analyzeduration', '1000000', '-user_agent', USER_AGENT, '-i', target],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(parseStreams(stderr));
    };
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already exited
      }
      finish();
    }, 15000);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 30000) stderr = stderr.slice(-30000);
      if (stderr.includes('At least one output file must be specified')) {
        clearTimeout(timer);
        try {
          child.kill('SIGKILL');
        } catch {
          // already exited
        }
        finish();
      }
    });
    child.on('close', () => {
      clearTimeout(timer);
      finish();
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish();
    });
  });
}

function remuxArgs(target, streams) {
  const video = streams.video;
  const audio = streams.audio;
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-user_agent',
    USER_AGENT,
    '-i',
    target,
    '-map',
    '0:v:0',
    '-sn',
    '-dn',
  ];
  if (video === 'hevc' || video === 'h265') {
    args.push('-c:v', 'copy', '-bsf:v', 'hevc_mp4toannexb', '-tag:v', 'hvc1');
  } else if (video === 'h264' || video === 'avc') {
    args.push('-c:v', 'copy', '-bsf:v', 'h264_mp4toannexb', '-tag:v', 'avc1');
  } else {
    return null;
  }
  const copyAudio = ['aac', 'mp3', 'ac3', 'eac3', 'alac'].includes(audio || '');
  if (copyAudio) {
    args.push('-map', '0:a:0', '-c:a', 'copy');
  } else {
    args.push('-an');
  }
  args.push(
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    '-f',
    'mp4',
    'pipe:1',
  );
  return args;
}

async function handleMediaStream(req, res, options = {}) {
  const parsed = requestUrl(req);
  if (!options.force && parsed.pathname !== STREAM_PATH) return false;

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'METHOD' });
    return true;
  }

  if (parsed.searchParams.get('probe') === '1') {
    sendJson(res, 200, { ffmpeg: ffmpegAvailable() });
    return true;
  }

  const target = allowedTarget(parsed.searchParams.get('url') || '');
  if (!target) {
    sendJson(res, 400, { error: 'EMPTY_URL' });
    return true;
  }

  // iPhone Safari requests this URL after the ffmpeg probe. A single chunked
  // MP4 is buffered by the host until the whole movie exists, so return HLS
  // segments that Safari can play natively.
  const { servePlaylistForTarget } = require('./mediaHls.cjs');
  await servePlaylistForTarget(req, res, target);
  return true;
}

module.exports = {
  STREAM_PATH,
  handleMediaStream,
  ffmpegAvailable,
  getFfmpegPath,
  probeStreams,
  allowedTarget,
  USER_AGENT,
};
