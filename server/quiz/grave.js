// PAY ATTENTION's grave-day rule (docs/programmes/pay-attention.md §3.3): the quiz is a game, and the channel does not
// play games beside a tragedy. Any one of three signals in the last six hours of the archive stops it:
//   - a breaking story that is grave (severity 2 or more);
//   - more than 25 % of the stories aired were read grave (the archive's `grave`: the presenters read them sad);
//   - one story in which people were harmed (severity 3) led WORLD NOW or NEWS IN 60 four or more times.
// Calibrated on 12 Oct, an ordinary heavy news day: at most 14.1 % grave in any six hours, no severity-3 story led more
// than twice, nothing breaking. "More than 40 % grave or serious", the first draft's rule, would have stopped the quiz on
// that ordinary day (41.6 % of its stories were read grave or serious).
import { severity } from '../facts.js';
import { realEntry } from './desk.js';

export const GRAVE_WINDOW_MS = 6 * 3600_000;
export const GRAVE_SHARE = 0.25;
export const GRAVE_LEADS = 4;
export const MIN_AIRINGS = 20; // fewer airings in six hours than this: too little to judge, and the quiz does not air
const LEAD_PROGRAMMES = new Set(['world-now', 'news-60']);

const storyText = (e) => `${e.title || ''}. ${e.summary || ''} ${e.text || ''}`;

/**
 * Is it a grave news day at `now`? `entries` are the archive's airings (oldest first); `same` groups a story's airings
 * (the news desk's sameStory), else they are grouped by id. Returns { grave, reason, share, leads, airings }.
 */
export function graveDay(entries, { now = Date.now(), same = null, real = true } = {}) {
  const win = entries.filter((e) => e.at <= now && e.at > now - GRAVE_WINDOW_MS && (!real || realEntry(e)));
  const share = win.length ? win.filter((e) => e.grave).length / win.length : 0;
  const base = { share: Math.round(share * 1000) / 10, airings: win.length };
  if (win.length < MIN_AIRINGS) return { grave: false, thin: true, reason: `only ${win.length} airings in six hours`, ...base, leads: 0 };
  const breaking = win.find((e) => e.breaking && severity(storyText(e)) >= 2);
  if (breaking) return { grave: true, reason: `grave breaking story: ${breaking.headline}`, ...base, leads: 0 };
  if (share > GRAVE_SHARE) return { grave: true, reason: `${base.share} % of the last six hours read grave`, ...base, leads: 0 };
  // the same harmful story leading the news programmes again and again
  const groups = [];
  for (const e of win) {
    if (e.rank !== 0 || !LEAD_PROGRAMMES.has(e.programId) || severity(storyText(e)) < 3) continue;
    let g = groups.find((x) => x.ids.has(e.id) || (same && x.entries.some((o) => same(o, e))));
    if (!g) groups.push((g = { ids: new Set(), entries: [] }));
    g.ids.add(e.id);
    g.entries.push(e);
  }
  const top = groups.sort((a, b) => b.entries.length - a.entries.length)[0];
  const leads = top ? top.entries.length : 0;
  if (leads >= GRAVE_LEADS) return { grave: true, reason: `a story with people harmed led ${leads} times: ${top.entries.at(-1).headline}`, ...base, leads };
  return { grave: false, reason: null, ...base, leads };
}
