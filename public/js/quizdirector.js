// PAY ATTENTION on air (docs/programmes/pay-attention.md §4-§6, build step 4): the director's side of a quiz edition.
// director.js calls prepareQuiz(director, episode) when the episode arrives (the plan, the pictures, the boards'
// players and titles; every segment is annotated with its planned shot, seg.quizShot, which the v2 planner reads), and
// playQuiz(director, episode) after the open. Everything is timed from what really happens: a board's clock starts at
// its own cut, its times are the segments' real starts, a countdown is the bed's (LiveMusic.countdown: whole half
// notes, the bar from its returned start, the reveal on its end), the lock-ins and buzzes are said on its ticks, the
// reveal's sting lands on the reveal, DOUBLE OR NOTHING's drumroll ends on it. The set follows (setQuizState through the
// v2 direction: the moving heads still from the frame to the reveal, the lamps lit on a lock-in, the desks' scores).
// No laughter and no applause: no such sound is ever asked for.
//
//   prepareQuiz(d, episode)   → d.quiz (null for any other programme)
//   playQuiz(d, episode)      the edition after the open, to its end card
//   quizMusic(d, seg)         the bed's moment for a quiz segment that starts speaking (director.js musicSegment)
import { BOARD_WAIT, quizUnits, planQuizShots, answerSchedule, countdownHalves, scheduleNeed, revealPlan, seatOf, sameShot, roundQuestions, speechOf, isQuizEpisode, REVEAL_BEAT, WHERE_SETTLE, LETTER_STAGES, TAG_CLEAR, HALF_NOTE, COUNTDOWN_HALVES } from './quizplay.js';
import { kickerOf, preparePicture } from './scenes/cards-quiz.js';
import { paceFor, gapAfter, CHANNEL, cutWait, paceTrace } from './pace.js';

const now = () => performance.now() / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const sleepUntil = (t) => sleep((t - now()) * 1000);
const DRUMROLL = 4.3; // s: DOUBLE OR NOTHING's drumroll (stings.js quizDrumroll: two bars at 112 BPM)
const PICTURE_WAIT = 3.0; // s a PICTURE THIS question waits for its picture before its board (never a dark slot when it can help it)
const STUDIO_WAIT = 1.2; // s a studio line waits for its cut likewise (a longer hold: the cut lands between two words)
const BACK_BEAT = 0.4; // s the board is back on air before its reveal (after a buzz or the guesses on the players' faces)
const LINK_SLACK = 0.6; // s of silence at most on the wide before LETTER BY LETTER's tiles (a link: playLine)
const CARD_WAIT = 1.6; // ... the first line after a board (the final score's 2 s line leaves its card 1.3 s short of the minimum)
const BOARD_MIN = 3.0; // s a reveal stays on the board before a studio shot may take over (the gold, the credit up for 2.75 s)
const BOARD_MIN_SAID = 2.0; // ... when the host says the credit in the reveal (heard, it need not be read on the board)
const VERDICT_MIN = 3.0; // s of the reveal's words (and the pause after) the verdict's wide must have left to be worth a cut

/** The players' first names as the writer says them ("Dr Nova Reyes" is Nova, unit8 is UNIT-8). */
function firstName(channel, id) {
  if (id === 'unit8') return 'UNIT-8';
  const full = channel?.presenters?.[id]?.name || String(id || '');
  return full.replace(/^Dr\s+/, '').split(/\s+/)[0];
}

/** The programmes' titles by id (the boards' credit lines): the channel's programmes and drafts. */
function titlesOf(channel) {
  const out = {};
  for (const [id, p] of Object.entries({ ...(channel?.programs || {}), ...(channel?.drafts || {}) })) if (p?.title) out[id] = p.title;
  return out;
}

/**
 * The quiz's plan for an episode (null when it is not PAY ATTENTION): its units, the shot of every segment (also on
 * seg.quizShot for the v2 planner), the players as the boards draw them, the programmes' titles, the pictures.
 */
export function prepareQuiz(d, episode) {
  if (!isQuizEpisode(episode)) {
    d.quiz = null;
    return null;
  }
  const segs = episode.segments;
  const units = quizUnits(segs);
  const P = paceFor(episode.program?.id);
  const shots = planQuizShots(episode, { gapAfter: (i) => gapAfter(episode, i).gap, studioMax: P.shots.studioMax, min: P.shots.min, units, endHold: P.holds.signoff });
  segs.forEach((s, i) => {
    if (s && shots[i]) s.quizShot = { shot: shots[i].shot, framing: shots[i].framing, focus: shots[i].focus, board: shots[i].board || null };
  });
  const cast = episode.cast || {};
  const players = ['A', 'B'].map((seat) => ({ seat, id: cast[seat], name: firstName(d.channel, cast[seat]) }));
  // the host's open palm to the player he names on a studio shot (the v2 planner and the old renderer read seg.cues):
  // the near arm turns to B on screen-right, the far arm to A (gestures/index.js point_partner after_you_far)
  segs.forEach((s, i) => {
    if (s?.anchor !== 'H' || !s.text || Array.isArray(s.cues) || !shots[i] || shots[i].shot === 'quiz' || shots[i].shot === 'open') return;
    const cues = [];
    for (const p of players) {
      const at = p.name ? s.text.search(new RegExp(`\\b${p.name.replace(/[^A-Za-z0-9-]/g, '')}\\b`)) : -1;
      if (at >= 0) cues.push({ char: at, action: 'point_partner', variant: p.seat === 'B' ? 'after_you' : 'after_you_far', slot: 'H' });
    }
    if (cues.length) s.cues = cues.sort((x, y) => x.char - y.char);
  });
  const q = { episode, units, shots, players, titles: titlesOf(d.channel), pics: new Map(), scores: { A: 0, B: 0 }, lamps: { A: false, B: false }, question: false, onAir: null, pending: null, tagUntil: Infinity, tally: { A: [], B: [] }, double: null, doubleDesk: null, sudden: false };
  d.quiz = q;
  loadPictures(d, q);
  return q;
}

// ---------------------------------------------------------------------------------------------- pictures

/** Every PICTURE THIS picture, through the station's own /api/img, prepared ahead (preparePicture) in the background. */
function loadPictures(d, q) {
  for (const u of q.units) {
    if (u.kind !== 'question' || u.type !== 'picture') continue;
    const question = q.episode.segments[u.from]?.quiz?.question;
    if (!question) continue;
    const id = question.imageId || question.key;
    if (!id || q.pics.has(id)) continue;
    const entry = { img: null, ready: null };
    const load = typeof d.loadQuizPicture === 'function' ? d.loadQuizPicture(question) : defaultLoad(id);
    entry.ready = Promise.resolve(load)
      .then((img) => {
        entry.img = img || null;
        // the picture's steps baked now (a few ms), never on the board's first frame
        if (img && typeof document !== 'undefined') preparePicture(img, question.steps || [8, 16, 32, 64]);
        return entry.img;
      })
      .catch((err) => {
        console.warn('[quiz] picture', id, err?.message || err);
        return null;
      });
    q.pics.set(id, entry);
  }
}

/** The picture through the station (which fetched it when it made the edition): three tries, 2 s apart, before air. */
function defaultLoad(id, tries = 3) {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => (tries > 1 ? sleep(2000).then(() => defaultLoad(id, tries - 1)).then(resolve, reject) : reject(new Error('picture unavailable')));
    img.src = `/api/img/${encodeURIComponent(id)}`;
  });
}

/** The question's picture, waiting a little for it if it is still on its way (null when it never came). */
async function pictureFor(q, question) {
  const entry = q.pics.get(question?.imageId || question?.key);
  if (!entry) return null;
  if (entry.img) return entry.img;
  return Promise.race([entry.ready, sleep(PICTURE_WAIT * 1000).then(() => null)]);
}

// ---------------------------------------------------------------------------------------------- the set's state

/** The set's state (studio/quiz.js setQuizState through the v2 direction; tests read d.quizTrace). */
function setState(d, o) {
  const q = d.quiz;
  if ('question' in o) q.question = !!o.question;
  if (o.lamps) Object.assign(q.lamps, o.lamps);
  if (o.scores) Object.assign(q.scores, o.scores);
  const t = now();
  try {
    d.v2?.quizState?.(o, t);
  } catch (err) {
    console.warn('[quiz] set state', err?.message || err);
  }
  d.quizTrace?.push({ k: 'state', t, question: q.question, lamps: { ...q.lamps }, scores: { ...q.scores } });
}

// ---------------------------------------------------------------------------------------------- cuts

/**
 * Cut to a planned shot (a board: its card), held back by the profile's cooldown when the shot on air has not held its
 * minimum (the cut then lands between two words, director.cutWhenClear); never player B's single while the programme's
 * tag shows. `onCut()` runs when the cut is on air. Returns the handle of a held-back cut, or null.
 */
function cutTo(d, spec, { card = null, onCut = null, wordSafe = false } = {}) {
  const q = d.quiz;
  const s = d.scene;
  if (spec.shot === 'close' && spec.focus === 'B' && now() < q.tagUntil) spec = { shot: 'wide', framing: 'quiz-wide', focus: 'H' };
  if (q.pending) {
    q.pending.cancel?.();
    q.pending = null;
  }
  const key = { ...spec, card };
  if (sameShot(q.onAir, key) && (spec.shot !== 'quiz' || q.onAir?.card === card)) {
    // (the half-time scores on a wide that a player's line opened: the strip comes up with the host's scores line)
    if (spec.strip && !s.quizStrip) s.quizStrip = { since: now(), scores: { ...q.scores }, players: q.players };
    onCut?.();
    return null;
  }
  const apply = () => {
    q.pending = null;
    s.lowerThird = null;
    const strip = spec.strip ? { since: now(), scores: { ...q.scores } } : null;
    d.setShot(spec.shot, { focus: spec.focus, storyId: null, wall: { mode: 'logo' }, card, framing: spec.framing ?? null, cameraMove: null });
    s.quizStrip = strip ? { ...strip, players: q.players } : null;
    q.onAir = key;
    paceTrace({ k: 'quizCut', shot: spec.shot, framing: spec.framing ?? null, board: card?.board ?? null });
    onCut?.();
  };
  const held = typeof d.onAir === 'function' ? d.onAir() : now() - (s.shotSince || 0);
  const wait = cutWait(s.program?.id, now() - held, now());
  if (wait > 0.05 || wordSafe) {
    // (a cut inside a line lands between two words: director.cutWhenClear)
    q.pending = d.cutWhenClear(Math.max(wait, wordSafe ? 0.03 : 0), apply);
    q.pendingAt = now() + wait;
    return q.pending;
  }
  apply();
  return null;
}

/**
 * Cut to a planned shot so that it lands on the next line's first word: when the cooldown holds the cut back by at most
 * `limit` s, the line waits for it (a beat of the bed between two lines, never a cut inside a word or a board that comes
 * in after its words have started); a longer hold lets the line start and the cut follow between two words.
 */
async function cutOnWord(d, spec, opts = {}, limit = 1.2) {
  const q = d.quiz;
  // (a reveal's board stays up its hold first: the gold and the credit seen, revealHold)
  const rw = revealWait(d);
  if (rw > 0) await sleep(Math.min(rw, limit) * 1000);
  const h = cutTo(d, spec, opts);
  if (h && q.pendingAt - now() <= limit) await sleepUntil(q.pendingAt + 0.02);
}

/** The planned shot of segment i as a cut spec. */
function plannedSpec(q, i) {
  const p = q.shots[i];
  return p ? { shot: p.shot, framing: p.framing, focus: p.focus, strip: !!p.strip, board: p.board, unit: p.unit } : { shot: 'wide', framing: 'quiz-wide', focus: 'H' };
}

// ---------------------------------------------------------------------------------------------- music

/** The bed's moment for a quiz segment that starts speaking (pay-attention.md §6; cuesheet.js QUIZ). */
export function quizMusic(d, seg, segment) {
  const m = d.music;
  const part = seg.part;
  if (part === 'welcome') m.cue('welcome', { segment });
  else if (part === 'round') m.cue('question', { segment });
  else if (part === 'frame' && (d.quiz?.double || d.quiz?.sudden)) m.cue('question', { double: true, segment });
  else if (part === 'frame') m.cue('question', { segment });
  else if (part === 'scores') m.cue('scores', { segment });
  else if (part === 'don' || part === 'tie') m.cue('question', { double: true, segment });
  else if (part === 'result') m.cue('result', { segment });
  else if (part === 'signoff') m.cue('outro', { segment });
}

function cue(d, moment, opts = {}) {
  d.quizTrace?.push({ k: 'music', t: now(), moment, ...opts });
  return d.music.cue(moment, opts);
}

// ---------------------------------------------------------------------------------------------- playout

/** The pause after segment i, less what a playing voice adds by itself (the director's rule). */
function pause(d, i) {
  const ep = d.quiz.episode;
  const g = gapAfter(ep, i).gap;
  return Math.max(0.06, g - (d.audio?.mode === 'tts' ? CHANNEL.voiceLatency : 0));
}

/** Speak segment i (the v2 plan goes on air for the gestures and glances, but makes no cut: the quiz cuts here). */
function say(d, i, onSentence = null, extra = null) {
  const seg = d.quiz.episode.segments[i];
  if (!seg || !seg.text) return Promise.resolve();
  d.quizTrace?.push({ k: 'say', t: now(), i, part: seg.part, anchor: seg.anchor });
  return d.say(seg, onSentence, { planOnly: true, ...(extra || {}) });
}

/** The edition after the open: its units in order, then the sign-off's hold and the end card. */
export async function playQuiz(d, episode) {
  const q = d.quiz;
  const s = d.scene;
  q.tagUntil = now() + TAG_CLEAR; // player B's single waits until the programme's tag has gone (studio/quiz.js)
  q.onAir = { shot: 'open' };
  const segs = episode.segments;
  // the desks' displays from the first studio picture: 0 to 0, lamps off, no question
  setState(d, { question: false, lamps: { A: false, B: false }, scores: { A: 0, B: 0 } });
  let first = true;
  for (let k = 0; k < q.units.length; k++) {
    const u = q.units[k];
    if (u.kind === 'open') continue;
    if (first) {
      first = false;
      // the first words a breath after the open's cut (the network's rule); the welcome's wide is on air from the cut
      cutTo(d, plannedSpec(q, u.from));
      await sleep(d.openBreath() * 1000);
    }
    if (u.kind === 'question') await playQuestion(d, u, k);
    else if (u.kind === 'card') await playCard(d, u, k);
    else await playLine(d, u.from);
    const last = u.to;
    if (last >= segs.length - 1) break;
    // the next segment's recorded voice is looked up in the pause (as every programme's)
    const following = segs[last + 1];
    if (following) d.voiceAhead = { seg: following, job: Promise.resolve(d.voices.audioFor(following)).catch(() => null) };
    await sleep(pause(d, last) * 1000);
  }
  q.pending?.cancel?.();
  s.quizStrip = null;
  setState(d, { question: false, lamps: { A: false, B: false } });
  // the sign-off: its cue after the last word, the hold on the wide, the stinger to the end card (as every programme)
  if (d.music.signoffAllowed?.(s.program?.id) !== false) d.audio.sfx('outro', { programId: s.program?.id, startAt: performance.now() + 150 });
  await sleep(paceFor(s.program?.id).holds.signoff * 1000);
  await d.stinger(() => {
    s.quizStrip = null;
    d.setShot('endcard', { card: { line1: 'STAY WITH US', line2: `${d.channel.name} · LIVE 24 HOURS` } });
  });
  await sleep(paceFor(s.program?.id).holds.endcard * 1000);
  d.quiz = null;
}

/** A host's or a player's line on its planned shot. */
async function playLine(d, i) {
  const q = d.quiz;
  const spec = plannedSpec(q, i);
  // a reaction too short to hold a shot of its own before the next board (no reveal's tail to start it in, and the
  // single would stand silent for more than STUDIO_WAIT before the next board's first word): the reveal's board keeps it
  // ("Correct, Lola." "Lovely." is one beat on the board, the player's mark lit), and the next board lands on its first word
  const segs = q.episode.segments;
  let limit = STUDIO_WAIT;
  if (q.onAir?.shot === 'quiz' && !sameShot(q.onAir, spec)) {
    const keep = () => {
      d.quizTrace?.push({ k: 'keep', t: now(), i });
      segs[i].quizShot = { shot: 'quiz', framing: null, focus: null, board: q.onAir?.card?.board || null }; // (no gestures under a board)
      return say(d, i);
    };
    let len = 0;
    let j = i;
    for (; j < segs.length && sameShot(q.shots[j], q.shots[i]); j++) len += speechOf(segs[j]) + pause(d, j);
    const min = paceFor(d.scene.program?.id).shots.min;
    // the reveal's board must stay up a while yet (a reveal of two words): the reply rides on it
    if (segs[i]?.part === 'react' && revealWait(d) > STUDIO_WAIT) return keep();
    if (segs[i]?.part === 'react' && q.shots[j]?.shot === 'quiz' && len < min + 0.1 - STUDIO_WAIT) {
      // LETTER BY LETTER next: its frame (the desk, which reads nothing off the board) rides on the quiz's wide with the
      // reaction, the host seen saying it, and the tiles come up as it ends (a face between two boards, no silence)
      const nu = q.units.find((x) => x.kind === 'question' && x.from === j);
      if (nu?.type === 'letters' && j === i + 1 && len + speechOf(segs[j]) >= min + 0.1 - LINK_SLACK) {
        const wide = { shot: 'wide', framing: 'quiz-wide', focus: 'H' };
        d.quizTrace?.push({ k: 'link', t: now(), i: j });
        for (const x of [segs[i], segs[j]]) x.quizShot = { ...wide, board: null }; // (the v2 planner's gestures and looks)
        await cutOnWord(d, { ...wide, link: true }, {}, STUDIO_WAIT);
        return say(d, i);
      }
      return keep();
    }
    // a short reply after a card the network's minimum still holds on air (the final score: "A profitable evening."):
    // the cut would land inside its words, so the card keeps it and the cut lands on the next line's first word
    const held = typeof d.onAir === 'function' ? d.onAir() : now() - (d.scene.shotSince || 0);
    const wait = cutWait(d.scene.program?.id, now() - held, now());
    const line = speechOf(segs[i]);
    if (segs[i]?.anchor !== 'H' && line <= 2.0 && wait > STUDIO_WAIT && wait < line + pause(d, i) && sameShot(q.shots[i + 1], spec)) return keep();
    // a longer one waits a little longer for its cut rather than have it land inside its words
    if (wait > STUDIO_WAIT && wait <= CARD_WAIT) limit = CARD_WAIT + 0.05;
  }
  await cutOnWord(d, spec, {}, limit);
  await say(d, i);
}

// ---------------------------------------------------------------------------------------------- the cards

async function playCard(d, u, k) {
  const q = d.quiz;
  const segs = q.episode.segments;
  const seg = segs[u.from];
  let card;
  if (u.board === 'round') {
    q.sudden = !!u.sudden;
    const qs = roundQuestions(q.units, k);
    const exact = u.type === 'howmany' && qs.some((x) => segs[x.from]?.quiz?.question?.figure?.exact);
    card = { board: 'round', o: { type: u.type, k: u.k || 0, sudden: !!u.sudden, exact } };
  } else if (u.board === 'double') {
    const data = seg.quiz || {};
    const trailing = trailingSeat(q, data, segs[u.to]?.part === 'pick' ? segs[u.to] : null);
    q.double = trailing;
    q.doubleDesk = segs[u.to]?.part === 'pick' ? segs[u.to].quiz?.desk : data.offered?.[0] || null;
    card = { board: 'double', o: { players: q.players, player: trailing, offered: data.offered || [], pick: null, pickAt: Infinity, leader: trailing === 'A' ? 'B' : 'A' } };
  } else if (u.board === 'final') {
    const data = seg.quiz || {};
    const scores = { A: Number(data.scores?.[q.players[0].id]) || 0, B: Number(data.scores?.[q.players[1].id]) || 0 };
    card = { board: 'final', o: { players: q.players, scores, title: 'FINAL SCORE', winner: seatOf(q.episode.cast, data.winner) } };
    // the desks show the final score (the tie-break does not change it)
    setState(d, { scores });
    q.double = null;
  } else {
    const data = seg.quiz || {};
    const standings = (data.standings || []).map((r) => ({ ...r, name: d.channel?.presenters?.[r.id]?.name || r.name || r.id }));
    card = { board: 'table', o: { standings, players: q.players, title: "THIS WEEK'S TABLE" } };
  }
  let since = null;
  await cutOnWord(d, plannedSpec(q, u.from), { card, onCut: () => (since = d.scene.shotSince) }, BOARD_WAIT);
  await say(d, u.from);
  if (u.to > u.from) {
    await sleep(pause(d, u.from) * 1000);
    // DOUBLE OR NOTHING's pick: the desk lights as the player names it
    if (u.board === 'double') {
      card.o.pick = segs[u.to].quiz?.desk || null;
      card.o.pickAt = since === null ? 0 : Math.max(0, now() - since);
    }
    await say(d, u.to);
  }
}

/** The seat of the player behind before DOUBLE OR NOTHING (the writer's `trailing`, else the pick's speaker, else the lower score). */
function trailingSeat(q, data, pick) {
  const cast = q.episode.cast;
  const bySeat = seatOf(cast, data.trailing);
  if (bySeat) return bySeat;
  if (pick?.anchor === 'A' || pick?.anchor === 'B') return pick.anchor;
  const sa = Number(data.scores?.[cast.A]) || 0;
  const sb = Number(data.scores?.[cast.B]) || 0;
  return sa <= sb ? 'A' : 'B';
}

// ---------------------------------------------------------------------------------------------- the questions

/** A question's board options, every time unknown until it happens (Infinity, or no countdown yet). */
function boardOf(d, u, item = null, index = 0) {
  const q = d.quiz;
  const segs = q.episode.segments;
  const frame = segs[item ? item.frame : u.from];
  const data = frame.quiz || {};
  const question = data.question || null;
  const desk = u.double ? q.doubleDesk : null;
  const kicker = u.sudden ? kickerOf({ sudden: true }) : u.double ? kickerOf({ type: u.type, double: desk || question?.desk || 'news' }) : kickerOf({ type: u.type, k: u.type === 'today' ? index + 1 : u.k, n: u.type === 'today' ? u.items.length : u.n, desk: question?.desk });
  const base = { players: q.players, kicker, now: Date.now(), titles: q.titles, revealAt: Infinity, double: u.double ? q.double : null };
  switch (u.type) {
    case 'picture':
      return { board: 'picture', o: { ...base, question, image: null, optionsAt: Infinity, countdown: null, locks: [] } };
    case 'letters':
      return { board: 'letters', o: { ...base, question, stageTimes: [Infinity, Infinity, Infinity], countdown: null, buzzes: [], winner: null } };
    case 'where':
      return { board: 'where', o: { ...base, question, pinsAt: Infinity, countdown: null, locks: [] } };
    case 'howmany':
      return { board: 'howmany', o: { ...base, question, countdown: null, guesses: [] } };
    case 'today':
      return { board: 'today', o: { ...base, item: data.item, index, total: u.items.length, countdown: null, locks: [], tally: { A: [...q.tally.A], B: [...q.tally.B] } } };
    default:
      return { board: u.type, o: base };
  }
}

/** The board on air for a question: its card, its clock (s since its own cut), the cut itself. */
function onBoard(d, spec, card) {
  const b = { card, since: null };
  b.at = () => (b.since === null ? 0 : Math.max(0, now() - b.since));
  // (the board's clock runs from its first cut: back from the players' faces it carries on, card.epoch for the drawing)
  const first = () => {
    b.since ??= d.scene.shotSince;
    card.epoch = b.since;
  };
  b.cut = () => cutOnWord(d, spec, { card, onCut: first }, BOARD_WAIT);
  // the countdown starts only with the board on air (a cut the cooldown held back comes first)
  b.ready = async () => {
    for (let n = 0; b.since === null && n < 400; n++) await sleep(20);
    if (b.since === null) {
      // (never reached on air: the cooldown is 4 s) the board now, whatever the cooldown
      d.quiz.pending?.cancel?.();
      d.quiz.pending = null;
      d.setShot(spec.shot, { focus: spec.focus, storyId: null, wall: { mode: 'logo' }, card, framing: null, cameraMove: null });
      d.quiz.onAir = { ...spec, card };
      first();
    }
  };
  return b;
}

/**
 * The countdown on the bed's half notes (LiveMusic.countdown): { T0, end, half } in the director's clock, the board's
 * bar from T0 for `halves` half notes. `lead`: s from now to the first tick at the earliest (it waits for the bed's next
 * half note). `ticks`: how many ticks sound (LETTER BY LETTER stops at the winning buzz); the bar is always `halves`.
 */
function countdown(d, b, halves, lead, ticks = halves) {
  const t = now();
  const cd = d.music.countdown(Math.max(1, ticks), Math.max(0.05, lead));
  const half = cd.half || HALF_NOTE;
  const T0 = t + cd.start;
  const end = T0 + halves * half;
  b.card.o.countdown = { at: Math.max(0, T0 - b.since), dur: halves * half };
  d.quizTrace?.push({ k: 'countdown', t, T0, end, halves, ticks: Math.max(1, ticks), half, board: b.card.board });
  return { T0, end, half };
}

/**
 * DOUBLE OR NOTHING's drumroll, timed to end on the reveal planned at `revealAt` (director clock): { timer, end }. A
 * reveal too close to start it in time moves to the drumroll's end (`end`), so the roll always lands on the reveal.
 */
function drumroll(d, revealAt) {
  const end = Math.max(revealAt, now() + DRUMROLL);
  const at = end - DRUMROLL;
  const go = () => cue(d, 'double', { endsAt: end });
  if (at <= now() + 0.02) {
    go();
    return { timer: null, end };
  }
  return { timer: setTimeout(go, (at - now()) * 1000), end };
}

/** The reveal: the board's gold, the sting (right if anyone scored, else wrong), the lamps of wrong answers out, the scores. */
function reveal(d, b, plan, wrongSeats = []) {
  const q = d.quiz;
  b.card.o.revealAt = b.at();
  cue(d, plan.right ? 'right' : 'wrong');
  const lamps = {};
  for (const seat of wrongSeats) lamps[seat] = false;
  const scores = { A: q.scores.A + plan.points.A, B: q.scores.B + plan.points.B };
  setState(d, { lamps, scores });
  d.quizTrace?.push({ k: 'reveal', t: now(), board: b.card.board, right: plan.right, points: { ...plan.points } });
}

/** Lamp on (a lock-in, a buzz, a guess). */
const lampOn = (d, seat) => setState(d, { lamps: { [seat]: true } });

async function playQuestion(d, u, k) {
  const q = d.quiz;
  if (u.type === 'today') return playToday(d, u, k);
  const segs = q.episode.segments;
  const cast = q.episode.cast;
  const spec = plannedSpec(q, u.from);
  const card = boardOf(d, u);
  const o = card.o;
  // never PICTURE THIS without its picture (the station checked it at production; here it is waited for)
  if (u.type === 'picture') o.image = await pictureFor(q, o.question);
  const b = onBoard(d, spec, card);
  q.double = u.double ? q.double : null;
  setState(d, { question: true, lamps: { A: false, B: false } });
  // (LETTER BY LETTER after a link: its frame on the wide the reaction opened, the board after it)
  const link = u.type === 'letters' && !!q.onAir?.link;
  if (!link) await b.cut();
  const latency = d.audio?.mode === 'tts' ? CHANNEL.voiceLatency : 0;
  const part = (name) => (u.parts[name] || [])[0];
  const sched = answerSchedule(u, segs, cast);
  const plan = revealPlan(u, segs, cast, { double: u.double ? q.double : null });
  // the frame (the board's question), and what the host reads before the countdown
  await say(d, u.from);
  if (link) await b.cut();
  // LETTER BY LETTER's buzz and HOW MANY?'s guesses, said in the players' own words, on their faces (the plan's
  // studio shot: the buzzer's single, the guessers' wide) when the board has held the network's minimum by the line's
  // first word, else on the board; the board comes back for the reveal (BACK_BEAT before it), its clock running on
  const min = paceFor(d.scene.program?.id).shots.min;
  const awayFor = (cd, a) => {
    const p = q.shots[a.i];
    return !!p && p.shot !== 'quiz' && cd.T0 + a.at - latency - b.since >= min + 0.05;
  };
  let away = null;
  const back = async (t) => {
    if (!away) return t;
    await sleepUntil(away.since + min + 0.02);
    cutTo(d, spec, { card });
    d.quizTrace?.push({ k: 'back', t: now(), board: card.board });
    away = null;
    return Math.max(t, now() + BACK_BEAT);
  };
  const answers = async (cd) => {
    let lastEnd = now();
    for (const a of sched) {
      await sleepUntil(cd.T0 + a.at - latency);
      const seg = segs[a.i];
      if (!away && awayFor(cd, a)) {
        cutTo(d, plannedSpec(q, a.i));
        away = { since: now() };
        b.wentAway = true;
        d.quizTrace?.push({ k: 'away', t: now(), i: a.i, framing: q.onAir?.framing ?? null });
      } else if (!away && q.shots[a.i]?.shot !== 'quiz') seg.quizShot = { shot: 'quiz', framing: null, focus: null, board: card.board }; // (kept on the board)
      const at = b.at() + latency;
      if (a.kind === 'lock') o.locks = [...o.locks, { seat: a.seat, answer: seg.quiz?.lock?.answer, at }];
      else if (a.kind === 'guess') o.guesses = [...o.guesses, { seat: a.seat, said: seg.quiz?.guess?.said || '', at, points: seg.quiz?.guess?.points || 0 }];
      else o.buzzes = [...o.buzzes, { seat: a.seat, at, stall: a.kind === 'stall' }];
      lampOn(d, a.seat);
      d.quizTrace?.push({ k: a.kind, t: now() + latency, seat: a.seat, i: a.i, planned: cd.T0 + a.at });
      await say(d, a.i);
      lastEnd = now();
      // a stall: that lamp goes out (the board shows OUT), the other player may still buzz
      if (a.kind === 'stall') setState(d, { lamps: { [a.seat]: false } });
    }
    return lastEnd;
  };
  let revealT;
  let drum = null;
  // (the reveal never comes before DOUBLE OR NOTHING's drumroll has landed)
  const held = (t) => Math.max(t, drum ? drum.end : 0);
  if (u.type === 'picture') {
    await sleep(pause(d, u.from) * 1000);
    const oi = part('options');
    if (oi !== undefined) {
      o.optionsAt = b.at();
      await say(d, oi);
      await sleep(pause(d, oi) * 1000);
    }
    await b.ready();
    const ci = part('countdown');
    const halves = countdownHalves('picture', scheduleNeed(sched));
    // the prompt ("Lock it in.") is said as the countdown asks for its first tick: the ticks start as it ends
    const promptLen = ci !== undefined ? speechOf(segs[ci]) : 0;
    const cd = countdown(d, b, halves, promptLen + 0.05);
    if (u.double) drum = drumroll(d, cd.end);
    if (ci !== undefined) await say(d, ci);
    const lastEnd = await answers(cd);
    revealT = held(Math.max(cd.end, lastEnd + 0.2));
  } else if (u.type === 'letters') {
    await b.ready();
    const win = sched.find((a) => a.kind === 'buzz');
    const halves = COUNTDOWN_HALVES.letters;
    // the ticks stop at the winning buzz (the board's game clock stops there too); nobody: all nine
    const ticks = win ? Math.max(1, Math.min(halves, Math.ceil(win.at / HALF_NOTE - 1e-6))) : halves;
    const cd = countdown(d, b, halves, 0.3, ticks);
    o.stageTimes = LETTER_STAGES.map((h) => Math.max(0, cd.T0 - b.since + h * cd.half));
    o.winner = plan.winner;
    const planned = win ? Math.max(cd.T0 + win.at + win.dur + 0.3, awayFor(cd, win) ? cd.T0 + win.at - latency + min + 0.02 + BACK_BEAT : 0) : cd.end;
    if (u.double) drum = drumroll(d, planned);
    const lastEnd = await answers(cd);
    revealT = held(await back(win ? lastEnd + 0.3 : Math.max(cd.end, lastEnd + 0.2)));
  } else if (u.type === 'where') {
    await sleep(pause(d, u.from) * 1000);
    const pi = part('pins');
    if (pi !== undefined) {
      o.pinsAt = b.at();
      await say(d, pi);
    }
    await b.ready();
    const halves = countdownHalves('where', scheduleNeed(sched));
    const cd = countdown(d, b, halves, 0.3);
    if (u.double) drum = drumroll(d, cd.end);
    const lastEnd = await answers(cd);
    revealT = held(Math.max(cd.end, lastEnd + 0.2));
  } else {
    // HOW MANY?
    await b.ready();
    const halves = countdownHalves('howmany', scheduleNeed(sched));
    const cd = countdown(d, b, halves, 0.3);
    const first = sched.find((a) => awayFor(cd, a));
    const last = sched[sched.length - 1];
    const planned = Math.max(cd.end, last ? cd.T0 + last.at + last.dur + 0.2 : 0, first ? cd.T0 + first.at - latency + min + 0.02 + BACK_BEAT : 0);
    if (u.double) drum = drumroll(d, planned);
    const lastEnd = await answers(cd);
    revealT = held(await back(Math.max(cd.end, lastEnd + 0.2)));
  }
  await sleepUntil(revealT);
  reveal(d, b, plan, wrongSeats(u, segs, plan));
  await sleep(REVEAL_BEAT * 1000);
  const ri = part('reveal');
  if (ri !== undefined) await sayReveal(d, u, ri, b, u.to + 1);
  // WHERE's reveal: the wrong pins away and the move onto the right one (2.2 s) before the board gives way
  if (u.type === 'where') await sleep((o.revealAt + WHERE_SETTLE - b.at()) * 1000);
  setState(d, { question: false, lamps: { A: false, B: false } });
}

/** s until the reveal on air has been shown its hold (sayReveal notes it), 0 when the board on air shows no reveal. */
function revealWait(d) {
  const r = d.quiz?.lastReveal;
  if (!r || d.quiz.onAir?.card !== r.card) return 0;
  return Math.max(0, r.at + r.hold - now());
}

/** How long the board must show a reveal before a studio shot takes over (s after the reveal). */
function revealHold(u, seg) {
  const said = !!seg?.quiz?.credit && String(seg.text || '').includes(seg.quiz.credit);
  return Math.max(said ? BOARD_MIN_SAID : BOARD_MIN, u.type === 'where' ? WHERE_SETTLE : 0);
}

/**
 * Where the reveal's words stop reading the board (a char offset in its text, 0 when they read nothing from it): the
 * headline LETTER BY LETTER revealed when nobody named it ("It was: ..."), WHERE's headline whole again, HOW MANY?'s
 * figure ("The answer: $1.3 billion acquisition,"). A cut away from the board never comes before the host has said it.
 */
export function readbackEnd(u, seg) {
  const text = String(seg?.text || '');
  const q = seg?.quiz?.question;
  if (!q) return 0;
  const after = (s0) => {
    const i = s0 ? text.indexOf(s0) : -1;
    return i >= 0 ? i + s0.length : 0;
  };
  if (u.type === 'letters') return /\bIt was:/.test(text) ? after(String(q.words).replace(/\u25ae+/g, 'blank')) + 1 : 0;
  if (u.type === 'where') return q.masked ? after(q.words) : 0;
  if (u.type === 'howmany') {
    const i = text.indexOf(', as reported');
    return i >= 0 ? i : text.length;
  }
  return 0;
}

/**
 * The cut away from a reveal's board, planned before the reveal is said: { spec, at, end, slack } (director clock),
 * or null. A reaction next: its shot in the reveal's last words (the player hears the verdict on their face, as a
 * quiz cuts) when, from the reaction's own start, it could not hold the network's minimum before the next cut. The
 * next question's board next (no reaction): the verdict on the quiz's wide when the reveal has words enough left
 * (the host speaking, the right lamps gold, the desks' scores just changed: the game's state seen in the studio, and
 * no round a minute of boards without a face). Never before the board has shown the reveal (revealHold).
 */
function revealCut(d, u, ri, b, nx) {
  const q = d.quiz;
  const segs = q.episode.segments;
  const next = q.shots[nx];
  const start = now();
  const end = start + speechOf(segs[ri]);
  // (never before the board has shown the reveal, nor before the board itself has held the network's minimum: one the
  // director cut back to after the players' faces has its own 4 s)
  const held = typeof d.onAir === 'function' ? d.onAir() : now() - (d.scene.shotSince || 0);
  const free = start + cutWait(d.scene.program?.id, start - held, start);
  const earliest = Math.max(free, start - b.at() + b.card.o.revealAt + revealHold(u, segs[ri]));
  if (next && next.shot !== 'quiz' && next.shot !== 'open') {
    // the next shot's own length: its lines (speech and pauses) until the plan cuts away from it
    let len = pause(d, ri);
    for (let j = nx; j < segs.length && sameShot(q.shots[j], next); j++) len += speechOf(segs[j]) + pause(d, j);
    const need = paceFor(d.scene.program?.id).shots.min + 0.1 - len;
    if (need <= 0) return null;
    // (a tail held back past its time would leave the reaction's face silent: then the board keeps the reaction)
    const at = Math.max(earliest, end - need);
    if (at > end - need + STUDIO_WAIT) return null;
    return { k: 'tail', spec: plannedSpec(q, nx), at, end, slack: 0.3 };
  }
  // (a question whose answers were on the players' faces has had its studio shot: the reveal keeps its board)
  if (next?.shot === 'quiz' && u.kind === 'question' && u.type !== 'today' && !b.wentAway) {
    return { k: 'verdict', spec: { shot: 'wide', framing: 'quiz-wide', focus: 'H' }, at: earliest, end, slack: VERDICT_MIN - pause(d, ri) };
  }
  return null;
}

/**
 * Speak a reveal with its planned cut (revealCut): armed at once, or when the voice has read the answer off the board
 * (a mark at readbackEnd); dropped when it would come too late for the shot it opens.
 */
async function sayReveal(d, u, ri, b, nx) {
  d.quiz.lastReveal = { card: b.card, at: now() - b.at() + b.card.o.revealAt, hold: revealHold(u, d.quiz.episode.segments[ri]) };
  const plan = revealCut(d, u, ri, b, nx);
  let timer = null;
  const arm = () => {
    if (!plan || timer) return;
    const at = Math.max(plan.at, now());
    if (at > plan.end - plan.slack) return;
    timer = setTimeout(() => {
      d.quizTrace?.push({ k: plan.k, t: now() });
      cutTo(d, plan.spec, { wordSafe: true });
    }, (at - now()) * 1000);
  };
  const read = readbackEnd(u, d.quiz.episode.segments[ri]);
  if (read <= 0) arm();
  await say(d, ri, null, read > 0 ? { marks: [read], onMark: arm } : null);
  clearTimeout(timer);
}

/** The seats whose answer was wrong (their lamps go out at the reveal: gold only ever means right). */
function wrongSeats(u, segs, plan) {
  const out = [];
  if (u.type === 'picture' || u.type === 'where') {
    for (const i of u.parts.lock || []) if (segs[i]?.quiz?.lock && !segs[i].quiz.lock.right) out.push(segs[i].anchor);
  } else if (u.type === 'howmany') {
    for (const i of u.parts.guess || []) if (!(segs[i]?.quiz?.guess?.points > 0)) out.push(segs[i].anchor);
  } else if (u.type === 'letters') {
    for (const seat of ['A', 'B']) if (seat !== plan.winner) out.push(seat);
  }
  return out;
}

/** TODAY OR NOT TODAY?: a board for each headline (its index, the round's tally so far), the lamps, the stamp; the tally line. */
async function playToday(d, u, k) {
  const q = d.quiz;
  const segs = q.episode.segments;
  const cast = q.episode.cast;
  q.tally = { A: [], B: [] };
  let b = null;
  for (let n = 0; n < u.items.length; n++) {
    const item = u.items[n];
    const card = boardOf(d, u, item, n);
    const o = card.o;
    b = onBoard(d, plannedSpec(q, item.frame), card);
    setState(d, { question: true, lamps: { A: false, B: false } });
    await b.cut();
    const plan = revealPlan(u, segs, cast, { item, double: u.double ? q.double : null });
    const sched = answerSchedule(u, segs, cast, { item });
    await say(d, item.frame);
    await b.ready();
    // (DOUBLE OR NOTHING's last headline: its countdown long enough for the drumroll to start inside it)
    const last = u.double && n === u.items.length - 1;
    const cd = countdown(d, b, last ? Math.max(COUNTDOWN_HALVES.today, Math.ceil(DRUMROLL / HALF_NOTE - 0.3)) : COUNTDOWN_HALVES.today, 0.3);
    const drum = last ? drumroll(d, cd.end) : null;
    const answer = segs[item.frame]?.quiz?.item?.answer;
    const reveal0 = segs[item.reveal];
    for (const a of sched) {
      await sleepUntil(cd.T0 + a.at);
      // the lamp the player chose: right when they scored on this headline
      const id = a.seat === 'A' ? cast.A : cast.B;
      const right = (reveal0?.quiz?.points?.[id] || 0) > 0;
      const chose = right ? answer : answer === 'TODAY' ? 'EARLIER' : 'TODAY';
      o.locks = [...o.locks, { seat: a.seat, answer: chose, at: b.at() }];
      lampOn(d, a.seat);
      d.quizTrace?.push({ k: 'lock', t: now(), seat: a.seat, i: -1, planned: cd.T0 + a.at });
    }
    await sleepUntil(Math.max(cd.end, drum ? drum.end : 0));
    const wrong = ['A', 'B'].filter((seat) => !((reveal0?.quiz?.points?.[seat === 'A' ? cast.A : cast.B] || 0) > 0));
    reveal(d, b, plan, wrong);
    for (const seat of ['A', 'B']) q.tally[seat].push(!wrong.includes(seat));
    await sleep(REVEAL_BEAT * 1000);
    // (after the last headline, the tally's wide may take the stamp's last words: revealCut)
    const ti0 = (u.parts.tally || [])[0];
    if (item.reveal !== null) await sayReveal(d, u, item.reveal, b, n === u.items.length - 1 && ti0 !== undefined ? ti0 : -1);
    setState(d, { question: false, lamps: { A: false, B: false } });
    if (n < u.items.length - 1) await sleep(pause(d, item.reveal ?? item.frame) * 1000);
  }
  // the round's tally to the studio (the wide: the lamps, the desks' scores just changed)
  const ti = (u.parts.tally || [])[0];
  if (ti !== undefined) {
    await sleep(pause(d, ti - 1) * 1000);
    await cutOnWord(d, plannedSpec(q, ti), {}, STUDIO_WAIT);
    await say(d, ti);
  }
}
