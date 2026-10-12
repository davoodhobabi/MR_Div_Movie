/**
 * Remux remote MKV (etc.) to fragmented MP4 via ffmpeg so Safari/iPhone
 * can play SoftSub sources in a plain <video> element (stream copy, no re-encode).
 *
 * GET /api/media-stream?url=<https media url>
 */
const fs = require('fs');
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

function findFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const candidates = [
    hostVendorFfmpegPath(),
    vendorFfmpegPath(),
    'ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
  ];
  for (const candidate of candidates) {
    try {
      if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
      const result = spawnSync(candidate, ['-version'], {
        encoding: 'utf8',
        timeout: 8000,
      });
      if (result.status === 0) return candidate;
    } catch {
      // try next
    }
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
  const video = [];
  const audio = [];
  for (const line of String(stderr || '').split('\n')) {
    const match = /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]+\))?: (Video|Audio): (\w+)/i.exec(
      line,
    );
    if (!match) continue;
    const kind = match[1].toLowerCase();
    const codec = match[2].toLowerCase();
    if (kind === 'video') video.push(codec);
    if (kind === 'audio') audio.push(codec);
  }
  return { video: video[0] || null, audio: audio[0] || null };
}

function probeStreams(ffmpeg, target) {
  return new Promise((resolve) => {
    const child = spawn(
      ffmpeg,
      ['-hide_banner', '-nostdin', '-user_agent', USER_AGENT, '-i', target],
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

  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) {
    sendJson(res, 503, { error: 'FFMPEG_MISSING' });
    return true;
  }

  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-store');
    res.end();
    return true;
  }

  const streams = await probeStreams(ffmpeg, target);
  const args = remuxArgs(target, streams);
  if (!args) {
    sendJson(res, 415, {
      error: 'CODEC',
      video: streams.video,
      audio: streams.audio,
    });
    return true;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Accept-Ranges', 'none');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const child = spawn(ffmpeg, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  child.stdout.pipe(res);

  const kill = () => {
    if (!child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }
  };

  req.on('close', kill);
  res.on('close', kill);

  child.on('error', (err) => {
    if (!res.headersSent) {
      sendJson(res, 502, { error: 'FFMPEG_SPAWN', detail: err.message });
      return;
    }
    res.end();
  });

  child.on('close', (code) => {
    if (code && code !== 0 && !res.writableEnded) {
      if (!res.headersSent) {
        sendJson(res, 502, {
          error: 'FFMPEG_FAIL',
          detail: stderr.trim() || `exit_${code}`,
        });
      } else {
        res.end();
      }
    }
  });

  return true;
}

module.exports = {
  STREAM_PATH,
  handleMediaStream,
  ffmpegAvailable,
  getFfmpegPath,
};
