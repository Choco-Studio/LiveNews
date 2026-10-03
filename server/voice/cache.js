// Disk cache of synthesised voice clips under data/voice/: <id>.ogg (the audio,
// written atomically by the worker) and <id>.json (duration, word times,
// phrases, loudness envelope). Ids are content hashes, so a clip never goes
// stale; the folder is kept under a size limit by deleting the least recently
// used clips, never one that is on air or queued.
import fs from 'node:fs';
import path from 'node:path';
import { ID_RE } from './plan.js';

export class VoiceCache {
  constructor({ dir, maxBytes = 300 * 1024 * 1024, minAgeMs = 3 * 3600_000, log = console } = {}) {
    this.dir = dir;
    this.maxBytes = maxBytes;
    this.minAgeMs = minAgeMs; // clips touched more recently than this are never pruned
    this.log = log;
    this.writes = 0;
  }

  ensureDir() {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  audioPath(id) {
    if (!ID_RE.test(id)) throw new Error('bad clip id');
    return path.join(this.dir, `${id}.ogg`);
  }

  metaPath(id) {
    if (!ID_RE.test(id)) throw new Error('bad clip id');
    return path.join(this.dir, `${id}.json`);
  }

  /** The clip's metadata if both files are there (and marks it as used), else null. */
  get(id) {
    if (!ID_RE.test(id)) return null;
    try {
      const meta = JSON.parse(fs.readFileSync(this.metaPath(id), 'utf8'));
      const st = fs.statSync(this.audioPath(id));
      if (!st.size || !Number.isFinite(meta?.duration)) return null;
      this.touch(id);
      return meta;
    } catch {
      return null;
    }
  }

  touch(id) {
    const t = new Date();
    for (const p of [this.audioPath(id), this.metaPath(id)]) {
      try {
        fs.utimesSync(p, t, t);
      } catch { /* gone: get() reports it */ }
    }
  }

  /** Store the metadata next to the audio the worker wrote (atomically: temp file + rename). */
  put(id, meta) {
    this.ensureDir();
    const file = this.metaPath(id);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(meta));
    fs.renameSync(tmp, file);
    this.writes++;
  }

  /**
   * Delete least recently used clips until the folder is under maxBytes.
   * `keep` (Set of ids) and anything used within minAgeMs survive. Returns
   * { files, bytes, removed }.
   */
  prune(keep = new Set(), now = Date.now()) {
    let entries = [];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return { files: 0, bytes: 0, removed: 0 };
    }
    const clips = new Map(); // id -> { bytes, mtime, files }
    for (const name of entries) {
      const full = path.join(this.dir, name);
      const m = /^(v[0-9a-f]{20})\.(ogg|json)$/.exec(name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (!m) {
        // Leftover temp files of an interrupted write.
        if ((/\.tmp$/.test(name) || name.startsWith('.voice-')) && now - st.mtimeMs > 3600_000) fs.rmSync(full, { force: true });
        continue;
      }
      const c = clips.get(m[1]) || { bytes: 0, mtime: 0, files: [] };
      c.bytes += st.size;
      c.mtime = Math.max(c.mtime, st.mtimeMs);
      c.files.push(full);
      clips.set(m[1], c);
    }
    let bytes = 0;
    for (const c of clips.values()) bytes += c.bytes;
    let removed = 0;
    if (bytes > this.maxBytes) {
      const old = [...clips.entries()].filter(([id, c]) => !keep.has(id) && now - c.mtime > this.minAgeMs).sort((a, b) => a[1].mtime - b[1].mtime);
      for (const [, c] of old) {
        if (bytes <= this.maxBytes) break;
        for (const f of c.files) fs.rmSync(f, { force: true });
        bytes -= c.bytes;
        removed++;
      }
    }
    return { files: clips.size - removed, bytes, removed };
  }
}
