// FULL TIME's stories, made ready before a writer sees them (docs/programmes/full-time.md §3): every sentence said from
// the day it airs and free of the outlets' verdicts on players, so neither writer can read out "tonight" for a game
// already played nor "a brilliant goal"; each story with its sport, its strap tag, its scorelines and fixtures. Then
// the running order's balance: not a Premier League show.
import { isGrave, sentencesIn } from '../facts.js';
import { isFragment } from '../writer.js';
import { isWomensSport, sportOf, sportTag } from './desk.js';
import { headlineContradicts, scorelinesIn } from './scores.js';
import { fixturesIn } from './fixtures.js';
import { retime, withoutJudgement } from './words.js';

// an outlet's own furniture in an article ("The Sky Sports app is better than ever - tap to find out why")
const PROMO = /\b(?:app is better than ever|tap to find out|download the|sign up|subscribe|follow us|click here|watch (?:live|it|the highlights) on|available on (?:sky|bbc|now|the)|listen to|read more|get the latest|newsletter|sky sports app|bbc sport app|live on sky sports|on demand|iplayer|get in touch|email us|let us know|reading on|sky sports scores|scores app|not got sky|got sky|on your phone|stream (?:it|live|every))\b/i;
// a clause that lost its main clause ("As Luis Enrique bids to guide PSG to a third successive Champions League triumph.")
const SUBORDINATE = /^(?:As|While|Although|Though|Because|If|When|Since|After|Before|Whereas|Unless|Once|Until)\b(?![^,]*,\s*\p{L})/u;
// a count that points back ("He was named the Finals' Most Valuable Player in all six", BBC Sport 13 Oct, after a
// sentence about his sixth title): it stands only straight after the sentence that gives that number
const COUNT_BACK = /\b(?:in|of|from)\s+(?:all|both|each of the|the other)\s+(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/i;
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const givesCount = (t, n) => {
  const k = /^\d+$/.test(n) ? Number(n) : NUMBER_WORDS.indexOf(n.toLowerCase());
  return new RegExp(`\\b(?:${k}|${NUMBER_WORDS[k] || k}|${ORDINALS[k] || k})\\b`, 'i').test(t);
};
/** Does a sentence point back to a count ("in all six") that the sentence before it does not give? */
export const leansOnCount = (t, prev) => {
  const back = COUNT_BACK.exec(String(t || ''));
  return !!back && !givesCount(String(prev || ''), back[1]);
};
const BARE_NOUN_START = /^(Tournament|Match|Game|Club|Team|Player|Manager|Coach|Striker|Midfielder|Defender|Goalkeeper|Forward|Winger|Quarterback|Competition|Event|Race|Final|Squad|Side|Champion|Holder|Holders|Skipper|Captain|Referee|Fixture|Season)(?=\s+(?:is|was|has|have|had|will|would|could|can|must|may|might|faces?|returns?|remains?|said|says)\b)/;
// a sentence that follows on from the one before it ("That was despite topping the table since September…", Sky Sports
// 13 Oct, after a sentence that went): it goes when that one went
export const FOLLOWS_ON_START = /^(?:But|And|So|Yet|Still|However|Instead|Meanwhile|Nevertheless|Nonetheless|Then|In the end|In response|As a result|Despite that|Despite this|Even so|By then|Not only that|On top of that|What is more|What's more|That|This|These|Those|Which|He|She|They|It|His|Her|Their|Its)\b/;
// a question the outlet asks its reader ("Watch Scottish Premiership games on your phone Not got Sky?"), never a quotation
const READER_QUESTION = (t) => /\?\s*$/.test(t) && !/["”’]\s*$/.test(t.trim());
// a crosshead the page ran into the next sentence ("Suljovic apologises over incident On Monday afternoon, Suljovic
// subsequently issued an apology", Sky Sports 13 Oct): the sentence starts where the capital says it does
const CROSSHEAD = /^(.{8,80}?[\p{Ll}\d])\s+((?:On|In|At|After|Before|During|But|However|Meanwhile|Speaking|Asked|When|While|The|He|She|They|It)\s+\S.*)$/u;
const unglue = (t) => {
  const m = CROSSHEAD.exec(t);
  return m && !/[,;:]/.test(m[1]) && !/\b(?:is|are|was|were|has|have|had|said|says|will)\b/.test(m[1]) ? m[2] : t;
};
const clean = (sentences, opts) => {
  const out = [];
  let prev = '';
  let lost = false;
  for (const t0 of sentencesIn(sentences)) {
    const t = unglue(t0);
    const kept = !PROMO.test(t) && !READER_QUESTION(t) && !SUBORDINATE.test(t.trim()) && !isFragment(t) && !leansOnCount(t, prev) && !(lost && FOLLOWS_ON_START.test(t.trim()));
    let said = kept ? withoutJudgement(retime(t, opts) ?? '') : null;
    // a bullet point's headline-ese gets its article ("Tournament is due to kick off in January…", Guardian 13 Oct)
    if (said) said = said.replace(BARE_NOUN_START, (m, noun) => `The ${noun.toLowerCase()}`);
    // (after a sentence that went, an "also" has nothing to add to: "Brad O'Neill also returns…")
    if (said && lost) said = said.replace(/^([^,;:.]{0,80}?)\s+also\b/i, '$1');
    if (said && said.trim()) out.push(said);
    // (a sentence that went takes its count and its antecedent with it: the next one cannot point back to it)
    prev = said && said.trim() ? said : '';
    lost = !(said && said.trim());
  }
  return out;
};
// a moment of the day (§4): a record, a milestone, an auction, a farewell, a catch; never grave
const MOMENT = /\b(?:record|records|sells? for|sold for|bought for|auction|memorabilia|milestone|youngest|oldest|first ever|first-ever|historic|history made|makes history|viral|mascot|bananas|troll\w*|celebrat\w*|catch|juggling|photo-finish|farewell|last dance|grandmaster|prodigy)\b/i;

/**
 * A copy of a sport story made ready for FULL TIME, or null when nothing fit to air is left: its summary and article
 * re-timed and without verdicts (a sentence that cannot be kept goes), its headline without verdicts (a headline that
 * judges a person outright drops the story), and its sport, tag, women's flag, scorelines and fixtures.
 */
export function prepareStory(story, { now = Date.now(), tz = 'Europe/London' } = {}) {
  if (!story) return null;
  const opts = { published: Number(story.published) || now, now, tz };
  const title = withoutJudgement(retime(String(story.title || ''), opts) ?? '');
  if (!title) return null;
  const summary = clean(String(story.summary || ''), opts);
  const body = story.body ? clean(String(story.body), opts) : [];
  if (summary.length + body.length < 2) return null;
  // one person, two first names ("head coach Brian McDermott" in the summary, "head coach Brad McDermott" in the article,
  // Sky Sports 13 Oct): the outlet got one of them wrong, and the channel says the first only
  const firstSeen = new Map();
  const variant = (t) => [...String(t).matchAll(/\b(\p{Lu}\p{Ll}+)\s+(\p{Lu}[\p{L}'’]{2,}(?:-\p{Lu}\p{Ll}+)?)(?![\p{L}])/gu)].some((m) => {
    const known = firstSeen.get(m[2]);
    if (!known) return firstSeen.set(m[2], m[1]) && false;
    return known !== m[1] && !/^(?:Mr|Mrs|Ms|Dr|Sir|Lord|Lady|The|And|But|Head|Coach|Manager|Captain|Boss|Chairman|Striker|Defender|Midfielder|Goalkeeper|Winger|Forward|Prop|Hooker|Scrum|Fly|Full|Centre|Opener|Bowler|Batter|Driver|Rider|Team|Former|Ex|New|Old|Young|Saint|St|Real|Inter|Sporting|Athletic|Atletico|United|City|Town|County|Rovers|Wanderers|Albion|North|South|East|West|Great|Little|Grand|Premier|Super|League|World|Golden|Gold|Coast|Titans|Hull|Leeds|Leigh|London|Manchester|Newcastle)$/.test(m[1]) && !/^(?:Mr|Mrs|Ms|Dr|Sir|Lord|Lady|The|And|But|Head|Coach|Manager|Captain|Boss|Chairman|Former|New|Saint|St)$/.test(known);
  });
  for (const t of [...summary]) variant(t);
  const bodyKept = body.filter((t) => !variant(t));
  body.splice(0, body.length, ...bodyKept);
  const sport = sportOf(story);
  const all = [title, ...summary, ...body];
  const context = all.join(' ');
  const scorelines = scorelinesIn(all, sport, context);
  // a headline and a copy that name different results: one of them is wrong, and nothing says which
  if (headlineContradicts(title, scorelines)) return null;
  return {
    ...story,
    title,
    summary: summary.join(' '),
    ...(story.body ? { body: body.join(' ') } : {}),
    sport,
    moment: MOMENT.test(title) && !isGrave(`${title}. ${summary.join(' ')}`),
    sportTag: sportTag(story),
    womens: isWomensSport(story),
    scorelines: scorelines.map((sl) => ({ ...sl, sport, storyId: story.id, published: story.published })),
    fixtures: fixturesIn(all, opts).map((f) => ({ ...f, sport, storyId: story.id })),
  };
}

/** Every story of the desk's list made ready (those left with nothing fit to air are dropped). */
export function prepareStories(stories, opts = {}) {
  return (stories || []).map((s) => prepareStory(s, opts)).filter(Boolean);
}

// a club, within one sport: a scoreline's teams, or the capitalised names a headline opens with
const clubsOf = (s) => {
  const names = new Set();
  for (const sl of s.scorelines || []) names.add(`${s.sport}|${sl.a}`).add(`${s.sport}|${sl.b}`);
  const m = /^((?:\p{Lu}[\p{L}'’.-]*\s?){1,3})/u.exec(String(s.title || ''));
  if (m) names.add(`${s.sport}|${m[1].trim().replace(/['’]s$/, '')}`);
  return [...names];
};

/**
 * FULL TIME's balance (§3.2), applied to the desk's ranked list before the writer chooses: the list keeps its order (the
 * strongest story leads) but a story that would break a rule waits at the back: football at most half, one club in at
 * most two stories (within a sport), and, when the desk has them, three sports and a women's story with a picture and
 * two sentences of its own among the first `count`. A story that led an edition in the last three hours with nothing
 * new does not lead (`ledLately(id)`). The returned list's `edition` is how many of its first stories the edition may
 * tell; the others are there for SCORE CENTRE and COMING UP.
 */
export function balance(stories, { count = 10, ledLately = () => false, now = Date.now() } = {}) {
  const list = [...(stories || [])];
  if (!list.length) return list;
  // the lead: the story most told (a match told by three outlets, or twice by one), among the desk's first eight, never
  // one that led lately; on a tie a result among the desk's first three before team news, then the desk's order
  const coverage = (s) => list.filter((o) => o !== s && sameEvent(o, s)).length;
  // (never a day-and-a-half-old story while a fresher one is there: on Thursday, Monday's match is no lead)
  const stale = (s) => Number.isFinite(Number(s.published)) && now - Number(s.published) > 30 * 3600_000;
  const anyFresh = list.slice(0, 8).some((s) => !stale(s));
  const top = list.slice(0, 8).map((s, i) => ({ s, i, c: ledLately(s.id) || s.moment || (anyFresh && stale(s)) ? -1 : coverage(s), r: i < 3 && s.scorelines?.length ? 1 : 0 }));
  let best = top.sort((a, b) => b.c - a.c || b.r - a.r || a.i - b.i)[0];
  // (of a match told twice, the result leads and the reaction follows: never "Jaissle sorry…" before "Coventry thump…")
  if (best && best.c >= 0 && !best.s.scorelines?.length) {
    const result = list.find((o) => o !== best.s && o.scorelines?.length && sameEvent(o, best.s) && !ledLately(o.id));
    if (result) best = { ...best, s: result };
  }
  if (best && best.c >= 0) list.unshift(...list.splice(list.indexOf(best.s), 1));
  const out = [];
  const waiting = [];
  const clubs = new Map();
  const fits = (s) => {
    const football = out.filter((x) => x.sport === 'football').length;
    if (s.sport === 'football' && football + 1 > Math.ceil(count / 2)) return false;
    return clubsOf(s).every((c) => (clubs.get(c) || 0) < 2);
  };
  const take = (s) => {
    out.push(s);
    for (const c of clubsOf(s)) clubs.set(c, (clubs.get(c) || 0) + 1);
  };
  for (const s of list) (out.length < count && fits(s) ? take(s) : waiting.push(s));
  // three sports, when the desk has them: a waiting story of a new sport replaces the last of the most common one
  const sports = () => new Set(out.map((s) => s.sport).filter(Boolean));
  for (const s of waiting) {
    if (sports().size >= 3 || !s.sport || sports().has(s.sport)) continue;
    const counts = {};
    for (const x of out) counts[x.sport] = (counts[x.sport] || 0) + 1;
    const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const drop = [...out].reverse().find((x, i) => x.sport === common && i < out.length - 1);
    if (out.length < count) take(s);
    else if (drop) {
      out.splice(out.indexOf(drop), 1, s);
      waiting.push(drop);
    }
  }
  // a women's story when the desk has a real one
  const womens = (s) => s.womens && s.image && sentencesIn(`${s.summary || ''} ${s.body || ''}`).length >= 2;
  if (!out.some(womens)) {
    const w = waiting.find(womens);
    if (w) {
      if (out.length < count) out.push(w);
      else out.splice(out.length - 1, 1, w);
    }
  }
  // (the edition is the first `edition` stories: football at most half of them even when the desk has little else; the
  // rest stay behind it for SCORE CENTRE's results and COMING UP's dates)
  const result = [...together(out), ...waiting.filter((s) => !out.includes(s))];
  result.edition = out.length;
  return result;
}

// the names a story is about: its scoreline's teams and the capitalised names of its headline, without the
// competitions every story shares
const COMPETITIONS = /^(?:Premier League|Champions League|Europa League|Conference League|World Cup|Rugby League World Cup|Rugby World Cup|Super League|Six Nations|Test|Grand Prix|Formula One|NFL|NBA|MLB|NHL|WNBA|NLCS|ALCS|World Series|Ryder Cup|Euro|Euros|Ligue|Serie|Bundesliga|LaLiga|League|Cup|England|Sport)$/;
// (word by word, so "Bitport" in one headline is "Bitport Athletic" in the other; never a club's generic word)
const GENERIC_WORD = /^(?:United|City|Town|Athletic|Rovers|Albion|Wanderers|County|Women|Men|FC|AFC|Club|Real|Sporting|Inter|Saint|St|Giants|Kings|Stars|Lions|Tigers|Eagles|Bears|Bulls|Rams|The|League|Cup|Open|Grand|Prix|World|Premier)$/;
const namesOf = (s) => new Set([
  ...(s.scorelines || []).flatMap((sl) => [sl.a, sl.b]),
  ...(String(s.title || '').match(/\p{Lu}[\p{L}'’-]{2,}(?:\s+\p{Lu}[\p{L}'’-]{2,})*/gu) || []),
].map((n) => n.replace(/['’]s$/, '')).filter((n) => !COMPETITIONS.test(n)).flatMap((n) => n.split(/\s+/)).filter((w) => !GENERIC_WORD.test(w) && !COMPETITIONS.test(w)));

/**
 * Two stories about the same thing: the same sport and the same match (their scorelines' teams), or two names of their
 * headlines in common ("Coventry thump Newcastle…" and "Jaissle sorry for Coventry loss as Carra says Newcastle…"; "Pixelburg
 * United beat Bitport Athletic…" and "Bitport manager Okafor apologises to fans after defeat at Pixelburg").
 */
export function sameEvent(a, b) {
  if (!a || !b || a === b || (a.sport && b.sport && a.sport !== b.sport) || !!a.womens !== !!b.womens) return false;
  const pair = (s) => (s.scorelines || []).map((sl) => [sl.a, sl.b].sort().join('|'));
  if (pair(a).some((p) => pair(b).includes(p))) return true;
  const mine = namesOf(a);
  return [...namesOf(b)].filter((n) => mine.has(n)).length >= 2;
}

/** A running order with the stories about the same thing told one after the other (the first keeps its place). */
export function together(list) {
  const out = [];
  for (const s of list) {
    if (out.includes(s)) continue;
    out.push(s);
    for (const o of list) if (!out.includes(o) && sameEvent(s, o)) out.push(o);
  }
  return out;
}
