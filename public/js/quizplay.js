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
export const QUESTION_PARTS = new Set(['frame', 'options', 'countdown', 'lock', 'recap', 'buzz', 'stall', 'guess', 'pins', 'reveal', 'tally']);
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
  // the host's recap of the locks (writer: 'recap'), a beat after the last one, on the same clock
  const recapAfter = (prev) => {
    const i = (unit.parts.recap || [])[0];
    if (i === undefined || !prev) return;
    out.push({ i, seat: 'H', at: prev.at + prev.dur + 0.3, dur: speech(segs[i]), kind: 'recap' });
  };
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
    recapAfter(prev);
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
    if (unit.type === 'where') recapAfter(prev);
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
 * A question's reveal: { right: anyone scored (the right sting) or not (the wrong one), scored: { A, B } (each seat
 * right or not: its lamp gold), points: { A, B } (the seats' points as the writer gives them, doubled for the player
 * behind on DOUBLE OR NOTHING: what the desks add), winner (LETTER BY LETTER: the
 * seat that named it) }. TODAY: per headline (`item`). SUDDEN DEATH's headline wins the game and adds nothing to the
 * desks: the scores stay level, as the result line and the final board say them ("level at 16 after the rounds").
 */
export function revealPlan(unit, segments, cast, { item = null, double = null } = {}) {
  const segs = segments || [];
  const ri = unit.type === 'today' && item ? item.reveal : (unit.parts.reveal || [])[0];
  const reveal = segs[ri];
  const pts = reveal?.quiz?.points || {};
  const points = { A: 0, B: 0 };
  const scored = { A: false, B: false };
  for (const [id, p] of Object.entries(pts)) {
    const seat = seatOf(cast, id);
    if (!seat) continue;
    if ((Number(p) || 0) > 0) scored[seat] = true;
    if (!unit.sudden) points[seat] += (Number(p) || 0) * (double && double === seat ? 2 : 1);
  }
  const buzz = unit.type === 'letters' ? (unit.parts.buzz || []).map((i) => segs[i]).find((s) => s?.quiz?.buzz?.right) : null;
  return { index: ri, right: scored.A || scored.B, scored, points, winner: buzz ? buzz.anchor : null };
}

// ---------------------------------------------------------------------------------------------- the shot plan

const BOARD = 'quiz';
const ANSWER_PARTS = new Set(['lock', 'recap', 'buzz', 'stall', 'guess']);
const WIDE_PARTS = new Set(['welcome', 'scores', 'signoff', 'tally']);
const MIN = 4.0; // the network's minimum shot (pace.js shots.min), planned with a margin
const MARGIN = 0.4;
/** s a board's first line may wait for the board's cut (quizdirector.js BOARD_WAIT): a run before a board may end short. */
export const BOARD_WAIT = 2.5;

/**
 * The stories an edition uses, to keep off the LATEST ticker while it airs (graphics quizAvoided): the station's list
 * (episode.quizStories: every asked story, option, pin, DOUBLE OR NOTHING offer and the tie-break, by story id and
 * headline), and the episode's own words besides (the questions' headlines, options and items, for an episode made
 * without the list). { ids: Set, titles: [] }.
 */
export function quizAvoidOf(episode) {
  const ids = new Set((episode?.quizStories?.ids || []).filter((x) => x != null));
  const titles = new Set((episode?.quizStories?.titles || []).filter(Boolean));
  for (const seg of episode?.segments || []) {
    const q = seg?.quiz?.question;
    if (q?.words) titles.add(String(q.words).replace(/\u25ae+/g, ' '));
    for (const o of q?.options || []) if (o?.words) titles.add(o.words);
    for (const it of q?.items || []) if (it?.words) titles.add(it.words);
    if (seg?.quiz?.item?.words) titles.add(seg.quiz.item.words);
  }
  return { ids, titles: [...titles] };
}

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
export function planQuizShots(episode, { gapAfter = () => 0.5, studioMax = 12, min = MIN, tagUntil = TAG_CLEAR, units = null, endHold = 1.2 } = {}) {
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
  // (the sign-off's hold on its shot before the end card counts as its air)
  const dur = (i) => len[i] + (i < segs.length - 1 ? gapAfter(i) : endHold);
  const start = new Array(segs.length).fill(0);
  for (let i = 1; i < segs.length; i++) start[i] = start[i - 1] + (segs[i - 1]?.part === 'open' ? 0 : dur(i - 1));
  // boards first
  U.forEach((u, k) => {
    if (u.kind === 'open') shots[u.from] = { shot: 'open', framing: null, focus: 'H' };
    // (TODAY OR NOT TODAY's tally is the host's line to the studio after the sixth stamp: the wide, the lamps and scores)
    else if (u.kind === 'question' || u.kind === 'card') for (let i = u.from; i <= u.to; i++) if (segs[i]?.part !== 'tally') shots[i] = boardShot(u, k, segs[u.from]?.anchor);
  });
  // the answers on the players' faces: LETTER BY LETTER's buzz on the buzzer's single (the wide while player B's single
  // would stand under the tag), HOW MANY?'s guesses on the wide (both desks lighting), the last lock-in of PICTURE THIS
  // and WHERE on the wide, TODAY's lock-ins and verdict on the wide. The other lock-ins stay on their board (the reading
  // rule: the options on screen to the last lock-in), and a stall too (the clock runs on for the other player).
  U.forEach((u) => {
    // DOUBLE OR NOTHING's pick, in the player's own words, on their single (the director keeps it on the card when the
    // single could not hold without standing silent)
    if (u.kind === 'card' && u.board === 'double') {
      for (let j = u.from; j <= u.to; j++) {
        if (segs[j]?.part !== 'pick') continue;
        const seat = segs[j].anchor;
        shots[j] = { ...studioShot(seat === 'B' && start[j] < tagUntil ? QUIZ_FRAMING.wide : QUIZ_FRAMING[seat] || QUIZ_FRAMING.wide), answer: true };
      }
    }
    if (u.kind !== 'question') return;
    // PICTURE THIS and WHERE: the last lock-in on the wide (both lamps lit: the reading rule has kept the options on
    // screen to it), the board back for the reveal
    // (the host's recap of the locks rides on the same shot; the director brings the board back once the faces have
    // held, so an early lock-in leaves the picture's last step and the clock's end on the board: quizdirector back)
    if (u.type === 'picture' || u.type === 'where') {
      const sched = answerSchedule(u, segs, episode.cast);
      const last = sched.filter((a) => a.kind === 'lock').at(-1);
      if (last) {
        shots[last.i] = { ...studioShot(QUIZ_FRAMING.wide), answer: true };
        for (const r of sched.filter((a) => a.kind === 'recap')) shots[r.i] = { ...studioShot(QUIZ_FRAMING.wide), answer: true };
      }
    }
    // TODAY OR NOT TODAY: its options are two and known, so once the headline is read on its board the lock-ins
    // light the desks on the wide, and the verdict stays there (the last headline's on its board when the round's tally
    // follows: the tally's wide takes the verdict's last words, and the studio run after it starts fresh)
    if (u.type === 'today') {
      const items = (u.items || []).filter((it) => it.reveal !== null && it.reveal !== undefined);
      const tally = (u.parts.tally || []).length > 0;
      items.forEach((it, k) => {
        if (!(tally && k === items.length - 1)) shots[it.reveal] = { ...studioShot(QUIZ_FRAMING.wide), answer: true };
      });
    }
    if (u.type === 'letters') {
      for (const j of u.parts.buzz || []) {
        const seat = segs[j]?.anchor;
        shots[j] = { ...studioShot(seat === 'B' && start[j] < tagUntil ? QUIZ_FRAMING.wide : QUIZ_FRAMING[seat] || QUIZ_FRAMING.wide), answer: true };
      }
    }
    if (u.type === 'howmany') for (const j of u.parts.guess || []) shots[j] = { ...studioShot(QUIZ_FRAMING.wide), answer: true };
  });
  // the studio runs between them
  let i = 0;
  while (i < segs.length) {
    if (shots[i]) {
      i++;
      continue;
    }
    const run = [];
    while (i < segs.length && !shots[i]) run.push(i++);
    // (a run the next board follows may end on a short shot: the board's first line waits for its cut, up to BOARD_WAIT;
    // a run after an answer's studio shot, TODAY's last verdict on the wide, carries that shot on: its time counts)
    const before = shots[run[0] - 1];
    const carry = before && before.answer && before.shot !== BOARD ? { framing: before.framing, len: dur(run[0] - 1) + COUNTDOWN_HALVES.today * HALF_NOTE } : null;
    planRun(run, shots[i]?.shot === BOARD ? BOARD_WAIT : 0, carry);
  }
  function prefer(j) {
    const s = segs[j];
    if (WIDE_PARTS.has(s?.part)) return QUIZ_FRAMING.wide;
    return QUIZ_FRAMING[s?.anchor] || QUIZ_FRAMING.H;
  }
  // a run of studio lines is cut into shots by the cheapest partition (a run holds a few lines: every way of cutting
  // it is tried): a shot under the network's minimum costs dearly (the last may lean on the board after it waiting up
  // to BOARD_WAIT), one past the studio maximum too, two neighbours on the same camera are no cut at all (never
  // allowed); several speakers are the wide; one speaker's lines are best on their single, the welcome, the scores, the
  // tally and the sign-off on the wide (the host's single when the wide would run past the maximum), and every cut
  // costs a little (no choppy cutting for its own sake)
  function options(g) {
    if (g.speakers.size > 1) return [[QUIZ_FRAMING.wide, 0]];
    const one = [...g.speakers][0];
    const single = one === 'B' && start[g.segs[0]] < tagUntil ? null : QUIZ_FRAMING[one] || QUIZ_FRAMING.H; // B never under the tag
    if (g.forced) return single ? [[QUIZ_FRAMING.wide, 0], [single, 1.5]] : [[QUIZ_FRAMING.wide, 0]];
    const own = one === 'A' || one === 'B' ? -1.5 : 0; // a player's own single
    return single ? [[single, own], [QUIZ_FRAMING.wide, 1]] : [[QUIZ_FRAMING.wide, 1]];
  }
  function planRun(run, allow, carry = null) {
    const n = run.length;
    let best = null;
    const limit = n > 12 ? 0 : 1 << (n - 1); // (a run longer than twelve lines, never written, stays one shot)
    for (let mask = 0; mask < Math.max(1, limit); mask++) {
      const groups = [];
      let g = null;
      run.forEach((j, k) => {
        if (!g || (limit && mask & (1 << (k - 1)))) groups.push((g = { segs: [], len: 0, speakers: new Set(), forced: false }));
        g.segs.push(j);
        g.len += dur(j);
        g.speakers.add(segs[j]?.anchor);
        g.forced ||= WIDE_PARTS.has(segs[j]?.part);
      });
      let cost = 0;
      groups.forEach((x, k) => {
        // the cheapest camera that is not the one before (a cut to the same picture is none; the shot carried on into
        // the run's first group adds its time)
        const opts = options(x).filter(([f]) => !k || f !== groups[k - 1].framing);
        if (!opts.length) {
          cost += 1000;
          x.framing = options(x)[0][0];
        } else {
          opts.sort((a, b) => a[1] - b[1]);
          x.framing = opts[0][0];
          cost += opts[0][1];
        }
        const last = k === groups.length - 1;
        const carried = !k && carry && x.framing === carry.framing ? carry.len : 0;
        const len = (last ? x.len + allow : x.len) + carried;
        if (len < min + MARGIN) cost += 100 * (min + MARGIN - len);
        if (last && allow && x.len < min) cost += 2 * (min - x.len); // (the silence the board's wait costs)
        const cap = x.segs.some((j) => segs[j]?.part === 'signoff') ? studioMax - MARGIN : studioMax; // (the stinger's transition after the hold)
        if (x.len + carried > cap) cost += 50 * (x.len + carried - cap);
        cost += 0.5;
      });
      if (!best || cost < best.cost - 1e-9) best = { cost, groups };
    }
    for (const x of best.groups) for (const j of x.segs) shots[j] = { ...studioShot(x.framing), strip: (x.framing === QUIZ_FRAMING.wide && x.segs.some((y) => segs[y]?.part === 'scores' && y <= j)) || undefined };
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

/**
 * May PICTURE THIS show this question's picture (server/rights.js, PICTURE_RIGHTS)? Only with a cleared rights record
 * for that very picture, or the operator's own local file; an outlet's photo only in a private preview (the episode's
 * `picturePreview`). The station plans and fetches no other (server/quiz/desk.js pictureCleared, producer.js); the
 * director never loads one either, so an outlet's photo never reaches the board outside a preview.
 */
export function quizPictureAirable(question, episode = null) {
  const image = question?.image;
  if (!image) return false;
  if (episode?.picturePreview === true) return true;
  const r = question.imageRights;
  return (!!r && r.cleared === true && r.url === image) || /^file:/i.test(image);
}

/**
 * The licence credit PICTURE THIS draws under its board while the picture shows, as the montage draws it (graphics/
 * remote.js drawFileCredit): { credit: 'FILE · AUTHOR · CC BY 4.0 · PIXELATED', tag: 'FILE' | 'FILE 2023' | 'PHOTO',
 * uncleared }. A cleared record's own credit; in a private preview, an outlet's photo says PREVIEW · NOT CLEARED (with
 * its credit when the record has one); the operator's own local picture carries none. Null when nothing is drawn.
 */
export function quizPictureCredit(question, episode = null) {
  const image = question?.image;
  if (!image) return null;
  const r = question.imageRights;
  if (r && r.cleared === true && r.url === image) {
    const credit = String(r.credit || '').trim();
    if (!credit) return null;
    return { credit, tag: /^FILE\b/i.test(credit) ? /^FILE(?: \d{4})?/i.exec(credit)[0].toUpperCase() : 'PHOTO', uncleared: false };
  }
  if (/^file:/i.test(image)) return null;
  if (episode?.picturePreview === true) return { credit: r?.credit ? String(r.credit) : null, tag: 'PHOTO', uncleared: true };
  return null;
}
