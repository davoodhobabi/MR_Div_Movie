/** Extract text subtitle tracks from a remote MKV using HTTP Range + Cues. */

export type ExtractedSubtitleTrack = {
  id: string;
  language: string;
  label: string;
  name: string;
  vtt: string;
};

const HEADER_BYTES = 65_536;
const CUES_LIMIT = 2_000_000;
const BLOCK_WINDOW = 2_048;
const FETCH_CONCURRENCY = 10;
const TEXT_CODECS = new Set([
  'S_TEXT/UTF8',
  'S_TEXT/ASCII',
  'S_TEXT/ASS',
  'S_TEXT/SSA',
  'S_TEXT/WEBVTT',
]);

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  TimestampScale: 0x2ad7b1,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  CodecID: 0x86,
  Language: 0x22b59c,
  Name: 0x536e,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
  CueTime: 0xb3,
  CueTrackPositions: 0xb7,
  CueTrack: 0xf7,
  CueClusterPosition: 0xf1,
  CueRelativePosition: 0xf0,
  CueDuration: 0x5378,
  Cluster: 0x1f43b675,
  BlockGroup: 0xa0,
  Block: 0xa1,
  SimpleBlock: 0xa3,
  BlockDuration: 0x9b,
} as const;

const TRACK_SUBTITLE = 0x11;

type MkvTrack = {
  number: number;
  type: number;
  codec: string;
  language: string;
  name: string;
};

type CueRef = {
  track: number;
  time: number;
  cluster: number;
  relative: number;
  duration: number | null;
};

class Bytes {
  constructor(
    readonly data: Uint8Array,
    public pos = 0,
    public end = data.length,
  ) {}

  remaining() {
    return this.end - this.pos;
  }
}

function vintLength(first: number) {
  if (first === 0) throw new Error('invalid vint');
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && !(first & mask)) {
    mask >>= 1;
    length += 1;
  }
  return length;
}

function readVint(data: Uint8Array, pos: number): { value: number; length: number } {
  const first = data[pos] ?? 0;
  const length = vintLength(first);
  // Length=8 uses the first byte only as a marker (0x01); data bits start at byte 2.
  let value = length === 8 ? 0 : first & (0xff >> length);
  for (let i = 1; i < length; i++) value = value * 256 + (data[pos + i] ?? 0);
  return { value, length };
}

function readId(data: Uint8Array, pos: number): { id: number; length: number } {
  const length = vintLength(data[pos] ?? 0);
  let id = 0;
  for (let i = 0; i < length; i++) id = id * 256 + (data[pos + i] ?? 0);
  return { id, length };
}

function readElement(buf: Bytes) {
  if (buf.remaining() < 2) return null;
  try {
    const { id, length: idLen } = readId(buf.data, buf.pos);
    const { value: size, length: sizeLen } = readVint(buf.data, buf.pos + idLen);
    const header = idLen + sizeLen;
    const payload = buf.pos + header;
    if (payload > buf.end) return null;
    return { id, size, header, payload };
  } catch {
    return null;
  }
}

async function fetchRange(
  url: string,
  start: number,
  length: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const end = start + Math.max(1, length) - 1;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Range: `bytes=${start}-${end}` },
    signal,
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`HTTP_${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index] as T, index);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function parseTracks(payload: Uint8Array): MkvTrack[] {
  const buf = new Bytes(payload);
  const tracks: MkvTrack[] = [];
  while (buf.remaining() > 2) {
    const el = readElement(buf);
    if (!el || el.payload + el.size > buf.end) break;
    if (el.id !== ID.TrackEntry) {
      buf.pos = el.payload + el.size;
      continue;
    }
    const inner = new Bytes(payload, el.payload, el.payload + el.size);
    const track: MkvTrack = {
      number: 0,
      type: 0,
      codec: '',
      language: '',
      name: '',
    };
    while (inner.remaining() > 2) {
      const child = readElement(inner);
      if (!child || child.payload + child.size > inner.end) break;
      const blob = payload.subarray(child.payload, child.payload + child.size);
      if (child.id === ID.TrackNumber) track.number = readUint(blob);
      else if (child.id === ID.TrackType) track.type = readUint(blob);
      else if (child.id === ID.CodecID) track.codec = decodeText(blob).replace(/\0/g, '');
      else if (child.id === ID.Language) {
        track.language = decodeText(blob).replace(/\0/g, '');
      } else if (child.id === ID.Name) {
        track.name = decodeText(blob).replace(/\0/g, '');
      }
      inner.pos = child.payload + child.size;
    }
    tracks.push(track);
    buf.pos = el.payload + el.size;
  }
  return tracks;
}

function readUint(bytes: Uint8Array) {
  let value = 0;
  for (const b of bytes) value = value * 256 + b;
  return value;
}

function parseSeekHead(payload: Uint8Array): Map<number, number> {
  const buf = new Bytes(payload);
  const seeks = new Map<number, number>();
  while (buf.remaining() > 2) {
    const el = readElement(buf);
    if (!el || el.payload + el.size > buf.end) break;
    if (el.id === ID.Seek) {
      const inner = new Bytes(payload, el.payload, el.payload + el.size);
      let sid = 0;
      let pos = 0;
      while (inner.remaining() > 2) {
        const child = readElement(inner);
        if (!child || child.payload + child.size > inner.end) break;
        const blob = payload.subarray(child.payload, child.payload + child.size);
        if (child.id === ID.SeekID) sid = readUint(blob);
        else if (child.id === ID.SeekPosition) pos = readUint(blob);
        inner.pos = child.payload + child.size;
      }
      if (sid) seeks.set(sid, pos);
    }
    buf.pos = el.payload + el.size;
  }
  return seeks;
}

function parseInfoScale(payload: Uint8Array): number {
  const buf = new Bytes(payload);
  while (buf.remaining() > 2) {
    const el = readElement(buf);
    if (!el || el.payload + el.size > buf.end) break;
    if (el.id === ID.TimestampScale) {
      return readUint(payload.subarray(el.payload, el.payload + el.size));
    }
    buf.pos = el.payload + el.size;
  }
  return 1_000_000;
}

function parseCues(payload: Uint8Array, wanted: Set<number>): CueRef[] {
  const buf = new Bytes(payload);
  const cues: CueRef[] = [];
  while (buf.remaining() > 2) {
    const el = readElement(buf);
    if (!el) break;
    if (el.payload + el.size > buf.end) break;
    if (el.id === ID.CuePoint) {
      const inner = new Bytes(payload, el.payload, el.payload + el.size);
      let time = 0;
      while (inner.remaining() > 2) {
        const child = readElement(inner);
        if (!child || child.payload + child.size > inner.end) break;
        if (child.id === ID.CueTime) {
          time = readUint(payload.subarray(child.payload, child.payload + child.size));
        } else if (child.id === ID.CueTrackPositions) {
          const pos = new Bytes(payload, child.payload, child.payload + child.size);
          let track = 0;
          let cluster = 0;
          let relative = -1;
          let duration: number | null = null;
          while (pos.remaining() > 2) {
            const field = readElement(pos);
            if (!field || field.payload + field.size > pos.end) break;
            const blob = payload.subarray(field.payload, field.payload + field.size);
            if (field.id === ID.CueTrack) track = readUint(blob);
            else if (field.id === ID.CueClusterPosition) cluster = readUint(blob);
            else if (field.id === ID.CueRelativePosition) relative = readUint(blob);
            else if (field.id === ID.CueDuration) duration = readUint(blob);
            pos.pos = field.payload + field.size;
          }
          if (wanted.has(track) && relative >= 0) {
            cues.push({ track, time, cluster, relative, duration });
          }
        }
        inner.pos = child.payload + child.size;
      }
    }
    buf.pos = el.payload + el.size;
  }
  return cues;
}

function findElementStart(window: Uint8Array, ids: number[]) {
  const max = Math.min(16, window.length - 2);
  for (let i = 0; i <= max; i++) {
    try {
      const { id } = readId(window, i);
      if (ids.includes(id)) return i;
    } catch {
      // Keep scanning the small window.
    }
  }
  return -1;
}

function readBlockPayload(data: Uint8Array, pos: number, end: number) {
  const { value: track, length } = readVint(data, pos);
  const flags = data[pos + length + 2] ?? 0;
  const lacing = (flags & 0x06) >> 1;
  if (lacing !== 0) return { track, text: new Uint8Array() };
  return { track, text: data.subarray(pos + length + 3, end) };
}

function parseBlockGroup(
  window: Uint8Array,
  expectedTrack: number,
): { text: Uint8Array; duration: number | null } | null {
  const offset = findElementStart(window, [ID.BlockGroup, ID.SimpleBlock]);
  if (offset < 0) return null;
  const buf = new Bytes(window, offset, window.length);
  const el = readElement(buf);
  if (!el) return null;
  if (el.id === ID.SimpleBlock) {
    const end = Math.min(el.payload + el.size, window.length);
    const block = readBlockPayload(window, el.payload, end);
    if (block.track !== expectedTrack) return null;
    return { text: block.text, duration: null };
  }
  if (el.id !== ID.BlockGroup) return null;
  const innerEnd = Math.min(el.payload + el.size, window.length);
  const inner = new Bytes(window, el.payload, innerEnd);
  let text: Uint8Array | null = null;
  let duration: number | null = null;
  let track = -1;
  while (inner.remaining() > 2) {
    const child = readElement(inner);
    if (!child || child.payload > inner.end) break;
    const payloadEnd = Math.min(child.payload + child.size, inner.end);
    if (child.id === ID.Block) {
      const block = readBlockPayload(window, child.payload, payloadEnd);
      track = block.track;
      text = block.text;
    } else if (child.id === ID.BlockDuration) {
      duration = readUint(window.subarray(child.payload, payloadEnd));
    }
    inner.pos = child.payload + child.size;
    if (inner.pos > inner.end) break;
  }
  if (!text || track !== expectedTrack) return null;
  return { text, duration };
}

function stripAss(text: string) {
  const comma = text.split(',');
  const body = comma.length >= 9 ? comma.slice(8).join(',') : text;
  return body.replace(/\{[^}]*\}/g, '').replace(/\\[nNh]/gi, '\n');
}

function normalizeCueText(raw: Uint8Array, codec: string) {
  let text = decodeText(raw).replace(/\0/g, '').trim();
  if (!text) return '';
  if (codec.includes('ASS') || codec.includes('SSA')) text = stripAss(text);
  text = text.replace(/\\N/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/?[^>]+>/g, '');
  return text.trim();
}

function vttStamp(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const f = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(f, 3)}`;
}

function cuesToVtt(
  cues: { start: number; end: number; text: string }[],
) {
  const lines = ['WEBVTT', ''];
  for (const cue of cues) {
    if (!cue.text) continue;
    const end = cue.end > cue.start ? cue.end : cue.start + 2;
    const text = cue.text.replace(/-->/g, '→');
    lines.push(`${vttStamp(cue.start)} --> ${vttStamp(end)}`);
    lines.push(text);
    lines.push('');
  }
  return lines.join('\n');
}

function languageLabel(language: string, name: string, index: number) {
  const lang = language.toLowerCase();
  if (lang === 'per' || lang === 'fas' || lang === 'fa') return 'فارسی';
  if (lang === 'eng' || lang === 'en') return 'English';
  if (name && !/donyayeserial/i.test(name)) return name;
  return language || `زیرنویس ${index + 1}`;
}

function bcp47(language: string) {
  const lang = language.toLowerCase();
  if (lang === 'per' || lang === 'fas') return 'fa';
  if (lang === 'eng') return 'en';
  return language || 'und';
}

async function loadElement(
  url: string,
  abs: number,
  limit: number,
  signal?: AbortSignal,
) {
  const header = await fetchRange(url, abs, 32, signal);
  const buf = new Bytes(header);
  const el = readElement(buf);
  if (!el) throw new Error('bad element');
  const payloadAbs = abs + el.header;
  const size = Math.min(el.size, limit);
  const payload = await fetchRange(url, payloadAbs, size, signal);
  return { id: el.id, payload };
}

export async function extractMkvTextSubtitles(
  url: string,
  signal?: AbortSignal,
): Promise<ExtractedSubtitleTrack[]> {
  const head = await fetchRange(url, 0, HEADER_BYTES, signal);
  const top = new Bytes(head);
  const ebml = readElement(top);
  if (!ebml || ebml.id !== ID.EBML) throw new Error('not ebml');
  top.pos = ebml.payload + ebml.size;
  const segment = readElement(top);
  if (!segment || segment.id !== ID.Segment) throw new Error('not segment');
  const segmentPayload = segment.payload;

  let seeks = new Map<number, number>();
  let timestampScale = 1_000_000;
  let tracks: MkvTrack[] = [];

  let pos = segmentPayload;
  for (let i = 0; i < 8 && pos + 2 < head.length; i++) {
    const el = readElement(new Bytes(head, pos, head.length));
    if (!el) break;
    const payload = head.subarray(el.payload, Math.min(el.payload + el.size, head.length));
    if (el.id === ID.SeekHead) seeks = parseSeekHead(payload);
    else if (el.id === ID.Info) timestampScale = parseInfoScale(payload);
    else if (el.id === ID.Tracks) tracks = parseTracks(payload);
    else if (el.id === ID.Cluster) break;
    pos = el.payload + el.size;
  }

  if (!tracks.length && seeks.has(ID.Tracks)) {
    const loaded = await loadElement(
      url,
      segmentPayload + (seeks.get(ID.Tracks) as number),
      64_000,
      signal,
    );
    tracks = parseTracks(loaded.payload);
  }
  if (seeks.has(ID.Info) && timestampScale === 1_000_000) {
    try {
      const loaded = await loadElement(
        url,
        segmentPayload + (seeks.get(ID.Info) as number),
        4096,
        signal,
      );
      timestampScale = parseInfoScale(loaded.payload);
    } catch {
      // Keep the Matroska default of 1ms.
    }
  }

  const textTracks = tracks.filter(
    (track) => track.type === TRACK_SUBTITLE && TEXT_CODECS.has(track.codec),
  );
  if (!textTracks.length) return [];

  const wanted = new Set(textTracks.map((track) => track.number));
  const cuesAbs = seeks.get(ID.Cues);
  if (cuesAbs == null) return [];
  const cuesEl = await loadElement(url, segmentPayload + cuesAbs, CUES_LIMIT, signal);
  const cueRefs = parseCues(cuesEl.payload, wanted);
  if (!cueRefs.length) return [];

  const scale = timestampScale / 1e9;
  const codecByTrack = new Map(textTracks.map((track) => [track.number, track.codec]));
  const parsed = await mapPool(cueRefs, FETCH_CONCURRENCY, async (cue) => {
    try {
      const clusterAbs = segmentPayload + cue.cluster;
      // CueRelativePosition is from the first Cluster child. Cluster headers are
      // typically 7 bytes, so the Block sits a few bytes after clusterAbs+relative.
      const window = await fetchRange(
        url,
        clusterAbs + cue.relative,
        BLOCK_WINDOW,
        signal,
      );
      const block = parseBlockGroup(window, cue.track);
      if (!block) return null;
      const codec = codecByTrack.get(cue.track) || 'S_TEXT/UTF8';
      const text = normalizeCueText(block.text, codec);
      if (!text) return null;
      const durationUnits = cue.duration ?? block.duration;
      const start = cue.time * scale;
      const end =
        durationUnits != null ? start + durationUnits * scale : start + 3;
      return { track: cue.track, start, end, text };
    } catch {
      return null;
    }
  });

  const byTrack = new Map<number, { start: number; end: number; text: string }[]>();
  for (const cue of parsed) {
    if (!cue) continue;
    const list = byTrack.get(cue.track) ?? [];
    list.push(cue);
    byTrack.set(cue.track, list);
  }

  return textTracks.flatMap((track, index) => {
    const list = (byTrack.get(track.number) ?? []).sort((a, b) => a.start - b.start);
    for (let i = 0; i < list.length; i++) {
      const current = list[i];
      const next = list[i + 1];
      if (!current) continue;
      if (current.end <= current.start) {
        current.end = next ? Math.min(next.start - 0.04, current.start + 5) : current.start + 3;
      } else if (next && current.end > next.start) {
        current.end = Math.max(current.start + 0.2, next.start - 0.04);
      }
    }
    const vtt = cuesToVtt(list);
    if (!vtt.includes('-->')) return [];
    return [
      {
        id: `mkv-${track.number}`,
        language: bcp47(track.language),
        label: languageLabel(track.language, track.name, index),
        name: track.name || languageLabel(track.language, track.name, index),
        vtt,
      },
    ];
  });
}
