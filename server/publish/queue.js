// The publishing queue (docs/publishing/pipeline.md): every piece the desk makes waits here, with its preview (the
// video, a thumbnail, its contact sheet, the text, the target network), until the owner approves it (or, in the
// later phases' automatic modes, the desk does), is given a time that keeps each network's spacing, hours and daily
// cap, and goes out through its network's adapter. A memory of everything published (the ledger) makes a second
// post of the same thing impossible: an item whose key is already in the ledger is refused at enqueue and again at
// the moment of publishing.
//
// Files (data/publish by default, never in git):
//   queue/<id>.json        one item each, written whole (a temporary file renamed over it: a crash never leaves half)
//   ledger.jsonl           what was really published (append only); ledger-dry.jsonl what a dry run would have
//   settings.json          the phase, each network's mode and time zone (the approval page edits it)
//
// Item: { id, kind ('clip' | 'episode' | 'text'), platform, format, key, status, title, text, description, tags,
//   links, media: { video, thumb, contact, captions, duration, sha256 }, source: { episodeId, programId, momentId,
//   storyIds, airedAt }, disclosure, credits, compliance, score, priority, schedule: { at, tz }, history, attempts }
// Status: pending (waits for the owner) -> approved -> scheduled -> published | failed; held (a compliance refusal),
// rejected (the owner), duplicate (already in the ledger).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PLATFORMS, DAILY } from './platforms.js';

export const STATUSES = ['pending', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'held', 'rejected', 'duplicate'];
export const MODES = ['off', 'manual', 'sample', 'auto'];
// the modes the phases allow (plan.md): Phase 1-2 everything waits for the owner; Phase 3 samples one in SAMPLE_EVERY
export const SAMPLE_EVERY = 5;
const GLOBAL_GAP_MS = 10 * 60_000; // never two uploads to any networks within ten minutes of each other

export const DEFAULT_SETTINGS = Object.freeze({
  phase: 1,
  dryRun: true,
  timezone: 'Europe/London',
  modes: { youtube: 'manual', tiktok: 'manual', instagram: 'manual', facebook: 'off', x: 'off', threads: 'off', bluesky: 'off', telegram: 'off' },
  timezones: {},
  live: {}, // per network: true only when the owner has switched that network on for real (PUBLISH_LIVE=1 too)
});

const atomicWrite = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
};

/** A content key: the same content to the same network is the same post, whatever its id or its title. */
export function contentKey(item) {
  const src = item.source || {};
  const base = item.kind === 'text' ? `text|${(src.storyIds || []).slice().sort().join(',')}|${item.postKind || ''}` : item.kind === 'episode' ? `episode|${src.episodeId}` : `clip|${src.momentId || src.episodeId}|${item.format || ''}`;
  return `${item.platform}|${base}`;
}

/** The hour and the day of an instant in a time zone: { h, m, day: 'YYYY-MM-DD' }. */
export function localParts(ms, timeZone) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { h: Number(p.hour) % 24, m: Number(p.minute), day: `${p.year}-${p.month}-${p.day}` };
}

export class PublishQueue {
  constructor({ dir, now = () => Date.now(), log = () => {} } = {}) {
    if (!dir) throw new Error('PublishQueue needs a directory');
    this.dir = dir;
    this.qdir = path.join(dir, 'queue');
    this.now = now;
    this.log = log;
    fs.mkdirSync(this.qdir, { recursive: true });
  }

  // ------------------------------------------------------------------ settings

  settings() {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(this.dir, 'settings.json'), 'utf8'));
      return { ...DEFAULT_SETTINGS, ...s, modes: { ...DEFAULT_SETTINGS.modes, ...(s.modes || {}) }, timezones: { ...(s.timezones || {}) }, live: { ...(s.live || {}) } };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  saveSettings(patch = {}) {
    const cur = this.settings();
    const next = { ...cur, ...patch, modes: { ...cur.modes, ...(patch.modes || {}) }, timezones: { ...cur.timezones, ...(patch.timezones || {}) }, live: { ...cur.live, ...(patch.live || {}) } };
    for (const [k, m] of Object.entries(next.modes)) if (!MODES.includes(m)) next.modes[k] = 'manual';
    // the automatic modes belong to Phase 3 (plan.md): earlier phases keep every item for the owner
    if (next.phase < 3) for (const k of Object.keys(next.modes)) if (next.modes[k] === 'auto' || next.modes[k] === 'sample') next.modes[k] = 'manual';
    atomicWrite(path.join(this.dir, 'settings.json'), JSON.stringify(next, null, 1));
    return next;
  }

  tzOf(platform) {
    const s = this.settings();
    return s.timezones[platform] || s.timezone || 'Europe/London';
  }

  // ------------------------------------------------------------------ ledger

  ledgerFile(dry) {
    return path.join(this.dir, dry ? 'ledger-dry.jsonl' : 'ledger.jsonl');
  }

  ledger(dry = false) {
    try {
      return fs.readFileSync(this.ledgerFile(dry), 'utf8').split('\n').filter(Boolean).map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Was this content already published to this network (in the real ledger; a dry run checks its own too)? */
  published(key, { dry = false } = {}) {
    const real = this.ledger(false).find((e) => e.key === key);
    if (real) return real;
    return dry ? this.ledger(true).find((e) => e.key === key) || null : null;
  }

  /** Same video bytes, or the same story on the same network within a day: also a duplicate. */
  nearDuplicate(item, { dry = false } = {}) {
    const day = 24 * 3600_000;
    const entries = [...this.ledger(false), ...(dry ? this.ledger(true) : [])].filter((e) => e.platform === item.platform);
    if (item.media?.sha256 && entries.some((e) => e.sha256 === item.media.sha256)) return 'the same video was already published there';
    if (item.kind === 'text') {
      const ids = new Set(item.source?.storyIds || []);
      const hit = entries.find((e) => e.kind === 'text' && this.now() - e.at < day && (e.storyIds || []).some((id) => ids.has(id)));
      if (hit) return 'a post on the same story went out in the last 24 hours';
    }
    return null;
  }

  record(item, result, { dry = false } = {}) {
    const e = { at: this.now(), key: item.key, id: item.id, platform: item.platform, kind: item.kind, storyIds: item.source?.storyIds || [], momentId: item.source?.momentId || null, sha256: item.media?.sha256 || null, remoteId: result?.remoteId || null, url: result?.url || null, dryRun: !!dry, ...(item.experiment ? { experiment: item.experiment } : {}) };
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(this.ledgerFile(dry), `${JSON.stringify(e)}\n`);
    return e;
  }

  // ------------------------------------------------------------------ items

  file(id) {
    if (!/^[a-z0-9-]+$/i.test(String(id))) throw new Error('bad item id');
    return path.join(this.qdir, `${id}.json`);
  }

  get(id) {
    try {
      return JSON.parse(fs.readFileSync(this.file(id), 'utf8'));
    } catch {
      return null;
    }
  }

  list({ status = null, platform = null } = {}) {
    const out = [];
    for (const f of fs.readdirSync(this.qdir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const it = JSON.parse(fs.readFileSync(path.join(this.qdir, f), 'utf8'));
        if (status && (Array.isArray(status) ? !status.includes(it.status) : it.status !== status)) continue;
        if (platform && it.platform !== platform) continue;
        out.push(it);
      } catch {
        /* a file being written */
      }
    }
    return out.sort((a, b) => (a.schedule?.at ?? Infinity) - (b.schedule?.at ?? Infinity) || b.priority - a.priority || a.createdAt - b.createdAt);
  }

  save(item) {
    atomicWrite(this.file(item.id), JSON.stringify(item, null, 1));
    return item;
  }

  note(item, action, by = 'desk', extra = {}) {
    item.history = [...(item.history || []), { at: this.now(), action, by, ...extra }];
    return item;
  }

  /**
   * Add a piece. Refused (status 'duplicate', returned, not saved twice) when its content is already published to that
   * network or already waits in the queue. Its first status follows the network's mode: manual -> pending; sample ->
   * approved, but every SAMPLE_EVERY-th waits; auto -> approved; off -> not queued (null).
   */
  enqueue(input, { dry = true } = {}) {
    const settings = this.settings();
    const mode = settings.modes[input.platform] || 'manual';
    if (mode === 'off' || !PLATFORMS[input.platform]) return null;
    const item = { priority: 0, score: 0, tags: [], links: [], history: [], attempts: [], ...input };
    item.key = item.key || contentKey(item);
    item.id = item.id || `${item.platform}-${crypto.createHash('sha1').update(item.key).digest('hex').slice(0, 12)}`;
    item.createdAt = item.createdAt || this.now();
    if (this.published(item.key, { dry }) || this.nearDuplicate(item, { dry })) {
      return { ...item, status: 'duplicate', reason: this.published(item.key, { dry }) ? 'already published to this network' : this.nearDuplicate(item, { dry }) };
    }
    const existing = this.get(item.id);
    if (existing && !['rejected', 'failed'].includes(existing.status)) return { ...existing, duplicateOf: existing.id };
    if (item.compliance && item.compliance.ok === false) item.status = 'held';
    else if (item.grave) item.status = 'pending'; // a grave story waits for the owner, whatever the mode
    else if (mode === 'auto') item.status = 'approved';
    else if (mode === 'sample') {
      const n = this.list({ platform: item.platform }).length + 1;
      item.status = n % SAMPLE_EVERY === 0 ? 'pending' : 'approved';
      if (item.status === 'pending') item.sample = true;
    } else item.status = 'pending';
    this.note(item, 'queued', 'desk', { mode });
    // the network's mode is the owner's standing approval (set on the page, Phase 3 only): it is recorded as his, by
    // that mode, so the publisher's last switch (an approval in the item's history) sees it like a hand approval
    if (item.status === 'approved') this.note(item, 'approved', mode);
    return this.save(item);
  }

  /** The owner's decisions (the approval page): approve, reject, edit the title or the text. */
  approve(id, by = 'owner') {
    const it = this.get(id);
    if (!it || !['pending', 'held', 'rejected'].includes(it.status)) return it;
    if (it.compliance && it.compliance.ok === false) return it; // a compliance refusal is never approved over
    it.status = 'approved';
    return this.save(this.note(it, 'approved', by));
  }

  reject(id, by = 'owner', reason = '') {
    const it = this.get(id);
    if (!it || ['published', 'publishing'].includes(it.status)) return it;
    it.status = 'rejected';
    it.schedule = null;
    return this.save(this.note(it, 'rejected', by, reason ? { reason } : {}));
  }

  edit(id, { title, text } = {}, by = 'owner') {
    const it = this.get(id);
    if (!it || ['published', 'publishing'].includes(it.status)) return it;
    const max = PLATFORMS[it.platform]?.text?.title || 200;
    const clean = (x) => String(x).replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
    // an empty title keeps the old one; a text post keeps its disclosure first (the owner cannot edit it away)
    if (typeof title === 'string' && clean(title)) it.title = clean(title).slice(0, max);
    if (typeof text === 'string' && clean(text)) {
      let t = clean(text);
      if (it.kind === 'text' && !/^AI-generated:/.test(t)) t = `AI-generated: ${t.replace(/^AI[- ]generated:?\s*/i, '')}`;
      it.text = t;
    }
    return this.save(this.note(it, 'edited', by, { title: it.title }));
  }

  // ------------------------------------------------------------------ scheduling

  /** The day's cap of a network in the current phase (clips for video items, posts for text). */
  capOf(platform, kind) {
    const s = this.settings();
    const d = DAILY[s.phase]?.[platform] || {};
    const k = kind === 'text' ? 'posts' : kind === 'episode' ? 'uploads' : 'clips';
    // the owner's own number (settings.caps, written by hand: 5 whole programmes a day, 19 Oct), never past what the
    // network itself allows a day (platforms.js caps)
    const own = Number(s.caps?.[platform]?.[k]);
    if (own > 0) {
      const hard = PLATFORMS[platform]?.caps || {};
      const ceiling = Math.min(...[hard.uploadsPerDay, hard.postsPerDay, hard.reelsPerDay].filter((x) => x > 0), Infinity);
      return Math.min(Math.floor(own), ceiling);
    }
    const range = d[k];
    return range ? range[1] : 0;
  }

  /** The least time between two items on a network (ms): settings.spacingMinutes (by hand), else the network's own. */
  spacingOf(platform) {
    const own = Number(this.settings().spacingMinutes?.[platform]);
    return own >= 15 ? own * 60_000 : PLATFORMS[platform].spacing;
  }

  /**
   * Give every approved item a time: the earliest moment from `from` that is inside its network's hours (in its time
   * zone), at least the network's spacing after any other item scheduled or published there, at least ten minutes
   * from any upload anywhere, and within the network's daily cap. The best-scored items first.
   */
  schedule(from = this.now()) {
    const all = this.list();
    const taken = all.filter((x) => ['scheduled', 'published', 'publishing'].includes(x.status) && x.schedule?.at).map((x) => ({ platform: x.platform, kind: x.kind, at: x.schedule.at }));
    for (const e of this.ledger(false)) taken.push({ platform: e.platform, kind: e.kind, at: e.at });
    const queue = all.filter((x) => x.status === 'approved').sort((a, b) => b.priority - a.priority || b.score - a.score || a.createdAt - b.createdAt);
    const done = [];
    for (const it of queue) {
      const at = this.slotFor(it, from, taken);
      if (at === null) continue;
      it.status = 'scheduled';
      it.schedule = { at, tz: this.tzOf(it.platform), local: localParts(at, this.tzOf(it.platform)) };
      this.save(this.note(it, 'scheduled', 'desk', { at }));
      taken.push({ platform: it.platform, kind: it.kind, at });
      done.push(it);
    }
    return done;
  }

  slotFor(it, from, taken) {
    const p = PLATFORMS[it.platform];
    const tz = this.tzOf(it.platform);
    const cap = this.capOf(it.platform, it.kind) || 1;
    const spacing = this.spacingOf(it.platform);
    const step = 5 * 60_000;
    let t = Math.ceil(from / step) * step;
    const limit = from + 14 * 24 * 3600_000;
    while (t < limit) {
      const lp = localParts(t, tz);
      if (lp.h < p.hours[0] || lp.h >= p.hours[1]) {
        t += step;
        continue;
      }
      const sameNet = taken.filter((x) => x.platform === it.platform);
      const tooClose = sameNet.some((x) => Math.abs(x.at - t) < spacing) || taken.some((x) => Math.abs(x.at - t) < GLOBAL_GAP_MS);
      const thatDay = sameNet.filter((x) => x.kind === it.kind && localParts(x.at, tz).day === lp.day).length;
      if (!tooClose && thatDay < cap) return t;
      t += step;
    }
    return null;
  }

  /** Items whose time has come (scheduled at or before now). */
  due(now = this.now()) {
    return this.list({ status: 'scheduled' }).filter((x) => x.schedule?.at <= now);
  }
}
