// FULL TIME's automatic checks of one edition (docs/roadmap/critique/full-time-writing.md): what the gate's script finds
// before an edition is read in full. The checks of rounds 2 and 3 (judgement words, a toss left, a pronoun first, a sentence
// said twice, a score not in its source, the balance, a grave moment, "And finally", long sentences, a question with no
// answer, the chats), and those the first real matchday taught (17 Oct): a result story without its result or its score, a
// description or a "both"/"later"/"however" before what it points back to, a person's first mention without the whole name
// the outlet gives (in the story, the headlines and the signposts), a name the outlet never gives, a headline cut
// mid-thought, rugby league tagged or told as rugby, the women's game never said, a one-sentence story, a story that opens
// on someone's words, and a matchday without SCORE CENTRE while the desk has results. Each story's verbatim share is measured
// too (server/compliance/verbatim.js), for the record: the fallback writer is extractive.
//   editionChecks(episode, { getStory, air, pool }) -> { faults: [string], verbatim: [{ head, share, longest, ok }] }
import { isGrave, sentencesIn } from '../../server/facts.js';
import { BANKS, cutMidThought, freshResults, ownResult } from '../../server/sport/shape.js';
import { peopleIn, prepareStory } from '../../server/sport/prepare.js';
import { PERSON_DESC, SPORT_ADDED, SPORT_BOTH, SPORT_LATER, TEAM_DESC, sportLeans } from '../../server/sport/leans.js';
import { rugbyCode } from '../../server/sport/desk.js';
import { storyReport } from '../../server/compliance/verbatim.js';

const plain = (t) => String(t || '').replace(/\[[^\]]*\]\s*/g, '');
const unquoted = (t) => plain(t).replace(/["“][^"”]*["”]/g, ' ');
const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const JUDGE = /\b(?:brilliant|stunning|superb|sublime|sensational|magnificent|wonderful|fantastic|outstanding|world-class|woeful|dismal|abject|shambolic|awful|dreadful|poor|sloppy|lacklustre|embarrassing|incredible|amazing|spectacular|terrible|appalling|wasteful|impressive|excellent|remarkable|disappointing|deserved|should have|nightmare|masterclass|howler|self-destruct)\b/i;
const LOST_A_PLAYER = /\b(?:lost|lose|losing)\s+(?:\p{Lu}[\p{L}'’-]+\s+){1,3}(?:to\s+(?:an?\s+)?(?:second\s+)?(?:yellow|red|injury|illness)\b[^,.;]*)?|\b(?:lost|lose|losing)\s+(?:\p{Lu}[\p{L}'’-]+\s*){1,3}$/gu;
const RESULT_WORDS = /\b(?:beat|beats|beaten|won|win|wins|victory|triumph|defeat|defeated|lost|lose|draw|drew|held|point|thrashed|edged|stunned|came from behind|comeback)\b/i;
const RESULT_TITLE = /\b(?:beat|beats|beaten|win|wins|won|victory|triumph|draw|draws|drew|held|point|defeat|defeats|defeated|lose|loses|lost|thrash(?:es|ed)?|edge[sd]?|stun(?:s|ned)?|sees? off|sink|sinks|sank|downs?|downed|routs?|routed|hammer(?:s|ed)?|crush(?:es|ed)?|too strong for)\b/i;
const SCORED = new Set(['football', 'rugby', 'american-football', 'basketball', 'ice-hockey', 'baseball', 'handball']);
const ANOTHER_TIME = /\b(?:last (?:week|weekend|season|month|year|time|Sunday|Saturday|Monday|Tuesday|Wednesday|Thursday|Friday)|previous|earlier (?:this|in the) (?:season|month|week|campaign)|midweek|already|in (?:January|February|March|April|May|June|July|August|September|November|December))\b/i;

// (after the shape's own lines, a transition, the follow line or the moment's, a story's first words)
const bankLines = [...BANKS.follow, ...BANKS.moment, ...Object.values(BANKS.transition).flat()].map((l) => l.replace(/\[[^\]]*\]\s*/g, '').trim());
export function opening(t) {
  let x = t;
  for (let changed = true; changed; ) {
    changed = false;
    for (const l of bankLines) if (x.startsWith(`${l} `)) {
      x = x.slice(l.length + 1);
      changed = true;
    }
    const num = /^Our number of the day: [^.]+\.\s+/.exec(x);
    if (num) {
      x = x.slice(num[0].length);
      changed = true;
    }
  }
  return x;
}
// a hand-over at a story's end ("Over to Kai for the rugby league.") is the shape's, not the story's
const handLines = BANKS.handover.map((l) => new RegExp(`\\s*${esc(l).replace('\\{N\\}', '\\S+').replace('\\{S\\}', 'the [\\w ]+?')}$`));
/** A story's own words as the presenter says them: without the shape's frames, transitions and hand-overs. */
export function ownWords(seg) {
  let t = opening(plain(seg.text)).trim();
  for (const re of handLines) t = t.replace(re, '');
  return t.trim();
}
const firstWords = (t) => String(t || '').toLowerCase().replace(/,\s+(?:according to [^,]+|[\p{L}'’ ]+ reports?)\.\s*$/u, '.').replace(/[^\p{L}\d ]+/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ');

/** Every fault the script can find in an edition, and each story's verbatim share. */
export function editionChecks(ep, { getStory = () => null, air = Date.now(), pool = [] } = {}) {
  const faults = [];
  const airMs = typeof air === 'number' ? air : Date.parse(air);
  const segs = ep?.segments || [];
  const stories = segs.filter((s) => s.type === 'story');
  for (const s of segs) if (JUDGE.test(unquoted(s.text))) faults.push(`judgement: ${unquoted(s.text).match(JUDGE)[0]} in «${s.headline || s.type}»`);
  for (const s of stories) if (/\b(?:Rosa|Kai)\?\s*$/.test(plain(s.text))) faults.push(`toss left in «${s.headline}»`);
  const LEANS = (t) => /^(?:It|They|He|She|This|These|Those|His|Her|Their|Its)\b/.test(opening(t));
  for (const s of stories.filter((x) => !['scores', 'fixtures'].includes(x.feature))) if (LEANS(plain(s.text))) faults.push(`opens on a pronoun: «${s.headline}» ${plain(s.text).slice(0, 80)}`);
  const sentences = segs.flatMap((s) => plain(s.text).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 6));
  const seen = new Set();
  for (const x of sentences) {
    const k = x.toLowerCase();
    if (seen.has(k)) faults.push(`said twice: ${x.slice(0, 80)}`);
    seen.add(k);
  }
  for (const s of stories.filter((x) => x.score)) {
    const src = getStory(s.storyId);
    if (!new RegExp(`${s.score.sa}\\s*[-–]\\s*${s.score.sb}|${s.score.sb}\\s*[-–]\\s*${s.score.sa}`).test(`${src?.title} ${src?.summary} ${src?.body || ''} ${src?.pageTitle || ''}`)) faults.push(`score not in source: «${s.headline}»`);
  }
  const football = stories.filter((s) => s.sport === 'football' && !s.feature).length;
  const toldCount = stories.filter((s) => s.storyId && !['scores', 'fixtures'].includes(s.feature)).length;
  if (football > Math.ceil(toldCount / 2)) faults.push(`football ${football} of ${toldCount}`);
  if (new Set(stories.map((s) => s.sport).filter(Boolean)).size < 3) faults.push('fewer than three sports');
  const moment = stories.find((s) => s.kicker === 'MOMENT OF THE DAY');
  if (moment && isGrave(`${getStory(moment.storyId)?.title}. ${getStory(moment.storyId)?.summary}`)) faults.push('grave moment of the day');
  if (/\band finally\b/i.test(segs.map((s) => plain(s.text)).join(' '))) faults.push('"And finally" left');
  for (const x of sentences) if (x.split(/\s+/).length > 45) faults.push(`long sentence (${x.split(/\s+/).length} words): ${x.slice(0, 60)}`);
  const chats = segs.filter((s) => s.type === 'chat');
  segs.forEach((s, i) => {
    if (s.type === 'chat' && /\?\s*$/.test(plain(s.text)) && segs[i + 1]?.type !== 'chat') faults.push(`question with no answer: ${plain(s.text)}`);
  });
  if (chats.length > 10) faults.push(`${chats.length} chats`);

  // ---- the first real matchday's checks (17 Oct)
  const verbatim = [];
  for (const s of stories.filter((x) => x.storyId && !['scores', 'fixtures'].includes(x.feature))) {
    const raw = getStory(s.storyId);
    if (!raw) continue;
    const prep = prepareStory(raw, { now: airMs }) || {};
    const words = ownWords(s);
    const parts = sentencesIn(words);
    const head = `«${s.headline}»`;
    const rawSentences = sentencesIn(`${raw.summary || ''} ${raw.body || ''}`).map(firstWords);
    const at = (x) => rawSentences.indexOf(firstWords(x));
    // a result story without its result: who won, and the score when the source states one
    const own = ownResult(prep);
    if (own && !new RegExp(`\\b(?:${own.sa}\\s*[-–]\\s*${own.sb}|${own.sb}\\s*[-–]\\s*${own.sa})\\b`).test(words)) faults.push(`result without its score (${own.a} ${own.sa}-${own.sb} ${own.b} in the source): ${head}`);
    if (SCORED.has(prep.sport) && (own || prep.result || RESULT_TITLE.test(raw.title)) && s.kicker !== 'MOMENT OF THE DAY') {
      const teams = [own?.a, own?.b, prep.result?.winner, prep.result?.loser, prep.result?.a, prep.result?.b].filter(Boolean).map((n) => String(n).split(' ').at(-1));
      const named = teams.length ? teams : (String(raw.title).match(/\p{Lu}[\p{L}'’-]{2,}/gu) || []).map((w) => w.replace(/['’]s$/u, ''));
      // (in one sentence about this match: never another's, "…with a 26-26 draw in Exeter last month")
      // ("Brentford, who later lost Vitaly Janelt to a second yellow card…" lost a player, not the match)
      const says = (x) => RESULT_WORDS.test(x.replace(LOST_A_PLAYER, ' ')) && !ANOTHER_TIME.test(x.replace(/[“"][^”"]*[”"]/g, ' ')) && named.some((n) => new RegExp(`(?<![\\p{L}])${esc(n)}(?![\\p{L}])`, 'u').test(x));
      if (!parts.some(says)) faults.push(`result story never says who won: ${head}`);
    }
    // a description or a "both"/"later"/"however" before what it points back to
    const people = peopleIn(`${raw.title || ''}.\n${raw.summary || ''}\n${raw.body || ''}`);
    parts.forEach((x, j) => {
      const before = parts.slice(0, j).join(' ');
      const prevSaid = j > 0 && at(x) > 0 && parts.slice(0, j).some((p) => at(p) === at(x) - 1);
      if (!sportLeans(x, before, { prevSaid, people })) return;
      const what = (SPORT_BOTH.test(x) || SPORT_LATER.test(x)) && !prevSaid ? 'points back to what was not told' : PERSON_DESC.test(x) ? 'a description before its name' : TEAM_DESC.test(x) ? "a team's description before its name" : SPORT_ADDED.test(x) ? 'words "added" to nothing said' : 'points back to what was not told';
      faults.push(`${what}: ${head} ${x.slice(0, 70)}`);
    });
    // a person's first mention without the whole name the outlet gives
    for (const [sur, given] of Object.entries(people)) {
      const m = [...words.matchAll(new RegExp(`(?<![\\p{L}’'-])${esc(sur)}(?![\\p{L}])`, 'gu'))].find((x) => (words.slice(0, x.index).match(/["“”]/g) || []).length % 2 === 0);
      if (!m) continue;
      const pre = words.slice(0, m.index);
      if ((/\p{Lu}[\p{L}’'-]*\s+$/u.test(pre) && !/['’]s?\s+$/u.test(pre)) || /^\s+\p{Lu}/u.test(words.slice(m.index + m[0].length))) continue;
      faults.push(`first mention without a first name: ${sur} (${given} ${sur}) in ${head}`);
    }
    // and in the headlines or a signpost before the story ("Still to come: Henderson, the Premier League's oldest player…",
    // "…plays down Haaland injury fears", 17 Oct): the first time the edition says the name
    const earlier = segs.slice(0, segs.indexOf(s)).filter((x) => ['intro', 'chat'].includes(x.type)).map((x) => plain(x.text).replace(/["“][^"”]*["”]/g, ' ')).join(' ');
    for (const [sur, given] of Object.entries(people)) {
      const m = earlier.match(new RegExp(`(?<![\\p{L}’'-])${esc(sur)}(?![\\p{L}])`, 'u'));
      if (!m) continue;
      const pre = earlier.slice(0, m.index);
      // (a first name before it, whoever's: "Harry Smith" in one headline is not Steve Smith's first mention; never "GK")
      if (/\p{Lu}\p{Ll}[\p{L}’'-]*\s+$/u.test(pre) && !/['’]s?\s+$/u.test(pre)) continue;
      faults.push(`first mention without a first name: ${sur} (${given} ${sur}) before ${head}`);
    }
    // a first name the outlet never gives that name ("Goalkeeper Alex Lowry", "Anis Ben Knapper": a writer's or the shape's
    // invention, found reading the matchday round of 17 Oct)
    const source = `${raw.title || ''}\n${raw.summary || ''}\n${raw.body || ''}`.replace(/\s+/g, ' ');
    const spoken = words.replace(/["“][^"”]*["”]/g, ' ');
    for (const [sur, given] of Object.entries(people)) {
      // (a word put before the whole name, "Goalkeeper Alex Lowry", or another first name, "Ben Knapper" for a Knapper the
      // source names otherwise)
      for (const m of spoken.matchAll(new RegExp(`(?<![\\p{L}’'.-])(\\p{Lu}\\p{Ll}+)\\s+(?:${esc(given)}\\s+)?${esc(sur)}(?![\\p{L}])`, 'gu'))) {
        if (m[1] === given || source.includes(m[0].trim())) continue;
        faults.push(`a name the source never gives: ${m[0].trim()} in ${head}`);
      }
    }
    // a headline cut mid-thought
    if (cutMidThought(s.headline, raw.title)) faults.push(`headline cut mid-thought: ${head} (${raw.title})`);
    // rugby league tagged as rugby, or never said
    if (prep.sport === 'rugby' && rugbyCode(raw) === 'league') {
      if (s.kicker !== 'RUGBY LEAGUE') faults.push(`rugby league tagged ${s.kicker}: ${head}`);
      const prev = segs[segs.indexOf(s) - 1];
      if (!/\b(?:rugby league|super league|nrl)\b/i.test(`${plain(s.text)} ${prev ? plain(prev.text) : ''}`)) faults.push(`rugby league never said: ${head}`);
    }
    // the women's game never said ("England have lost a rugby game after four years…" for the Red Roses, 17 Oct)
    if (prep.womens && !/\b(?:women|women's|womens|woman|female|ladies|girls|WSL|NWSL|WNBA|WXV|Lionesses|Matildas|Red Roses|Black Ferns|Wildcats|she|her)\b/i.test(`${plain(s.text)} ${plain(segs[segs.indexOf(s) - 1]?.text)}`)) faults.push(`the women's game never said: ${head}`);
    // a story of one sentence, or one that opens on someone's words
    if (parts.length < 2) faults.push(`a story of one sentence: ${head} ${words.slice(0, 60)}`);
    if (/^["“‘']/.test(parts[0] || '')) faults.push(`opens on a quotation: ${head}`);
    const r = storyReport(words, [raw.title, raw.summary, raw.body].filter(Boolean));
    verbatim.push({ head, share: r.share, longest: r.longest, ok: !r.violations.length });
  }
  // a matchday without SCORE CENTRE while the desk has results to show
  if (ep?.sport?.shape === 'MATCHDAY' && !ep.sport.results && pool.length) {
    const toldPairs = new Set(stories.filter((x) => x.score).map((x) => [x.score.a, x.score.b].sort().join('|')));
    const left = freshResults(pool, { now: airMs }).filter((r) => !toldPairs.has([r.a, r.b].sort().join('|')));
    if (left.length >= 3) faults.push(`MATCHDAY without SCORE CENTRE: the desk has ${left.length} results (${left.slice(0, 3).map((r) => `${r.a} ${r.sa}-${r.sb} ${r.b}`).join(', ')}…)`);
  }
  return { faults, verbatim };
}
