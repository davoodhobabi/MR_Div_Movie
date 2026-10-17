/**
 * iPhone Safari plays HLS. This host's disk quota is full, so segments are
 * not stored: each request remuxes a few seconds of the remote MKV to
 * memory and sends them with Content-Length.
 *
 * GET /api/media-hls?url=...          → playlist
 * GET /api/media-hls/:id/00000.ts     → one segment
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
const {
  allowedTarget,
  getFfmpegPath,
  probeStreams,
  USER_AGENT,
} = require('./mediaStream.cjs');

const HLS_PATH = '/api/media-hls';
const FILE_PATH = /^\/api\/media-hls\/([a-f0-9]{16})\/(\d{5})\.ts$/;
const sessions = new Map();
const inflight = new Map();
const segmentCache = new Map();
const segmentJobs = new Map();

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

const META_DIR = path.join(__dirname, 'tmp', 'hls-meta');
const SEG_DIR = path.join(__dirname, 'tmp', 'hls-seg');

function saveMeta(session) {
  try {
    fs.mkdirSync(META_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(META_DIR, `${session.id}.json`),
      JSON.stringify({
        target: session.target,
        video: session.video,
        audio: session.audio,
        audioIndex: session.audioIndex || 0,
        audioTracks: session.audioTracks || [],
        duration: session.duration,
        stepMs: session.stepMs,
      }),
    );
  } catch {
    // Memory session still works on this process.
  }
}

function loadMeta(id) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(META_DIR, `${id}.json`), 'utf8'));
    if (!data || !data.target || !data.duration || !data.stepMs) return null;
    return { id, ...data };
  } catch {
    return null;
  }
}

function diskSegment(id, index) {
  return path.join(SEG_DIR, id, `v7-${index}.ts`);
}

function readDiskSegment(id, index) {
  try {
    const file = diskSegment(id, index);
    if (!fs.existsSync(file)) return null;
    const body = fs.readFileSync(file);
    return body.length > 187 ? body : null;
  } catch {
    return null;
  }
}

function writeDiskSegment(id, index, body) {
  if (index > 1) return;
  try {
    const dir = path.join(SEG_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(diskSegment(id, index), body);
  } catch {
    // Playback can continue from memory on this process.
  }
}
function remember(key, body) {
  segmentCache.set(key, body);
  while (segmentCache.size > 8) {
    const oldest = segmentCache.keys().next().value;
    segmentCache.delete(oldest);
  }
}

function segmentCount(session) {
  return Math.max(1, Math.ceil((session.duration * 1000) / session.stepMs));
}

function segmentStart(session, index) {
  return (index * session.stepMs) / 1000;
}

function playlistFor(session) {
  const count = segmentCount(session);
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:10',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXT-X-MEDIA-SEQUENCE:0',
  ];
  const step = session.stepMs / 1000;
  for (let index = 0; index < count; index += 1) {
    const start = segmentStart(session, index);
    const dur = Math.min(step, Math.max(0.001, session.duration - start));
    if (index > 0) lines.push('#EXT-X-DISCONTINUITY');
    lines.push(`#EXTINF:${dur.toFixed(3)},`);
    lines.push(`${HLS_PATH}/${session.id}/${String(index).padStart(5, '0')}.ts`);
  }
  lines.push('#EXT-X-ENDLIST', '');
  return lines.join('\n');
}

function audioArgs(session) {
  const copyAudio = ['aac', 'mp3', 'ac3', 'eac3', 'alac'].includes(session.audio || '');
  if (!session.audio) return ['-an'];
  if (copyAudio) return ['-map', '0:a:0', '-c:a', 'copy'];
  return ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '96k', '-ac', '2'];
}

function transcodeSegment(ffmpeg, session, start) {
  const preroll = start > 0 ? Math.min(2, start) : 0;
  const inputSeek = Math.max(0, start - preroll);
  const outputSeek = start - inputSeek;
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-user_agent',
    USER_AGENT,
    '-ss',
    inputSeek.toFixed(3),
    '-i',
    session.target,
    '-ss',
    outputSeek.toFixed(3),
    '-t',
    (session.stepMs / 1000).toFixed(3),
    '-map',
    '0:v:0',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-crf',
    '26',
    ...audioArgs(session).map((part) => (part === '-c:a' ? '-c:a' : part)),
    '-f',
    'mpegts',
    '-muxdelay',
    '0',
    'pipe:1',
  ];
  // audioArgs already includes -c:a copy or aac. Re-encode audio so the cut is exact.
  const audio = session.audio
    ? [
        '-map',
        `0:a:${session.audioIndex || 0}`,
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-ac',
        '2',
      ]
    : ['-an'];
  const finalArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-user_agent',
    USER_AGENT,
    '-ss',
    inputSeek.toFixed(3),
    '-i',
    session.target,
    '-ss',
    outputSeek.toFixed(3),
    '-t',
    (session.stepMs / 1000).toFixed(3),
    '-map',
    '0:v:0',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '26',
    '-maxrate',
    '1800k',
    '-bufsize',
    '3600k',
    ...audio,
    '-f',
    'mpegts',
    '-muxdelay',
    '0',
    'pipe:1',
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, finalArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let size = 0;
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('segment_timeout'));
    }, 25000);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) {
        child.kill('SIGKILL');
        reject(new Error('segment_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 2000) stderr = stderr.slice(-2000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const body = Buffer.concat(chunks);
      if (body.length < 188) {
        reject(new Error(stderr.trim() || `empty_${code}`));
        return;
      }
      resolve(body);
    });
  });
}

const probeCache = new Map();

function probeCached(ffmpeg, target) {
  const existing = probeCache.get(target);
  if (existing) return existing;
  const job = probeStreams(ffmpeg, target);
  probeCache.set(target, job);
  return job;
}

async function ensureSession(target, audioIndex) {
  const requested = Number.isFinite(audioIndex) ? Math.max(0, audioIndex) : 0;
  const id = crypto
    .createHash('sha1')
    .update(`enc7:${requested}:${target}`)
    .digest('hex')
    .slice(0, 16);
  const existing = sessions.get(id);
  if (existing) return existing;
  let job = inflight.get(id);
  if (!job) {
    job = (async () => {
      const ffmpeg = getFfmpegPath();
      if (!ffmpeg) {
        const error = new Error('FFMPEG_MISSING');
        throw error;
      }
      const streams = await probeCached(ffmpeg, target);
      const video = streams.video;
      const supported =
        video === 'h264' || video === 'avc' || video === 'hevc' || video === 'h265';
      if (!supported || !streams.duration) {
        const error = new Error('CODEC');
        error.streams = streams;
        throw error;
      }
      const tracks = Array.isArray(streams.audioTracks) ? streams.audioTracks : [];
      const picked = tracks.some((track) => track.index === requested) ? requested : 0;
      const session = {
        id,
        target,
        video,
        audio: tracks[picked]?.codec || streams.audio,
        audioIndex: picked,
        audioTracks: tracks,
        duration: streams.duration,
        stepMs: 4000,
      };
      sessions.set(id, session);
      saveMeta(session);
      while (sessions.size > 40) {
        const oldest = sessions.keys().next().value;
        sessions.delete(oldest);
      }
      return session;
    })();
    inflight.set(id, job);
  }
  try {
    return await job;
  } finally {
    if (inflight.get(id) === job) inflight.delete(id);
  }
}

function loadSegment(session, index) {
  const start = segmentStart(session, index);
  if (start >= session.duration) return Promise.reject(new Error('SEGMENT'));
  const key = `${session.id}:${index}`;
  const cached = segmentCache.get(key) || readDiskSegment(session.id, index);
  if (cached) {
    remember(key, cached);
    return Promise.resolve(cached);
  }
  const pending = segmentJobs.get(key);
  if (pending) return pending;
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) return Promise.reject(new Error('FFMPEG_MISSING'));
  const job = transcodeSegment(ffmpeg, session, start)
    .then((body) => {
      remember(key, body);
      writeDiskSegment(session.id, index, body);
      return body;
    })
    .finally(() => {
      if (segmentJobs.get(key) === job) segmentJobs.delete(key);
    });
  segmentJobs.set(key, job);
  return job;
}

function sendPlaylist(req, res, session) {
  const raw = Buffer.from(playlistFor(session));
  const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  const body = gzip ? zlib.gzipSync(raw) : raw;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-store');
  if (gzip) res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Length', String(body.length));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

async function sendSegment(req, res, session, index) {
  if (!session.stepMs || segmentStart(session, index) >= session.duration) {
    sendJson(res, 404, { error: 'SEGMENT' });
    return;
  }
  let body;
  try {
    body = await loadSegment(session, index);
  } catch (err) {
    sendJson(res, 502, {
      error: 'SEGMENT_FAIL',
      detail: err instanceof Error ? err.message : 'segment',
    });
    return;
  }
  res.statusCode = 200;
  res.setHeader('X-Seek', segmentStart(session, index).toFixed(3));
  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(body.length));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

async function servePlaylistForTarget(req, res, target) {
  try {
    const parsed = requestUrl(req);
    const requested = Number(parsed.searchParams.get('audio'));
    if (parsed.searchParams.get('meta') === '1') {
      const session = await ensureSession(target, 0);
      sendJson(res, 200, {
        audioTracks: session.audioTracks || [],
      });
      return;
    }
    const session = await ensureSession(
      target,
      Number.isFinite(requested) ? requested : 0,
    );
    const first = loadSegment(session, 0);
    loadSegment(session, 1).catch(() => {});
    try {
      await first;
    } catch {
      // Safari can still request the segment and get the error itself.
    }
    sendPlaylist(req, res, session);
  } catch (err) {
    if (err instanceof Error && err.message === 'CODEC') {
      sendJson(res, 415, {
        error: 'CODEC',
        video: err.streams?.video,
        audio: err.streams?.audio,
      });
      return;
    }
    sendJson(res, 502, {
      error: 'FFMPEG_FAIL',
      detail: err instanceof Error ? err.message : 'probe',
    });
  }
}

async function handleMediaHls(req, res) {
  const parsed = requestUrl(req);
  const fileMatch = FILE_PATH.exec(parsed.pathname);
  if (!fileMatch && parsed.pathname !== HLS_PATH) return false;

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'METHOD' });
    return true;
  }

  if (fileMatch) {
    const session = sessions.get(fileMatch[1]) || loadMeta(fileMatch[1]);
    if (!session) {
      sendJson(res, 404, { error: 'SESSION' });
      return true;
    }
    sessions.set(session.id, session);
    await sendSegment(req, res, session, Number(fileMatch[2]));
    return true;
  }

  const target = allowedTarget(parsed.searchParams.get('url') || '');
  if (!target) {
    sendJson(res, 400, { error: 'EMPTY_URL' });
    return true;
  }
  await servePlaylistForTarget(req, res, target);
  return true;
}

module.exports = {
  HLS_PATH,
  handleMediaHls,
  servePlaylistForTarget,
};
