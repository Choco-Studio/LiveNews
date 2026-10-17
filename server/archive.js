// The channel's memory of what it put on air (SEVEN DAYS, the weekly round-up; owner 12 Oct: "Sí, pero cúrratelo"):
// every story that went out, with the words it was told in, the programme and the time, its picture, its place, its
// figures and its quote, kept 14 days in data/archive/<date>.jsonl so a restart forgets nothing. The weekly is
// written from it (server/weeklywriter.js): only what the channel already told, checked when it aired.
//
//   new Archive({ dir, days, now }).record(episode, { get })   one line per story of a news episode
//   archive.week({ days, now, same })   the week's stories, grouped by event: [{ key, entries, first, last, times,
//                                       programmes, days, best, latest, score }], the most told first
//   archive.story(id)                   an archived story (for its picture once the news desk has let it go)
// With `articles` (server/articlecache.js), each recorded story's article text (or its feed's full text) is kept beside
// it, the outlet's words a clip or a post is measured against once the news desk has let the story go.
import fs from 'node:fs';
import path from 'node:path';
import { compactRights, currentRights } from './rights.js';

const DAY = 86400_000;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export class Archive {
  constructor({ dir = null, days = 14, now = () => Date.now(), log = console, pictures = null, articles = null } = {}) {
    this.dir = dir;
    this.articles = articles;
    // the picture rights mode (server/rights.js): 'cleared' shows an archived picture again only with its cleared rights
    // record (an older entry's outlet photo is kept aside as `outletImage`); 'preview' shows them all; null (tests,
    // older callers) leaves the entries as written
    this.pictures = pictures;
    this.days = days;
    this.now = now;
    this.log = log;
    this.entries = []; // oldest first
    this.byId = new Map(); // story id -> the latest entry's story fields
    this.pictured = new Map(); // story id -> the latest entry that aired it with its picture (a retelling may carry none)
    this.load();
  }

  load() {
    if (!this.dir || !fs.existsSync(this.dir)) return;
    const since = this.now() - this.days * DAY;
    for (const f of fs.readdirSync(this.dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort()) {
      if (Date.parse(`${f.slice(0, 10)}T23:59:59Z`) < since) {
        try {
          fs.unlinkSync(path.join(this.dir, f)); // older than the archive keeps
        } catch { /* gone already */ }
        continue;
      }
      for (const line of fs.readFileSync(path.join(this.dir, f), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          this.keep(JSON.parse(line));
        } catch { /* a torn last line after a crash is skipped */ }
      }
    }
  }

  keep(e) {
    if (!e?.id || !Number.isFinite(e.at)) return;
    if (this.pictures === 'cleared' && e.image && !(e.imageRights?.cleared && e.imageRights.url === e.image) && !/^file:/i.test(e.image)) {
      // an outlet's photo (every entry before the rights desk): never shown again by default (SEVEN DAYS, PAY ATTENTION)
      e.outletImage = e.image;
      e.image = null;
      delete e.images;
    }
    this.entries.push(e);
    this.byId.set(e.id, e);
    if (e.image) this.pictured.set(e.id, e);
  }

  /**
   * One entry per story of a news episode (weather and the weekly itself are not news): the aired text of its first
   * story segment (the presenter's words, checked against the source when it was made), its boards and quote, and the
   * story's own fields. `get(id)` is the news desk's story.
   */
  record(episode, { get = () => null, at = this.now() } = {}) {
    if (!episode?.segments?.length || episode.weather || episode.program?.kind === 'weekly' || episode.weekly) return 0;
    const seen = new Set();
    const lines = [];
    const order = (episode.storyIds || []).slice();
    // an expert's first answer on a story (SEVEN DAYS can bring it back: "our health correspondent explained it")
    const analyses = new Map();
    for (const seg of episode.segments) {
      if (seg.type === 'cross' && seg.kind === 'expert' && seg.part === 'piece' && seg.storyId && !analyses.has(seg.storyId)) {
        analyses.set(seg.storyId, { expert: seg.reporter, text: clip(seg.text, 500), backdrop: seg.backdrop || null, desk: seg.desk || null });
      }
    }
    for (const seg of episode.segments) {
      if (seg.type !== 'story' || !seg.storyId || seen.has(seg.storyId)) continue;
      seen.add(seg.storyId);
      const s = get(seg.storyId) || {};
      const e = {
        at,
        programId: episode.program?.id || null,
        rank: order.indexOf(seg.storyId),
        id: seg.storyId,
        title: clip(s.title || seg.headline, 200),
        headline: clip(seg.headline, 80),
        summary: clip(s.summary, 700),
        source: seg.source || s.source || null,
        category: seg.category || s.category || null,
        image: s.image || null,
        ...(Array.isArray(s.images) && s.images.length ? { images: s.images.slice(0, 3) } : {}),
        // the picture's rights record as it aired (its credit, licence, author, page): shown again only if cleared
        ...(s.image && currentRights(s) ? { imageRights: compactRights(currentRights(s)) } : {}),
        link: s.link || null,
        ...(Array.isArray(s.kw) ? { kw: s.kw.slice(0, 24) } : {}),
        text: clip(seg.text, 700),
        ...(seg.kicker ? { kicker: seg.kicker } : {}),
        ...(seg.location ? { location: seg.location } : {}),
        ...(seg.numbers?.length ? { numbers: seg.numbers } : {}),
        ...(seg.known?.length ? { known: seg.known } : {}),
        ...(seg.quote?.text ? { quote: seg.quote } : {}),
        ...(seg.feature ? { feature: seg.feature } : {}),
        ...(seg.roundup ? { roundup: true } : {}),
        ...(seg.breaking ? { breaking: true } : {}),
        ...(analyses.has(seg.storyId) ? { analysis: analyses.get(seg.storyId) } : {}),
        ...(seg.emotion === 'sad' || seg.emotion === 'serious' ? { grave: seg.emotion === 'sad', serious: true } : {}),
      };
      lines.push(e);
      this.keep(e);
      this.articles?.save?.(s);
    }
    this.prune();
    if (this.dir && lines.length) {
      try {
        fs.mkdirSync(this.dir, { recursive: true });
        fs.appendFileSync(path.join(this.dir, `${new Date(at).toISOString().slice(0, 10)}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      } catch (err) {
        this.log.warn?.(`[archive] ${err.message}`);
      }
    }
    return lines.length;
  }

  prune() {
    const since = this.now() - this.days * DAY;
    if (this.entries.length && this.entries[0].at < since) {
      this.entries = this.entries.filter((e) => e.at >= since);
      for (const [id, e] of this.pictured) if (e.at < since) this.pictured.delete(id);
    }
  }

  story(id) {
    const e = this.byId.get(id);
    // (the story's picture is the one it aired with, even when a later retelling, NEWS IN 60's, carried none: /api/img
    // serves it, as PAY ATTENTION's PICTURE THIS asks it)
    const pic = e?.image ? e : this.pictured.get(id);
    return e ? { id: e.id, title: e.title, summary: e.summary, source: e.source, category: e.category, image: pic?.image ?? null, images: pic?.images, ...(pic?.imageRights ? { imageRights: pic.imageRights, imageCredit: pic.imageRights.credit } : {}), link: e.link, kw: e.kw, archived: true } : null;
  }

  /**
   * The week's stories grouped by event (`same(a, b)`: the news desk's sameStory, else the same id), each with its
   * entries oldest first, when it was first and last told, how often, in how many programmes and on how many days,
   * the fullest telling (`best`) and the latest; scored by how much the channel told it (the lead counts double).
   */
  week({ days = 7, now = this.now(), same = null } = {}) {
    const since = now - days * DAY;
    const groups = [];
    for (const e of this.entries) {
      if (e.at < since || e.at > now) continue;
      let g = groups.find((x) => x.ids.has(e.id));
      if (!g && same) g = groups.find((x) => x.entries.some((o) => o.category === e.category && same(o, e)));
      if (!g) groups.push((g = { ids: new Set(), entries: [] }));
      g.ids.add(e.id);
      g.entries.push(e);
    }
    return groups
      .map((g) => {
        const es = g.entries;
        const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
        const best = [...es].sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0) || (a.roundup ? 1 : 0) - (b.roundup ? 1 : 0))[0];
        const programmes = new Set(es.map((e) => e.programId));
        const daysTold = new Set(es.map((e) => dayKey(e.at)));
        const leads = es.filter((e) => e.rank === 0).length;
        return {
          key: [...g.ids][0],
          ids: [...g.ids],
          entries: es,
          first: es[0].at,
          last: es.at(-1).at,
          times: es.length,
          programmes: [...programmes],
          days: [...daysTold].sort(),
          best,
          latest: es.at(-1),
          category: best.category,
          score: es.length + 1.5 * programmes.size + 2 * daysTold.size + 2 * leads + (es.some((e) => e.breaking) ? 3 : 0),
        };
      })
      .sort((a, b) => b.score - a.score || b.last - a.last);
  }
}
