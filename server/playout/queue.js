// The playout queue (docs/publishing/playout.md §3-4): the programmes rendered ahead, each a file with the time it
// airs baked into its pictures and words, aired back to back by tools/playout/air.mjs; the filler that covers a hole
// or an underrun; and the renderer's buffer policy (tools/playout/render.mjs).
//
// A segment: { id, kind: 'episode' | 'break', unit, airAt (ms, its first frame on air), frames, fps, file, title,
//              programId, itemId, master?, gate? }. A unit is a break and the programme it promotes ("UP NEXT"), or a
//              programme alone: the gate passes or holds them together, so no break ever promotes what does not air.
//
//   planAir(queue, playhead, opts)      what the playout writes next: a segment, filler up to the next one, or a late
//                                       segment dropped (its clock would lie). Never black: no segment -> filler.
//   bufferAhead(queue, now)             seconds of programme queued from now on (the buffer)
//   renderPlan({ frontier, now, ... })  'render' or 'wait', and the air time the next unit renders for (the frontier,
//                                       or later when the frontier fell behind real time: the gap is filler)
//   framesOf(seconds, fps), secondsOf(frames, fps), samplesOf(frames, fps, rate)
//   PlayoutStore                        the queue's folder: one JSON per segment, written atomically
import fs from 'node:fs';
import path from 'node:path';

export const PLAYOUT_DEFAULTS = Object.freeze({
  fps: 30,
  rate: 48000, // audio samples a second (each frame carries rate / fps of them: 1600)
  targetSeconds: 3600, // the buffer the renderer keeps (PLAYOUT_BUFFER_MIN, --buffer)
  minLeadSeconds: 90, // a unit never renders for an air time closer than this to now plus its expected render time
  tolerance: 2, // s: a segment this late still airs (its clock reads HH:MM); later, it is dropped
  granuleSeconds: 2, // the filler's step when nothing is queued (one GOP)
});

export const framesOf = (seconds, fps = PLAYOUT_DEFAULTS.fps) => Math.max(0, Math.round(seconds * fps));
export const secondsOf = (frames, fps = PLAYOUT_DEFAULTS.fps) => frames / fps;
/** The audio samples that go with `frames` (exact: 1600 a frame at 48 kHz and 30 fps). */
export const samplesOf = (frames, fps = PLAYOUT_DEFAULTS.fps, rate = PLAYOUT_DEFAULTS.rate) => Math.round((frames * rate) / fps);
export const endOf = (seg) => seg.airAt + (seg.frames / (seg.fps || PLAYOUT_DEFAULTS.fps)) * 1000;

const byAir = (a, b) => a.airAt - b.airAt || String(a.id).localeCompare(String(b.id));

/**
 * The playout's next step at `playhead` (ms, the air time of the next frame it writes).
 *   { type: 'segment', seg, offset }               it starts now (late by at most `tolerance` s: its clock reads HH:MM)
 *   { type: 'drop', seg, late }                    it should have started `late` s ago: airing it would put a wrong
 *                                                  time on screen and push every later segment off its time
 *   { type: 'filler', frames, until, reason }      until the next segment (reason 'gap': a hole or a jump in the
 *                                                  renderer's frontier), or one granule when nothing is queued
 *                                                  (reason 'underrun')
 * `queue` holds segments not yet aired, in any order.
 */
export function planAir(queue, playhead, { fps = PLAYOUT_DEFAULTS.fps, tolerance = PLAYOUT_DEFAULTS.tolerance, granuleSeconds = PLAYOUT_DEFAULTS.granuleSeconds } = {}) {
  const list = [...(queue || [])].filter((s) => Number.isFinite(s?.airAt) && s.frames > 0).sort(byAir);
  const frameMs = 1000 / fps;
  for (const seg of list) {
    const late = (playhead - seg.airAt) / 1000;
    if (late > tolerance) return { type: 'drop', seg, late };
    // on time (late by at most `tolerance`, early by under half a frame): it airs now
    if (late >= -frameMs / 2000) return { type: 'segment', seg, offset: late };
    // the next segment is ahead: filler up to it (whole frames)
    const frames = Math.max(1, Math.round((seg.airAt - playhead) / frameMs));
    return { type: 'filler', frames, until: seg.airAt, reason: 'gap', next: seg.id };
  }
  return { type: 'filler', frames: framesOf(granuleSeconds, fps), until: null, reason: 'underrun' };
}

/** Seconds of programme queued from `now` on: up to the end of the last segment, gaps not counted. */
export function bufferAhead(queue, now) {
  let s = 0;
  for (const seg of queue || []) {
    const a = Math.max(seg.airAt, now);
    const b = endOf(seg);
    if (b > a) s += (b - a) / 1000;
  }
  return s;
}

/**
 * The renderer's decision before each unit. `frontier` (ms) is where the last rendered unit ends on air; `expect`
 * (s) how long the next unit should take to make and render. It renders while the frontier is less than `target`
 * seconds ahead of now; it waits otherwise. When the frontier has fallen behind (now + expect + minLead), the unit
 * renders for that later time instead, rounded up to a whole granule after the frontier: the playout fills the gap.
 * -> { action: 'render' | 'wait', airAt, gap (s), ahead (s), waitSeconds }
 */
export function renderPlan({ frontier, now, target = PLAYOUT_DEFAULTS.targetSeconds, expect = 0, minLead = PLAYOUT_DEFAULTS.minLeadSeconds, granuleSeconds = PLAYOUT_DEFAULTS.granuleSeconds, fps = PLAYOUT_DEFAULTS.fps }) {
  const start = Number.isFinite(frontier) ? frontier : now;
  const ahead = (start - now) / 1000;
  if (ahead >= target) return { action: 'wait', airAt: start, gap: 0, ahead, waitSeconds: Math.max(1, Math.min(60, ahead - target + 1)) };
  const earliest = now + (Math.max(0, expect) + minLead) * 1000;
  let airAt = start;
  if (start < earliest) {
    const g = granuleSeconds * 1000;
    airAt = start + Math.ceil((earliest - start) / g) * g;
  }
  // whole frames from the frontier (the playout counts frames)
  const frameMs = 1000 / fps;
  airAt = start + Math.round((airAt - start) / frameMs) * frameMs;
  return { action: 'render', airAt: Math.round(airAt), gap: (airAt - start) / 1000, ahead, waitSeconds: 0 };
}

/** A running estimate of render speed (air seconds made per real second), for `expect`. */
export class SpeedMeter {
  constructor({ initial = 1, weight = 0.3 } = {}) {
    this.speed = initial;
    this.weight = weight;
    this.samples = [];
  }
  add(airSeconds, realSeconds) {
    if (!(airSeconds > 0 && realSeconds > 0)) return this.speed;
    const s = airSeconds / realSeconds;
    this.samples.push({ air: airSeconds, real: realSeconds, speed: s });
    if (this.samples.length > 200) this.samples.shift();
    this.speed = this.samples.length === 1 ? s : this.speed * (1 - this.weight) + s * this.weight;
    return this.speed;
  }
  /** Real seconds to render `airSeconds` (with a margin: speed is a running mean). */
  expect(airSeconds, margin = 1.25) {
    return (airSeconds / Math.max(0.05, this.speed)) * margin;
  }
}

// ---------------------------------------------------------------- the folder

const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
};
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/**
 * The playout's folder (data/playout by default):
 *   queue/<airAt>-<id>.json   segments passed by the gate, waiting to air (the renderer writes, the playout reads)
 *   aired/<airAt>-<id>.json   segments the playout has aired (moved there by the playout, with airedAt)
 *   held/<airAt>-<id>.json    units the gate held, with the reasons (never aired; the approval page lists them)
 *   segments/                 the air files; masters/<slot>/ the clip-mode masters for the publishing desk
 *   events.jsonl              one line per event (render, gate, air, filler, underrun, drop, delete)
 */
export class PlayoutStore {
  constructor(dir) {
    this.dir = dir;
    for (const d of ['queue', 'aired', 'held', 'segments', 'masters']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  name(seg) {
    return `${stamp(seg.airAt)}-${seg.id}.json`;
  }
  list(sub) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(this.dir, sub)).filter((n) => n.endsWith('.json'));
    } catch {
      return [];
    }
    return names.sort().map((n) => readJson(path.join(this.dir, sub, n))).filter(Boolean);
  }
  queued() {
    return this.list('queue');
  }
  enqueue(seg) {
    writeJson(path.join(this.dir, 'queue', this.name(seg)), seg);
    return seg;
  }
  hold(unit) {
    const at = Number.isFinite(unit.airAt) ? unit.airAt : Number.isFinite(unit.segments?.[0]?.airAt) ? unit.segments[0].airAt : Date.now();
    writeJson(path.join(this.dir, 'held', `${stamp(at)}-${unit.id}.json`), { ...unit, heldAt: Date.now() });
  }
  held() {
    return this.list('held');
  }
  /** The playout moves a segment from queue/ to aired/ once it has written it (or dropped it). */
  aired(seg, extra = {}) {
    const n = this.name(seg);
    writeJson(path.join(this.dir, 'aired', n), { ...seg, ...extra });
    try {
      fs.rmSync(path.join(this.dir, 'queue', n), { force: true });
    } catch {
      /* gone */
    }
  }
  airedList() {
    return this.list('aired');
  }
  event(type, data = {}) {
    try {
      fs.appendFileSync(path.join(this.dir, 'events.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), type, ...data })}\n`);
    } catch {
      /* the log is a record */
    }
  }
  status(name, data) {
    try {
      writeJson(path.join(this.dir, `${name}-status.json`), { ...data, at: new Date().toISOString() });
    } catch {
      /* a convenience */
    }
  }
  readStatus(name) {
    return readJson(path.join(this.dir, `${name}-status.json`));
  }
}
