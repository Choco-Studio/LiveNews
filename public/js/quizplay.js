// PAY ATTENTION on air (docs/programmes/pay-attention.md §4-§6, build step 4): the director's plan of a quiz edition,
// pure and DOM-free (the director, the v2 planner and the node tests import it). The writer's segments
// (server/quiz/writer.js: { type: 'quiz', part, anchor 'H' | 'A' | 'B', text, countdown?, quiz }) become:
//
//   quizUnits(segments)          the running order in units: a question (its frame to its reveal; TODAY OR NOT TODAY's
//                                six headlines and the round's tally as one), a card (a round, DOUBLE OR NOTHING and the
//                                pick, the final score, the week's table) or a line (the host, a player)
//   planQuizShots(episode, o)    the shot of every segment on the estimated timeline: each question and card on its
//                                board; the host's lines on his single or the quiz's wide; a player's line on their
//                                single; the welcome, the scores and the sign-off on the wide. The network's minimum
//                                shot and the studio maximum are kept, and player B's single never airs while the
//                                programme's tag shows (studio/quiz.js: B's frame stands under it)
//   countdownHalves(type, ...)   a countdown in whole half notes of the bed (112 BPM: 1.0714 s), long enough for the
//                                lock-ins said inside it
//   answerSchedule(unit, ...)    when each lock-in, buzz or guess is said, on the countdown's clock (half notes after
//                                its first tick), from the players' model (a PICTURE THIS lock-in on its step, a buzz on
//                                its stage)
//   revealPlan(unit)             who scored, right or wrong (the sting), the points each seat takes
//
// Boards are full frame (studio.js draws the quiz's ground under the board): cards-quiz.js lays every board out over
// the whole safe area (x 13..371, y 28..134), and in the quiz's wide the three people sit inside those rows (heads at
// y 65..90, the desks' tops at y 124): a panel over the studio would hide all three and leave their desks' fronts.

/** The bed's half note at 112 BPM (scenes/cards-quiz.js HALF_NOTE; music/live.js countdown): one countdown tick. */
export const HALF_NOTE = 120 / 112;

/** The writer's question parts (a question runs from its frame to its reveal). */
export const QUESTION_PARTS = new Set(['frame', 'options', 'countdown', 'lock', 'buzz', 'stall', 'guess', 'pins', 'reveal', 'tally']);
/** The quiz's framings (camera.js composes them from studio/quiz.js quizCamera; the seats are QUIZ_SEATS). */
export const QUIZ_FRAMING = Object.freeze({ wide: 'quiz-wide', H: 'quiz-host', A: 'quiz-a', B: 'quiz-b' });
export const QUIZ_FRAMINGS = Object.freeze(Object.values(QUIZ_FRAMING));
/** The writer's countdowns (BEATS: seconds) as whole half notes: 7.5 s is seven, 10 s nine (9.33), 6.4 s six, 4.3 s four, 3.2 s three. */
export const COUNTDOWN_HALVES = Object.freeze({ picture: 7, letters: 9, where: 6, howmany: 4, today: 3 });
/** LETTER BY LETTER's stages on the countdown's beats (half notes after its first tick: lab/quiz-cases.js). */
export const LETTER_STAGES = Object.freeze([0, 3, 6]);
/** PICTURE THIS's steps 2..4 on the countdown's beats (the board's default stepTimes: its start, two and four ticks in). */
export const PICTURE_STEPS = Object.freeze({ 2: 0, 3: 2, 4: 4 });
/** WHERE's reveal: the dimmed pins, their wipe and the move onto the right pin take 2.2 s (cards-quiz.js MOVE). */
export const WHERE_SETTLE = 2.4;
/** The beat between the reveal (the board's gold, the sting) and the host's first word. */
export const REVEAL_BEAT = 0.3;
/** Speech rate the plan estimates with when a segment has no recorded length (director.js CPS_EST). */
export const CPS = 14.5;
/** s the programme's tag is on screen after the open (graphics: in 0.5 s after the cut, held 8 s, out 0.25 s) + margin. */
export const TAG_CLEAR = 9.0;

/** A segment's spoken length (s): its recording, else its characters at CPS. */
export const speechOf = (seg) => (Number.isFinite(seg?.audio?.duration) ? seg.audio.duration : String(seg?.text || '').length / CPS);

/** The seat of a player id in the episode's cast ('A' | 'B'), or null. */
export function seatOf(cast, id) {
  if (!cast || !id) return null;
  return cast.A === id ? 'A' : cast.B === id ? 'B' : null;
}

/**
 * The running order in units. A question: { kind: 'question', type, from, to, frames: [i], parts: { [part]: [i] },
 * double, sudden, k, n, items (TODAY: [{ frame, reveal }]) }. A card: { kind: 'card', board: 'round' | 'double' |
 * 'final' | 'table', from, to }. A line: { kind: 'line', from, to } (to = from). The open: { kind: 'open' }.
 */
export function quizUnits(segments = []) {
  const segs = Array.isArray(segments) ? segments : [];
  const units = [];
  let round = null; // { type, k, n: questions so far }
  let don = false; // DOUBLE OR NOTHING's question comes next
  let sudden = false;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const part = s?.part;
    if (part === 'open') {
      units.push({ kind: 'open', from: i, to: i });
      continue;
    }
    if (part === 'round') {
      round = { type: s.quiz?.round || null, k: s.quiz?.k || 0, n: 0 };
      don = sudden = false;
      units.push({ kind: 'card', board: 'round', from: i, to: i, type: round.type, k: round.k });
      continue;
    }
    if (part === 'tie') {
      round = null;
      don = false;
      sudden = true;
      units.push({ kind: 'card', board: 'round', from: i, to: i, type: 'letters', sudden: true });
      continue;
    }
    if (part === 'don') {
      round = null;
      don = true;
      sudden = false;
      const u = { kind: 'card', board: 'double', from: i, to: i };
      if (segs[i + 1]?.part === 'pick') u.to = ++i;
      units.push(u);
      continue;
    }
    if (part === 'result' || part === 'table') {
      round = null;
      don = sudden = false;
      units.push({ kind: 'card', board: part === 'result' ? 'final' : 'table', from: i, to: i });
      continue;
    }
    if (part === 'frame') {
      const type = s.quiz?.round || s.quiz?.question?.type || (s.quiz?.item ? 'today' : null);
      const u = { kind: 'question', type, from: i, to: i, frames: [i], parts: {}, double: don, sudden, k: 0, n: 3, items: null };
      const add = (j) => (u.parts[segs[j].part] ||= []).push(j);
      add(i);
      if (type === 'today') {
        u.items = [];
        let j = i;
        // the quickfire: frame, reveal, frame, reveal ... and the round's tally
        while (j < segs.length && (segs[j]?.part === 'frame' || segs[j]?.part === 'reveal' || segs[j]?.part === 'tally') && (segs[j].quiz?.round || 'today') === 'today') {
          if (segs[j].part === 'frame') {
            if (j !== i) {
              u.frames.push(j);
              add(j);
            }
            u.items.push({ frame: j, reveal: null });
          } else if (segs[j].part === 'reveal') {
            add(j);
            if (u.items.length) u.items[u.items.length - 1].reveal = j;
          } else {
            add(j);
            u.to = j;
            j++;
            break;
          }
          u.to = j;
          j++;
        }
        i = u.to;
      } else {
        let j = i + 1;
        while (j < segs.length && QUESTION_PARTS.has(segs[j]?.part) && segs[j].part !== 'frame' && segs[j].part !== 'tally') {
          add(j);
          u.to = j;
          if (segs[j].part === 'reveal') break;
          j++;
        }
        i = u.to;
      }
      if (round) {
        round.n++;
        u.k = round.k ? round.n : 0;
        u.n = 3;
        u.round = round.k;
      }
      units.push(u);
      continue;
    }
    units.push({ kind: 'line', from: i, to: i });
  }
  return units;
}

/** The questions of a round card (for HOW MANY?'s "exactly right 3": one of its figures aired unqualified). */
export function roundQuestions(units, at) {
  const out = [];
  for (let k = at + 1; k < units.length && units[k].kind === 'question'; k++) out.push(units[k]);
  return out;
}

/**
 * A countdown in whole half notes: the writer's (COUNTDOWN_HALVES) or more, so the lines said inside it (`need`: s from
 * its first tick to the end of the last one, plus a breath) end before its last tick.
 */
export function countdownHalves(type, need = 0, half = HALF_NOTE) {
  const base = COUNTDOWN_HALVES[type] ?? 4;
  return Math.max(base, Math.ceil((need + 0.35) / half - 1e-9));
}

/** A small seeded unit value (FNV-1a of a key): the players' reaction times vary, the same edition always the same. */
export function jitter(key) {
  let h = 0x811c9dc5;
  for (const c of String(key)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return (h >>> 0) / 4294967296;
}

/**
 * When the answers are given, on the countdown's clock (s after its first tick): [{ i (segment index, or -1 for a
 * TODAY lamp), seat, at, dur, kind: 'lock' | 'buzz' | 'stall' | 'guess' }], in the order said. PICTURE THIS: a lock-in
 * just after its step's tick (2 = the first tick, 3 = two ticks in, 4 = four), the second player after the first has
 * spoken; LETTER BY LETTER: a buzz half a note or so into its stage, a stall said in full before a later buzz;
 * WHERE and HOW MANY?: the two answers one after the other; TODAY: the two lamps, no words.
 */
export function answerSchedule(unit, segments, cast, { half = HALF_NOTE, speech = speechOf, item = null } = {}) {
  const segs = segments || [];
  const out = [];
  const after = (prev, t) => (prev ? Math.max(t, prev.at + prev.dur + 0.25) : t);
  const key = (i) => `${unit.from}:${i}:${segs[i]?.anchor || ''}`;
  if (unit.type === 'picture') {
    const locks = (unit.parts.lock || []).map((i) => ({ i, step: segs[i]?.quiz?.lock?.step || 4 }));
    // (the writer orders them by step; a tie keeps its order)
    locks.sort((a, b) => a.step - b.step);
    let prev = null;
    for (const l of locks) {
      const at = after(prev, ((PICTURE_STEPS[l.step] ?? 4) + 0.25 + 0.35 * jitter(key(l.i))) * half);
      prev = { i: l.i, seat: segs[l.i].anchor, at, dur: speech(segs[l.i]), kind: 'lock' };
      out.push(prev);
    }
  } else if (unit.type === 'letters') {
    const list = [...(unit.parts.stall || []).map((i) => ({ i, kind: 'stall' })), ...(unit.parts.buzz || []).map((i) => ({ i, kind: 'buzz' }))];
    for (const b of list) b.stage = Math.max(1, Math.min(3, segs[b.i]?.quiz?.buzz?.stage || 3));
    // stalls before the winning buzz at the same stage (the model's order)
    list.sort((a, b) => a.stage - b.stage || (a.kind === 'stall' ? -1 : 1) - (b.kind === 'stall' ? -1 : 1));
    let prev = null;
    for (const b of list) {
      const at = after(prev, (LETTER_STAGES[b.stage - 1] + 0.45 + 0.5 * jitter(key(b.i))) * half);
      prev = { i: b.i, seat: segs[b.i].anchor, at, dur: speech(segs[b.i]), kind: b.kind, stage: b.stage };
      out.push(prev);
    }
  } else if (unit.type === 'where' || unit.type === 'howmany') {
    const parts = unit.type === 'where' ? unit.parts.lock || [] : unit.parts.guess || [];
    let prev = null;
    parts.forEach((i, k) => {
      const at = after(prev, (0.35 + 0.3 * jitter(key(i)) + k * 1.2) * half);
      prev = { i, seat: segs[i].anchor, at, dur: speech(segs[i]), kind: unit.type === 'where' ? 'lock' : 'guess' };
      out.push(prev);
    });
  } else if (unit.type === 'today' && item) {
    // the lamps: each player within the first two half notes, the quicker one first (seeded); no words
    const reveal = segs[item.reveal];
    const ids = reveal?.quiz?.points ? Object.keys(reveal.quiz.points) : [cast?.A, cast?.B].filter(Boolean);
    const seats = ids.map((id) => seatOf(cast, id)).filter(Boolean);
    seats
      .map((seat) => ({ seat, at: (0.3 + 1.5 * jitter(`${item.frame}:${seat}`)) * half }))
      .sort((a, b) => a.at - b.at)
      .forEach((x, k) => out.push({ i: -1, seat: x.seat, at: k ? Math.max(x.at, out[0].at + 0.3) : x.at, dur: 0, kind: 'lock' }));
  }
  return out;
}

/** Seconds from the countdown's first tick to the end of the last answer said inside it. */
export const scheduleNeed = (sched) => sched.reduce((m, x) => Math.max(m, x.at + x.dur), 0);

/**
 * A question's reveal: { right: anyone scored (the right sting) or not (the wrong one), points: { A, B } (the seats'
 * points as the writer gives them, doubled for the player behind on DOUBLE OR NOTHING), winner (LETTER BY LETTER: the
 * seat that named it) }. TODAY: per headline (`item`).
 */
export function revealPlan(unit, segments, cast, { item = null, double = null } = {}) {
  const segs = segments || [];
  const ri = unit.type === 'today' && item ? item.reveal : (unit.parts.reveal || [])[0];
  const reveal = segs[ri];
  const pts = reveal?.quiz?.points || {};
  const points = { A: 0, B: 0 };
  for (const [id, p] of Object.entries(pts)) {
    const seat = seatOf(cast, id);
    if (seat) points[seat] += (Number(p) || 0) * (double && double === seat ? 2 : 1);
  }
  const buzz = unit.type === 'letters' ? (unit.parts.buzz || []).map((i) => segs[i]).find((s) => s?.quiz?.buzz?.right) : null;
  return { index: ri, right: points.A > 0 || points.B > 0, points, winner: buzz ? buzz.anchor : null };
}

// ---------------------------------------------------------------------------------------------- the shot plan

const BOARD = 'quiz';
const ANSWER_PARTS = new Set(['lock', 'buzz', 'stall', 'guess']);
const WIDE_PARTS = new Set(['welcome', 'scores', 'signoff']);
const MIN = 4.0; // the network's minimum shot (pace.js shots.min), planned with a margin
const MARGIN = 0.4;

/** A board shot for a unit. */
const boardShot = (unit, k, anchor) => ({ shot: BOARD, framing: null, focus: anchor || 'H', board: unit.kind === 'question' ? unit.type : unit.board, unit: k });
/** A studio shot: the quiz's wide (focus H: one camera whoever speaks) or a single. */
const studioShot = (framing) => (framing === QUIZ_FRAMING.wide ? { shot: 'wide', framing, focus: 'H' } : { shot: 'close', framing, focus: framing === QUIZ_FRAMING.A ? 'A' : framing === QUIZ_FRAMING.B ? 'B' : 'H' });

/**
 * The shot of every segment, on the timeline the plan estimates (speech at its recorded length or CPS, the profile's
 * pauses, the countdowns): [{ shot, framing, focus, board?, unit?, strip?, at, len }] by segment index. Boards are fixed
 * (a question from its frame to its reveal, a card for its lines); between them the studio's lines are grouped into
 * shots of at least the network's minimum (a player's short reply joins its neighbours on the wide when it cannot
 * hold one alone), none longer than the studio maximum where a speaker change allows a cut; player B's single is the
 * wide while the programme's tag shows (`tagUntil`: s after the open's cut). o = { gapAfter(i) → s, studioMax, min }.
 */
export function planQuizShots(episode, { gapAfter = () => 0.5, studioMax = 12, min = MIN, tagUntil = TAG_CLEAR, units = null } = {}) {
  const segs = episode?.segments || [];
  const U = units || quizUnits(segs);
  const shots = new Array(segs.length).fill(null);
  // the estimated timeline from the open's cut (the open itself is the open's)
  const len = new Array(segs.length).fill(0);
  U.forEach((u) => {
    if (u.kind === 'question') {
      const sched = u.type === 'today' ? null : answerSchedule(u, segs, episode.cast);
      const halves = u.type === 'today' ? COUNTDOWN_HALVES.today : countdownHalves(u.type, scheduleNeed(sched || []));
      // (the answers are said inside the countdown: they add no time of their own)
      for (let i = u.from; i <= u.to; i++) len[i] = ANSWER_PARTS.has(segs[i]?.part) ? 0 : speechOf(segs[i]);
      // the countdowns (the answers are said inside them) and the reveal's settle
      const cds = u.type === 'today' ? u.items.length : 1;
      len[u.from] += cds * halves * HALF_NOTE + (u.type === 'today' ? u.items.length : 1) * REVEAL_BEAT;
      if (u.type === 'where') len[u.to] = Math.max(len[u.to], WHERE_SETTLE);
    } else {
      for (let i = u.from; i <= u.to; i++) len[i] = u.kind === 'open' ? 0 : speechOf(segs[i]);
    }
  });
  const dur = (i) => len[i] + (i < segs.length - 1 ? gapAfter(i) : 0);
  const start = new Array(segs.length).fill(0);
  for (let i = 1; i < segs.length; i++) start[i] = start[i - 1] + (segs[i - 1]?.part === 'open' ? 0 : dur(i - 1));
  // boards first
  U.forEach((u, k) => {
    if (u.kind === 'open') shots[u.from] = { shot: 'open', framing: null, focus: 'H' };
    else if (u.kind === 'question' || u.kind === 'card') for (let i = u.from; i <= u.to; i++) shots[i] = boardShot(u, k, segs[u.from]?.anchor);
  });
  // a final score shorter than the minimum keeps the board into the next line (the winner's first words over it)
  // (never past the minimum: the reactions belong to the faces)
  // the studio runs between them
  let i = 0;
  while (i < segs.length) {
    if (shots[i]) {
      i++;
      continue;
    }
    const run = [];
    while (i < segs.length && !shots[i]) run.push(i++);
    planRun(run);
  }
  function prefer(j) {
    const s = segs[j];
    if (WIDE_PARTS.has(s?.part)) return QUIZ_FRAMING.wide;
    return QUIZ_FRAMING[s?.anchor] || QUIZ_FRAMING.H;
  }
  function planRun(run) {
    const groups = [];
    let cur = null;
    const rest = (k) => run.slice(k).reduce((t, j) => t + dur(j), 0);
    run.forEach((j, k) => {
      const want = prefer(j);
      if (!cur) {
        cur = { segs: [j], framing: want, len: dur(j), speakers: new Set([segs[j]?.anchor]), forced: WIDE_PARTS.has(segs[j]?.part) };
        return;
      }
      const same = want === cur.framing || (cur.framing === QUIZ_FRAMING.wide && (cur.forced || cur.speakers.size > 1) && cur.len < min + MARGIN);
      const canCut = cur.len >= min + MARGIN && rest(k) >= min + MARGIN;
      const tooLong = cur.len + dur(j) > studioMax;
      if (!same && (canCut || (tooLong && cur.len >= min))) {
        groups.push(cur);
        cur = { segs: [j], framing: want, len: dur(j), speakers: new Set([segs[j]?.anchor]), forced: WIDE_PARTS.has(segs[j]?.part) };
        return;
      }
      cur.segs.push(j);
      cur.len += dur(j);
      cur.speakers.add(segs[j]?.anchor);
      cur.forced ||= WIDE_PARTS.has(segs[j]?.part);
      // a shot that carries several speakers (or the welcome, the scores, the sign-off) is the wide
      if (cur.speakers.size > 1 || cur.forced) cur.framing = QUIZ_FRAMING.wide;
    });
    if (cur) groups.push(cur);
    // two neighbours on the same camera are one shot
    const merged = [];
    for (const g of groups) {
      const last = merged[merged.length - 1];
      if (last && last.framing === g.framing) {
        last.segs.push(...g.segs);
        last.len += g.len;
      } else merged.push(g);
    }
    for (const g of merged) {
      // player B's single never under the programme's tag (it would stand under the purple tag: studio/quiz.js)
      let framing = g.framing;
      if (framing === QUIZ_FRAMING.B && start[g.segs[0]] < tagUntil) framing = QUIZ_FRAMING.wide;
      for (const j of g.segs) shots[j] = { ...studioShot(framing), strip: segs[g.segs[0]]?.part === 'scores' || g.segs.some((x) => segs[x]?.part === 'scores' && x <= j) || undefined };
    }
  }
  // two neighbouring studio shots on the same camera after the B rule are one shot
  for (let j = 0; j < segs.length; j++) {
    const s = shots[j];
    if (!s) continue;
    s.at = Math.round(start[j] * 1000) / 1000;
    s.len = Math.round(dur(j) * 1000) / 1000;
    if (!s.strip) delete s.strip;
  }
  return shots;
}

/** Are two planned shots the same picture (no cut between them)? */
export function sameShot(a, b) {
  if (!a || !b) return false;
  if (a.shot !== b.shot) return false;
  if (a.shot === BOARD) return a.unit === b.unit;
  return (a.framing || null) === (b.framing || null) && (a.shot === 'wide' || a.focus === b.focus);
}

/** Is this a PAY ATTENTION episode (the quiz's segments)? */
export const isQuizEpisode = (ep) => Array.isArray(ep?.segments) && ep.segments.some((s) => s?.type === 'quiz');
