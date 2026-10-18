// A whole programme as a YouTube video (docs/publishing/plan.md §5; Phase 2: the best programmes and SEVEN DAYS):
// its title, its description (the disclosure first, what it covers, the chapters, every source with its link, the
// credits), its tags and its chapters from the aired timeline (timeline.js: each segment's start in the recording).
// YouTube makes chapters from timestamps in the description when the first is 0:00, there are three or more, and each
// is at least 10 seconds long; this module writes them only then.
//
//   chaptersFor(episode, timeline) -> [{ at, label }]
//   uploadMeta(episode, { timeline, stories, airedAt, timeZone, credits }) -> { title, description, tags, chapters, worthy, why }
import { describe, creditsFor } from './compliance.js';
import { ownWords, storyLabel, citation, cleanLink } from './wording.js';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const clock = (s) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const title100 = (s) => {
  const t = norm(s).replace(/[<>]/g, '');
  if (t.length <= 100) return t;
  const cut = t.slice(0, 99);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:–-]+$/, '')}…`;
};

const WEAK = new Set('a an the of to in on at by for from with and or but as after before over into its is are was were be'.split(' '));
/** Text cut to at most `max` characters at a word, never ending on a weak word or a comma. */
function cutAtWord(text, max) {
  const words = norm(text).split(' ');
  while (words.length > 1 && (words.join(' ').length > max || WEAK.has(words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '')))) words.pop();
  return words.join(' ').replace(/[,;:–-]+$/, '');
}

/**
 * A story's words in a title, a chapter or the summary: the channel's aired headline when it passes the verbatim rule
 * against the story's sources, else the channel's label of the story (its kicker and place), else its outlet's name.
 */
function storyWords(seg, stories, { fallback = true } = {}) {
  const st = stories?.get?.(seg.storyId) || null;
  const sources = [st?.title, st?.summary].filter(Boolean);
  if (seg.headline && ownWords(seg.headline, sources)) return norm(seg.headline);
  const label = storyLabel({ kicker: seg.kicker, location: seg.location, category: seg.category }, sources);
  if (label) return label;
  // nothing of its own to name it by: a chapter is its place in the programme and its outlet (never two chapters
  // alike); a title or the summary leaves it out
  if (!fallback) return '';
  return `Story ${(seg.storyIndex ?? 0) + 1}${seg.source ? ` · ${String(seg.source).split(' / ')[0]}` : ''}`;
}

/** A segment's chapter label: the story's own words, a quiz round's title, the weather's zone, else what it is. */
function labelOf(seg, stories) {
  if (seg.type === 'intro') return 'Headlines';
  if (seg.type === 'outro') return 'Sign-off';
  if (seg.part === 'round' && seg.quiz?.title) return `Round: ${seg.quiz.title}`;
  if (seg.part === 'don') return 'Double or nothing';
  if (seg.part === 'result') return 'Result';
  if (seg.type === 'weather') {
    if (seg.kind === 'zone' && seg.zone) return `Weather: ${String(seg.zone.name || seg.zone.label || seg.zone).replace(/^\w/, (c) => c.toUpperCase())}`;
    return { headline: 'The big weather story', world: 'The next 24 hours', hotcold: 'Hot and cold', warning: 'Weather warnings', outlook: 'The next three days', outro: 'Sign-off' }[seg.kind] || null;
  }
  if (seg.type === 'story' && seg.headline) return seg.roundup ? 'Around the world' : storyWords(seg, stories);
  if (seg.type === 'cross' && seg.kind === 'expert' && seg.part === 'piece') return null; // the story's own chapter goes on
  return null;
}

/** Chapters from the aired timeline: a new label at each segment that has one, merged under 10 s, 0:00 first. */
export function chaptersFor(episode, timeline, { stories = new Map() } = {}) {
  // (each story's place in the running order, for a story with nothing else to name it by)
  const order = [...new Set((episode.segments || []).filter((s) => s.type === 'story' && s.storyId).map((s) => s.storyId))];
  const segs = (timeline?.segments || []).map((t) => (t.seg?.type === 'story' ? { ...t, seg: { ...t.seg, storyIndex: order.indexOf(t.seg.storyId) } } : t));
  const out = [{ at: 0, label: `Open: ${episode.program?.title || 'GLOBIT 24'}` }];
  for (const t of segs) {
    const label = labelOf(t.seg, stories);
    if (!label || label === out[out.length - 1].label) continue;
    const at = Math.max(0, Math.floor(t.start) - 1);
    if (at - out[out.length - 1].at < 10) {
      // too close to the last one: the later label wins (a short intro gives way to the first story)
      if (out.length > 1) out[out.length - 1] = { at: out[out.length - 1].at, label };
      continue;
    }
    out.push({ at, label });
  }
  // the last chapter must last 10 s too
  const dur = timeline?.duration || 0;
  if (out.length > 1 && dur && dur - out[out.length - 1].at < 10) out.pop();
  return out.length >= 3 ? out : [];
}

/** Is a programme worth a full upload (Phase 2)? Its length, its stories, nothing demo, nothing grave in a light slot. */
export function worthUploading(episode, timeline) {
  const why = [];
  const dur = timeline?.duration || 0;
  if (episode.demo) why.push('demo data');
  if (dur < 150) why.push('under two and a half minutes');
  if (episode.program?.id === 'news-60') why.push('NEWS IN 60 is a clip already: its stories go as posts');
  const spoken = (episode.segments || []).filter((s) => norm(s.text)).length;
  const voiced = (episode.segments || []).filter((s) => s.audio?.url).length;
  if (spoken && voiced < spoken) why.push(`${spoken - voiced} segments without their recorded voice`);
  return { worthy: why.length === 0, why };
}

/**
 * Everything YouTube needs for a whole programme. `stories`: the archive's stories by id (for the outlets' article
 * links); `airedAt`: when it aired (ms); `timeZone`: the channel's (London).
 */
export function uploadMeta(episode, { timeline = null, stories = new Map(), airedAt = null, timeZone = 'Europe/London', url = null, recorded = false } = {}) {
  const prog = episode.program?.title || 'GLOBIT 24';
  const when = airedAt ? new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(new Date(airedAt)) : '';
  // the stories in the channel's own words (wording.js): never an outlet's headline as ours
  const heads = [...new Set((episode.segments || []).filter((s) => s.type === 'story' && s.headline && !s.roundup).map((s) => storyWords(s, stories, { fallback: false })).filter(Boolean))];
  const date = when ? ` · ${when}` : '';
  let title;
  if (episode.quiz) title = `${prog}: the news quiz${date}`;
  else if (episode.weather) title = `${prog}: the world's weather${date}`;
  else if (!heads.length) title = `${prog}${date}`;
  else {
    // the lead first, the next story when it fits, "and more" when there is more; the date always (a programme is
    // of its day); a lead too long for all of that is cut at a word, never the date
    const h = heads.map((x) => x.replace(/[.!]$/, ''));
    const tries = [h[1] ? `${prog}: ${h[0]}, ${h[1]} and more${date}` : null, `${prog}: ${h[0]}${h.length > 1 ? ' and more' : ''}${date}`, `${prog}: ${h[0]}${date}`].filter(Boolean);
    title = tries.find((x) => x.length <= 100) || `${cutAtWord(`${prog}: ${h[0]}`, 99 - date.length)}…${date}`;
  }
  title = title100(title);
  const chapters = chaptersFor(episode, timeline, { stories });
  // the sources: every story the programme told, its outlet and its article
  const seen = new Set();
  const sources = [];
  for (const s of episode.segments || []) {
    const id = s.storyId || s.quiz?.question?.key;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const st = stories.get?.(id) || null;
    const outlet = s.source || s.outlet || s.quiz?.question?.aired?.source || st?.source;
    // the outlet's own headline, cited (a quiz question's is its answer: the quiz's sources carry no headline)
    const head = s.quiz ? '' : st?.title || s.headline;
    if (outlet) sources.push({ outlet: String(outlet).split(' / ')[0], headline: norm(head), link: st?.link ? cleanLink(st.link) : null });
  }
  const summary = [
    episode.quiz ? 'Two GLOBIT 24 presenters play a quiz on the stories the channel told this week.' : episode.weather ? 'The world\'s weather, zone by zone, from the forecast data.' : heads.length ? `In this edition: ${heads.slice(0, 5).join('; ')}.` : '',
    // (pre-rendered playout, docs/publishing/playout.md §5: the channel is not live, the invitation says so)
    url ? (recorded ? `Watch GLOBIT 24, news 24 hours a day: ${url}` : `Watch GLOBIT 24 live: ${url}`) : '',
  ].filter(Boolean).join('\n');
  const credits = creditsFor({ kind: 'episode', episode });
  const lines = [describe({ kind: 'episode', episode }, { credits: [], summary })];
  if (chapters.length) lines.push('', 'Chapters:', ...chapters.map((c) => `${clock(c.at)} ${c.label}`));
  if (sources.length) lines.push('', 'Sources:', ...sources.map((s) => `· ${s.headline ? citation(s.outlet, s.headline) : s.outlet}${s.link ? ` — ${s.link}` : ''}`));
  if (credits.length) lines.push('', 'Credits:', ...credits.map((c) => `· ${c}`));
  let description = lines.join('\n');
  while (Buffer.byteLength(description, 'utf8') > 5000) description = description.split('\n').slice(0, -1).join('\n');
  // (a running-order label is not a subject: AND FINALLY, NUMBER OF THE DAY never become tags)
  const FEATURES = /^(?:and finally|number of the day|still to come|coming up|the lead)$/i;
  const tags = ['GLOBIT 24', prog, 'news', 'pixel art', episode.quiz ? 'news quiz' : null, episode.weather ? 'weather' : null, ...new Set((episode.segments || []).map((s) => s.kicker).filter(Boolean).map((k) => String(k).toLowerCase()).filter((k) => !FEATURES.test(k)))].filter(Boolean).slice(0, 15);
  const w = worthUploading(episode, timeline);
  return { title, description, tags, chapters, sources, worthy: w.worthy, why: w.why };
}

export { clock as timestamp };
