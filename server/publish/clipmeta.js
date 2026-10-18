// The words that travel with a clip (docs/publishing/plan.md §4): its title, the caption each network shows under it,
// the description, the hashtags and the links. Factual, from what aired: the clip's hook (moments.js), the story's
// headline as aired and the outlet's own article; the disclosure first where the network shows text before "more"
// (the compliance desk's describe()). A light clip may open its caption with one emoji that names its programme; a
// grave one never has an emoji and never a playful line.
import { describe, creditsFor, disclosureFor } from './compliance.js';
import { PLATFORMS } from './platforms.js';
import { ownWords, citation, storyLabel, cleanLink } from './wording.js';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const sentence = (s) => {
  const t = norm(s).toLowerCase().replace(/(^|[.?!]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return t.replace(/\b(unit-8|globit 24|pay attention|world weather|cosmos desk|tech bytes|full time|money minute|world now|seven days|news in 60|nasa|ai|uk|us|eu|un)\b/gi, (w) => w.toUpperCase());
};
const EMOJI = { 'pay-attention': '🧠', 'world-weather': '🌦️', cosmos: '🔭', 'tech-bytes': '💻', 'full-time': '⚽', 'press-start': '🎮' };
const TAGS = {
  'pay-attention': ['newsquiz', 'quiz', 'news', 'pixelart'],
  'world-weather': ['weather', 'forecast', 'pixelart'],
  cosmos: ['space', 'science', 'news', 'pixelart'],
  'tech-bytes': ['tech', 'technology', 'news', 'pixelart'],
  'full-time': ['sport', 'football', 'pixelart'],
  default: ['news', 'pixelart'],
};
const PLAYERS = (ids, presenters) => ids.map((id) => presenters?.[id]?.name?.split(' ')[0] || String(id).toUpperCase()).map((n) => (n.toUpperCase() === 'UNIT-8' ? 'UNIT-8' : n));

/**
 * A title within `room` characters at whole words. A quiz question's keeps its blank: the words round the ___ (the
 * question's own label first), "…" where it was cut (How many? …net profit soared ___ to a record high…).
 */
export function fitTitle(head, room) {
  if (head.length <= room) return head;
  const m = /^(How many\?|Where is it\?|Today or not today\?)\s+(.*)$/.exec(head);
  const words = (m ? m[2] : head).split(' ');
  const at = words.indexOf('___');
  if (m && at >= 0) {
    let lo = at;
    let hi = at;
    const make = (a, b) => `${m[1]} ${a > 0 ? '…' : ''}${words.slice(a, b + 1).join(' ')}${b < words.length - 1 ? '…' : ''}`;
    for (let grew = true; grew; ) {
      grew = false;
      if (hi < words.length - 1 && make(lo, hi + 1).length <= room) {
        hi++;
        grew = true;
      }
      if (lo > 0 && make(lo - 1, hi).length <= room) {
        lo--;
        grew = true;
      }
    }
    // never cut after a weak word (…in the…)
    const weak = /^(?:the|a|an|of|in|to|and|or|with|at|by|for|on|from|as|its)$/i;
    while (hi > at && hi < words.length - 1 && weak.test(words[hi])) hi--;
    return make(lo, hi);
  }
  return `${head.slice(0, room - 1).replace(/\s+\S*$/, '')}…`;
}

/**
 * The texts of a clip for one network. `stories`: archive stories by id (their links); `presenters`: the channel's
 * (for the players' names); `channelUrl`: the live stream's page when there is one; `recorded`: the channel airs
 * pre-rendered (docs/publishing/playout.md §5), so the invitation to watch it never says live.
 */
export function clipTexts(moment, episode, { platform = 'youtube', stories = new Map(), presenters = {}, channelUrl = null, recorded = false } = {}) {
  const prog = moment.programme || episode.program?.title || 'GLOBIT 24';
  const grave = !!moment.grave;
  const hook = (moment.hook || []).join(' ');
  const links = [];
  const sources = [];
  for (const id of moment.storyIds || []) {
    const s = stories.get?.(id);
    if (s) sources.push(s.title, s.summary);
    const url = s?.link ? cleanLink(s.link) : null;
    if (url && !links.some((l) => l.url === url)) links.push({ label: s.source || 'Source', url, title: s.title });
  }
  // the clip's words are the channel's own when they pass the verbatim rule; else the outlet's headline, cited
  const ownHead = moment.headline && ownWords(moment.headline, sources.filter(Boolean)) ? norm(moment.headline) : '';
  const outlet = (moment.sources || [])[0] || links[0]?.label || null;
  let lead;
  if (moment.kind === 'quiz-question' || moment.kind === 'quiz-round') {
    const who = PLAYERS(moment.quiz?.players || [], presenters);
    lead = `${who.length === 2 ? `Can you beat ${who[0]} and ${who[1]}?` : 'Play along.'} ${moment.kind === 'quiz-round' ? 'A whole round' : 'A question'} from ${prog}, the quiz on stories GLOBIT 24 told this week.`;
    // never the question's headline: it can be the answer (WHERE's place, HOW MANY?'s figure, LETTER BY LETTER's words)
    if (moment.quiz?.tease) lead += ` The question: “${norm(moment.quiz.tease)}”`;
    if (outlet) lead += ` From a story by ${outlet}.`;
  } else if (moment.kind.startsWith('weather')) {
    lead = `${sentence(hook)}. From ${prog}, the world's weather from the forecast data.`;
  } else if (ownHead || !moment.headline) {
    const h = ownHead || sentence(hook);
    lead = `${h}${/[.?!]$/.test(h) ? '' : '.'}${outlet ? ` Reporting: ${outlet}.` : ''} From ${prog} on GLOBIT 24.`;
  } else {
    // the channel's headline is the outlet's: its label, and the outlet's headline only as a citation
    const label = storyLabel({ kicker: moment.kicker, place: moment.place, category: moment.category }, sources.filter(Boolean));
    const first = (moment.storyIds || []).map((id) => stories.get?.(id)).find(Boolean);
    lead = `${label ? `${label}. ` : ''}From ${prog} on GLOBIT 24. ${citation(outlet || first?.source || 'Source', first?.title || moment.headline)}.`;
  }
  const disclosure = 'Presenters are AI-generated characters with synthetic voices; every fact is from the named source.';
  const tags = (grave ? ['news'] : TAGS[moment.programId] || TAGS.default).slice(0, 5);
  const emoji = !grave && moment.light && EMOJI[moment.programId] ? `${EMOJI[moment.programId]} ` : '';
  // a quiz question's own title (two questions never share one); within the limit at a whole word
  // a quiz question's own title (two questions never share one); a story's hook when it is the channel's own words,
  // else the outlet's headline cited (the verbatim rule: wording.js); within the limit at a whole word
  const storyHook = moment.headline && sentence(hook).toLowerCase().replace(/[^a-z0-9]+/g, '') === norm(moment.headline).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const head = moment.kind === 'quiz-question' && moment.quiz?.title ? norm(moment.quiz.title) : storyHook ? ownHead || citation(outlet || 'Source', norm(moment.headline)) : sentence(hook);
  const max = PLATFORMS.youtube.text.title;
  let title;
  if (/^.+: “.*”$/.test(head)) {
    // a citation is never cut (a cut quotation misquotes): a shorter tail, else the story's label instead
    const fit = [` | ${prog} | GLOBIT 24`, ' | GLOBIT 24', ''].find((t) => head.length + t.length <= max);
    const label = storyLabel({ kicker: moment.kicker, place: moment.place, category: moment.category }, sources.filter(Boolean));
    title = fit !== undefined ? `${head}${fit}` : `${fitTitle(label || prog, max - 12)} | GLOBIT 24`;
  } else {
    const tail = ` | ${prog} | GLOBIT 24`;
    title = `${fitTitle(head, max - tail.length)}${tail}`;
  }
  const item = { kind: 'clip', episode, platforms: [platform] };
  const credits = creditsFor({ ...item, credits: (moment.credits || []) });
  const sourceLines = links.map((l) => `Source: ${l.label} — ${l.url}`);
  const summary = [lead, ...sourceLines, channelUrl ? (recorded ? `GLOBIT 24, 24 hours a day: ${channelUrl}` : `GLOBIT 24 live, 24 hours a day: ${channelUrl}`) : ''].filter(Boolean).join('\n');
  const description = describe(item, { credits, summary });
  const hashtags = tags;
  let caption;
  if (platform === 'youtube') caption = description;
  else caption = [`${emoji}${lead}`, sourceLines[0] || (outlet ? `Source: ${outlet}` : ''), disclosure].filter(Boolean).join('\n\n');
  const disc = disclosureFor({ kind: 'clip', episode, platforms: [platform] }).platforms[platform] || {};
  return { title, text: caption, description, hashtags, links, disclosure: { [platform]: disc }, lead };
}
