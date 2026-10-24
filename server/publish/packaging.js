// A clip's packaging (docs/publishing/thumbnails-titles.md): what makes a viewer choose it, and nothing it does not
// deliver. Three titles (YouTube's Test & Compare takes up to three; on a Short the owner picks one), three thumbnail
// texts (one for each cover template: the story's picture, the presenter, the words), the caption's hook (its first
// line after the AI disclosure's words), the description's lead and a few hashtags.
//
// The words are the channel's AI writer's when the provider chain has one (stage 'package': the offline mock never
// writes them, it copies), else a deterministic writer's. Both work from the story's facts as the clip aired them, and
// every field passes the same checks before it is used, whoever wrote it:
//   - the verbatim rule (no run of more than 12 words, at most 20 % in runs of 6, compliance/verbatim.js), and closer
//     for packaging: never the outlet's headline, nor five of its words in a row;
//   - lengths: a title 15–70 characters (YouTube cuts at about 70 in its lists), a thumbnail text 1–4 words and 22
//     characters, a hook 90;
//   - no bait: no "shocking", "you won't believe", "insane", "breaking", no LIVE (the channel has no live stream in the
//     beta: CHANNEL_LIVE_URL), no "!", no ALL CAPS shouting outside a thumbnail's own text, no emoji in a title;
//   - supported: every number, every name and most of the words are in the clip's aired words or its sources;
//   - grave news (deaths, disasters, conflict: facts.js isGrave, moments.js grave): plain words, no question, no
//     emotional word ("horror", "tragic", "heartbreaking"), no emoji, no "pixelart" hashtag.
//
//   packFacts(moment, episode, { stories, presenters, airedAt })   the facts a package is written from
//   fallbackPackage(facts)                                          the deterministic writer -> package
//   packagePrompt(facts)                                            the AI writer's prompt
//   checkTitle / checkThumb / checkHook (text, facts, opts)         -> [faults]
//   checkPackage(pkg, facts)                                        -> { ok, faults: [{ field, text, fault }] }
//   writePackage(facts, { chain, log })                             the AI writer, field by field checked, the
//                                                                   deterministic writer filling what it did not pass
import { ownWords, storyLabel } from './wording.js';
import { tokens } from '../compliance/verbatim.js';
import { numbersIn, numberWordsIn, contentWords, sentencesIn, extractFigures, sameWord, isGrave, GRAVE } from '../facts.js';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const chars = (s) => [...String(s ?? '')].length;

export const LIMITS = Object.freeze({
  title: Object.freeze({ min: 15, max: 70, hard: 100 }),
  thumb: Object.freeze({ words: 4, chars: 22, word: 9 }),
  hook: Object.freeze({ min: 20, max: 90 }),
  lead: Object.freeze({ max: 160 }),
  hashtags: Object.freeze({ max: 4 }),
  variants: 3,
});

// Bait: words that sell a feeling the clip does not deliver, or a promise it cannot keep (YouTube's "malicious
// clickbait", spam and deceptive practices policy). A news title never needs them.
export const BAIT = /\b(?:shock(?:ing|ed|er)?|you won['’]?t believe|unbelievable|insane|crazy|mind[- ]?blowing|jaw[- ]?dropping|epic|must[- ]see|gone wrong|destroy(?:s|ed)?|slams?|exposed|the truth about|what happens next|this changes everything|everyone is talking|goes viral|omg|wow|bombshell|breaking|urgent|watch till the end|wait for it|secret)\b/i;
// On grave news also the words that dramatise suffering (Ofcom and IPSO practice: no sensationalism on deaths and
// disasters; the channel's own grave handling, facts.js and writer.js)
export const GRAVE_WORDS = /\b(?:horror|horrific|horrifying|terrifying|carnage|bloodbath|chilling|heartbreaking|heart-breaking|devastating|nightmare|tragic|tragedy|panic|chaos|slaughter|savage|brutal|gruesome|grisly|apocalyp\w*|hell)\b/i;
// LIVE where there is no live stream (the CHANNEL_LIVE_URL rule: compliance.md, airmode.js)
const LIVE = /\bLIVE\b|\blive (?:now|stream|coverage|updates?|blog)\b|\bwatch live\b|\bstreaming now\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
// words a package may add that are no claim about the story (its kind, the clip, the invitation)
const FRAMING = new Set('one two three four five six seven eight nine ten did does many much full whole reporting source sources what why how who where when know known explained explain explainer story stories headline headlines today\'s this week\'s news quiz question questions answer answers play along beat guess weather forecast week weeks numbers number latest briefing brief report reports reported says said means mean matters matter next inside look closer can you your here heres facts fact key big minute minutes second seconds today tonight world around update world\'s channel find out see watch clip short programme edition desk read the and in on of at for to with a an is are was were be from by as it its this that'.split(' '));
const PROGRAMME_WORDS = /\b(?:globit|world now|tech bytes|cosmos desk|money minute|news in 60|world weather|seven days|full time|pay attention)\b/gi;

const flat = (s) => tokens(s).map((t) => t.w);

/** The longest run of consecutive words `text` shares with `other` (folded words). */
export function sharedRun(text, other) {
  const a = flat(text);
  const b = flat(other);
  if (!a.length || !b.length) return 0;
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const keep = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = keep;
    }
  }
  return best;
}

/** Is `text` the outlet's headline, or close to it (five words in a row, or most of its words in the same order)? */
export function nearCopy(text, titles = []) {
  const t = flat(text);
  if (!t.length) return false;
  for (const title of titles.filter(Boolean)) {
    const run = sharedRun(text, title);
    if (run >= 5) return true;
    const h = flat(title);
    // (most of a short headline, in its order: "Kenya confirms third Ebola case" of a five-word headline; a thumbnail's
    // REAL LIVING WAGE from a long one is a term, not the headline)
    if (run >= 3 && run >= h.length * 0.75) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the facts

const FEATURE = /^(?:AND FINALLY|NUMBER OF THE DAY|STILL TO COME|COMING UP|LATER|ALSO|IN BRIEF|THE LEAD|BREAKING|NEWS|GENERAL|(?:THE )?WEEK IN 60 SECONDS|STORY OF THE WEEK|(?:THE )?WEEK IN NUMBERS|WORDS? OF THE WEEK|THE WEEK'?S DESKS|SCORE CENTRE|RESULTS|TODAY'?S RESULTS|THE SCORES)$/i;
const STORY_KINDS = new Set(['story', 'lead', 'known', 'number', 'expert', 'unit8', 'montage', 'week60', 'stories', 'sport-result']);
const firstName = (presenters, id) => {
  const n = presenters?.[id]?.name?.split(' ').find((w) => !/^(?:dr|prof|mr|mrs|ms)\.?$/i.test(w)) || String(id || '').toUpperCase();
  return n.toUpperCase() === 'UNIT-8' || n.toUpperCase() === 'UNIT8' ? 'UNIT-8' : n;
};

/**
 * The facts of a moment as it aired, and what its words are checked against. `stories`: the archive's by id (their
 * title, summary and article: the sources); `presenters`: the channel's (names).
 */
export function packFacts(moment, episode = {}, { stories = new Map(), presenters = {}, airedAt = null, live = false } = {}) {
  const segs = (episode.segments || []).slice(moment.from ?? 0, (moment.to ?? moment.from ?? 0) + 1);
  const seg = segs.find((s) => s.headline && s.storyId) || segs.find((s) => s.headline) || segs[0] || {};
  // (a clip with no story of its own, the open's headlines, is measured against every story of its programme: what
  // it teases is theirs)
  const ids = moment.storyIds?.length ? moment.storyIds : [...new Set((episode.segments || []).map((s) => s.storyId).filter(Boolean))];
  const st = ids.map((id) => stories.get?.(id)).filter(Boolean);
  const outletTitles = st.map((s) => norm(s.title)).filter(Boolean);
  const sources = st.flatMap((s) => [s.title, s.summary, s.body]).filter((x) => typeof x === 'string' && x.trim());
  const quiz = /^quiz-/.test(moment.kind || '');
  const weather = /^weather/.test(moment.kind || '');
  const aired = norm(moment.text || segs.map((s) => s.text).filter(Boolean).join(' '));
  // the channel's headline as it aired: its own words only when they pass against the story's sources (a quiz's
  // headline can be its answer: never used)
  const headline = quiz ? '' : norm(moment.headline || seg.headline || '');
  const headlineOwn = !!headline && sources.length > 0 && ownWords(headline, sources) && !nearCopy(headline, outletTitles);
  const kicker = norm(seg.kicker || moment.kicker || '');
  const place = norm(seg.location?.place || seg.place || moment.place || '');
  const label = storyLabel({ kicker: FEATURE.test(kicker) ? '' : kicker, place, category: seg.category || moment.category }, sources.length ? sources : null);
  const rundown = (episode.rundown || []).find((r) => r.storyId && moment.storyIds?.includes(r.storyId)) || {};
  const grave = !!moment.grave || (!quiz && !weather && isGrave(`${headline}. ${aired}`));
  const cast = (episode.program?.presenters || []).length ? episode.program.presenters : Object.values(episode.cast || {});
  return {
    kind: moment.kind || 'story',
    story: STORY_KINDS.has(moment.kind) || (!quiz && !weather),
    quiz,
    weather,
    programme: moment.programme || episode.program?.title || 'GLOBIT 24',
    programId: moment.programId || episode.program?.id || null,
    grave,
    light: !!moment.light && !grave,
    live: !!live,
    duration: Number(moment.duration) || null,
    date: airedAt ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' }).format(new Date(airedAt)) : null,
    headline,
    headlineOwn,
    hookLines: Array.isArray(moment.hook) ? moment.hook : [],
    kicker: FEATURE.test(kicker) ? '' : kicker,
    place,
    label,
    subject: norm(rundown.imageSubject?.label || ''),
    aired,
    outlet: (moment.sources || [])[0] || st[0]?.source || null,
    outletTitles,
    summaries: st.map((s) => norm(s.summary)).filter(Boolean),
    sources,
    quizInfo: quiz ? { title: norm(moment.quiz?.title), tease: norm(moment.quiz?.tease), type: moment.quiz?.type || null, players: (moment.quiz?.players || []).map((id) => firstName(presenters, id)) } : null,
    presenters: [...new Set(cast.map((id) => firstName(presenters, id)).filter(Boolean))].slice(0, 2),
    // (every presenter of the channel: a guest expert of another programme is still not the story)
    castNames: Object.values(presenters || {}).map((p) => p?.name).filter(Boolean),
    hasPicture: !!rundown.hasImage,
  };
}

/**
 * A whole programme's facts (a YouTube upload, docs/publishing/plan.md §5): its lead story's, every aired word as the
 * basis, every story's sources; `title` the upload's own title (uploads.js uploadMeta), the deterministic writer's first.
 */
export function episodeFacts(episode = {}, { stories = new Map(), presenters = {}, airedAt = null, live = false, duration = null, title = '' } = {}) {
  const segs = episode.segments || [];
  const lead = Math.max(0, segs.findIndex((s) => s.type === 'story' && s.headline && s.storyId));
  const storyIds = [...new Set(segs.map((s) => s.storyId).filter(Boolean))];
  const m = { kind: 'programme', from: lead, to: lead, text: segs.map((s) => s.text).filter(Boolean).join(' '), headline: episode.quiz || episode.weather ? '' : segs[lead]?.headline || '', storyIds, sources: [...new Set(segs.map((s) => s.source).filter(Boolean))], programme: episode.program?.title, programId: episode.program?.id, grave: false, light: false, duration };
  const f = packFacts(m, episode, { stories, presenters, airedAt, live });
  // (a programme is no grave clip of itself: its lead decides the tone of its packaging)
  const leadSeg = segs[lead] || {};
  f.grave = !episode.quiz && !episode.weather && isGrave(`${leadSeg.headline || ''}. ${leadSeg.text || ''}`);
  // the lead's own facts: thumbnail A goes on the lead story's picture, so its words are about the lead alone
  const leadStory = stories.get?.(leadSeg.storyId) || null;
  const leadOnly = { aired: norm(leadSeg.text), headline: norm(leadSeg.headline), sources: leadStory ? [leadStory.title, leadStory.summary, leadStory.body].filter((x) => typeof x === 'string' && x.trim()) : [] };
  return { ...f, programmeTitle: norm(title), quizShow: !!episode.quiz, weatherShow: !!episode.weather, stories: storyIds.length, lead: leadOnly };
}

/** Everything a package's claims may rest on: the aired words, the channel's labels and the sources. */
// (and what is true of the clip itself: its programme, its day, its length)
const basisOf = (f) => [f.aired, f.headline, (f.hookLines || []).join(' '), f.kicker, f.place, f.label, f.subject, f.quizInfo?.title, f.quizInfo?.tease, ...(f.quizInfo?.players || []), ...(f.presenters || []), f.outlet, f.programme, 'GLOBIT 24', f.date, f.duration ? `${roundSecs(f.duration)} seconds ${Math.round(f.duration)} seconds` : '', ...f.sources].filter(Boolean).join(' . ');
/** What capitals may repeat: the aired words and the sources as written (an all-capital word there is a name: NASA, UNIT-8). */
const shoutBasis = (f) => [f.aired, f.headline, ...(f.presenters || []), ...(f.quizInfo?.players || []), ...f.sources].filter(Boolean).join(' ').replace(PROGRAMME_WORDS, ' ');

// ---------------------------------------------------------------- the checks

const ACRONYM_OK = /^(?:[A-Z]{2,5}|[A-Z]+-\d+|\d+[A-Z]{1,3}|UNIT-8|GLOBIT)$/;

/** The words of `text` the facts do not bear out (names, numbers and content words), [] when all are. */
// a word without its possessive and its common endings, to compare with the facts' words ("leo's" is "leo", "flying"
// is "fly", "buying" is "buy")
const stem = (w) => String(w).toLowerCase().replace(/[’']s$/, '').replace(/(?:ies|ied)$/, 'y').replace(/(?:ing|ed|es|s)$/, '').replace(/(.)\1$/, '$1');
const grounded = (w, pool, low) => low.includes(w) || pool.some((p) => sameWord(w, p) || (stem(w).length >= 3 && stem(p) === stem(w)) || (stem(w).length >= 4 && (stem(p).startsWith(stem(w)) || stem(w).startsWith(stem(p)) && stem(p).length >= 4)));

/**
 * Every number of `text` in the facts, by value (its currency and percent sign alike): "£1.6bn deal" stands on
 * "£1.6bn purchase", "GTA 6" on "GTA 6"; a number the facts do not give is refused, and so is its word ("a fourth case").
 */
function numbersStand(text, basis) {
  const have = numbersIn(basis);
  const words = numberWordsIn(basis, { skipOne: true });
  const ok = (n) => [...have, ...words].some((h) => Math.abs((h.scaled ?? h.value) - (n.scaled ?? n.value)) <= Math.abs(n.scaled ?? n.value) * 0.005 && !!h.percent === !!n.percent && (!n.currency || !h.currency || h.currency === n.currency));
  return [...numbersIn(text), ...numberWordsIn(text, { skipOne: true })].every(ok);
}

/** The words of `text` the facts do not bear out (names, numbers and content words), [] when all are. */
export function unsupported(text, facts) {
  const basis = basisOf(facts);
  const low = basis.toLowerCase();
  const out = [];
  if (!numbersStand(text, basis)) out.push('a number the story does not give');
  const pool = contentWords(basis);
  const words = contentWords(String(text).replace(PROGRAMME_WORDS, ' ')).map((w) => w.replace(/[’']s$/, '')).filter((w) => !FRAMING.has(w));
  const missing = words.filter((w) => !grounded(w, pool, low));
  // an ordinal ("a fourth case") and a grave word ("dead", "attack") are claims of their own: in the facts
  const claims = (String(text).toLowerCase().match(/\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\b/g) || []).filter((w) => !low.includes(w));
  for (const m of String(text).matchAll(new RegExp(GRAVE.source, 'gi'))) if (!grounded(m[0].toLowerCase(), pool, low)) claims.push(m[0].toLowerCase());
  if (claims.length) out.push(`words the story does not bear out: ${[...new Set(claims)].join(', ')}`);
  // a name (a capitalised word, the first one too unless it is a framing word) the facts never say is a claim of its
  // own (a thumbnail's capitals are its type, not names: its words are checked as words)
  const caps = String(text) === String(text).toUpperCase();
  const names = caps ? [] : (String(text).replace(PROGRAMME_WORDS, ' ').match(/\p{Lu}[\p{L}’'-]{2,}/gu) || []).flatMap((n) => n.toLowerCase().replace(/[’']s$/, '').split('-')).filter((n) => n.length >= 3 && !FRAMING.has(n) && !/^(?:globit|unit)$/.test(n));
  const badNames = [...new Set(names.filter((n) => !grounded(n, pool, low)))];
  if (badNames.length) out.push(`names the story does not: ${badNames.join(', ')}`);
  // most of the words are the story's: one in four may be the channel's own framing (a verb of its own, "explained")
  const allowed = Math.max(1, Math.floor(words.length * 0.25));
  const loose = missing.filter((w) => !badNames.includes(w));
  if (words.length && loose.length > allowed) out.push(`words the story does not bear out: ${loose.join(', ')}`);
  return out;
}

// a promise of an explanation ("why", "how", "explained", "what it means", "all you need to know") only where the clip
// gives one: half a minute or more, or a reason in its own words ("because", "after", "means", "due to")
const EXPLAINS = /^(?:why\b|how\b(?! many\b| much\b))|\b(?:explained|explainer|what it means|what this means|all you need to know|everything you need to know|the reason)\b/i;
const REASON = /\b(?:because|after|since|means|meaning|due to|so that|as a result|following|led to|leads to|caused|reason)\b/i;

function common(text, facts, field) {
  const faults = [];
  const t = norm(text);
  if (EXPLAINS.test(t) && !(Number(facts.duration) >= 30) && !REASON.test(facts.aired) && !/\?$/.test(t)) faults.push('promises an explanation the clip does not give');
  if (BAIT.test(t)) faults.push(`bait: "${t.match(BAIT)[0]}"`);
  if (!facts.live && LIVE.test(t)) faults.push('says live: the channel has no live stream');
  const sober = facts.grave || healthStory(facts);
  if (sober && GRAVE_WORDS.test(t)) faults.push(`sensational on grave news: "${t.match(GRAVE_WORDS)[0]}"`);
  if (sober && /\?/.test(t)) faults.push(facts.grave ? 'a question on grave news' : 'a question on a person\'s health');
  if (/!/.test(t)) faults.push('an exclamation mark');
  if (field !== 'thumb' && EMOJI.test(t)) faults.push('an emoji');
  if (facts.sources.length && !ownWords(t, facts.sources) && flat(t).length >= 6) faults.push('copies its source (the verbatim rule)');
  if (nearCopy(t, facts.outletTitles)) faults.push("the outlet's headline (five of its words in a row)");
  faults.push(...unsupported(t, facts));
  return faults;
}

/** A title's faults ([] when it can be used). `edited`: the owner's own (his words: unsupported words are his call). */
const FILLER_OPEN = /^(?:here'?s|here is|so,?|well,?|there (?:is|are|was|were)|it turns out|this is|meet the|watch|you won'?t|guess)\b/i;
export function checkTitle(text, facts, { edited = false } = {}) {
  const t = norm(text);
  const faults = [];
  const n = chars(t);
  if (n < LIMITS.title.min) faults.push(`too short (${n} characters, at least ${LIMITS.title.min})`);
  if (n > (edited ? LIMITS.title.hard : LIMITS.title.max)) faults.push(`too long (${n} characters, at most ${edited ? LIMITS.title.hard : LIMITS.title.max})`);
  // the first two words are what a scanning eye reads (docs/publishing/attention.md): a topic, never a filler
  if (FILLER_OPEN.test(t)) faults.push('opens on a filler, not the topic');
  // shouting: a word of capitals that is no acronym (NASA, UK, UNIT-8 are fine)
  const shout = (t.replace(PROGRAMME_WORDS, ' ').match(/\b\p{Lu}[\p{Lu}\d]*(?:-[\p{Lu}\d]+)*\b/gu) || []).filter((w) => w.replace(/[^\p{Lu}]/gu, '').length >= 4).filter((w) => !ACRONYM_OK.test(w) && !shoutBasis(facts).includes(w));
  if (shout.length) faults.push(`capitals: ${shout.join(' ')}`);
  if ((t.match(/\?/g) || []).length > 1) faults.push('more than one question mark');
  const f = common(t, facts, 'title');
  return [...faults, ...(edited ? f.filter((x) => !/^(?:words|names|a number) the story/.test(x)) : f)];
}

/** A thumbnail text's faults: one to four words, 22 characters, its own words beside the title (never the title again). */
export function checkThumb(text, facts, { title = '' } = {}) {
  const t = norm(text);
  const faults = [];
  const words = t.split(' ').filter(Boolean);
  if (!words.length) return ['empty'];
  if (words.length > LIMITS.thumb.words) faults.push(`${words.length} words (at most ${LIMITS.thumb.words})`);
  if (chars(t) > LIMITS.thumb.chars) faults.push(`${chars(t)} characters (at most ${LIMITS.thumb.chars})`);
  // (a word over nine letters cannot be set at 3x on a 216-pixel cover or beside a thumbnail's presenter: IMPROVEMENT
  // drops the whole cover to small type, unreadable at YouTube's 168×94)
  const long = words.filter((w) => chars(w.replace(/[^\p{L}\p{N}]/gu, '')) > LIMITS.thumb.word);
  if (long.length) faults.push(`a word too long to read big (${long.join(' ')}: at most ${LIMITS.thumb.word} letters)`);
  if (EMOJI.test(t)) faults.push('an emoji');
  if (title) {
    const own = contentWords(t);
    const tw = contentWords(title);
    if (own.length && own.every((w) => tw.some((x) => sameWord(w, x)))) faults.push('repeats the title (a thumbnail adds to it)');
  }
  faults.push(...concreteFaults(t, facts));
  return [...faults, ...common(t, facts, 'thumb').filter((x) => !/^copies its source/.test(x))];
}

// The big words tell a stranger what happened, or show the striking fact: a number, a place, a who. Never a label of
// the running order or the channel (NUMBER OF THE DAY, STORY OF THE WEEK, SCORE CENTRE, ROUND THREE, THE HEADLINES,
// FULL PROGRAMME, PLAY ALONG), never a nickname or a quotation lifted out of context ('BILLY THE KID', "STEADY
// IMPROVEMENT"), never a teaser that only makes sense after watching (IMPROVING, SERVICE HALTED, WHAT WE KNOW).
export const LABELS = /^(?:(?:THE |OUR )?NUMBER OF THE DAY|(?:THE )?STORY OF THE WEEK|SCORE CENTRE|ROUND (?:ONE|TWO|THREE|FOUR|\d+)|(?:THE |TODAY'?S |[A-Z]+ )?HEADLINES|THE BIG STORIES|THE WEEK|THE DAY IN SPORT|THE WORLD TODAY|THE WORLD|TODAY|FULL PROGRAMME|PLAY ALONG|NEWS QUIZ|THE NEWS QUIZ|YOUR GUESS\??|CAN YOU\??|HOW MANY\??|WHAT WE KNOW|THE FACTS|IN BRIEF|THE STORY|THE LATEST|LETTER BY LETTER|WHERE IN THE WORLD\??|FORECAST|OUTLOOK|\d+ STORIES|AND FINALLY|BREAKING|NEW TRAILER|BIGGEST GAME)$/;
// words that name nothing on their own (a "service", a "deal"): they do not make a phrase concrete
const VAGUE = new Set('service services deal deals plan plans move moves update updates news story stories change changes thing things issue issues situation latest headline headlines record step steps improving improvement trailer game'.split(' '));
/** The facts' names: words written with a capital inside a sentence, acronyms, the place, the people (lower case). */
/** The capitalised words of the story itself (its headline, its outlets' titles, its aired lines), whoever presents it. */
function storyNames(facts) {
  const out = new Set();
  // (and its aired words, the channel's presenters' own names taken out: a correspondent named is not the story)
  let aired = String(facts.kind === 'programme' ? facts.lead?.aired || '' : facts.aired || '');
  for (const n of facts.castNames || []) aired = aired.split(n).join(' . ');
  for (const text of [facts.headline, ...(facts.outletTitles || []), aired].filter(Boolean)) {
    for (const m of text.matchAll(/(?<=[^.!?:\s]\s+)(\p{Lu}[\p{L}’'-]+)/gu)) for (const x of flat(m[1].replace(/[’']s$/, ''))) out.add(x);
    for (const m of text.matchAll(/^(\p{Lu}[\p{L}’'-]+)/gu)) if (!FRAMING.has(m[1].toLowerCase())) for (const x of flat(m[1].replace(/[’']s$/, ''))) out.add(x);
  }
  for (const w of out) if (CALENDAR.test(w) || /^(?:the|a|an|and|but|in|on|at|of|for|to|it|he|she|they|we|i|this|that|our|his|her|its)$/.test(w)) out.delete(w);
  return out;
}
/** The words that go with a name (a title, a rank). */
const HONORIFIC = /^(?:pope|president|king|queen|prince|princess|minister|prime|chancellor|secretary|archbishop|bishop|cardinal|dr|doctor|sir|dame|lord|lady|mr|mrs|ms|senator|governor|mayor|general|coach|manager|captain|keeper|goalkeeper|gk|star|player|striker|rider|jockey|singer|actor|chief|leader|ceo|boss)$/;
/** A day or a month is when, not who or what. */
const CALENDAR = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december)$/;
function namesOf(facts) {
  const text = [basisOf(facts), facts.place, facts.subject].filter(Boolean).join(' . ').replace(PROGRAMME_WORDS, ' ');
  const out = new Set();
  for (const m of text.matchAll(/(?<=[^.!?:\s]\s+|^)(\p{Lu}[\p{L}’'-]+)/gu)) {
    const w = m[1].toLowerCase().replace(/[’']s$/, '');
    if (w.length >= 2 && !FRAMING.has(w) && !CALENDAR.test(w) && !/^(?:the|a|an|and|but|in|on|at|of|for|to|it|he|she|they|we|i|this|that|our|his|her|its)$/.test(w)) for (const x of flat(w)) out.add(x);
  }
  for (const m of text.matchAll(/\b[\p{Lu}]{2,}\b/gu)) for (const x of flat(m[0])) out.add(x);
  // the people of the clip and its place, whatever their position in a sentence (the channel's own presenters only in
  // a quiz, where they are the players: elsewhere a presenter's name says nothing of what happened)
  const quiz = facts.quiz || facts.quizShow;
  for (const n of [...(facts.quizInfo?.players || []), ...(facts.presenters || []), facts.place, facts.subject]) for (const w of flat(n || '')) if (w.length >= 2) out.add(w);
  if (!quiz) for (const w of [...(facts.castNames || []), ...(facts.presenters || [])].flatMap((n) => flat(n || ''))) out.delete(w);
  // (a word of the story's own that a presenter's name shares stays: Pope Leo is a who, whoever presents)
  if (!quiz) for (const w of storyNames(facts)) out.add(w);
  return out;
}
/** Is a thumbnail's text quoted in the facts (a nickname, a phrase of someone's: words out of their context)? */
function quotedInFacts(t, facts) {
  const want = flat(t).join(' ');
  if (!want) return false;
  for (const m of basisOf(facts).matchAll(/[“"‘']([^”"’']{3,80})[”"’']/g)) if (flat(m[1]).join(' ') === want) return true;
  return false;
}
const HEALTH = /\b(?:surgery|surgeries|operation|cancer|cancerous|hospital|hospitali[sz]ed|ill health|illness|diagnos\w*|treatment|recovering|recovery|medical bulletin|concussion|stroke|heart attack)\b/i;
/** A story about a person's health: plain words, the who and the what; never a tease. */
export const healthStory = (facts) => !facts.quiz && !facts.weather && !facts.quizShow && !facts.weatherShow && HEALTH.test(`${facts.headline}. ${facts.kind === 'programme' ? facts.lead?.aired || '' : facts.aired}`);

function concreteFaults(t, facts) {
  const T = norm(t).toUpperCase().replace(/[.!]+$/, '');
  const faults = [];
  if (LABELS.test(T)) return [`a label, not what happened ("${T}")`];
  // a date alone says when, not what
  if (/^(?:\d{1,2}\s+)?(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*(?:\s+\d{1,2})?$/.test(T)) return [`a date, not what happened ("${T}")`];
  if (quotedInFacts(t, facts)) faults.push('a quotation or nickname out of its context');
  const digits = /\d/.test(T);
  // a figure alone ("£1.6BN") says nothing of what it is, and beside a person's picture reads as theirs: name the thing
  if (digits && !flat(t).some((w) => /\p{L}{3,}/u.test(w) && !/^(?:bn|mn|million|billion|thousand|percent)$/.test(w))) faults.push('a figure alone: say what it is (£1.6BN SKY DEAL)');
  const names = namesOf(facts);
  const words = flat(t);
  const named = words.some((w) => names.has(w) || names.has(w.replace(/s$/, '')));
  // money beside a picture reads as the pictured person's: a sum names whose it is or what it buys (SKY'S £1.6BN ITV BID);
  // a quiz's question stands beside its players, never a picture of someone in the story (FROM $8 TO ?)
  if (/[£$€¥]\s?\d|\d(?:[.,]\d+)?\s?(?:BN|MN|M|K)\b/.test(T) && !named && !facts.quiz) faults.push('a sum without whose it is (SKY\'S £1.6BN ITV BID)');
  // a number clip shows its number
  if (facts.kind === 'number' && !digits) faults.push('a number clip\'s words without its number');
  // a person's health: who it is, plainly
  // (who is a person: a hospital's name is where, not who)
  const institution = /^(?:hospital|clinic|infirmary|centre|center|ward|institute)$/;
  const person = words.some((w, i) => (names.has(w) || names.has(w.replace(/s$/, ''))) && !institution.test(w) && !institution.test(words[i + 1] || ''));
  const health = healthStory(facts) && (facts.kind !== 'programme' || words.some((w) => storyNames(facts).has(w)));
  if (health && !person) faults.push('a person\'s health without who it is');
  // and what: a name alone beside a face says nothing of what happened to them
  else if (health) {
    const told = contentWords([facts.headline, ...(facts.outletTitles || []), facts.kind === 'programme' ? facts.lead?.aired || '' : facts.aired].join(' '));
    // (a title or a regnal number is part of who: POPE LEO XIV says who, not what)
    const who = (w) => names.has(w) || names.has(w.replace(/s$/, '')) || HONORIFIC.test(w) || /^[ivxlc]+$/.test(w);
    if (!contentWords(t).some((w) => !who(w) && !FRAMING.has(w) && told.some((x) => sameWord(w, x)))) faults.push('a person\'s health: who, and plainly what (a name alone)');
  }
  if (!digits && !named) {
    // what happened, in the story's own nouns: two of its headline's or outlets' content words, none vague
    const pool = contentWords([facts.headline, ...facts.outletTitles, sentencesIn(facts.aired)[0] || ''].join(' '));
    const own = contentWords(t).filter((w) => !FRAMING.has(w));
    const solid = own.filter((w) => !VAGUE.has(w) && pool.some((p) => sameWord(w, p)));
    if (solid.length < 2 || own.some((w) => VAGUE.has(w))) faults.push('neither a number, a place, a who nor what happened (too vague for a stranger)');
  }
  return faults;
}

/** The caption's hook (its first line, after the disclosure's words) and the description's lead. */
export function checkHook(text, facts, { max = LIMITS.hook.max } = {}) {
  const t = norm(text);
  const faults = [];
  const n = chars(t);
  if (n < LIMITS.hook.min) faults.push(`too short (${n} characters)`);
  if (n > max) faults.push(`too long (${n} characters, at most ${max})`);
  const shout = (t.replace(PROGRAMME_WORDS, ' ').match(/\b\p{Lu}[\p{Lu}\d]*(?:-[\p{Lu}\d]+)*\b/gu) || []).filter((w) => w.replace(/[^\p{Lu}]/gu, '').length >= 4).filter((w) => !ACRONYM_OK.test(w) && !shoutBasis(facts).includes(w));
  if (shout.length) faults.push(`capitals: ${shout.join(' ')}`);
  return [...faults, ...common(t, facts, 'hook')];
}

/** Every field of a package: { ok, faults: [{ field, text, fault }] }. */
export function checkPackage(pkg, facts, { editedTitle = null } = {}) {
  const faults = [];
  const add = (field, text, list) => list.forEach((fault) => faults.push({ field, text, fault }));
  const titles = pkg?.titles || [];
  if (!titles.length) faults.push({ field: 'titles', text: '', fault: 'no title' });
  titles.forEach((t, i) => add(`title${i + 1}`, t, checkTitle(t, facts, { edited: editedTitle !== null && t === editedTitle && i === 0 })));
  (pkg?.thumbs || []).forEach((t, i) => add(`thumb${i + 1}`, t, checkThumb(t, facts, { title: titles[i] || titles[0] || '' })));
  if (pkg?.hook) add('hook', pkg.hook, checkHook(pkg.hook, facts));
  if (pkg?.lead) add('lead', pkg.lead, checkHook(pkg.lead, facts, { max: LIMITS.lead.max }));
  const tags = pkg?.hashtags || [];
  if (tags.length > LIMITS.hashtags.max) faults.push({ field: 'hashtags', text: tags.join(' '), fault: `${tags.length} hashtags (at most ${LIMITS.hashtags.max})` });
  if (facts.grave && tags.includes('pixelart')) faults.push({ field: 'hashtags', text: 'pixelart', fault: 'a playful hashtag on grave news' });
  return { ok: faults.length === 0, faults };
}

// ---------------------------------------------------------------- the deterministic writer

const WEAK_END = /\b(?:a|an|the|of|to|in|on|at|by|for|from|with|and|or|but|as|after|before|over|into|its|is|are|was|were|be|has|have|had|will|would|can|could|says|said)$/i;
const cut = (s, max) => {
  let t = norm(s).replace(/[.!]+$/, '');
  if (chars(t) <= max) return t;
  // at its own break (a colon, a dash, a comma) when what comes before can stand alone
  const head = /^(.{20,}?)\s*(?:[:;–—]|,\s)/.exec(t);
  if (head && chars(head[1]) <= max) return head[1].replace(WEAK_END, '').trim();
  const words = t.split(' ');
  while (words.length > 3 && (chars(words.join(' ')) > max || WEAK_END.test(words.join(' ')))) words.pop();
  return chars(words.join(' ')) <= max ? words.join(' ') : '';
};
/** A headline in sentence case: its words in capitals stay where the facts write them so (names, places). */
function sentenceCase(text, facts) {
  const t = norm(text).replace(/[.!]+$/, '');
  const basis = basisOf(facts);
  const words = t.split(' ');
  const titled = words.filter((w) => /^\p{Lu}\p{Ll}/u.test(w)).length >= Math.max(3, words.length * 0.6);
  const caps = t === t.toUpperCase();
  if (!titled && !caps) return t.charAt(0).toUpperCase() + t.slice(1);
  return words.map((w, i) => {
    if (i === 0) return caps ? w.charAt(0) + w.slice(1).toLowerCase() : w;
    const bare = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (ACRONYM_OK.test(bare) && !caps) return w;
    // a word the facts write with a capital inside a sentence is a name
    const proper = bare && new RegExp(`[^.!?\\s]\\s+${bare.charAt(0).toUpperCase()}${bare.slice(1).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(basis);
    if (proper) return caps ? w.charAt(0) + w.slice(1).toLowerCase() : w;
    return w.toLowerCase();
  }).join(' ');
}
const placeName = (p) => norm(p).split(',')[0].toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const roundSecs = (d) => (d ? Math.max(10, Math.round(d / 5) * 5) : null);
const usable = (t, facts) => t && checkTitle(t, facts).length === 0;

/** The story's statement in the channel's own words: its headline, else an aired sentence of its own, else ''. */
function statement(facts) {
  if (facts.headlineOwn) {
    const h = cut(sentenceCase(facts.headline, facts), LIMITS.title.max);
    if (usable(h, facts)) return h;
  }
  // an aired sentence only when it can be measured against the story's sources (else it may be the outlet's own)
  for (const s of facts.sources.length ? sentencesIn(facts.aired).slice(0, 3) : []) {
    const plain = s.replace(/^(?:now|next|and|also|meanwhile|finally|and finally|in [a-z]+ news)[,:]?\s+/i, '').replace(/[.!]+$/, '');
    if (/^(?:this is|i'?m|good (?:morning|evening|afternoon)|hello|welcome|thanks)/i.test(plain) || /\b(?:I|we|you)\b/.test(plain)) continue;
    // whole, or the part before its own colon, semicolon or dash (never cut after a comma or mid-clause: "readers in
    // Oslo can use the main public library" lost "on Sundays", the story's point)
    const head = /^(.{25,}?)\s*[:;–—]\s/.exec(plain);
    const t = chars(plain) <= LIMITS.title.max ? plain : head && chars(head[1]) <= LIMITS.title.max ? head[1] : '';
    if (chars(t) >= 25 && usable(t, facts)) return t;
  }
  // the clip's own hook when it is the channel's (a figure and its label, "4 stories in 45 seconds"), not the headline
  const hook = facts.hookLines.join(' ');
  if (hook && !(facts.headline && sharedRun(hook, facts.headline) >= 3) && !FEATURE.test(hook) && hook.toUpperCase() !== facts.programme.toUpperCase()) {
    const t = cut(sentenceCase(hook.replace(/&/g, 'and'), facts), LIMITS.title.max);
    if (chars(t) >= 12 && usable(t, facts)) return t;
  }
  return '';
}

/** A story's label as words (Wildfire in California), '' when it has none of its own. */
function labelPhrase(facts) {
  const [k, p] = facts.label.split(' · ');
  if (k && p) return `${k} in ${p}`;
  return k || (p ? `News from ${p}` : '');
}

// (a figure that ends on a weak word reads as a fragment: "6 ALL YOU")
const FRAGMENT_END = /\b(?:ALL|YOU|YOUR|THE|OF|TO|A|AN|AND|OR|FOR|IN|ON|AT|WITH|IS|ARE|WAS|IT|ITS)$/;
const escapeRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The story's figures that are figures: a small number right after a name is part of the name (GTA 6, iPhone 17). */
function realFigures(facts, n) {
  const aired = String(facts.aired || '');
  return extractFigures(aired, n).filter((f) => {
    const v = String(f.value).trim();
    return !(/^\d{1,2}$/.test(v) && new RegExp(`(?:\\b[A-Z]{2,}|\\b\\p{Lu}\\p{Ll}+)\\s+${escapeRe(v)}\\b`, 'u').test(aired));
  });
}
/** A subject that can stand big: not a suffix or initials cut from a name (JR, SR). */
const bigSubject = (facts) => (facts.subject && facts.subject.replace(/[^\p{L}]/gu, '').length >= 3 ? facts.subject.toUpperCase() : '');
function figureWords(facts, max = 14) {
  for (const f of realFigures(facts, 4)) {
    const v = norm(f.fact).toUpperCase();
    if (chars(v) <= max && f.label && !FRAGMENT_END.test(v)) return v;
    if (chars(f.value) <= max && /\D/.test(f.value)) return norm(f.value).toUpperCase();
  }
  return '';
}

/** Topic hashtags: the story's place and its named subject, as the facts write them; never a person on grave news. */
const PROG_TAG = { 'world-now': 'worldnews', 'tech-bytes': 'technews', cosmos: 'sciencenews', 'money-minute': 'businessnews', 'news-60': 'news', 'world-weather': 'weather', 'seven-days': 'weekinreview', 'full-time': 'sportsnews', 'pay-attention': 'newsquiz' };
export function hashtagsFor(facts) {
  const tags = [];
  const add = (t) => {
    const tag = String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').map((w) => (w.length <= 4 && w === w.toUpperCase() && !/^(?:OF|THE|AND|IN|ON|AT|TO|FOR|A|AN|BY)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('');
    if (tag.length >= 3 && tag.length <= 24 && !tags.some((x) => x.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  };
  if (facts.quiz) return ['newsquiz', 'quiz', 'news', 'pixelart'];
  if (facts.weather) return ['weather', 'forecast', 'pixelart'];
  const place = facts.place ? placeName(facts.place) : '';
  if (facts.grave) {
    if (place) add(place);
    return [...tags.slice(0, 1), PROG_TAG[facts.programId] || 'news'].slice(0, 2);
  }
  if (facts.subject && basisOf(facts).toLowerCase().includes(facts.subject.toLowerCase()) && facts.subject.split(' ').length <= 3) add(facts.subject);
  else if (facts.kicker && facts.label.toLowerCase().startsWith(facts.kicker.toLowerCase())) add(facts.kicker);
  if (place) add(place);
  return [...tags.slice(0, 2), PROG_TAG[facts.programId] || 'news', 'pixelart'].slice(0, LIMITS.hashtags.max);
}

/** Is one thumbnail text the other's words again (£15M UK beside £15M UK FUND is no variant)? */
const overlaps = (a, b) => {
  const A = flat(a);
  const B = flat(b);
  // (a lone figure beside the same figure with its noun is a variant: 40, MORE THAN 40 PEOPLE)
  const [short, long] = A.length <= B.length ? [A, B] : [B, A];
  return (short.length >= 2 || short.length === long.length) && short.every((w) => long.includes(w));
};

/** Words for a thumbnail that claim nothing of the story, by kind, for when nothing better passes. */
function genericThumbs(facts) {
  const out = [];
  const add = (t) => t && chars(t) <= LIMITS.thumb.chars && !out.includes(t) && out.push(t);
  if (facts.quiz) for (const p of facts.quizInfo?.players || []) add(`BEAT ${p.toUpperCase()}?`);
  if (facts.quiz && facts.quizInfo?.players?.length >= 2) add(facts.quizInfo.players.slice(0, 2).join(' VS ').toUpperCase());
  // (a quiz's aired lines hold its answers: nothing of them on a cover)
  if (facts.quiz || facts.quizShow) return out;
  // (a figure with its noun before the bare figure: MORE THAN 40 PEOPLE tells more than 40)
  const figs = realFigures(facts, 6);
  for (const f of figs) if (!FRAGMENT_END.test(norm(f.fact).toUpperCase())) add(norm(f.fact).toUpperCase());
  for (const f of figs) add(norm(f.value).toUpperCase());
  // the names the story's first words give, as they are written (two or three capitalised words: CHANNEL TUNNEL)
  // (a quiz's words never come from its aired lines: they can hold the answer)
  for (const s of facts.quiz || facts.quizShow ? [] : [facts.headlineOwn ? facts.headline : '', ...sentencesIn(facts.aired).slice(0, 2)]) {
    for (const m of String(s).matchAll(/(?<=\S\s+)\p{Lu}[\p{L}\d’'-]+(?:\s+\p{Lu}[\p{L}\d’'-]+){0,2}/gu)) add(m[0].toUpperCase().replace(/[’']S$/, ''));
  }
  if (facts.place) add(placeName(facts.place).toUpperCase());
  add(bigSubject(facts));
  // (never the outlet's name: who reported it is not what happened)
  const outlets = new Set([facts.outlet, ...(facts.credits || [])].filter((o) => typeof o === 'string').flatMap((o) => flat(o)));
  for (let i = out.length - 1; i >= 0; i--) if (!/\d/.test(out[i]) && flat(out[i]).some((w) => outlets.has(w))) out.splice(i, 1);
  // and a figure with a name of the story (£15M · BELFAST HARBOUR), for a third variant that shows both
  const values = extractFigures(facts.aired, 3).map((f) => norm(f.value).toUpperCase()).filter(Boolean);
  const names = out.filter((t) => !/\d/.test(t));
  for (const v of values) for (const n of names) add(`${v} ${n}`);
  return out;
}

const QUIZ_KIND = { where: 'where in the world is it?', howmany: 'how many?', letters: 'name the headline', today: 'today or not today?', which: 'which story is it?', picture: 'what is in the picture?' };

/** The deterministic writer: a package from the facts alone (no AI), never the outlet's headline. */
export function fallbackPackage(facts) {
  const prog = facts.programme;
  const secs = roundSecs(facts.duration);
  let titles = [];
  let thumbs = [];
  let hook = '';
  let lead = '';
  if (facts.quiz) {
    const q = facts.quizInfo || {};
    const who = q.players?.length === 2 ? `${q.players[0]} and ${q.players[1]}` : '';
    const kindWords = QUIZ_KIND[q.type] || 'a question from the news';
    // what the question is about, without its answer: the first name it gives (TSMC, Waymo), as the board shows it
    const qtext = `${q.tease || q.title || ''}`;
    const about = ((qtext.match(/(?<=\S\s+)\p{Lu}[\p{L}\d’'&-]*(?:\s+\p{Lu}[\p{L}\d’'&-]+){1,2}/u) || qtext.match(/\b(?!AI\b)[\p{Lu}\d]{2,6}\b/u) || qtext.match(/(?<=\S\s+)(?!(?:The|A|An|In|On|And|But)\b)\p{Lu}\p{Ll}[\p{L}\d’'&-]*/u) || [''])[0]).replace(/[’']s$/, '');
    const ask = { howmany: 'How many?', where: 'Where is it?', today: 'Today or not today?' }[q.type] || 'News quiz:';
    titles = [q.title && chars(q.title) <= LIMITS.title.max ? q.title : '', about ? `${ask} A question about ${about} from this week's news` : '', who ? `Can you beat ${who}? This week's news quiz` : '', `News quiz: ${kindWords}`, `Play along: a ${prog} question on this week's news`];
    thumbs = [about && chars(about) <= 16 ? `${about.toUpperCase()}?` : 'YOUR GUESS?', who ? `BEAT ${q.players[0].toUpperCase()}?` : 'CAN YOU?', 'PLAY ALONG', 'NEWS QUIZ'];
    hook = who ? `Can you beat ${who}? Play along with a question on this week's news.` : 'Play along with a question on this week\'s news.';
    lead = `A question from ${prog}, the quiz on stories GLOBIT 24 told this week.`;
  } else if (facts.weather) {
    const fig = figureWords(facts, 12);
    const words = facts.hookLines.join(' ').replace(/&/g, 'and');
    const head = words ? sentenceCase(words, facts) : 'The world\'s weather';
    titles = [`${head}: the world's weather today`, fig ? `${fig.charAt(0) + fig.slice(1).toLowerCase()} and more: the world's weather` : '', 'The world\'s weather, zone by zone, from forecast data', `${prog}: today's weather around the world`];
    thumbs = [fig || 'TODAY', words ? words.toUpperCase().slice(0, 22) : 'THE WORLD', 'FORECAST'];
    hook = `${head}: the world's weather from the forecast data.`;
    lead = `${head}. From ${prog}, the world's weather from the forecast data.`;
  } else if (facts.kind === 'programme') {
    const s = facts.quizShow || facts.weatherShow ? '' : statement(facts);
    const mins = facts.duration ? Math.max(1, Math.round(facts.duration / 60)) : null;
    titles = [facts.programmeTitle, s ? `${s}: ${prog}${facts.date ? `, ${facts.date}` : ''}` : '', `${prog}${facts.date ? ` · ${facts.date}` : ''}: ${facts.quizShow ? 'the week\'s news as a game' : facts.weatherShow ? 'the world\'s weather' : `${facts.stories} stories${mins ? ` in ${mins} minutes` : ''}`}`];
    const place = facts.place ? placeName(facts.place).toUpperCase() : '';
    thumbs = [facts.quizShow ? 'PLAY ALONG' : facts.weatherShow ? 'THE WORLD TODAY' : figureWords({ ...facts, aired: facts.lead?.aired || facts.aired }) || place || 'TODAY', 'FULL PROGRAMME', facts.date ? facts.date.toUpperCase() : 'TODAY'];
    hook = s ? `${s}, and more from ${prog}.` : `${prog}, the whole programme.`;
    lead = hook;
  } else if (facts.kind === 'montage') {
    const subj = facts.programId === 'tech-bytes' ? 'tech' : facts.programId === 'cosmos' ? 'science' : facts.programId === 'money-minute' ? 'money' : facts.programId === 'full-time' ? 'sport' : '';
    titles = [`Today's ${subj ? `${subj} ` : ''}headlines${secs ? ` in ${secs} seconds` : ''}`, `${prog}: the headlines${facts.date ? `, ${facts.date}` : ''}`, `The ${subj ? `${subj} ` : ''}stories of the day from ${prog}`];
    thumbs = ['THE HEADLINES', secs ? `IN ${secs} SECONDS` : 'TODAY', facts.date ? facts.date.toUpperCase() : 'TODAY'];
    hook = `Today's ${subj ? `${subj} ` : ''}headlines from ${prog}${secs ? `, in ${secs} seconds` : ''}.`;
    lead = `The headlines from ${prog} on GLOBIT 24.`;
  } else {
    const s = statement(facts);
    const lab = labelPhrase(facts);
    const fig = figureWords(facts);
    const place = facts.place ? placeName(facts.place) : '';
    const base = s || (lab ? `${lab}: the facts${secs ? ` in ${secs} seconds` : ''}` : `${prog}: the story${secs ? ` in ${secs} seconds` : ''}`);
    titles = [
      base,
      s ? (facts.grave ? `${s}: what we know` : `${s}${secs ? `, in ${secs} seconds` : ': what we know'}`) : '',
      s && lab && !contentWords(lab).every((w) => contentWords(s).some((x) => sameWord(w, x))) ? `${facts.label.split(' · ')[0]}: ${s}` : '',
      s ? `${s} | ${prog}` : '',
      lab ? `${lab} | ${prog}` : '',
      `${prog}: the story${secs ? ` in ${secs} seconds` : ''}`,
    ];
    const kick = facts.label.split(' · ')[0] || '';
    thumbs = [fig, place ? place.toUpperCase() : '', kick && place ? `${kick} IN ${place}`.toUpperCase() : '', bigSubject(facts)];
    hook = s ? `${s}.` : lab ? `${lab}: what the reports say.` : `The story from ${prog}.`;
    lead = `${s ? `${s}.` : lab ? `${lab}.` : ''}${facts.outlet ? ` Reporting: ${facts.outlet}.` : ''}`.trim() || `From ${prog} on GLOBIT 24.`;
  }
  const keep = [];
  for (const t of titles.map(norm).filter(Boolean)) if (keep.length < LIMITS.variants && !keep.some((k) => k.toLowerCase() === t.toLowerCase()) && usable(t, facts)) keep.push(t);
  if (!keep.length) keep.push(`${prog}${facts.date ? ` · ${facts.date}` : ''}`.slice(0, LIMITS.title.max));
  const tks = [];
  for (const t of thumbs.map(norm).filter(Boolean)) if (tks.length < LIMITS.variants && !tks.includes(t) && checkThumb(t, facts, { title: keep[tks.length] || keep[0] }).length === 0) tks.push(t);
  // (each beside the title it goes with: a package passes its own checks, the gate's, as a whole)
  for (const t of genericThumbs(facts)) if (tks.length < LIMITS.variants && !tks.some((x) => overlaps(x, t)) && checkThumb(t, facts, { title: keep[tks.length] || keep[0] }).length === 0) tks.push(t);
  if (checkHook(hook, facts).length || /^The story from /.test(hook)) {
    const t = keep.find((x) => checkHook(`${x}.`, facts).length === 0);
    if (t) hook = /\?$/.test(t) ? t : `${t}.`;
  }
  if (checkHook(lead, facts, { max: LIMITS.lead.max }).length || /^(?:Reporting: [^.]*\.|From .* on GLOBIT 24\.)$/.test(lead)) lead = `${hook}${facts.outlet && !hook.includes(facts.outlet) ? ` Reporting: ${facts.outlet}.` : ''}`;
  return { titles: keep, thumbs: tks, hook: cut(hook, LIMITS.hook.max) + (/[.?]$/.test(cut(hook, LIMITS.hook.max)) ? '' : '.'), lead, hashtags: hashtagsFor(facts), writer: 'fallback' };
}

// ---------------------------------------------------------------- the AI writer

/** The AI writer's prompt: the facts as the clip aired them, the rules, the JSON it returns. */
export function packagePrompt(facts) {
  const lines = [
    facts.kind === 'programme'
      ? `You package one whole programme of GLOBIT 24, a 24-hour news channel made by AI with pixel-art presenters, for YouTube (its title and its thumbnail's words; YouTube's Test & Compare tries three of each).`
      : `You package one short clip of GLOBIT 24, a 24-hour news channel made by AI with pixel-art presenters, for YouTube Shorts, TikTok and Instagram Reels.`,
    `Write in the channel's own words, from the FACTS below only. Facts are free; the outlet's wording is not.`,
    '',
    'FACTS',
    `Programme: ${facts.programme}${facts.date ? ` (aired ${facts.date})` : ''}`,
    `Clip: ${facts.kind}${facts.duration ? `, ${Math.round(facts.duration)} seconds` : ''}${facts.grave ? ' - GRAVE NEWS' : ''}`,
    facts.quizInfo ? `Quiz question as the board asks it (never give the answer): ${facts.quizInfo.title || facts.quizInfo.tease}\nPlayers: ${facts.quizInfo.players.join(' and ')}` : null,
    facts.headline ? `The channel's headline as aired: ${facts.headline}` : null,
    facts.label ? `Label: ${facts.label}` : null,
    facts.aired ? `What the presenters said (the channel's words):\n${facts.aired.slice(0, 1500)}` : null,
    facts.outletTitles.length ? `The outlet's headline (DO NOT reuse its wording; never 5 of its words in a row): ${facts.outletTitles.join(' | ')}` : null,
    facts.summaries.length ? `The outlet's summary (facts only): ${facts.summaries.join(' ').slice(0, 800)}` : null,
    facts.outlet ? `Source: ${facts.outlet}` : null,
    '',
    'RULES',
    '- Every name, number and claim must be in the facts. Nothing the clip does not show or say.',
    '- No clickbait: no "shocking", "you won\'t believe", "insane", "breaking", "live", no "!", no emoji, no ALL CAPS in titles or the hook.',
    '- titles: 3 different angles (the news itself; the stakes or the number; the place or the people), each 30 to 70 characters, sentence case, the key word in the first 40 characters. A question only when the clip answers it.',
    '- thumbs: 3 thumbnail texts of 1 to 4 short words (at most 22 characters, no word over 9 letters, capitals are fine) that ADD to the title instead of repeating it: a key figure, the place, what is at stake. One for each title, in order.',
    facts.kind === 'programme' ? null : '- The first thumbnail text must make sense on its own, without any title (TikTok and Instagram show a cover alone in their grids): the striking fact or what happened; put the title that complements it first.',
    '- No "why", "how", "explained" or "all you need to know" unless the clip itself explains it.',
    '- The thumbnail words must tell a stranger what happened, or show the striking fact: a number, a place, a who. Never a label (NUMBER OF THE DAY, STORY OF THE WEEK, THE HEADLINES, ROUND THREE, PLAY ALONG, FULL PROGRAMME), never a nickname or a quotation out of its context, never a teaser that only makes sense after watching. A number clip: the number itself, with what it is (£15M FOR BELFAST, never £15M alone: a figure alone says nothing, and beside a person\'s picture reads as theirs). A sum always names whose it is or what it buys (SKY\'S £1.6BN ITV BID, not £1.6BN PURCHASE). A person\'s health: plainly, who and what, no tease.',
    '- hook: the caption\'s first line, at most 90 characters: the most interesting fact first, a reason to watch.',
    // (docs/publishing/attention.md: what holds a stranger's eye, within the story)
    '- Lead with the topic: the first two words of every title and of the hook name what the story is about (a thing, a place, a who, a number), never a filler ("Here\'s", "So", "There is", "It turns out").',
    '- Numbers as digits (19, not nineteen), and the most specific true detail over a general one (a place, a figure, a name).',
    '- Say what is new or surprising in the story, in its own facts. For science, space and technology: the wonder of it, plainly (the scale, the first, the record) when the facts carry it.',
    '- When the facts say how the story touches ordinary people (prices, health, the phone or apps they use, their weather), say that, plainly; never invent a link that is not in the facts.',
    '- Never make it sound worse or better than the facts: no exaggeration of harm, no false hope. A curiosity gap only when the clip closes it.',
    '- lead: one sentence for the description, at most 160 characters.',
    facts.grave ? '- This is grave news (deaths, disaster or conflict): plain, factual and respectful. No question, no emotional or dramatic word, no emoji.' : null,
    facts.quiz ? '- A quiz: invite the viewer to play along; never give or hint at the answer. The first thumbnail text shows what the question is about (TSMC: HOW MUCH?, FROM $8 TO ?); a challenge to a player (BEAT PENNY?) only after it, or when nothing of the question can be shown without its answer.' : null,
    '- The presenters are the channel\'s own AI characters: their names are never a thumbnail\'s words outside a quiz (they are not the story).',
    facts.kind === 'programme' ? `- The first thumbnail text goes on the lead story's picture: it must be about the lead story (${facts.lead?.headline || 'the first story'}) and nothing else.` : null,
    '',
    'Reply with JSON only: {"titles":["","",""],"thumbs":["","",""],"hook":"","lead":""}',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

/** The AI writer's reply as a package draft (throws when it is not the JSON asked for). */
export function parsePackage(text) {
  const raw = String(text || '').replace(/^```[a-z]*\s*|\s*```$/gi, '').trim();
  const at = raw.indexOf('{');
  const v = JSON.parse(at > 0 ? raw.slice(at, raw.lastIndexOf('}') + 1) : raw);
  const list = (x) => (Array.isArray(x) ? x.map(norm).filter(Boolean) : []);
  const out = { titles: list(v.titles), thumbs: list(v.thumbs).map((t) => t.toUpperCase()), hook: norm(v.hook), lead: norm(v.lead) };
  if (!out.titles.length) throw new Error('no titles');
  return out;
}

/**
 * The package: the AI writer's words where they pass every check, field by field, the deterministic writer's where they
 * do not (or when the chain has no AI writer). -> { titles, thumbs, hook, lead, hashtags, writer, rejected }
 */
export async function writePackage(facts, { chain = null, log = console } = {}) {
  const fb = fallbackPackage(facts);
  if (!chain) return { ...fb, rejected: [] };
  let draft = null;
  try {
    ({ value: draft } = await chain.generate({ stage: 'package', prompt: packagePrompt(facts), programId: facts.programId, program: { id: facts.programId, title: facts.programme } }, parsePackage));
  } catch (err) {
    if (err?.code !== 'NO_PACKAGER') log.warn?.(`[package] the AI writer did not write it (${String(err?.message || err).slice(0, 160)}): the deterministic writer's words`);
    return { ...fb, rejected: [] };
  }
  const rejected = [];
  const pick = (cands, check, n) => {
    const keep = [];
    for (const c of cands) {
      if (keep.length >= n) break;
      const faults = check(c, keep.length);
      if (faults.length) rejected.push({ text: c, faults });
      else if (!keep.includes(c)) keep.push(c);
    }
    return keep;
  };
  // the pairs as the AI writer meant them (title A with thumbnail A: Test & Compare tries them together); a pair
  // whose title fails keeps its thumbnail beside the next title it does not repeat, a thumbnail that fails gives way to
  // the deterministic writer's
  const titles = pick(draft.titles, (t) => checkTitle(t, facts), LIMITS.variants);
  for (const t of fb.titles) if (titles.length < LIMITS.variants && !titles.includes(t)) titles.push(t);
  const pool = [...draft.thumbs];
  const thumbs = [];
  for (const [i, title] of titles.entries()) {
    const own = draft.titles.indexOf(title);
    const order = [...(own >= 0 && pool[own] ? [pool[own]] : []), ...pool.filter((x, k) => k !== own), ...fb.thumbs];
    const pick1 = order.find((c) => c && !thumbs.some((x) => x === c || (!draft.thumbs.includes(c) && overlaps(x, c))) && checkThumb(c, facts, { title }).length === 0);
    for (const c of order.slice(0, 1)) if (c && c !== pick1 && draft.thumbs.includes(c) && !thumbs.includes(c) && checkThumb(c, facts, { title }).length) rejected.push({ text: c, faults: checkThumb(c, facts, { title }) });
    const generic = pick1 ? null : genericThumbs(facts).find((c) => !thumbs.some((x) => overlaps(x, c)) && checkThumb(c, facts, { title }).length === 0);
    if (pick1 || generic) thumbs.push(pick1 || generic);
  }
  // a whole programme's thumbnail A stands on its lead story's picture: its words must be about the lead alone (a
  // minister's photo over another story's figure says what is not so)
  if (facts.kind === 'programme' && facts.lead && !facts.quizShow && !facts.weatherShow) {
    const leadFacts = { ...facts, aired: facts.lead.aired, headline: facts.lead.headline, sources: facts.lead.sources, summaries: [], label: '' };
    const onLead = (t) => t && checkThumb(t, leadFacts, { title: titles[0] }).length === 0 && !/^(?:FULL PROGRAMME|THE WORLD TODAY|TODAY|\d{1,2} (?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)|[\d,.%£$€]+)$/.test(t) ? true : false;
    if (!onLead(thumbs[0])) {
      // (the writer's own words about the lead first, the deterministic writer's after)
      const own = thumbs.findIndex((t) => onLead(t) && draft.thumbs.includes(t));
      const k = own > 0 ? own : thumbs.findIndex(onLead);
      const pool = [...draft.thumbs, ...fb.thumbs, ...genericThumbs(leadFacts)];
      const alt = k > 0 ? thumbs[k] : pool.find((t) => onLead(t) && !thumbs.includes(t));
      // (else what is about the lead even if the first title says it too: a programme's A is its lead, never a label)
      const near = pool.find((t) => t && !thumbs.includes(t) && checkThumb(t, leadFacts, {}).length === 0);
      if (k > 0) [thumbs[0], thumbs[k]] = [thumbs[k], thumbs[0]];
      else if (alt || near) thumbs[0] = alt || near;
    }
  }
  // the hook and the lead: the AI writer's when they pass, else the first title's words (the strongest line that passed),
  // else the deterministic writer's
  const fromTitle = (t) => `${t.replace(/[.:;,]+$/, '')}${/\?$/.test(t) ? '' : '.'}`;
  const titleLine = [titles[0], titles[1]].map((t) => t && fromTitle(t)).find((t) => t && checkHook(t, facts).length === 0);
  const hookOk = draft.hook && !checkHook(draft.hook, facts).length;
  if (draft.hook && !hookOk) rejected.push({ text: draft.hook, faults: checkHook(draft.hook, facts) });
  const hook = hookOk ? draft.hook : titleLine || fb.hook;
  const leadOk = draft.lead && !checkHook(draft.lead, facts, { max: LIMITS.lead.max }).length;
  if (draft.lead && !leadOk) rejected.push({ text: draft.lead, faults: checkHook(draft.lead, facts, { max: LIMITS.lead.max }) });
  const lead = leadOk ? draft.lead : `${hook}${facts.outlet && !hook.includes(facts.outlet) ? ` Reporting: ${facts.outlet}.` : ''}`;
  const fromAi = titles.filter((t) => draft.titles.includes(t)).length;
  return { titles, thumbs, hook, lead, hashtags: fb.hashtags, writer: fromAi === titles.length && hook === draft.hook ? 'ai' : fromAi ? 'ai+fallback' : 'fallback', rejected };
}
