// PRESS START's release-date reader, for the design's measurement (docs/programmes/press-start.md §3.2, the UNLOCKS
// board): a game's release date read from a headline or the summary's first sentence, only when the sentence says it
// plainly ("Vixen 357 coming to PS5, Xbox Series, PS4, Xbox One, Switch, and PC on October 23", "Guns of Eschaton
// launches December 8", "Edge of Memories has been delayed to December 3"). A month alone, a season or a quarter is no
// date; a demo, a beta, a sale or a DLC wave is no release of the game; a date already past when the story was filed is
// not ahead. Returns null when nothing is certain.
import { sentencesIn } from '../../server/facts.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\\.?';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
// "October 23", "23 October", "October 23, 2026", "Oct. 23"
const DATE = new RegExp(`(?:${MONTH}\\s+${DAY}(?:,?\\s+(20\\d\\d))?|${DAY}\\s+${MONTH}(?:\\s+(20\\d\\d))?)(?![\\d:])`, 'i');
// the verb that makes it a release: launches, arrives, is out, comes to, hits, is dated for, delayed to, release date
const RELEASE = /\b(?:launch(?:es|ing)?|launched|arriv(?:es|ing)|out (?:on|now)|comes? (?:to|out)|coming (?:to|out)|hits?|lands?|releas(?:es|ing)|release date|dated for|is dated|delayed (?:to|until)|pushed (?:back )?to|slips? to|set for|due (?:on|out)|available (?:on|from))\b/i;
// what is not the game itself coming out
// (a console's name is no series: "Vixen 357 coming to PS5, Xbox Series, PS4… on October 23")
const NOT_A_RELEASE = /\b(?:demo|beta|alpha|playtest|test|sale|discount|free (?:weekend|to play weekend)|showcase|direct|stream|livestream|event\b|tournament|update|patch|season \d|wave \d|warbond|battle pass|expansion pass|soundtrack|vinyl|album|trailer|reveal|presentation|conference|award|awards|ceremony|film|movie|tv series|netflix|anime series|episode|pre-?orders?|reviews?|embargo|tribunal|hearing|trial)\b/i;

const monthIndex = (m) => MONTHS.findIndex((x) => x.startsWith(m.toLowerCase().replace('.', '').slice(0, 3)));

/** The release date a story states, as { date: 'YYYY-MM-DD', sentence }, or null. */
export function releaseDate(story) {
  const published = Number(story?.published) || Date.now();
  const pubYear = new Date(published).getUTCFullYear();
  const sentences = [String(story?.title || ''), sentencesIn(String(story?.summary || ''))[0] || ''];
  for (const sentence of sentences) {
    if (!RELEASE.test(sentence) || NOT_A_RELEASE.test(sentence)) continue;
    const m = DATE.exec(sentence);
    if (!m) continue;
    const [month, day, year] = m[1] ? [m[1], m[2], m[3]] : [m[5], m[4], m[6]];
    const mi = monthIndex(month);
    const d = Number(day);
    if (mi < 0 || !(d >= 1 && d <= 31)) continue;
    let y = year ? Number(year) : pubYear;
    let at = Date.UTC(y, mi, d);
    // no year: the next such date on or after the day it was filed
    if (!year && at < Date.UTC(new Date(published).getUTCFullYear(), new Date(published).getUTCMonth(), new Date(published).getUTCDate())) at = Date.UTC(++y, mi, d);
    if (new Date(at).getUTCDate() !== d) continue; // "February 31"
    if (at + 86400_000 <= published) continue; // already past when filed
    return { date: new Date(at).toISOString().slice(0, 10), sentence };
  }
  return null;
}
