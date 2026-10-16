// The channel's archive (data/archive/<date>.jsonl, server/archive.js) read back for the length gate: every story the
// station aired with the fields its desk had (headline, summary, outlet, section, picture, link), the moment it first
// aired, and every edition as it aired (programme, time, its stories in running order).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** The file name of a page in the cache (the same key as tools/sport/snapshot.mjs). */
export const pageKey = (u) => crypto.createHash('sha1').update(String(u)).digest('hex').slice(0, 14);

/**
 * { stories: Map id -> story (first airing's fields, `firstAired` ms), editions: [{ at, programId, ids }] oldest first }.
 * `until` (ms) leaves out what aired after it.
 */
export function readArchive(dir, { until = Infinity } = {}) {
  const entries = [];
  for (const f of fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort()) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e?.id && Number.isFinite(e.at) && e.at <= until) entries.push(e);
      } catch {
        /* a torn line */
      }
    }
  }
  entries.sort((a, b) => a.at - b.at || a.rank - b.rank);
  const stories = new Map();
  const editions = new Map();
  for (const e of entries) {
    if (!stories.has(e.id)) {
      stories.set(e.id, {
        id: e.id,
        title: e.title,
        summary: e.summary || '',
        // (the archive keeps the source plate as aired: "The Guardian / Photo: Jae C Hong/AP"; the desk's is the outlet)
        source: String(e.source || '').split(' / ')[0],
        category: e.category,
        image: e.image || null,
        images: e.images || (e.image ? [e.image] : []),
        link: e.link || '',
        firstAired: e.at,
      });
    }
    const k = `${e.at} ${e.programId}`;
    if (!editions.has(k)) editions.set(k, { at: e.at, programId: e.programId, ids: [] });
    editions.get(k).ids[e.rank >= 0 ? e.rank : editions.get(k).ids.length] = e.id;
  }
  return { stories, editions: [...editions.values()].map((x) => ({ ...x, ids: x.ids.filter(Boolean) })).sort((a, b) => a.at - b.at) };
}
