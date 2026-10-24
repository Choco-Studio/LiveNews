// Moments: the parts of an aired episode worth a clip of their own (docs/publishing/clips.md §2), found from the
// episode's own structure (its segments, boards, speakers and the quiz's parts), placed on its timeline to the word,
// and scored for whether they make sense alone and whether they hold a viewer.
//
//   detectMoments(episode, { timeline }) -> [moment] best first
//
// The kinds (each from the structure, never from a guess at the words):
//   quiz-question  PAY ATTENTION: a question from its frame to its reveal (the round's title first when it opens a round),
//                  and the winner's one-line reaction when it follows
//   quiz-round     a whole round, title to last reveal: TikTok's longer clip (over a minute)
//   weather-board  WORLD WEATHER: HOT AND COLD, THE NEXT THREE DAYS
//   weather-story  WORLD WEATHER's big story: its headline segment and its warning
//   weather-map    WORLD WEATHER's world: the next 24 hours as a time-lapse, the highs and lows and places named
//   sport-result   FULL TIME: a result told with its score card or the SCORE CENTRE
//   lead           a programme's lead story told with its board
//   known          a story told over WHAT WE KNOW
//   number         NUMBER OF THE DAY (its figure on the board)
//   expert         an expert's answer: the story that asks it, the answer (and the follow-up), not the thanks
//   unit8          COSMOS DESK's robot co-host: an exchange in which UNIT-8 speaks, with the story it answers
//   stories        two to four light stories in a row, each whole (25-75 s: the longer clip a light desk makes)
//   montage        the headline montage that opens a programme
//   week60         SEVEN DAYS's THE WEEK IN 60 SECONDS
//   story          any other light story, whole
// A moment never starts on a sentence that leans on an earlier one (text.js dangling: the start moves to the first
// sentence that stands alone, inside its first segment), never ends inside a sentence, never cuts a quote.
import { estimateTimeline } from './timeline.js';
import { dangling, backReference, endsClean, quotesBalanced, graveText, interestCues, greetingOnly, teaseText } from './text.js';
import { severity } from '../facts.js';
import { excludedKind } from '../quiz/desk.js';
import { ownWords, storyLabel } from './wording.js';

// Phase 1's light programmes (docs/publishing/plan.md §2): the quiz, the weather, sport and the light desks (science,
// technology, games). SEVEN DAYS and the news programmes come in Phase 2, hard news gradually after.
const LIGHT_PROGRAMMES = new Set(['pay-attention', 'world-weather', 'full-time', 'cosmos', 'tech-bytes', 'press-start']);
// the kinds the channel's quiz desk refuses as a game (server/quiz/desk.js EXCLUDED): a story of one of them is never a
// light moment either (harm, disaster, crime, conflict, children, politics, health, people's money, hardship...)
const NOT_LIGHT = (text, subject) => {
  const k = excludedKind(text, subject);
  return k && k !== 'promotion' ? k : null;
};
export const KIND_BASE = { 'quiz-question': 7.5, 'quiz-round': 7, 'weather-board': 6.5, 'weather-story': 6.5, 'weather-map': 6.5, 'sport-result': 7, lead: 6, known: 6.5, number: 6.5, expert: 6.5, unit8: 6.5, montage: 5.5, week60: 7, stories: 5.5, story: 4.5 };
const BOARD_FIELDS = ['numbers', 'known', 'timeline', 'change', 'share', 'next', 'who', 'quote', 'term', 'score', 'chalk', 'fixtures', 'fact'];
const hasBoard = (seg) => BOARD_FIELDS.some((k) => (Array.isArray(seg?.[k]) ? seg[k].length : seg?.[k]));
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const upper = (s) => norm(s).toUpperCase();

/** A moment's identity: episode, kind and first segment (stable across runs, the ledger's key with the platform). */
export const momentId = (episodeId, kind, from, to) => `${episodeId}:${kind}:${from}-${to}`;

/** A grave segment: read sad, a grave story by the channel's own measure (facts.js severity), or breaking. */
function grave(seg) {
  const text = `${seg?.headline || ''}. ${seg?.text || ''}`;
  return seg?.emotion === 'sad' || severity(text) >= 2 || graveText(seg?.headline) || !!seg?.breaking;
}

/**
 * Place a run of segments [from..to] on the timeline: its start at the first sentence of `from` that stands alone
 * (or the segment's start when `keepStart`), its end at the last word of `to`. Returns null when it did not air.
 */
export function placeRun(timeline, from, to, { keepStart = false } = {}) {
  const segs = timeline.segments.filter((s) => s.index >= from && s.index <= to);
  if (!segs.length) return null;
  const first = segs[0];
  let startSentence = 0;
  let lead = null;
  if (!keepStart) {
    startSentence = first.sentences.findIndex((x) => !dangling(x.text) && !greetingOnly(x.text) && !labelOnly(x.text));
    if (startSentence < 0) return null;
    lead = leadIn(first, first.sentences[startSentence]);
  }
  const s0 = first.sentences[startSentence] || { start: first.start, from: 0 };
  const last = segs[segs.length - 1];
  const lastSentence = last.sentences[last.sentences.length - 1];
  const end = lastSentence?.end ?? last.end;
  const from0 = lead ? lead.from : s0.from || 0;
  const text = segs.map((s, i) => (i === 0 ? s.seg.text.slice(from0) : s.seg.text)).map(norm).join(' ');
  return { start: lead ? lead.start : s0.start ?? first.start, end, text, trimmed: startSentence > 0 || !!lead, leadIn: !!lead, segs };
}

// A running-order label at a run's head ("And finally:", "Our number of the day:", "Now,", "Around the world in 30
// seconds.") is the programme talking to itself, not the news: a clip starts on the news, because the first two
// seconds decide the scroll and are mostly watched without sound (docs/publishing/attention.md §2).
const LEAD_IN = /^(?:and finally|finally|our number of the day(?: is)?|the number of the day(?: is)?|(?:now,? )?around the world(?: in \d+ seconds)?|in other news|(?:and )?now|meanwhile|next|also)(?:\s*[:,.—–-]\s*|\s+(?=[A-Z0-9£$€"“‘'])|\s*$)/i;
// ("now", "next", "also" and "meanwhile" only with their comma or colon, or before a capital: "Now you can call
// anyone" keeps its "Now")
/** The label a sentence opens with, as many as it stacks ("Now, around the world:"), or ''. */
function leadLabel(text) {
  let rest = String(text || '');
  let cut = 0;
  for (let i = 0; i < 3; i++) {
    const m = LEAD_IN.exec(rest);
    // (the /i flag reads [A-Z] as any letter: a label joined by a bare space must meet a real capital, "Now you" is a
    // sentence)
    if (!m || (!/[:,.—–-]\s*$/.test(m[0]) && rest.length > m[0].length && !/^[A-Z0-9£$€"“‘']/.test(rest.slice(m[0].length)))) break;
    cut += m[0].length;
    rest = rest.slice(m[0].length);
  }
  return { cut, rest };
}
/** A sentence that is nothing but a label ("Around the world in 30 seconds."): never a clip's first. */
const labelOnly = (text) => {
  const { cut, rest } = leadLabel(text);
  return cut > 0 && !/[\p{L}\p{N}]/u.test(rest);
};
/**
 * Where a run starts once its sentence's opening label is left out: the first word after the label (its time from the
 * recording's word marks; estimated within the sentence when there are none), or null when there is no label (or
 * nothing after it: then the sentence is a label alone, never a first).
 */
function leadIn(seg, sentence) {
  if (!sentence?.text) return null;
  const { cut, rest } = leadLabel(sentence.text);
  if (!cut || !/[\p{L}\p{N}]/u.test(rest)) return null;
  const at = (sentence.from || 0) + cut;
  const w = (seg.words || []).find((x) => x.from >= at);
  if (w) return { from: w.from, start: w.at };
  const len = Math.max(1, sentence.text.length);
  const t0 = sentence.start ?? seg.start;
  const t1 = sentence.end ?? seg.end;
  return Number.isFinite(t0) && Number.isFinite(t1) ? { from: at, start: t0 + ((t1 - t0) * cut) / len } : null;
}

function score(m, { grave: g, board = false, light = true }) {
  const reasons = [];
  let sense = 10;
  const firstSentence = norm(m.text).split(/(?<=[.!?])\s+/)[0] || '';
  if (!m.keepStart && dangling(firstSentence)) {
    sense -= 4;
    reasons.push('opens on a sentence that leans on an earlier one');
  }
  if (backReference(m.text)) {
    sense -= 3;
    reasons.push('points back at an earlier part of the programme');
  }
  if (m.kind !== 'montage' && norm(m.text).split(/(?<=[.!?])\s+/).some(teaseText)) {
    sense -= 4;
    reasons.push('teases something the clip does not hold');
  }
  if (!endsClean(m.text)) {
    sense -= 2;
    reasons.push('does not end on a whole sentence');
  }
  if (!quotesBalanced(m.text)) {
    sense -= 5;
    reasons.push('a quote is cut');
  }
  const dur = m.end - m.start;
  if (dur < 10) {
    sense -= 2;
    reasons.push('under 10 s');
  }
  let interest = KIND_BASE[m.kind] ?? 4;
  interest += 2 * interestCues(m.text);
  if (board) interest += 0.8;
  if (dur >= 20 && dur <= 75) interest += 0.7;
  if (!light) interest -= 1.5;
  if (g) reasons.push('grave: never a light clip, no emoji, no lit word');
  sense = Math.max(0, Math.min(10, sense));
  interest = Math.max(0, Math.min(10, interest));
  return { sense: +sense.toFixed(1), interest: +interest.toFixed(1), total: +(0.55 * sense + 0.45 * interest).toFixed(2), reasons };
}

function makeMoment(episode, timeline, kind, from, to, extra = {}) {
  const run = placeRun(timeline, from, to, { keepStart: !!extra.keepStart });
  if (!run) return null;
  const segs = episode.segments.slice(from, to + 1);
  const g = segs.some(grave);
  // light: a light programme, nothing grave, and (outside the quiz and the weather, which choose their own stories) no
  // story of a kind the quiz desk would refuse
  const own = episode.program?.id === 'pay-attention' || !!episode.weather;
  const subject = segs.map((x) => x.headline).filter(Boolean).join('. ') || String(run.text).split(/(?<=[.!?])\s+/)[0];
  const refused = own ? null : NOT_LIGHT(run.text, subject);
  const light = LIGHT_PROGRAMMES.has(episode.program?.id) && !g && !refused;
  const storyIds = [...new Set(segs.map((s) => s.storyId).filter(Boolean))];
  const sources = [...new Set(segs.map((s) => s.source || s.outlet).filter(Boolean))];
  const m = {
    id: momentId(episode.id, kind, from, to),
    kind,
    episodeId: episode.id,
    programId: episode.program?.id || null,
    programme: episode.program?.title || null,
    from,
    to,
    start: +run.start.toFixed(3),
    end: +run.end.toFixed(3),
    duration: +(run.end - run.start).toFixed(2),
    text: run.text,
    trimmed: run.trimmed,
    leadIn: !!run.leadIn,
    keepStart: !!extra.keepStart,
    storyIds,
    sources,
    grave: g,
    light,
    demo: !!episode.demo,
    refused: refused || null,
    hook: extra.hook || null,
    headline: extra.headline || segs.find((s) => s.headline)?.headline || null,
    credits: extra.credits || [],
  };
  m.scores = score(m, { grave: g, board: segs.some(hasBoard) || !!extra.board, light });
  return m;
}

// ---------------------------------------------------------------- hooks: the clip's title (2 lines of 2x type, ≤ 16 characters each)

const MAX_LINE = 16;
/** Split a hook into at most two lines of ≤16 characters, whole words; null when it does not fit. */
export function hookLines(text, { chars = MAX_LINE, max = 2 } = {}) {
  const words = upper(text).split(' ').filter(Boolean);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if (`${cur} ${w}`.length <= chars) lines[lines.length - 1] = `${cur} ${w}`;
    else lines.push(w);
  }
  if (!lines[0] || lines.length > max || lines.some((l) => l.length > chars)) return null;
  return lines;
}
// a headline too long for the 2x hook goes whole in the body face: three lines of 32 (cards.js drawHook sets it 1x)
const SMALL_LINE = 32;
const fitsHook = (lines) => lines.length >= 1 && ((lines.length <= 2 && lines.every((l) => l.length <= MAX_LINE)) || (lines.length <= 3 && lines.every((l) => l.length <= SMALL_LINE)));

/** The first candidate that fits the hook's two lines (an array is lines as given; the fallback always fits). */
export function pickHook(cands, fallback) {
  for (const c of cands) {
    if (!c) continue;
    if (Array.isArray(c)) {
      const lines = c.map(upper).filter(Boolean);
      if (fitsHook(lines)) return lines;
      continue;
    }
    // a colon or a question mark ends the first line when both halves fit
    const m = /^(.+?[:?])\s+(.+)$/.exec(upper(c));
    if (m && m[1].length <= MAX_LINE && m[2].length <= MAX_LINE) return [m[1], m[2]];
    const lines = hookLines(c);
    if (lines) return lines;
  }
  return hookLines(fallback) || [upper(fallback).slice(0, MAX_LINE)];
}

// a programme's own labels say where a story sits in the running order, not what it is: never a clip's title
const FEATURE_LABEL = /^(?:AND FINALLY|NUMBER OF THE DAY|STILL TO COME|COMING UP|LATER|ALSO|IN BRIEF|THE LEAD)$/i;

/**
 * A headline as a hook, always whole (a cut headline says what the story did not: "NEANDERTHAL / REMAINS MAY"): two
 * lines of 16 at 2x when it fits; else the part before its own colon or dash at 2x; else the whole headline in the
 * body face, three lines of 32; else its colon part in the body face. null when nothing whole fits.
 */
export function headlineHook(headline) {
  const h = upper(headline).replace(/[.!]$/, '');
  if (!h) return null;
  const head = /^(.{8,}?)\s*[:–—]\s/.exec(h);
  return hookLines(h) || (head && hookLines(head[1])) || hookLines(h, { chars: SMALL_LINE, max: 3 }) || (head && hookLines(head[1], { chars: SMALL_LINE, max: 3 })) || null;
}
const kickerHook = (k) => (k && !FEATURE_LABEL.test(String(k).trim()) ? k : null);

/**
 * The verbatim rule on a clip's burned-in title (docs/publishing/verbatim.md): a hook that is the story's aired
 * headline (or its part before a colon) stays only when that headline is the channel's own words against the story's
 * sources (`ownWords`); otherwise it would show the outlet's headline as the channel's, unattributed, so the hook is
 * the story's label as its own words bear it out ("WILDFIRE · CALIFORNIA, USA"), else the programme's name.
 * `story` = { kicker, location|place, category }; `sources` = the story's title, summary and article.
 */
export function ownHook(m, story = {}, sources = []) {
  if (!m?.headline || !Array.isArray(m.hook) || !m.hook.length) return m?.hook || null;
  const flat = (x) => upper(x).replace(/[^A-Z0-9]+/g, '');
  const head = flat(m.headline);
  const hook = flat(m.hook.join(' '));
  if (!(hook.length >= 8 && head.startsWith(hook))) return m.hook; // a kind's own hook, not the headline
  const src = (sources || []).filter((x) => typeof x === 'string' && x.trim());
  if (!src.length || ownWords(m.headline, src)) return m.hook;
  const label = storyLabel(story, src);
  return pickHook([label ? label.replace(/ · /g, ': ') : null, kickerHook(upper(story.kicker || '')) && storyLabel({ kicker: story.kicker }, src) ? story.kicker : null], m.programme || 'GLOBIT 24');
}

/**
 * A quiz question's words for its posts, which never give its answer away: the question as the board asks it (its
 * blank as ___, a running-order label such as "And finally:" left out), or, where the headline is the answer itself
 * (LETTER BY LETTER, WHICH STORY?), only what the board shows at once (a headline's first letters). `title` tells one
 * question from another; `tease` is the question for the caption (null when there is none to give).
 */
export function quizWords(q = {}, type = q.type) {
  const blank = (t) => String(t || '').replace(/\s+/g, ' ').trim().replace(/^(?:and finally|finally|now|next|and)\s*[:,–—-]\s*/i, '').replace(/▮+/g, '___');
  if ((type === 'howmany' || type === 'where') && q.masked && /▮/.test(q.masked)) {
    const tease = blank(q.masked);
    return { title: `${type === 'where' ? 'Where is it?' : 'How many?'} ${tease}`, tease };
  }
  if (type === 'letters' && q.words) {
    const initials = String(q.words).split(/\s+/).filter(Boolean).map((w) => (/^\d+$/.test(w) ? w : `${w.replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase()}.`)).join(' ');
    return { title: `Name the headline: ${initials}`, tease: null };
  }
  if (type === 'today' && q.words) return { title: `Today or not today? ${blank(q.words)}`, tease: blank(q.words) };
  return { title: type === 'picture' ? 'Which story is this picture?' : 'Play along', tease: null };
}

const QUIZ_HOOK = { howmany: ['HOW MANY?', 'PLAY ALONG'], where: ['WHERE IN', 'THE WORLD?'], letters: ['NAME THE', 'HEADLINE'], today: ['TODAY OR', 'NOT TODAY?'], picture: ['WHICH STORY?', 'PLAY ALONG'] };

// ---------------------------------------------------------------- detectors

function quizMoments(episode, timeline) {
  const segs = episode.segments;
  const out = [];
  const rounds = [];
  let round = null;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.part === 'round' || s.part === 'don') {
      round = { at: i, type: s.quiz?.round || null, title: s.quiz?.title || null, questions: [] };
      rounds.push(round);
      continue;
    }
    if (s.part !== 'frame') continue;
    // the question: its frame to its reveal, and a player's reaction right after it
    let j = i + 1;
    while (j < segs.length && segs[j].part !== 'reveal' && segs[j].part !== 'frame' && segs[j].part !== 'round') j++;
    if (segs[j]?.part !== 'reveal') continue;
    let end = j;
    if (segs[j + 1]?.part === 'react' && ['A', 'B'].includes(segs[j + 1].anchor)) end = j + 1;
    const first = round && round.questions.length === 0 && round.at === i - 1;
    const from = first ? round.at : i;
    const q = s.quiz?.question || {};
    const type = q.type || round?.type || s.quiz?.round;
    const story = q.key ? q.key : null;
    const credits = q.aired?.source ? [{ outlet: q.aired.source, programme: q.aired.programme || null, storyId: story }] : [];
    const players = Object.entries(episode.cast || {}).filter(([k]) => k === 'A' || k === 'B').map(([, id]) => id);
    const m = makeMoment(episode, timeline, 'quiz-question', from, end, {
      keepStart: true,
      board: true,
      hook: pickHook([QUIZ_HOOK[type]], 'PLAY ALONG'),
      headline: q.words || null,
      credits,
    });
    if (m) {
      m.hookTall = ['PLAY ALONG'];
      m.quiz = { type, round: round?.title || null, players, opensRound: first, ...quizWords(q, type) };
      if (story) m.storyIds = [...new Set([story, ...m.storyIds])];
      if (q.aired?.source) m.sources = [...new Set([q.aired.source, ...m.sources])];
      // the round's first question opens on its title card: the clearest start; a "next headline" frame reads mid-way
      if (!first && /^(?:next|another|and one more|one more)\b/i.test(norm(s.text))) {
        m.scores.sense = +(m.scores.sense - 1.5).toFixed(1);
        m.scores.reasons.push('opens on "next": mid-round');
        m.scores.total = +(0.55 * m.scores.sense + 0.45 * m.scores.interest).toFixed(2);
      }
      out.push(m);
      round?.questions.push(m);
    }
  }
  // whole rounds (TikTok's over-a-minute clip): the title to the last question's end
  for (const r of rounds) {
    if (r.questions.length < 2) continue;
    const last = r.questions[r.questions.length - 1];
    const m = makeMoment(episode, timeline, 'quiz-round', r.at, last.to, { keepStart: true, board: true, hook: pickHook([QUIZ_HOOK[r.type] ? [QUIZ_HOOK[r.type][0] === 'HOW MANY?' || QUIZ_HOOK[r.type][0] === 'WHICH STORY?' ? QUIZ_HOOK[r.type][0] : QUIZ_HOOK[r.type].join(' '), 'A WHOLE ROUND'] : null, ['PAY ATTENTION', 'A WHOLE ROUND']], 'PLAY ALONG'), credits: r.questions.flatMap((q) => q.credits) });
    if (m) {
      m.hookTall = ['FULL ROUND'];
      m.quiz = { type: r.type, round: r.title, players: r.questions[0].quiz.players, questions: r.questions.length };
      m.storyIds = [...new Set(r.questions.flatMap((q) => q.storyIds))];
      m.sources = [...new Set(r.questions.flatMap((q) => q.sources))];
      out.push(m);
    }
  }
  return out;
}

function weatherMoments(episode, timeline) {
  const out = [];
  episode.segments.forEach((s, i) => {
    if (s.type !== 'weather') return;
    if (s.kind === 'hotcold') out.push(makeMoment(episode, timeline, 'weather-board', i, i, { keepStart: true, board: true, hook: pickHook([['HOT AND COLD:', "TODAY'S EXTREMES"], 'HOT AND COLD'], 'WORLD WEATHER') }));
    else if (s.kind === 'outlook') out.push(makeMoment(episode, timeline, 'weather-board', i, i, { keepStart: true, board: true, hook: pickHook(['THE NEXT THREE DAYS'], 'WORLD WEATHER') }));
    else if (s.kind === 'warning') out.push(makeMoment(episode, timeline, 'weather-story', i, i, { keepStart: true, board: true, hook: pickHook(['WEATHER WARNING'], 'WORLD WEATHER') }));
    // the world's next 24 hours (composed for the tall frame too: scenes/weather/index.js drawWeatherVertical)
    else if (s.kind === 'world' && s.timelapse) out.push(makeMoment(episode, timeline, 'weather-map', i, i, { keepStart: true, board: true, hook: pickHook([['THE NEXT 24 HOURS', 'AROUND THE WORLD'], 'THE NEXT 24 HOURS'], 'WORLD WEATHER') }));
  });
  return out.filter(Boolean);
}

/** The segments that belong to the story told in segment i: the story, its link or analysis, the board segments. */
function storyRun(segs, i) {
  const id = segs[i].storyId;
  let j = i;
  while (j + 1 < segs.length && segs[j + 1].storyId === id && segs[j + 1].part !== 'thanks' && segs[j + 1].type !== 'story') j++;
  return j;
}

/** The first segment of the story that segment i belongs to (its story segment, before any link or board). */
function storyStart(segs, i) {
  const id = segs[i].storyId;
  let a = i;
  while (a - 1 >= 0 && segs[a].type !== 'story' && segs[a - 1].storyId === id) a--;
  return a;
}

/**
 * Light stories in a row (2 to 4, each a whole story moment that stands alone and is light), 25 to 75 s: the light
 * desk's longer clip. The best windows, never overlapping.
 */
function storyRuns(episode, timeline, found) {
  const singles = found.filter((m) => m.kind === 'story' && m.light && !m.refused && !m.grave && m.scores.sense >= 7.5).sort((a, b) => a.from - b.from);
  const groups = [];
  for (const m of singles) {
    const g = groups[groups.length - 1];
    if (g && m.from === g[g.length - 1].to + 1) g.push(m);
    else groups.push([m]);
  }
  const out = [];
  for (const g of groups) {
    const cands = [];
    for (let a = 0; a < g.length; a++) {
      for (let b = a + 1; b < Math.min(g.length, a + 4); b++) {
        const dur = g[b].end - g[a].start;
        if (dur < 25 || dur > 75) continue;
        const n = b - a + 1;
        const m = makeMoment(episode, timeline, 'stories', g[a].from, g[b].to, { hook: pickHook([[`${n} STORIES`, `IN ${Math.round(dur / 5) * 5} SECONDS`]], `${n} STORIES`) });
        if (m && m.light) cands.push(m);
      }
    }
    cands.sort((x, y) => y.scores.total - x.scores.total || y.duration - x.duration);
    for (const c of cands) if (!out.some((o) => c.from <= o.to && o.from <= c.to)) out.push(c);
  }
  return out;
}

function newsMoments(episode, timeline) {
  const segs = episode.segments;
  const out = [];
  const program = episode.program?.id;
  let leadDone = false;
  const castIds = episode.cast || {};
  const unitSlot = Object.entries(castIds).find(([, id]) => id === 'unit8')?.[0] || null;
  segs.forEach((s, i) => {
    // the headline montage: the intro's teases
    if (s.type === 'intro' && Array.isArray(s.teases) && s.teases.length >= 2) {
      const m = makeMoment(episode, timeline, 'montage', i, i, { keepStart: true, hook: pickHook([`${episode.program?.title || ''}: THE HEADLINES`, 'THE HEADLINES'], 'THE HEADLINES') });
      if (m) out.push(m);
    }
    if (s.type === 'story' && s.storyId && !s.roundup) {
      const to = storyRun(segs, i);
      const run = segs.slice(i, to + 1);
      const expert = run.find((x) => x.type === 'cross' && x.kind === 'expert' && x.part === 'piece');
      const kicker = upper(s.kicker || '');
      if (!leadDone) {
        leadDone = true;
        if (hasBoard(s) || run.some(hasBoard)) {
          const m = makeMoment(episode, timeline, 'lead', i, to, { hook: pickHook([headlineHook(s.headline), kickerHook(kicker) ? `${kicker}: THE LEAD` : null], episode.program?.title || 'TOP STORY') });
          if (m) out.push(m);
        }
      }
      if (Array.isArray(s.known) && s.known.length >= 2) {
        const m = makeMoment(episode, timeline, 'known', i, i, { board: true, hook: pickHook([`WHAT WE KNOW: ${s.headline || ''}`, headlineHook(s.headline), 'WHAT WE KNOW'], 'WHAT WE KNOW') });
        if (m) out.push(m);
      }
      if (s.feature === 'number' && (s.numbers?.length || s.fact)) {
        const n = s.numbers?.[0];
        const m = makeMoment(episode, timeline, 'number', i, i, { board: true, hook: pickHook([n ? `${n.value} ${n.label}` : s.fact, 'NUMBER OF THE DAY'], 'NUMBER OF THE DAY') });
        if (m) out.push(m);
      }
      if (expert) {
        const last = run.reduce((k, x, n) => (x.type === 'cross' && x.kind === 'expert' && (x.part === 'piece' || x.part === 'answer') ? i + n : k), i);
        const m = makeMoment(episode, timeline, 'expert', i, last, { hook: pickHook([headlineHook(s.headline), `${upper(expert.desk || 'OUR EXPERT')} EXPLAINS`], 'THE EXPERT') });
        if (m) {
          m.expert = expert.reporter || null;
          out.push(m);
        }
      }
      // any other light story, whole (a light programme's, or an AND FINALLY)
      if ((LIGHT_PROGRAMMES.has(program) || s.feature === 'lighter') && !expert) {
        const m = makeMoment(episode, timeline, 'story', i, to, { hook: pickHook([headlineHook(s.headline), kickerHook(kicker)], episode.program?.title || 'GLOBIT 24') });
        if (m) out.push(m);
      }
    }
    // COSMOS DESK's UNIT-8: an exchange (chat segments in a row) in which the robot speaks, with the story it answers
    // ("Texas. Logged." means nothing without the flights over Texas)
    // (a tease the robot reads, "Still to come: ...", is not an exchange, and no exchange runs into one)
    const chat = (x) => x?.type === 'chat' && !teaseText(x.text);
    if (unitSlot && chat(s) && s.anchor === unitSlot) {
      let a = i;
      while (a - 1 >= 0 && chat(segs[a - 1])) a--;
      let b = i;
      while (b + 1 < segs.length && chat(segs[b + 1])) b++;
      if (segs[a - 1]?.type === 'story' && segs[a - 1].storyId) a = storyStart(segs, a - 1);
      else if (segs[a].type === 'chat' && segs[a].anchor === unitSlot && segs[a - 1]?.storyId) a = storyStart(segs, a - 1);
      if (!out.some((m) => m.kind === 'unit8' && m.from === a)) {
        // the robot's own words: a line worth its hook ("UNIT-8 HAS A THOUGHT") has some; a two-word filing quip
        // ("Texas. Logged.") is a payoff, not a promise, so the clip is titled by its story and scored as one
        const said = segs.slice(i, b + 1).filter((x) => x.anchor === unitSlot).map((x) => norm(x.text)).join(' ');
        const words = said.split(' ').filter(Boolean).length;
        const story = segs[a]?.type === 'story' ? segs[a] : null;
        const m = makeMoment(episode, timeline, 'unit8', a, b, { hook: words >= 6 || !story ? pickHook(['UNIT-8 HAS A THOUGHT', 'UNIT-8, COSMOS DESK'], 'UNIT-8') : pickHook([headlineHook(story.headline), kickerHook(story.kicker)], 'COSMOS DESK') });
        if (m) {
          m.unitWords = words;
          if (words < 6) {
            m.scores.interest = +Math.max(0, m.scores.interest - 1).toFixed(1);
            m.scores.reasons.push('UNIT-8 says little: titled by its story');
            m.scores.total = +(0.55 * m.scores.sense + 0.45 * m.scores.interest).toFixed(2);
          }
          out.push(m);
        }
      }
    }
  });
  out.push(...storyRuns(episode, timeline, out));
  // SEVEN DAYS: THE WEEK IN 60 SECONDS (its kicker on the segment)
  segs.forEach((s, i) => {
    if (/WEEK IN 60/i.test(String(s.kicker || '')) && s.type === 'story') {
      const to = storyRun(segs, i);
      const m = makeMoment(episode, timeline, 'week60', i, to, { hook: pickHook(['THE WEEK IN 60 SECONDS'], 'SEVEN DAYS') });
      if (m) out.push(m);
    }
  });
  return out;
}

function sportMoments(episode, timeline) {
  const out = [];
  episode.segments.forEach((s, i) => {
    if (s.type !== 'story') return;
    if (s.score?.a && s.score?.b) {
      const sc = s.score;
      out.push(makeMoment(episode, timeline, 'sport-result', i, i, { board: true, hook: pickHook([`${sc.a.name || sc.a} ${sc.a.goals ?? ''}-${sc.b.goals ?? ''} ${sc.b.name || sc.b}`, s.headline, 'FULL TIME'], 'FULL TIME') }));
    } else if (s.feature === 'scores') out.push(makeMoment(episode, timeline, 'sport-result', i, i, { board: true, keepStart: true, hook: pickHook(['THE SCORES', 'FULL TIME'], 'FULL TIME') }));
  });
  return out.filter(Boolean);
}

/** Every moment of an episode, best first. */
export function detectMoments(episode, { timeline = null } = {}) {
  if (!episode?.segments?.length) return [];
  const tl = timeline || estimateTimeline(episode);
  const kind = episode.program?.kind || (episode.quiz ? 'quiz' : episode.weather ? 'weather' : 'news');
  let out;
  if (kind === 'quiz' || episode.program?.id === 'pay-attention') out = quizMoments(episode, tl);
  else if (kind === 'weather' || episode.weather) out = weatherMoments(episode, tl);
  else if (episode.program?.id === 'full-time') out = [...sportMoments(episode, tl), ...newsMoments(episode, tl)];
  else out = newsMoments(episode, tl);
  return out.filter(Boolean).sort((a, b) => b.scores.total - a.scores.total);
}

/** Moments a phase may publish: light, not demo, sense at least `minSense` (Phase 1: the light programmes only). */
/**
 * The floor of a published clip, in seconds of the moment itself (the end card comes on top): YouTube's and TikTok's own
 * minimum. A shorter moment is not worth a viewer's swipe nor the owner's minute (round 7: a 3-second story passed every
 * other rule, a 6.5 s Reel with its end card).
 */
export const CLIP_MIN_SECONDS = 10;

export function publishable(moments, { phase = 1, minSense = 7, minSeconds = CLIP_MIN_SECONDS } = {}) {
  return moments.filter((m) => !m.demo && !m.copied && !m.uncleared && m.scores.sense >= minSense && !(Number(m.duration) < minSeconds) && (phase <= 1 ? m.light : phase === 2 ? !m.grave : true));
}

/**
 * The pictures a moment puts on screen (docs/pictures/RIGHTS.md): its own segments' (a story's picture, full frame, on
 * the studio wall, behind a board), and the rundown items its cold open's montage (the teased stories, else the first
 * three) or a STILL TO COME shows. -> [the segments and rundown items with a picture]
 */
export function picturesShown(episode, from, to) {
  const segs = (Array.isArray(episode?.segments) ? episode.segments : []).slice(from, to + 1);
  const rundown = Array.isArray(episode?.rundown) ? episode.rundown : [];
  const byId = (id) => rundown.find((r) => r?.storyId === id);
  const out = new Set();
  const quizPics = new Map();
  for (const s of segs) {
    if (s?.hasImage) out.add(s);
    // PAY ATTENTION's PICTURE THIS: the archived story's picture with the record it aired with (a local fixture's own
    // file is the operator's)
    const q = s?.quiz?.question;
    if (q?.type === 'picture' && q.image && !/^file:/i.test(q.image)) {
      const id = q.imageId || q.key;
      if (!quizPics.has(id)) quizPics.set(id, { storyId: id, hasImage: true, imageRights: q.imageRights || null, imageCredit: q.imageCredit || null, source: q.aired?.source || null });
      out.add(quizPics.get(id));
    }
    if (s?.type === 'intro') for (const id of Array.isArray(s.teases) && s.teases.length ? s.teases : rundown.slice(0, 3).map((r) => r?.storyId)) if (byId(id)?.hasImage) out.add(byId(id));
    for (const x of Array.isArray(s?.stillToCome) ? s.stillToCome : []) if (byId(x?.storyId)?.hasImage) out.add(byId(x.storyId));
  }
  return [...out];
}

/**
 * The picture rule (docs/pictures/RIGHTS.md; publishing round 5): a moment that shows a picture not cleared for
 * publication is never chosen nor queued, in any phase; nor any moment of an episode made as a private preview
 * (PICTURE_RIGHTS=preview: outlet photos stand in, marked NOT CLEARED). `audit` is the compliance desk's auditItem (its
 * picture records); without it a picture counts as cleared only with a cleared rights record.
 */
export function markUncleared(moments, episode, { audit = null } = {}) {
  const preview = !!episode?.picturePreview;
  for (const m of moments) {
    let why = preview ? 'a private preview (PICTURE_RIGHTS=preview) is never published' : null;
    if (!why) {
      const shown = picturesShown(episode, m.from, m.to);
      const bad = audit ? (audit({ segments: shown }).missing || []).filter((a) => a.kind === 'picture').map((a) => a.storyId) : shown.filter((x) => x.imageRights?.cleared !== true || x.imageUncleared).map((x) => x.storyId);
      if (bad.length) why = `a picture not cleared for publication (story ${[...new Set(bad)].filter(Boolean).join(', ') || 'unknown'})`;
    }
    if (why) {
      m.uncleared = true;
      m.refused = m.refused ? `${m.refused}; pictures: ${why}` : `pictures: ${why}`;
    }
  }
  return moments;
}

/**
 * The verbatim rule (docs/publishing/verbatim.md): a moment that tells a story whose aired words copy its source is not
 * publishable in any phase (the compliance gate would hold its clip). `copied`: the story ids the lint flagged.
 */
export function markCopied(moments, copied, { unverified = [] } = {}) {
  const ids = copied instanceof Set ? copied : new Set(copied || []);
  const blind = unverified instanceof Set ? unverified : new Set(unverified || []);
  for (const m of moments) {
    if ((m.storyIds || []).some((id) => ids.has(id))) {
      m.copied = true;
      m.refused = m.refused || 'verbatim: its aired words copy the source';
    } else if ((m.storyIds || []).some((id) => blind.has(id))) {
      // (publishing round 6) the sources are not at hand: its words cannot be shown not to copy them, so the gate
      // refuses its clip (sources-missing) and it is not chosen either
      m.copied = true;
      m.refused = m.refused || 'verbatim: its sources are not at hand, its words cannot be checked';
    }
  }
  return moments;
}
