// What an edition measures for the length gate (docs/roadmap/critique/fallback-lengths.md): its length at the voices'
// rate as the station counts it (server/station.js programmeAir: each segment's words at 2.75 a second, 0.6 s between
// segments, 12 s for the open and the close), the time each kind of segment takes, the boards it carries, and the
// sentences it says twice, within itself or after the programme's previous edition.
import { programmeAir } from '../../server/station.js';

const plain = (t) => String(t || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (t) => plain(t).split(/\s+/).filter(Boolean).length;
export const sentencesOfText = (t) => plain(t).split(/(?<=[.!?…]["”’]?)\s+(?=["“‘]?[A-Z0-9])/).map((x) => x.trim()).filter(Boolean);
const SIGNPOST = /^(?:still to come|also coming up|coming up|later in the programme|also ahead)\b/i;

/** The kind of a segment, for the share of time: lead, story, number, roundup, lighter, correspondent, expert, ... */
export function kindOf(seg, i, segs) {
  if (seg.type === 'intro') return 'intro';
  if (seg.type === 'outro') return 'outro';
  if (seg.type === 'cross') return seg.kind === 'expert' ? 'expert' : seg.kind === 'restage' ? 'in-their-words' : 'correspondent';
  if (seg.type === 'chat') return seg.term ? 'explainer' : SIGNPOST.test(plain(seg.text)) ? 'signpost' : 'exchange';
  if (seg.type === 'story') {
    if (seg.feature === 'roundup') return 'roundup';
    if (seg.feature === 'number') return 'number';
    if (seg.feature === 'lighter') return 'lighter';
    const first = segs.findIndex((s) => s.type === 'story');
    return i === first ? 'lead' : 'story';
  }
  return seg.type || 'other';
}

/** Content words of a sentence, folded (for "the same sentence in other words"). */
const content = (t) => new Set(plain(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3));
function near(a, b) {
  const x = content(a);
  const y = content(b);
  if (x.size < 4 || y.size < 4) return false;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size) >= 0.8;
}

/** The measures of an episode; `prev` is the programme's previous edition (for repeats across editions). */
export function measure(ep, prev = null) {
  const segs = ep?.segments || [];
  const air = programmeAir(ep);
  const byKind = {};
  segs.forEach((s, i) => {
    const k = kindOf(s, i, segs);
    byKind[k] ||= { n: 0, words: 0, seconds: 0 };
    byKind[k].n++;
    byKind[k].words += words(s.text);
    byKind[k].seconds += words(s.text) / 2.75;
  });
  const spoken = Object.values(byKind).reduce((a, k) => a + k.seconds, 0) || 1;
  const share = Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, Math.round((1000 * v.seconds) / spoken) / 10]));
  const boards = {};
  for (const s of segs) for (const b of ['known', 'timeline', 'change', 'share', 'next', 'who', 'numbers', 'quote', 'map']) if (s[b] && (!Array.isArray(s[b]) || s[b].length)) boards[b] = (boards[b] || 0) + 1;
  // every sentence of six words or more, said twice in the edition (the same words, or most of them); the headlines
  // and a signpost name what a story then tells, and a link's prompt and thanks are formulae: they are left out
  const told = (s, i) => s.type === 'story' || (s.type === 'cross' && (s.part === 'piece' || s.part === 'answer')) || (s.type === 'chat' && !['signpost'].includes(kindOf(s, i, segs)));
  const all = segs.flatMap((s, i) => (told(s, i) ? sentencesOfText(s.text).map((t) => ({ t, i })) : []));
  const long = all.filter((x) => words(x.t) >= 6);
  const within = [];
  for (let a = 0; a < long.length; a++) for (let b = a + 1; b < long.length; b++) if (long[a].t.toLowerCase() === long[b].t.toLowerCase() || near(long[a].t, long[b].t)) within.push([long[a].t, long[b].t]);
  // ...and after the programme's previous edition: the presenters' own lines (not a story's sentences, which a re-run
  // story tells again) and every sentence alike, counted apart
  const across = { lines: [], sentences: 0 };
  if (prev) {
    const prevSegs = prev.segments || [];
    const prevSet = new Set(prevSegs.flatMap((s) => sentencesOfText(s.text)).filter((t) => words(t) >= 4).map((t) => t.toLowerCase()));
    for (const s of segs) {
      // (the greeting and the sign-off are the programme's fixed formulae)
      const own = s.type === 'chat' || (s.type === 'cross' && (s.part === 'ask' || s.part === 'thanks'));
      for (const t of sentencesOfText(s.text)) {
        if (words(t) < 4 || !prevSet.has(t.toLowerCase())) continue;
        across.sentences++;
        if (own) across.lines.push(t);
      }
    }
  }
  const stories = segs.filter((s) => s.type === 'story');
  return {
    air: Math.round(air),
    words: segs.reduce((a, s) => a + words(s.text), 0),
    segments: segs.length,
    stories: stories.length,
    mains: stories.filter((s) => !s.feature).length,
    byKind,
    share,
    boards,
    within,
    across,
  };
}

/** One edition as a page to read line by line: every segment with who reads it, its kind, its boards and its words. */
export function render(ep, { title = '' } = {}) {
  const segs = ep?.segments || [];
  const out = [];
  if (title) out.push(`# ${title}`, '');
  const who = (slot) => ep?.cast?.[slot] || ep?.correspondents?.[slot] || slot;
  segs.forEach((s, i) => {
    const kind = kindOf(s, i, segs);
    const tags = [kind, s.part, s.kicker, s.location?.place && `@${s.location.place}`, s.link && `link ${s.link}`, s.fact && `FACT ${s.fact}`].filter(Boolean);
    const boards = [];
    if (s.numbers?.length) boards.push(`NUMBERS ${s.numbers.map((n) => [n.qualifier, n.value, n.label].filter(Boolean).join(' ')).join(' / ')}`);
    if (s.known?.length) boards.push(`WHAT WE KNOW ${s.known.join(' / ')}`);
    if (s.timeline?.length) boards.push(`HOW WE GOT HERE ${s.timeline.map((x) => `${x.when}: ${x.what}`).join(' / ')}`);
    if (s.change) boards.push(`FROM-TO ${s.change.label}: ${s.change.from} -> ${s.change.to}`);
    if (s.share) boards.push(`SHARE ${JSON.stringify(s.share)}`);
    if (s.next) boards.push(`NEXT ${JSON.stringify(s.next)}`);
    if (s.who?.length) boards.push(`WHO ${s.who.map((p) => `${p.name} (${p.role})`).join(' / ')}`);
    if (s.quote?.text) boards.push(`QUOTE “${s.quote.text}” — ${s.quote.by}`);
    if (s.term) boards.push(`TERM ${s.term.term}: ${s.term.plain}`);
    if (s.stillToCome) boards.push(`STILL TO COME ${s.stillToCome.map((x) => x.storyId).join(', ')}`);
    out.push(`[${String(i).padStart(2)}] ${s.type}:${who(s.anchor)} {${tags.join(' | ')}}${s.headline ? ` «${s.headline}»` : ''}${s.storyId ? ` (${s.storyId})` : ''}`);
    for (const b of boards) out.push(`       ▸ ${b}`);
    out.push(`       ${plain(s.text)}`);
  });
  return out.join('\n');
}
