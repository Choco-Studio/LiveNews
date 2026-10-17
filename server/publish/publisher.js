// The publisher (docs/publishing/pipeline.md §4): every item whose time has come goes through, in order,
//   1. the ledger: already published to that network (or the same video, or the same story there today): refused
//   2. the compliance gate (server/publish/compliance.js preflight): any violation holds the item, nothing is sent
//   3. the C2PA mark on a video (markFile, into a signed copy beside the clip, which is what is uploaded; the clip
//      itself stays as it was made, so its hash in the ledger stays its identity), read back by the real module:
//      an unmarked file is never sent live
//   4. its network's adapter: a DRY RUN unless every switch is on (below), with the adapter's rate limit and retries
//   5. the ledger again (the real one, or the dry run's own), the outbox (what was sent or would have been, secrets
//      redacted) and the item's status
// A live publish needs ALL of: PUBLISH_LIVE=1 in the environment, settings.dryRun false, the network switched on in
// settings.live, the real compliance module (never the stub), the item approved by the owner (or by its automatic
// mode in Phase 3), and the network's credentials. Missing any one: a dry run, and the outbox says which was missing.
import fs from 'node:fs';
import path from 'node:path';
import { makeAdapter } from './adapters/index.js';
import { redact } from './adapters/base.js';
import * as compliance from './compliance.js';

/** Why an item would not go out live (empty: it may). */
export function liveBlockers(queue, item, { env = process.env, usingStub = compliance.usingStub, adapter = null } = {}) {
  const s = queue.settings();
  const why = [];
  if (env.PUBLISH_LIVE !== '1') why.push('PUBLISH_LIVE is not 1');
  if (s.dryRun !== false) why.push('the desk is in dry-run mode (settings.dryRun)');
  if (!s.live?.[item.platform]) why.push(`${item.platform} is not switched on (settings.live.${item.platform})`);
  if (usingStub) why.push('the compliance module is the stub');
  if (!(item.history || []).some((h) => h.action === 'approved')) why.push('nobody approved it');
  if (adapter && !adapter.configured()) why.push(`credentials missing: ${adapter.missing().join(', ')}`);
  return why;
}

export class Publisher {
  constructor({ queue, env = process.env, fetchImpl = globalThis.fetch, log = () => {}, now = () => Date.now(), sleep, adapters = {}, gate = compliance.preflight, mark = compliance.markFile, readMark = compliance.complianceModule.readMark || null, dataDir = null, usingStub = compliance.usingStub } = {}) {
    this.queue = queue;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.log = log;
    this.now = now;
    this.sleep = sleep;
    this.adapters = adapters; // id -> adapter (tests); else made on demand
    this.gate = gate;
    this.mark = mark;
    this.readMark = readMark;
    this.dataDir = dataDir;
    this.usingStub = usingStub;
    this.outbox = path.join(queue.dir, 'outbox.jsonl');
  }

  adapterFor(platform, dryRun) {
    const key = `${platform}|${dryRun ? 'dry' : 'live'}`;
    if (!this.adapters[key]) this.adapters[key] = this.adapters[platform] || makeAdapter(platform, { env: this.env, fetchImpl: this.fetchImpl, dryRun, log: this.log, now: this.now, ...(this.sleep ? { sleep: this.sleep } : {}) });
    return this.adapters[key];
  }

  writeOutbox(entry) {
    fs.mkdirSync(path.dirname(this.outbox), { recursive: true });
    fs.appendFileSync(this.outbox, `${JSON.stringify(redact(entry, Object.values(this.env).filter((v) => typeof v === 'string' && v.length >= 12)))}\n`);
  }

  /** Publish (or dry-run) one item now. Returns the item as saved. */
  async publishOne(item) {
    const q = this.queue;
    const probe = makeAdapter(item.platform, { env: this.env, dryRun: true });
    const blockers = liveBlockers(q, item, { env: this.env, usingStub: this.usingStub, adapter: probe });
    const dry = blockers.length > 0;
    // 1. the ledger
    if (q.published(item.key, { dry }) || q.nearDuplicate(item, { dry })) {
      item.status = 'duplicate';
      return q.save(q.note(item, 'duplicate', 'desk', { reason: q.published(item.key, { dry }) ? 'already published to this network' : q.nearDuplicate(item, { dry }) }));
    }
    // 2. the compliance gate, again, at the moment of publishing
    const gate = this.gate(this.gateItem(item), { now: this.now(), register: compliance.register(this.dataDir) });
    item.compliance = { ok: !!gate.ok, violations: gate.violations || [], warnings: gate.warnings || [], stub: !!this.usingStub, checkedAt: this.now() };
    if (!gate.ok) {
      item.status = 'held';
      this.writeOutbox({ at: this.now(), id: item.id, platform: item.platform, held: item.compliance.violations });
      return q.save(q.note(item, 'held', 'compliance', { rules: item.compliance.violations.map((v) => v.rule) }));
    }
    // 3. the C2PA mark (a video item): a signed copy, read back
    let upload = item;
    if (item.media?.video) {
      const signed = item.media.video.replace(/(\.[a-z0-9]+)$/i, '.c2pa$1');
      const manifest = compliance.buildManifest({ kind: item.kind === 'clip' && item.format === 'vertical' ? 'short' : item.kind, episode: null }, { title: item.title, sources: item.links?.map((l) => l.url) || [], credits: item.credits || [], format: item.format });
      const m = await this.mark(item.media.video, manifest, { output: signed });
      let readBack = null;
      if (m.ok && this.readMark && !this.usingStub) {
        try {
          readBack = this.readMark(m.path || signed);
        } catch (err) {
          readBack = { ok: false, error: String(err?.message || err) };
        }
      }
      const ok = !!m.ok && (!readBack || (readBack.ok && readBack.aiGenerated !== false));
      item.media.mark = { ok, stub: !!m.stub, reason: m.reason || readBack?.error || null, sidecar: m.sidecar || null, signed: m.ok ? m.path || signed : null };
      if (!ok && !dry) {
        item.status = 'held';
        return q.save(q.note(item, 'held', 'compliance', { rules: ['unmarked'], reason: item.media.mark.reason }));
      }
      if (ok && item.media.mark.signed && fs.existsSync(item.media.mark.signed)) upload = { ...item, media: { ...item.media, video: item.media.mark.signed } };
    }
    // 4. the adapter
    item.status = 'publishing';
    q.save(item);
    const adapter = this.adapterFor(item.platform, dry);
    const r = await adapter.publish(upload);
    item.attempts = [...(item.attempts || []), { at: this.now(), ok: r.ok, dryRun: r.dryRun, error: r.error || null }];
    this.writeOutbox({ at: this.now(), id: item.id, platform: item.platform, dryRun: r.dryRun, blockers, ok: r.ok, error: r.error || null, requests: r.requests });
    if (r.ok) {
      item.status = 'published';
      item.result = { remoteId: r.remoteId || null, url: r.url || null, dryRun: r.dryRun };
      q.record(item, r, { dry: r.dryRun });
      return q.save(q.note(item, r.dryRun ? 'published (dry run)' : 'published', 'desk', r.dryRun ? { blockers } : { url: r.url }));
    }
    // a retryable failure goes back to the schedule (an hour later), three times at most
    const fails = item.attempts.filter((a) => !a.ok).length;
    if (r.retryable && fails < 3) {
      item.status = 'approved';
      item.schedule = null;
      return q.save(q.note(item, 'retry later', 'desk', { error: r.error }));
    }
    item.status = 'failed';
    return q.save(q.note(item, 'failed', 'desk', { error: r.error }));
  }

  /** The compliance gate's view of an item (the contract's clip fields). */
  gateItem(item) {
    const episode = item.gate?.episodeFile && fs.existsSync(item.gate.episodeFile) ? JSON.parse(fs.readFileSync(item.gate.episodeFile, 'utf8')) : null;
    const recording = item.gate?.reportFile && fs.existsSync(item.gate.reportFile) ? JSON.parse(fs.readFileSync(item.gate.reportFile, 'utf8')) : null;
    return {
      id: item.id,
      kind: item.kind === 'text' ? 'text' : item.kind === 'episode' ? 'episode' : item.format === 'vertical' ? 'short' : 'clip',
      episode,
      recording,
      range: item.gate?.range || null,
      platforms: [item.platform],
      // the flags the adapter will really send (and an owner's hand-set label on a network with no field)
      flags: { [item.platform]: { ...(item.disclosure?.[item.platform] || {}), ...makeAdapter(item.platform, { env: {}, dryRun: true }).aiFlags(item), ...(item.manualLabel?.[item.platform] ? { manualLabel: true } : {}) } },
      text: item.text,
      labelFrames: item.gate?.labelFrames || null,
      // the vertical picture is recomposed at 216x384 and scaled 5x (docs/publishing/vertical.md), not a crop
      frame: item.gate?.frame || (item.format === 'vertical' ? { layout: 'vertical-216x384', crop: { x: 0, y: 0, w: 216, h: 384 }, output: { w: 1080, h: 1920 } } : null),
      publishAt: item.schedule?.at ?? this.now(),
    };
  }

  /**
   * One publisher at a time: a lock file with this process's id (a second round started by hand while the scheduled one
   * runs would race it to the same items). A lock left by a process that is gone is taken over. Returns a release().
   */
  lock() {
    const file = path.join(this.queue.dir, 'publisher.lock');
    try {
      const held = JSON.parse(fs.readFileSync(file, 'utf8'));
      let alive = false;
      try {
        process.kill(held.pid, 0);
        alive = held.pid !== process.pid;
      } catch {
        alive = false;
      }
      if (alive) return null;
    } catch {
      /* no lock */
    }
    fs.mkdirSync(this.queue.dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: this.now() }));
    return () => fs.rmSync(file, { force: true });
  }

  /** Schedule what is approved, then publish everything due (refused while another publisher holds the lock). */
  async run() {
    const release = this.lock();
    if (!release) throw new Error('another publisher is running (data/publish/publisher.lock)');
    try {
      this.queue.schedule(this.now());
      const out = [];
      for (const it of this.queue.due(this.now())) out.push(await this.publishOne(it));
      return out;
    } finally {
      release();
    }
  }
}
