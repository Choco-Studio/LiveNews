// What the faces in a picture show, as the face reader (tools/pictures/faces.mjs: a face detector and an expression
// model, run in a headless browser) found them; the picture desk reads its verdicts and queues the pictures it needs
// read. The station itself runs no model: a picture never read is treated as unknown, and an unknown face never airs
// where its expression matters (a grave story's portrait) or where a bystander's face would (a FILE picture of an
// event under a grave story).
//
//   new FaceStore({ dir }).verdict(url) -> faceVerdict | null (never read)
//   .want(url, why)  queue a picture for the reader;  .queue() the queued pictures;  .record(url, reading)
//   faceVerdict(reading) -> { faces, share, smile, sober, foreground, why }
import fs from 'node:fs';
import path from 'node:path';

// the expression model's classes (FER+): neutral, happiness, surprise, sadness, anger, disgust, fear, contempt
export const SOBER = {
  minScore: 0.85, // the main face, surely a face
  minShare: 0.12, // the main face at least this share of the picture's height (a portrait, not a crowd)
  maxHappiness: 0.2, // no smile, no grin
  maxSurprise: 0.4,
  minCalm: 0.45, // neutral + sadness: a sober face
  foreground: 0.09, // a face this share of the height or more is a person in the foreground
};

/** The verdict on one reading: the main face and its expression, any face in the foreground. */
export function faceVerdict(reading) {
  if (!reading || !Array.isArray(reading.faces)) return null;
  const faces = reading.faces.filter((f) => f.score >= 0.7);
  const main = faces.slice().sort((a, b) => b.h - a.h)[0] || null;
  const e = main?.emotions || {};
  const share = main ? main.h : 0;
  const smile = !!main && ((e.happiness || 0) > SOBER.maxHappiness || topOf(e) === 'happiness');
  const calm = (e.neutral || 0) + (e.sadness || 0);
  let why = null;
  if (!main) why = 'no face found';
  else if (main.score < SOBER.minScore) why = 'face not sure';
  else if (share < SOBER.minShare) why = 'face too small for a portrait';
  else if (smile) why = `smiling (happiness ${(e.happiness || 0).toFixed(2)})`;
  else if ((e.surprise || 0) > SOBER.maxSurprise) why = 'surprised';
  else if (calm < SOBER.minCalm) why = `not calm (${topOf(e)})`;
  // a second face nearly as big: not a portrait of one person
  else if (faces.filter((f) => f !== main && f.h >= share * 0.7).length) why = 'two people';
  return {
    faces: faces.length,
    share: +share.toFixed(3),
    expression: main ? topOf(e) : null,
    happiness: +(e.happiness || 0).toFixed(3),
    smile,
    sober: !why,
    foreground: faces.some((f) => f.h >= SOBER.foreground),
    why,
  };
}

const topOf = (e) => Object.entries(e || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

/** The face reader's readings kept on disk, and the queue of pictures the desk wants read. */
export class FaceStore {
  constructor({ dir = null, now = () => Date.now(), log = console } = {}) {
    this.file = dir ? path.join(dir, 'faces.json') : null;
    this.queueFile = dir ? path.join(dir, 'faces-queue.json') : null;
    this.now = now;
    this.log = log;
    this.readings = new Map();
    this.wanted = new Map();
    this.mtime = 0;
    this.load();
    try {
      for (const [url, why] of Object.entries(JSON.parse(fs.readFileSync(this.queueFile, 'utf8'))?.queue || {})) this.wanted.set(url, why);
    } catch {}
  }

  /** Read the file again if the reader wrote it since. */
  load() {
    if (!this.file) return;
    try {
      const st = fs.statSync(this.file);
      if (st.mtimeMs === this.mtime) return;
      this.mtime = st.mtimeMs;
      const doc = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const [url, r] of Object.entries(doc?.readings || {})) this.readings.set(url, r);
    } catch {}
  }

  /** The verdict on a picture (null: never read). */
  verdict(url) {
    this.load();
    const r = this.readings.get(url);
    return r && !r.failed ? faceVerdict(r) : null; // (a picture that would not download was never read)
  }

  /** Ask the reader to read this picture (kept in faces-queue.json). */
  want(url, why = '') {
    if (!url || this.verdict(url) || this.wanted.has(url)) return;
    this.wanted.set(url, why);
    this.saveQueue();
  }

  queue() {
    return [...this.wanted.entries()].filter(([url]) => !this.verdict(url)).map(([url, why]) => ({ url, why }));
  }

  /** The reader's reading of a picture (the tool records it). */
  record(url, reading) {
    this.readings.set(url, { ...reading, at: this.now() });
    this.wanted.delete(url);
  }

  save() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, readings: Object.fromEntries(this.readings) }));
      fs.renameSync(tmp, this.file);
      this.mtime = fs.statSync(this.file).mtimeMs;
    } catch (err) {
      this.log.warn?.(`[pictures] could not keep face readings: ${err.message}`);
    }
    this.saveQueue();
  }

  saveQueue() {
    if (!this.queueFile) return;
    try {
      fs.mkdirSync(path.dirname(this.queueFile), { recursive: true });
      const tmp = `${this.queueFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, queue: Object.fromEntries([...this.wanted].filter(([u]) => !this.verdict(u))) }));
      fs.renameSync(tmp, this.queueFile);
    } catch {}
  }
}
