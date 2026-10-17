// The article cache (docs/publishing/verbatim.md §5): the outlet's own words for each story the channel puts on air,
// kept after the news desk has let the story go, so a clip, a Short, an upload or a post can still be measured against
// them under the verbatim rule (server/compliance/verbatim.js archiveGetStory reads this cache), and a post can carry
// an aired line once the article proves the line is the channel's own words.
//
// Only what the channel already read, and nothing fetched here:
//   article  the article text the news desk read for the writer (news.js readArticle: the outlet's page, read under
//            the desk's own rules, the first paragraphs: article.js caps it at 2,400 characters)
//   feed     else the feed's own full text (content:encoded) when the feed gave one (news.js parseItem: feedText)
// A story with neither (a feed of headlines and teasers, a page that refused the desk) keeps its title and summary in
// the archive and nothing here. A page the outlet's robots.txt keeps from us (server/robots.js) was never read: only
// its feed's text is kept, and an article text kept for it earlier is replaced or removed.
//
// Lean on disk: text only (no HTML, no picture, no page), at most ARTICLE_MAX characters, one small JSON file per
// article in <dataDir>/compliance/articles/<articleKey(link)>.json { link, text, via, source, at } (the file name
// and the `text` field the compliance desk's audit already uses), expired with the archive: a file not written or
// refreshed for `days` is removed (checked at most once an hour).
//
// ARTICLE_CACHE=off keeps nothing; a feed marked "cache": false in the feeds file is never kept (server/index.js).
//
//   new ArticleCache({ dir, days, max, now, log, skip })
//   cache.save(story)     -> 'article' | 'feed' | null (what it kept)
//   cache.text(link)      -> the cached text, or null
//   cache.prune()         -> how many files it removed
//   sourceTextOf(story)   -> { text, via } | null: what the cache keeps for a story
import fs from 'node:fs';
import path from 'node:path';
import { articleKey } from './compliance/verbatim.js';

export const ARTICLE_MAX = 6000;
export const ARTICLE_DAYS = 14;
const HOUR = 3600_000;
const DAY = 86400_000;
const plain = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/[ \t\f\v\r]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

/** The outlet's words a story carries that the channel read: its article text, else the feed's full text. */
export function sourceTextOf(story, { max = ARTICLE_MAX } = {}) {
  if (!story) return null;
  const cut = (t) => {
    const s = plain(t);
    if (s.length <= max) return s;
    // whole sentences up to the cap
    const head = s.slice(0, max);
    const stop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'), head.lastIndexOf('? '), head.lastIndexOf('! '));
    return stop > max * 0.6 ? head.slice(0, stop + 1) : head;
  };
  // a page the outlet's robots.txt keeps from us (news.js pageRefused) never gives its article text, only the feed's
  if (story.pageRefused !== 'robots' && typeof story.body === 'string' && story.body.trim().length >= 80) return { text: cut(story.body), via: `article${story.bodyVia ? `:${story.bodyVia}` : ''}` };
  if (typeof story.feedText === 'string' && story.feedText.trim().length >= 80) return { text: cut(story.feedText), via: 'feed' };
  return null;
}

export class ArticleCache {
  constructor({ dir = null, days = ARTICLE_DAYS, max = ARTICLE_MAX, now = () => Date.now(), log = console, skip = null } = {}) {
    this.dir = dir;
    this.skip = typeof skip === 'function' ? skip : null; // a story never kept (its feed is marked "cache": false)
    this.days = days;
    this.max = max;
    this.now = now;
    this.log = log;
    this.prunedAt = -Infinity;
    this.warned = false;
  }

  file(link) {
    return path.join(this.dir, `${articleKey(link)}.json`);
  }

  read(link) {
    if (!this.dir || !link) return null;
    try {
      return JSON.parse(fs.readFileSync(this.file(link), 'utf8'));
    } catch {
      return null;
    }
  }

  text(link) {
    return this.read(link)?.text || null;
  }

  /**
   * Keep a story's words (its article text, else its feed's full text). An article already kept is never replaced by
   * a feed's text, unless the outlet's robots.txt now keeps the page from us; the same text again only refreshes the
   * file's date (a story told again stays as long as the archive keeps it).
   */
  save(story) {
    if (!this.dir || !story?.link || this.skip?.(story)) return null;
    const got = sourceTextOf(story, { max: this.max });
    // the outlet's robots.txt keeps the page from us: an article text kept before (an older reading, the audit) goes,
    // replaced by the feed's text when there is one
    const refused = story.pageRefused === 'robots';
    if (!got && !refused) return null;
    try {
      const f = this.file(story.link);
      const old = this.read(story.link);
      const oldIsArticle = !!old?.text && !/^feed/.test(old.via || '');
      if (!got) {
        if (oldIsArticle) fs.unlinkSync(f);
        return null;
      }
      fs.mkdirSync(this.dir, { recursive: true });
      if (old?.text === got.text || (oldIsArticle && got.via === 'feed' && !refused)) {
        const t = new Date(this.now());
        fs.utimesSync(f, t, t);
      } else {
        const doc = { link: story.link, text: got.text, via: got.via, source: story.source || null, at: new Date(this.now()).toISOString() };
        fs.writeFileSync(f, JSON.stringify(doc));
      }
      if (this.now() - this.prunedAt >= HOUR) this.prune();
      return /^article/.test(got.via) ? 'article' : 'feed';
    } catch (err) {
      if (!this.warned) this.log.warn?.(`[articles] ${err.message}`);
      this.warned = true;
      return null;
    }
  }

  /** Remove what has not been written or refreshed for `days`. */
  prune() {
    this.prunedAt = this.now();
    if (!this.dir || !fs.existsSync(this.dir)) return 0;
    const since = this.now() - this.days * DAY;
    let n = 0;
    for (const name of fs.readdirSync(this.dir)) {
      if (!/^[0-9a-f]{20}\.json$/.test(name)) continue;
      const f = path.join(this.dir, name);
      try {
        if (fs.statSync(f).mtimeMs < since) {
          fs.unlinkSync(f);
          n++;
        }
      } catch { /* gone already */ }
    }
    return n;
  }
}
