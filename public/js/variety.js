// Visual variety (owner, 18 Oct, on PAY ATTENTION and FULL TIME: "necesitan algunas diapositivas más o cosas que no lo
// hagan muy repetitivo"): what a viewer sees, shot by shot, named the same way by the directors, the tests and the
// measuring tool (tools/pace/variety.mjs), and the pacing standard each programme is held to.
// docs/roadmap/critique/visual-variety.md has the measurements before and after.
//
//   shotLayout(shot)          { group, kind, layout } of a shot on air ({ shot, framing, focus, card })
//                               group   presenter | board | picture | map | remote | furniture
//                               kind    what counts as a different picture for the variety rules: 'wide', 'two',
//                                       'single', 'ots' (over the shoulder, the wall beside), 'picture', 'map', 'montage', 'remote', and every board by its name
//                                       ('board:today', 'board:score', 'board:aired' ...)
//                               layout  the exact composition: a kind with its framing and whose face ('single:quiz-a')
//   VARIETY[programId]        the standard: maxShot (no shot held longer, s), maxStudio (no studio shot longer), minShot
//                             (the network's floor), cutsPerMin (the owner's most), the kinds a 60 s window must show at
//                             least (kindsPerWindow, window), and no layout twice in a row (always)
//   varietyReport(shots, o)   the measures of a timeline of visible shots [{ t, shot, framing, focus, card }]
//   varietyFaults(report, id) the standard's breaches in a report (the tests assert none)
//
// Pure and DOM-free: node tests, the tool and the browser import it.

/** The pacing standard of the two programmes the owner asked about (seconds). */
export const VARIETY = Object.freeze({
  // PAY ATTENTION: a board stands for its whole question only by the reading rule (the options on screen from the
  // first word that reads them to the last lock-in, pay-attention.md §4), so a question's board changes its view
  // (the reading board, then its reveal view) rather than hold one picture past 15 s; a studio shot past the network's 12 s
  // (one exception, by the bible's reading rule: PICTURE THIS's reading board holds its three headlines from the first
  // word that reads them to the last lock-in on the picture's steps, its picture sharper at every step, at most 22 s:
  // its frame on the picture alone when the minute has room for that cut, else on the board, and its reveal on the
  // reveal view)
  'pay-attention': Object.freeze({ maxShot: 15, maxStudio: 12, minShot: 4, cutsPerMin: 10, kindsPerWindow: 3, window: 60, limits: Object.freeze({ 'board:picture': 22 }) }),
  // FULL TIME: the network's 12 s studio maximum for every picture, SCORE CENTRE's board included (its rows split
  // between the stadium's board and the scores wall)
  'full-time': Object.freeze({ maxShot: 12, maxStudio: 12, minShot: 4, cutsPerMin: 10, kindsPerWindow: 3, window: 60 }),
});

const FURNITURE = new Set(['open', 'endcard', 'breakingCard', 'ident', 'promo', 'ad', 'bumper', 'standby', 'start', 'countdown', 'title']);
const WIDE_FRAMINGS = new Set(['wide', 'solo-wide', 'quiz-wide', 'quiz-wide-tight']);
const TWO_FRAMINGS = new Set(['two', 'quiz-two-a', 'quiz-two-b']);

/** The fact card's board by the field it carries (scenes/cards.js drawFactCard's order). */
function factBoard(card) {
  const c = card || {};
  if (c.aired) return 'aired';
  if (c.score?.a && c.score?.b) return c.matchCentre ? 'match-centre' : 'score';
  if (c.chalk) return 'chalk';
  if (Array.isArray(c.fixtures) && c.fixtures.length >= 2) return 'fixtures';
  if (Array.isArray(c.wall) && c.wall.length) return 'scores-wall';
  if (c.standing?.team && c.standing?.text) return 'standing';
  if (c.form?.team && c.form?.count) return 'form';
  if (c.moment?.headline) return 'moment';
  if (c.sport?.name) return 'sport';
  if (c.venue?.name) return 'venue';
  if (Array.isArray(c.who) && c.who.length >= 2) return 'who';
  if (c.share?.value) return 'share';
  if (c.next?.when) return 'next';
  if (c.term?.term) return 'term';
  if (Array.isArray(c.known) && c.known.length >= 2) return 'known';
  if (c.change?.from) return 'change';
  if (Array.isArray(c.timeline) && c.timeline.length >= 2) return 'timeline';
  if (Array.isArray(c.numbers) && c.numbers.length) return 'numbers';
  if (!c.fact && c.quote?.text) return 'quote';
  return 'fact';
}

/**
 * What a shot on air is, for the variety rules: { group, kind, layout }. `s` = { shot, framing, focus, card } as the
 * director sets it (director.js setShot).
 */
export function shotLayout(s = {}) {
  const shot = s.shot || 'wide';
  const framing = s.framing || null;
  if (FURNITURE.has(shot)) return { group: 'furniture', kind: shot, layout: shot };
  if (shot === 'quiz') {
    const b = s.card?.board || 'board';
    // a question's board in its players' view (the reading rule's second picture) is a picture of its own
    const view = s.card?.o?.view && s.card.o.view !== 'reading' ? `-${s.card.o.view}` : '';
    // (PICTURE THIS's opening picture across the frame and its reveal view are pictures; WHERE's reveal view a map)
    const group = b === 'picture-open' || (b === 'picture' && view) ? 'picture' : b === 'where' && view ? 'map' : 'board';
    return { group, kind: `board:${b}${view}`, layout: `board:${b}${view}` };
  }
  if (shot === 'scores') {
    const v = s.card?.view === 'wall' ? 'scores-wall' : 'scores';
    return { group: 'board', kind: `board:${v}`, layout: `board:${v}` };
  }
  if (shot === 'fact') {
    const b = factBoard(s.card);
    return { group: 'board', kind: `board:${b}`, layout: `board:${b}` };
  }
  if (shot === 'tease') return { group: 'board', kind: 'board:still-to-come', layout: 'board:still-to-come' };
  if (shot === 'full') return { group: 'picture', kind: 'picture', layout: 'picture' };
  if (shot === 'montage' || shot === 'headline') {
    // (a headline frame by what fills it: its picture, its place, the sport's emblem, or the headline alone: card.look)
    const look = s.card?.look ? `:${s.card.look}` : '';
    return { group: 'picture', kind: 'montage', layout: `montage${look}` };
  }
  if (shot === 'map') return { group: 'map', kind: 'map', layout: 'map' };
  if (shot === 'twoway' || shot === 'location' || shot === 'restage') return { group: 'remote', kind: 'remote', layout: `remote:${shot}` };
  if (shot === 'wide') {
    if (framing && TWO_FRAMINGS.has(framing)) return { group: 'presenter', kind: 'two', layout: framing };
    return { group: 'presenter', kind: 'wide', layout: framing && WIDE_FRAMINGS.has(framing) ? framing : 'wide' };
  }
  if (shot === 'close' || shot === 'single') {
    if (framing && TWO_FRAMINGS.has(framing)) return { group: 'presenter', kind: 'two', layout: framing };
    // (over the shoulder: the presenter beside the wall's picture, figure or plate, a shot of its own in the grammar)
    if (framing === 'ots') return { group: 'presenter', kind: 'ots', layout: `ots:${s.focus || ''}` };
    return { group: 'presenter', kind: 'single', layout: `single:${framing || 'close'}:${s.focus || ''}` };
  }
  return { group: 'board', kind: `board:${shot}`, layout: `board:${shot}` };
}

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * The measures of a timeline of visible shots (each { t, shot, framing, focus, card } as it went on air, in order; a
 * shot lasts to the next one's t, the last to `end`). The body runs from the first shot after the open to the end card
 * (furniture is left out of every measure but the length). Returns: length, shots (count), cutsPerMin, median and
 * longest shot, longest studio shot, the share of each group, each kind's count and seconds, the longest run of one
 * kind, back-to-back layouts (two shots in a row of the same layout), the most repeated layout, the fewest and the
 * mean distinct kinds in a `window` s window (sliding by 1 s), and every shot past `maxShot`.
 */
export function varietyReport(shots = [], { end = null, window = 60, maxShot = Infinity, maxStudio = Infinity, limits = null, minShot = 0 } = {}) {
  // (a shot already named, as a recording's trace names it, keeps its names)
  const list = shots.map((x, i) => ({ ...x, ...(x.layout && x.kind && x.group ? { group: x.group, kind: x.kind, layout: x.layout } : shotLayout(x)), len: (i + 1 < shots.length ? shots[i + 1].t : end ?? x.t) - x.t }));
  const body = list.filter((x) => x.group !== 'furniture' && x.len > 0.05);
  const total = body.reduce((a, x) => a + x.len, 0);
  const groups = {};
  const kinds = {};
  const layouts = {};
  for (const x of body) {
    groups[x.group] = (groups[x.group] || 0) + x.len;
    (kinds[x.kind] ||= { n: 0, s: 0 }).n++;
    kinds[x.kind].s += x.len;
    layouts[x.layout] = (layouts[x.layout] || 0) + 1;
  }
  const share = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, r2(v / Math.max(1e-9, total))]));
  const sorted = body.map((x) => x.len).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
  const longest = body.reduce((m, x) => (x.len > (m?.len ?? -1) ? x : m), null);
  const studio = body.filter((x) => x.group === 'presenter');
  const longestStudio = studio.reduce((m, x) => (x.len > (m?.len ?? -1) ? x : m), null);
  let backToBack = 0;
  const repeats = [];
  for (let i = 1; i < body.length; i++) {
    if (body[i].layout === body[i - 1].layout && Math.abs(body[i].t - (body[i - 1].t + body[i - 1].len)) < 0.05) {
      backToBack++;
      repeats.push({ t: r2(body[i].t - (body[0]?.t ?? 0)), layout: body[i].layout });
    }
  }
  // the longest stretch of one kind (back to back shots of the same kind joined: what the viewer sees as "the same")
  let run = null;
  let cur = null;
  for (const x of body) {
    if (cur && cur.kind === x.kind && Math.abs(x.t - (cur.t + cur.len)) < 0.05) cur.len += x.len;
    else cur = { kind: x.kind, t: x.t, len: x.len };
    if (!run || cur.len > run.len) run = { ...cur };
  }
  const mostLayout = Object.entries(layouts).sort((a, b) => b[1] - a[1])[0] || null;
  // distinct kinds in every window of `window` s inside the body (sliding by 1 s)
  const t0 = body.length ? body[0].t : 0;
  const t1 = body.length ? body[body.length - 1].t + body[body.length - 1].len : 0;
  const counts = [];
  let worst = null;
  for (let a = t0; a + window <= t1 + 1e-6; a += 1) {
    const b = a + window;
    const seen = new Set(body.filter((x) => x.t < b && x.t + x.len > a + 0.5 && Math.min(b, x.t + x.len) - Math.max(a, x.t) >= 1).map((x) => x.kind));
    counts.push(seen.size);
    if (!worst || seen.size < worst.n) worst = { at: r2(a - t0), n: seen.size, kinds: [...seen] };
  }
  const minutes = Math.max(1e-9, total / 60);
  const limitOf = (x) => (x.group === 'presenter' ? Math.min(maxStudio, maxShot) : limits?.[x.layout] ?? maxShot);
  const over = body.filter((x) => x.len > limitOf(x) + 0.05).map((x) => ({ t: r2(x.t - t0), layout: x.layout, len: r2(x.len), limit: limitOf(x) }));
  // (the network's floor: every shot but the last before the end card holds `minShot`)
  const under = body.slice(0, -1).filter((x) => x.len < minShot - 0.05).map((x) => ({ t: r2(x.t - t0), layout: x.layout, len: r2(x.len) }));
  return {
    length: r2(total),
    shots: body.length,
    cutsPerMin: r2((body.length - 1) / minutes),
    median: r2(median),
    longest: longest ? { layout: longest.layout, len: r2(longest.len), t: r2(longest.t - t0) } : null,
    longestStudio: longestStudio ? { layout: longestStudio.layout, len: r2(longestStudio.len), t: r2(longestStudio.t - t0) } : null,
    share,
    kinds: Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1].s - a[1].s).map(([k, v]) => [k, { n: v.n, s: r2(v.s) }])),
    distinctKinds: Object.keys(kinds).length,
    distinctLayouts: Object.keys(layouts).length,
    longestRun: run ? { kind: run.kind, len: r2(run.len), t: r2(run.t - t0) } : null,
    backToBack,
    repeats,
    mostRepeated: mostLayout ? { layout: mostLayout[0], n: mostLayout[1] } : null,
    windowMin: worst,
    windowMean: counts.length ? r2(counts.reduce((a, b) => a + b, 0) / counts.length) : 0,
    over,
    under,
  };
}

/** The standard's breaches in a report of programme `id` (VARIETY): [] when it holds. */
export function varietyFaults(report, id) {
  const V = VARIETY[id];
  if (!V || !report) return [];
  const out = [];
  for (const x of report.over || []) out.push(`a shot held ${x.len} s (${x.layout}, at ${x.t} s): the most is ${x.limit} s`);
  for (const x of report.under || []) out.push(`a shot held ${x.len} s (${x.layout}, at ${x.t} s): the network's floor is ${V.minShot} s`);
  if (V.cutsPerMin && report.cutsPerMin > V.cutsPerMin + 1e-9) out.push(`${report.cutsPerMin} cuts a minute: the most is ${V.cutsPerMin}`);
  if (report.backToBack > 0) out.push(`${report.backToBack} layout(s) twice in a row: ${report.repeats.map((r) => `${r.layout} at ${r.t}`).join(', ')}`);
  if (report.windowMin && report.windowMin.n < V.kindsPerWindow) out.push(`only ${report.windowMin.n} kind(s) in the ${V.window} s from ${report.windowMin.at} s (${report.windowMin.kinds.join(', ')}): at least ${V.kindsPerWindow}`);
  return out;
}
