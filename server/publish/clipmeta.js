// The words that travel with a clip (docs/publishing/plan.md §4; docs/publishing/thumbnails-titles.md): its title,
// the caption each network shows under it, the description, the hashtags and the links. The title, the hook, the lead
// and the hashtags are the clip's package (packaging.js: the AI writer's words from the story's facts, checked, or the
// deterministic writer's); the outlet's headline only as a citation beside its link; the disclosure first where the
// network shows text before "more" (the compliance desk's describe()). A light clip may close its caption's first line
// with one emoji that names its programme; a grave one never has an emoji and never a playful line.
import { describe, creditsFor, disclosureFor } from './compliance.js';
import { PLATFORMS } from './platforms.js';
import { citation, cleanLink } from './wording.js';
import { packFacts, fallbackPackage } from './packaging.js';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const EMOJI = { 'pay-attention': '🧠', 'world-weather': '🌦️', cosmos: '🔭', 'tech-bytes': '💻', 'full-time': '⚽', 'press-start': '🎮' };
const TAGS = {
  'pay-attention': ['newsquiz', 'quiz', 'news', 'pixelart'],
  'world-weather': ['weather', 'forecast', 'pixelart'],
  cosmos: ['space', 'science', 'news', 'pixelart'],
  'tech-bytes': ['tech', 'technology', 'news', 'pixelart'],
  'full-time': ['sport', 'football', 'pixelart'],
  default: ['news', 'pixelart'],
};

/**
 * A title within `room` characters at whole words. A quiz question's keeps its blank: the words round the ___ (the
 * question's own label first), "…" where it was cut (How many? …net profit soared ___ to a record high…).
 */

/**
 * A clip caption's AI disclosure (the on-screen notice's words in a sentence). Since 23 Oct its first words open the
 * caption's first line, the hook beside them ("AI-produced news: Kenya confirms a third Ebola case."), and its whole
 * sentence stands right under it (compliance.md §2.10: the words a viewer reads before "more" still say AI-produced
 * news first; the platform's own AI label and the end card say it too). CLIP_DISCLOSURE is the older form, the whole
 * sentence as the first line, which captions written before then still carry.
 */
export const CLIP_DISCLOSURE_PREFIX = 'AI-produced news:';
export const CLIP_DISCLOSURE_DETAIL = 'Presenters are AI characters with synthetic voices; every fact is from a credited source.';
export const CLIP_DISCLOSURE = 'AI-produced news: presenters are AI characters with synthetic voices; every fact is from a credited source.';

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
 * pre-rendered (docs/publishing/playout.md §5), so the invitation to watch it never says live. `pack`: the clip's
 * packaging (packaging.js writePackage: the AI writer's words, checked; without it the deterministic writer's).
 *
 * The title is the package's first (YouTube: up to 70 characters, the key words first; never the outlet's headline,
 * which is cited in the description beside its link). The caption opens with the AI disclosure's words and the hook
 * on the same line ("AI-produced news: <hook>"), the disclosure's whole sentence right under it (compliance.md
 * §2.10); the description opens with the disclosure, then the package's lead.
 */
export function clipTexts(moment, episode, { platform = 'youtube', stories = new Map(), presenters = {}, channelUrl = null, recorded = false, pack = null, airedAt = null } = {}) {
  const prog = moment.programme || episode.program?.title || 'GLOBIT 24';
  const grave = !!moment.grave;
  const links = [];
  for (const id of moment.storyIds || []) {
    const s = stories.get?.(id);
    const url = s?.link ? cleanLink(s.link) : null;
    if (url && !links.some((l) => l.url === url)) links.push({ label: s.source || 'Source', url, title: s.title });
  }
  const outlet = (moment.sources || [])[0] || links[0]?.label || null;
  const live = !!channelUrl && !recorded;
  const facts = packFacts(moment, episode, { stories, presenters, airedAt, live });
  const pk = pack && Array.isArray(pack.titles) && pack.titles.length ? pack : fallbackPackage(facts);
  // the description's middle: what the clip is (a quiz's question as the board asks it, never its answer), the
  // outlet's headline only as a citation beside its link
  const about = [];
  if (moment.kind === 'quiz-question' || moment.kind === 'quiz-round') {
    about.push(`${moment.kind === 'quiz-round' ? 'A whole round' : 'A question'} from ${prog}, the quiz on stories GLOBIT 24 told this week.`);
    if (moment.quiz?.tease) about.push(`The question: “${norm(moment.quiz.tease)}”`);
    if (outlet) about.push(`From a story by ${outlet}.`);
  } else if (moment.kind.startsWith('weather')) about.push(`From ${prog}, the world's weather from the forecast data.`);
  else about.push(`From ${prog} on GLOBIT 24.`);
  const first = (moment.storyIds || []).map((id) => stories.get?.(id)).find(Boolean);
  const cite = first?.title && !moment.kind.startsWith('quiz') ? citation(outlet || first.source || 'Source', first.title) : null;
  const lead = pk.lead || pk.hook;
  const tags = (pk.hashtags && pk.hashtags.length ? pk.hashtags : grave ? ['news'] : TAGS[moment.programId] || TAGS.default).slice(0, 4);
  const emoji = !grave && moment.light && EMOJI[moment.programId] ? ` ${EMOJI[moment.programId]}` : '';
  const title = fitTitle(norm(pk.titles[0]), PLATFORMS.youtube.text.title);
  const item = { kind: 'clip', episode, platforms: [platform] };
  const credits = creditsFor({ ...item, credits: (moment.credits || []) });
  const sourceLines = links.map((l) => `Source: ${l.label} — ${l.url}`);
  const summary = [about.join(' '), ...(cite ? [`Reporting: ${cite}.`] : []), ...sourceLines, channelUrl ? (recorded ? `GLOBIT 24, 24 hours a day: ${channelUrl}` : `GLOBIT 24 live, 24 hours a day: ${channelUrl}`) : ''].filter(Boolean).join('\n');
  const description = describe(item, { credits, summary, lead });
  let caption;
  if (platform === 'youtube') caption = description;
  // the disclosure's words first, the hook beside them: the caption's first line is what a viewer reads before "more"
  // (compliance.md §1, §2.10, §3.5); its whole sentence right under it
  else caption = [`${CLIP_DISCLOSURE_PREFIX} ${pk.hook}${emoji}`, CLIP_DISCLOSURE_DETAIL, [lead !== pk.hook ? lead : null, about.join(' ')].filter(Boolean).join(' '), sourceLines[0] || (outlet ? `Source: ${outlet}` : '')].filter(Boolean).join('\n\n');
  const disc = disclosureFor({ kind: 'clip', episode, platforms: [platform] }).platforms[platform] || {};
  return { title, titles: pk.titles, thumbs: pk.thumbs, hook: pk.hook, writer: pk.writer || 'fallback', text: caption, description, hashtags: tags, links, disclosure: { [platform]: disc }, lead };
}
