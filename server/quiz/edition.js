// PAY ATTENTION at the station (docs/programmes/pay-attention.md §7–8): the desk the producer asks whether an edition
// can air and for the edition itself. It keeps the editions' history (who played, which rounds, what was asked) and the
// weekly table in their own files beside the archive (data/quiz/history.json, data/quiz/table.json), so a restart
// forgets nothing: the planner's pairing, rotation and "asked once a week" rules read the history.
//
//   const quiz = new QuizDesk({ archive, same, dir })
//   quiz.ready(program, channel, now)          → { air, reason }   (the plan is kept for the edition that follows)
//   quiz.make(program, channel, { now, recentLines }) → { episode, plan, game } | null
import fs from 'node:fs';
import path from 'node:path';
import { quizEvents, realEntry } from './desk.js';
import { planEdition, contestantsFrom, historyOf } from './planner.js';
import { writeEpisode } from './writer.js';
import { QuizTable } from './table.js';

const DAY = 86400_000;

/**
 * Every story an edition uses: the asked ones, every option and pin, DOUBLE OR NOTHING's offers (both, though one
 * airs) and the tie-break. Returns { ids, titles }: the events' story ids and their headlines (the aired words and the
 * archive's feed titles). The director keeps them all off the LATEST ticker while the edition airs: a headline the
 * game asks the viewer to name must never scroll under it.
 */
export function editionStories(plan, events, archive = null) {
  const keys = new Set();
  const add = (q) => {
    if (!q) return;
    if (q.key) keys.add(q.key);
    for (const o of q.options || []) if (o?.key) keys.add(o.key);
    for (const it of q.items || []) if (it?.key) keys.add(it.key);
  };
  for (const r of plan?.rounds || []) for (const q of r.questions || []) add(q);
  for (const o of plan?.don?.offers || []) add(o.question);
  add(plan?.tieBreak);
  const byKey = new Map((events || []).map((e) => [e.key, e]));
  const ids = new Set();
  const titles = new Set();
  const title = (t) => {
    const x = String(t || '').trim();
    if (x) titles.add(x);
  };
  for (const k of keys) {
    const ev = byKey.get(k);
    if (!ev) continue;
    title(ev.words);
    title(ev.latest?.title);
    title(ev.latest?.headline);
    for (const id of ev.ids || []) {
      ids.add(id);
      const e = archive?.byId?.get?.(id);
      title(e?.title);
      title(e?.headline);
    }
  }
  return { ids: [...ids], titles: [...titles] };
}
export const DEFAULT_CONTESTANTS = Object.freeze(['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam']);

export class QuizDesk {
  constructor({ archive = null, same = null, dir = null, now = () => Date.now(), log = console, view = false, pictures = null } = {}) {
    this.archive = archive;
    // the picture rights mode (server/rights.js, PICTURE_RIGHTS): PICTURE THIS shows only cleared pictures unless the
    // station runs a private preview ('preview'); the archive's own mode when none is given, else 'cleared'
    this.pictures = (pictures ?? archive?.pictures) === 'preview' ? 'preview' : 'cleared';
    // QUIZ_VIEW (server/config.js): a draft put on air by DRAFTS_ON_AIR may be viewed before the archive holds three
    // days and at any hour; an official programme never (plan() asks the channel which drafts are on air)
    this.view = !!view;
    this.same = same;
    this.now = now;
    this.log = log;
    this.historyFile = dir ? path.join(dir, 'history.json') : null;
    this.table = new QuizTable({ file: dir ? path.join(dir, 'table.json') : null, now });
    this.history = [];
    this.lastAt = 0;
    this.pending = null; // { at, plan } from ready()
    if (this.historyFile && fs.existsSync(this.historyFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        this.history = Array.isArray(data?.editions) ? data.editions.filter((h) => Number.isFinite(h?.at) && Array.isArray(h.pair)) : [];
        this.lastAt = this.history.reduce((m, h) => Math.max(m, h.at), 0);
      } catch { /* a torn file starts a fresh history */ }
    }
  }

  /** The contestants this programme draws from, with their own programmes (config `contestants`, else the eight). */
  contestants(program, channel) {
    const ids = (program.contestants || DEFAULT_CONTESTANTS).filter((id) => channel.presenters?.[id]);
    return contestantsFrom(channel, ids);
  }

  plan(program, channel, now = this.now()) {
    if (!this.archive) return { air: false, reason: 'no archive' };
    if (now - this.lastAt < (program.minGapHours ?? 4) * 3600_000) return { air: false, reason: `the last edition aired under ${program.minGapHours ?? 4} hours ago` };
    const entries = this.archive.entries.filter((e) => e.at <= now && realEntry(e));
    const { events, avoid } = quizEvents(this.archive, { now, days: 7, same: this.same, pictures: this.pictures });
    const view = this.view && Array.isArray(channel?.draftsOnAir) && channel.draftsOnAir.includes(program.id);
    const plan = planEdition({ events, entries, now, contestants: this.contestants(program, channel), history: this.history.filter((h) => h.at > now - 8 * DAY), same: this.same, avoid, pictures: this.pictures, ...(view ? { minArchiveDays: 0, checkHour: false } : {}) });
    if (plan?.air) plan.stories = editionStories(plan, events, this.archive);
    return plan;
  }

  /**
   * May an edition air now? The plan is kept for `make` (for ten minutes), and the answer for five: the station asks
   * often, and grouping a week of archive by story is not free.
   */
  ready(program, channel, now = this.now()) {
    if (this.checked && now - this.checked.at < 5 * 60_000 && now >= this.checked.at) return this.checked.result;
    const plan = this.plan(program, channel, now);
    this.pending = plan.air ? { at: now, plan } : null;
    const result = { air: plan.air, reason: plan.air ? null : plan.reason };
    this.checked = { at: now, result };
    return result;
  }

  /** The plan the next edition would air (the kept one if it is fresh, else a new one, kept), or null when nothing fits. */
  planFor(program, channel, now = this.now()) {
    if (this.pending && now - this.pending.at < 10 * 60_000) return this.pending.plan;
    const plan = this.plan(program, channel, now);
    this.pending = plan.air ? { at: now, plan } : null;
    return plan.air ? plan : null;
  }

  /** Forget the kept plan (the producer refused it: a picture the station could not fetch). */
  drop() {
    this.pending = null;
    this.checked = null;
  }

  /** The edition: `plan` (planFor's), else the kept plan if it is fresh, else a new one; null when nothing fits. */
  make(program, channel, { now = this.now(), recentLines = [], nextAt = null, plan: given = null } = {}) {
    const plan = given || (this.pending && now - this.pending.at < 10 * 60_000 ? this.pending.plan : this.plan(program, channel, now));
    this.pending = null;
    this.checked = null;
    if (!plan?.air) return null;
    // (the plan as aired: the writer's length guard may drop TODAY OR NOT TODAY headlines, which are then not asked)
    const { episode, game, plan: aired = plan } = writeEpisode(plan, { channel, now, table: this.table, recentLines, nextAt });
    this.record(aired);
    return { episode: { ...episode, quizStories: plan.stories || null }, plan: aired, game };
  }

  record(plan) {
    this.history.push(historyOf(plan));
    this.lastAt = Math.max(this.lastAt, plan.at);
    const since = this.now() - 14 * DAY;
    this.history = this.history.filter((h) => h.at >= since);
    if (!this.historyFile) return;
    try {
      fs.mkdirSync(path.dirname(this.historyFile), { recursive: true });
      fs.writeFileSync(this.historyFile, JSON.stringify({ editions: this.history }, null, 1));
    } catch (err) {
      this.log.warn?.(`[quiz] history not saved: ${err.message}`);
    }
  }
}
