#!/usr/bin/env node
// Camera and cut analyser (owner: PACE stream): reads a pace trace made with
// `tools/pace/trace.mjs --camera --fps 30` (one row per frame: the shot on air,
// its framing and move, the Stage's camera as drawn, each presenter's voice) and
// measures, per programme, what a broadcast director checks frame by frame:
//
//   shots      visible shots (a re-set of the same camera is no cut), cuts per minute (outside the
//              headline montage), median / p10 / shortest shot, shots under the floor, two cuts close
//              together, the same framing twice (a jump cut: same presenter, under 1.3x of size and
//              under 40 px of head travel), a shot that comes back after a flash (A, B < 2.5 s, A)
//   eyelines   singles framed on their seat's side (A on the left half, B on the right), two singles
//              in a row of different presenters on opposite sides, a look to the partner fired while the
//              speaker is in a single of their own (an eyeline off the frame)
//   words      cuts inside a word (the same word spoken two frames before and after the cut), a segment's
//              opening cut while the previous segment's voice still speaks
//   silence    dead air in the body (no voice for > 1.5 s outside the planned holds), shots that hold
//              over silence (a picture or card on air > 1.2 s after its last word, or cut > 1.2 s before
//              the first), the wait from the open's cut to the first word and from the last word to the
//              end card, the stinger's place against speech
//   moves      every camera move: start against its cut, the ease at both ends (first / last frame speed
//              against the peak), the frame-to-frame acceleration, speed of a landmark (the presenter's
//              neck, the wall's corner) in px per frame, rounded steps that go back (shimmer), a cut that
//              lands while the camera still moves
//
//   node tools/pace/camera.mjs trace-timeline.json [--item episode.json] [--json out.json] [--md out.md]
//
// The geometry is the Stage's (v2/canvas25d/studio/geometry.js), so landmark positions are the pixels drawn.

import fs from 'node:fs';
import { SET, kAt, sxOf, syOf } from '../../public/js/v2/canvas25d/studio/geometry.js';
import { paceFor, gapAfter, shotMax } from '../../public/js/pace.js';

const args = process.argv.slice(2);
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const opt = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
function quant(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const STUDIO = new Set(['wide', 'close']);
const NOT_BODY = new Set(['open', 'endcard', 'ident', 'ad', 'promo', 'standby', 'start', 'countdown']);
const WIDE_FRAMINGS = new Set(['wide', 'two', 'solo-wide']);
const DEAD_AIR = 1.5; // s of silence in the body that reads as dead air
const SILENT_HOLD = 1.2; // s a shot may hold after its last word / before its first
const CLOSE_CUTS = 2.5; // s: two cuts closer than this read as a stutter
const JUMP_SCALE = 1.3; // a change of presenter size under this (and little travel) is a jump cut
const JUMP_TRAVEL = 40; // px of head travel under which a size change under JUMP_SCALE reads as a jump

/** Camera tuple [x, y, z, zoom, hy] → { x, y, z, zoom, hy }. */
const camOf = (a) => (a ? { x: a[0], y: a[1], z: a[2], zoom: a[3], hy: a[4] } : null);

/** Where a presenter's neck base is drawn (screen x, y) and their scale, for a camera. */
function neckOf(cam, slot, solo) {
  const X = solo ? (SET.seatX.solo ?? 0) : slot === 'B' ? SET.seatX.B : SET.seatX.A;
  const k = kAt(cam, SET.presenterZ);
  return { x: sxOf(cam, k, X), y: syOf(cam, k, SET.neckY), k };
}

/** Landmarks drawn by a camera: the focus presenter's neck, the wall's top-left corner, the desk plate. */
function landmarks(cam, slot, solo) {
  const n = neckOf(cam, slot, solo);
  const kw = kAt(cam, SET.wallZ);
  const kd = kAt(cam, SET.deskFrontZ);
  return { neck: [n.x, n.y], wall: [sxOf(cam, kw, SET.screen.x0), syOf(cam, kw, SET.screen.y0)], desk: [sxOf(cam, kd, 0), syOf(cam, kd, 0)], k: n.k };
}

/** The key of what the viewer sees: a studio camera (its framing camera, moves aside), else the shot and its cut. */
function keyOf(r) {
  if (r.base) return `S:${r.base.map((v) => v.toFixed(2)).join(',')}`;
  // WORLD WEATHER's centre cuts between its own shots (the close-up, the wall, the boards) inside one director shot
  if (r.shot === 'weather' && r.weather) return `weather:${r.weather}`;
  return `${r.shot}:${r.since}:${r.card ?? ''}`;
}

function voiced(r) {
  for (const v of Object.values(r.voice || {})) if (v[0] || v[4] > 0.08) return true;
  return false;
}

/** The slot speaking in a row and its word { slot, sentence, word, char } (the first speaking slot). */
function wordAt(r) {
  for (const [slot, v] of Object.entries(r.voice || {})) if (v[0] && v[2] >= 0) return { slot, sentence: v[1], word: v[2], char: v[3] };
  return null;
}

function analyse(file, itemFile) {
  return analyseTimeline(JSON.parse(fs.readFileSync(file, 'utf8')), itemFile ? JSON.parse(fs.readFileSync(itemFile, 'utf8')) : null, file);
}

/** Every programme of a parsed trace timeline (`T.camera` rows, `T.events`), with its episode when given. */
export function analyseTimeline(T, item = null, name = 'timeline') {
  const rows = (T.camera || []).slice().sort((a, b) => a.t - b.t);
  if (!rows.length) throw new Error(`${name}: no camera rows (trace with --camera)`);
  const events = (T.events || []).slice().sort((a, b) => a.t - b.t);
  const dt = rows.length > 1 ? (rows[rows.length - 1].t - rows[0].t) / (rows.length - 1) : 1 / 30;
  // programme spans: playEpisode start → the next playBreak / playEpisode start (or the trace's end)
  const starts = events.filter((e) => (e.ev === 'playEpisode' || e.ev === 'playBreak') && e.phase === 'start');
  const out = [];
  for (let s = 0; s < starts.length; s++) {
    const e = starts[s];
    if (e.ev !== 'playEpisode') continue;
    const t0 = e.t;
    const t1 = s + 1 < starts.length ? starts[s + 1].t : rows[rows.length - 1].t + dt;
    const ep = item && item.id === e.episodeId ? item : null;
    out.push(programme(e, t0, t1, rows.filter((r) => r.t >= t0 && r.t < t1), events.filter((x) => x.t >= t0 - 0.01 && x.t < t1), dt, ep, starts[s + 1]));
  }
  return out;
}

function programme(epEv, t0, t1, rows, events, dt, episode, nextStart) {
  const pid = epEv.programId;
  const P = paceFor(pid);
  const cast = epEv.cast || {};
  const solo = !(cast.A && cast.B);
  const defects = [];
  const flag = (kind, at, what) => defects.push({ kind, at: r2(at), what });
  // ---- visible shots
  const shots = [];
  for (const r of rows) {
    const key = keyOf(r);
    const last = shots[shots.length - 1];
    if (last && last.key === key) {
      last.rows.push(r);
      continue;
    }
    if (last) last.end = r.t;
    shots.push({ key, shot: r.shot, framing: r.spec || r.framing, focus: r.focus, at: r.t, end: null, rows: [r], base: camOf(r.base) });
  }
  if (shots.length) shots[shots.length - 1].end = t1;
  for (const s of shots) s.dur = s.end - s.at;
  const open = shots.find((s) => s.shot === 'open');
  const endcard = shots.find((s) => s.shot === 'endcard');
  const bodyStart = open ? open.end : t0;
  const bodyEnd = endcard ? endcard.at : t1;
  const body = shots.filter((s) => s.at >= bodyStart - 1e-6 && s.at < bodyEnd - 1e-6 && !NOT_BODY.has(s.shot));
  const edit = body.filter((s) => s.shot !== 'montage');
  const cutsAll = body.length;
  const montageTime = body.filter((s) => s.shot === 'montage').reduce((a, s) => a + s.dur, 0);
  const editMinutes = Math.max(1 / 60, (bodyEnd - bodyStart - montageTime) / 60);
  const durs = edit.map((s) => s.dur);
  for (const s of body) {
    s.wide = STUDIO.has(s.shot) && WIDE_FRAMINGS.has(s.framing || (s.shot === 'wide' ? 'wide' : ''));
    s.single = STUDIO.has(s.shot) && !s.wide;
    if (s.base) {
      const n = neckOf(s.base, s.focus, solo);
      s.k = n.k;
      s.headX = n.x;
    }
  }
  // ---- shot grammar
  const minShot = P.shots.min;
  for (const s of edit) {
    if (s.dur < minShot - 0.05) flag('short shot', s.at, `${s.shot}${s.framing ? `/${s.framing}` : ''} ${r2(s.dur)} s (floor ${minShot})`);
    // over the top of its window (pace.js shotMax: maps, pictures, cards, studio shots), 0.5 s of grace
    // (a correspondent's shots: the two-way and LOCATION are studio-like holds, the B-roll a picture)
    // (the round-up's opening map carries its title line over the world view on top of the map maximum, ≤ 3 s, as the
    // planner's capMax and the runtime guard allow: the zoom to item 1 is a move inside that one map shot)
    const legacy = s.shot === 'twoway' || s.shot === 'location' ? 'wide' : s.shot === 'broll' ? 'full' : s.shot;
    const roundupOpen = s.shot === 'map' && events.some((e) => e.ev === 'say' && e.phase === 'start' && e.roundup?.index === 0 && Math.abs(e.t - s.at) < 0.6);
    const max = ['wide', 'close', 'map', 'full', 'fact'].includes(legacy) ? shotMax(pid, legacy) + (roundupOpen ? 3 : 0) : null;
    if (max && s.dur > max + 0.5) flag('over its maximum', s.at, `${s.shot}${s.framing ? `/${s.framing}` : ''} ${r2(s.dur)} s (max ${max})`);
  }
  if ((edit.length - 1) / editMinutes > P.shots.cutsPerMinMax + 0.05) flag('cut rate', bodyStart, `${r2((edit.length - 1) / editMinutes)} cuts a minute (at most ${P.shots.cutsPerMinMax})`);
  const med = quant(durs, 0.5);
  if (med != null && (med < P.shots.median[0] - 0.05 || med > P.shots.median[1] + 0.05)) flag('median shot', bodyStart, `${r2(med)} s (band ${P.shots.median.join('-')})`);
  for (let i = 1; i < body.length; i++) {
    const a = body[i - 1];
    const b = body[i];
    if (b.shot !== 'montage' && b.at - a.at < CLOSE_CUTS && a.shot !== 'montage') flag('cuts close together', b.at, `${a.shot}→${b.shot} ${r2(b.at - a.at)} s apart`);
    // jump cut: two singles of the same presenter, barely a different size or place
    if (a.single && b.single && a.focus === b.focus && a.k && b.k) {
      const ratio = Math.max(a.k, b.k) / Math.min(a.k, b.k);
      const travel = Math.abs(a.headX - b.headX);
      if (ratio < JUMP_SCALE && travel < JUMP_TRAVEL) flag('jump cut', b.at, `${a.framing}→${b.framing} of ${b.focus}: size x${r2(ratio)}, head ${Math.round(travel)} px`);
    }
    if (a.wide && b.wide && Math.abs((a.k || 0) - (b.k || 0)) / Math.max(a.k || 1, b.k || 1) < 0.25) flag('jump cut', b.at, `wide→wide (${a.framing}→${b.framing})`);
    // a flash between two identical shots
    if (i >= 2) {
      const z = body[i - 2];
      if (z.key.startsWith('S:') && z.key === b.key && a.dur < 2.5) flag('repeat after a flash', b.at, `${z.framing} / ${a.shot} ${r2(a.dur)} s / ${b.framing}`);
    }
    if (!STUDIO.has(a.shot) && a.shot === b.shot && a.shot === 'full') flag('same full-screen type twice', b.at, `${a.shot}→${b.shot}`);
    // eyelines: two singles of different presenters on the same side of the frame
    if (a.single && b.single && a.focus !== b.focus && !solo && a.headX && b.headX && Math.sign(a.headX - 192) === Math.sign(b.headX - 192)) flag('eyeline', b.at, `${a.focus} at x ${Math.round(a.headX)} then ${b.focus} at x ${Math.round(b.headX)}: both on one side`);
  }
  for (const s of body) {
    if (!s.single || solo || !s.headX) continue;
    const want = s.focus === 'B' ? 1 : -1;
    if (Math.sign(s.headX - 192) !== want) flag('eyeline', s.at, `${s.focus}'s single puts them on the ${s.headX < 192 ? 'left' : 'right'} (seat side is the ${want < 0 ? 'left' : 'right'})`);
  }
  // looks to the partner fired while that presenter is in a single of their own (an eyeline off the frame)
  const perf = events.filter((e) => e.ev === 'pace' && e.k === 'perf');
  for (const p of perf) {
    if (!(p.kind === 'look' && p.name === 'partner') && !(p.kind === 'gesture' && p.name === 'look_partner')) continue;
    // (a turn to the partner in the last second before the cut to the two-shot reads as the hand-over it is)
    const s = body.find((x) => p.t >= x.at && p.t < x.end);
    if (s && s.single && s.focus === p.slot && !solo && s.end - p.t > 1.2) flag('eyeline', p.t, `${p.slot} looks at the partner in a single of their own (${s.framing}) ${r2(s.end - p.t)} s before the cut`);
  }
  // ---- words and voices at the cuts
  const idx = new Map(rows.map((r, i) => [r, i]));
  for (const s of body) {
    const i = idx.get(s.rows[0]);
    if (!(i >= 2) || i + 1 >= rows.length) continue;
    // the word on the cut's frame was already spoken two frames earlier (66 ms at 30 fps): the cut lands inside it
    const a = wordAt(rows[i - 2]);
    const c = wordAt(rows[i]);
    if (a && c && a.slot === c.slot && a.sentence === c.sentence && a.word === c.word) {
      s.midWord = true;
      flag('cut inside a word', s.at, `${s.shot}${s.framing ? `/${s.framing}` : ''} cuts in ${c.slot}'s word ${c.word} of sentence ${c.sentence}`);
    }
  }
  // the person in a single is the one speaking: another voice at the start of the shot (a late hand-over cut) or
  // running on at its end (an early one), and a single where its presenter never speaks while another does
  for (const s of body) {
    if (!s.single || solo) continue;
    const other = (r) => Object.entries(r.voice || {}).some(([slot, v]) => slot !== s.focus && v[0]);
    const own = (r) => !!r.voice?.[s.focus]?.[0];
    const rs = s.rows;
    let head = 0;
    while (head < rs.length && other(rs[head]) && !own(rs[head])) head++;
    let tail = 0;
    while (tail < rs.length && other(rs[rs.length - 1 - tail]) && !own(rs[rs.length - 1 - tail])) tail++;
    if (!rs.some(own) && rs.some(other)) flag('speaker off screen', s.at, `${s.framing} of ${s.focus} while only another voice speaks (${r2(s.dur)} s)`);
    else {
      if (head * dt > 0.4) flag('speaker off screen', s.at, `${s.framing} of ${s.focus} opens on another voice for ${r2(head * dt)} s`);
      if (tail * dt > 0.4) flag('speaker off screen', s.end, `${s.framing} of ${s.focus} holds ${r2(tail * dt)} s into another voice`);
    }
  }
  // ---- segments: their voice spans (say start/end + voiced rows)
  const says = [];
  for (const e of events) {
    if (e.ev !== 'say' || e.phase !== 'start') continue;
    const end = events.find((x) => x.ev === 'say' && x.phase === 'end' && Math.abs(x.ref - e.t) < 1e-3);
    const span = rows.filter((r) => r.t >= e.t - 0.02 && r.t <= (end ? end.t : t1) + 0.05 && voiced(r));
    says.push({ t: e.t, end: end?.t ?? null, type: e.type, anchor: e.anchor, feature: e.feature, on: span.length ? span[0].t : null, off: span.length ? span[span.length - 1].t + dt : null });
  }
  // a segment's opening cut while the previous voice still speaks
  for (let i = 1; i < says.length; i++) {
    const p = says[i - 1];
    const n = says[i];
    if (p.off == null || n.on == null) continue;
    const cut = body.find((s) => s.at > p.off - 3 && s.at <= n.on + 0.6 && s.at >= p.t);
    if (cut && cut.at < p.off - 0.1 && cut.at > n.t - 0.5) flag('voice over the cut', cut.at, `the cut for segment ${i} (${n.type}) lands ${r2(p.off - cut.at)} s before the previous voice ends`);
  }
  // ---- silence
  const bodyRows = rows.filter((r) => r.t >= bodyStart && r.t < bodyEnd);
  const silences = [];
  let run = null;
  for (const r of bodyRows) {
    if (!voiced(r)) run ||= { from: r.t };
    else if (run) {
      run.to = r.t;
      silences.push(run);
      run = null;
    }
  }
  if (run) silences.push({ from: run.from, to: bodyEnd });
  const firstVoice = bodyRows.find(voiced);
  const lastVoice = [...bodyRows].reverse().find(voiced);
  for (const sl of silences) {
    const len = sl.to - sl.from;
    // the planned waits: from the open's cut to the first word, the sign-off's hold before the end card
    if (firstVoice && sl.to <= firstVoice.t + 1e-6) continue;
    if (lastVoice && sl.from >= lastVoice.t) continue;
    const allowed = Math.max(DEAD_AIR, maxGap(P) + 0.35);
    if (len > allowed) flag('dead air', sl.from, `${r2(len)} s without a voice (allowed ${r2(allowed)})`);
  }
  // shots holding over silence: a non-studio shot on air long after its last word, or a cut long before the first word
  for (const s of body) {
    const inRows = s.rows.filter((r) => r.t < bodyEnd);
    if (!inRows.length) continue;
    const v = inRows.filter(voiced);
    if (!v.length) {
      if (s.dur > SILENT_HOLD && s.shot !== 'montage') flag('shot over silence', s.at, `${s.shot}${s.framing ? `/${s.framing}` : ''} ${r2(s.dur)} s with no voice`);
      continue;
    }
    const before = v[0].t - s.at;
    const after = Math.min(s.end, bodyEnd) - (v[v.length - 1].t + dt);
    s.silentHead = before;
    s.silentTail = after;
    const last = s.end >= bodyEnd - 1e-6;
    if (before > SILENT_HOLD && s.at > (firstVoice?.t ?? 0)) flag('shot over silence', s.at, `${s.shot}${s.framing ? `/${s.framing}` : ''} cut ${r2(before)} s before its first word`);
    // (a shot may carry the pause after its line: the profile's longest, a block's, plus a frame or two)
    if (after > Math.max(SILENT_HOLD, maxGap(P) + 0.1) + (last ? P.holds.signoff : 0)) flag('shot over silence', s.end, `${s.shot}${s.framing ? `/${s.framing}` : ''} holds ${r2(after)} s after its last word`);
  }
  // ---- the open and the close
  const afterOpen = firstVoice && open ? firstVoice.t - open.end : null;
  const stinger = events.filter((e) => e.ev === 'stinger').map((e) => e.at ?? e.t);
  const endSting = endcard ? stinger.filter((x) => x <= endcard.at + 0.01 && x >= endcard.at - 1).pop() : null;
  const beforeEnd = lastVoice && endSting != null ? endSting - (lastVoice.t + dt) : null;
  if (afterOpen != null && Math.abs(afterOpen - P.open.firstWord) > 0.35) flag('wait after the open', open.end, `${r2(afterOpen)} s from the open's cut to the first word (profile ${P.open.firstWord})`);
  if (beforeEnd != null && Math.abs(beforeEnd - P.holds.signoff) > 0.4) flag('wait before the end card', lastVoice.t, `${r2(beforeEnd)} s from the last word to the stinger (profile ${P.holds.signoff})`);
  for (const st of stinger) {
    const during = rows.filter((r) => r.t >= st && r.t < st + 0.8 && voiced(r));
    if (during.length > 2) flag('stinger over speech', st, `${r2(during.length * dt)} s of voice under the stinger`);
  }
  const endcardHold = endcard ? Math.min(endcard.end, t1) - endcard.at : null;
  // ---- moves
  const moves = [];
  let m = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const has = r.move && r.cam && r.base;
    if (has && (!m || m.since !== r.moveSince || m.key !== keyOf(r))) {
      if (m) moves.push(m);
      m = { since: r.moveSince, key: keyOf(r), spec: r.move, framing: r.spec, focus: r.focus, rows: [] };
    }
    if (has) m.rows.push(r);
    else if (m) {
      // the move taken off the shot still on air (no cut): the camera snaps back to its framing
      const prev = m.rows[m.rows.length - 1];
      if (r.base && keyOf(r) === m.key) {
        const a = landmarks(camOf(prev.cam), prev.focus, solo);
        const b = landmarks(camOf(r.base), r.focus, solo);
        const jump = Math.max(Math.abs(a.neck[0] - b.neck[0]), Math.abs(a.neck[1] - b.neck[1]), Math.abs(a.wall[0] - b.wall[0]), Math.abs(a.wall[1] - b.wall[1]));
        if (jump >= 0.75) flag('move pops back', r.t, `${m.spec?.[0]} on ${m.framing} removed on air: the camera jumps ${r2(jump)} px back to its framing`);
      } else m.cutAfter = r.t;
      moves.push(m);
      m = null;
    }
  }
  if (m) moves.push(m);
  const moveRows = moves.map((mv) => moveStats(mv, shots, solo, dt, flag));
  // ---- summary
  const gapRows = [];
  if (episode) {
    for (let i = 1; i < says.length; i++) {
      const p = says[i - 1];
      const n = says[i];
      if (p.off == null || n.on == null) continue;
      const g0 = gapAfter(episode, i - 1);
      // (WORLD WEATHER: the director's own short breath between weather segments, pace gaps.weather)
      const g = p.type === 'weather' && Number.isFinite(P.gaps.weather) ? { kind: 'weather', gap: P.gaps.weather } : g0;
      gapRows.push({ i, kind: g.kind, target: g.gap, aired: r2(n.on - p.off) });
      if (n.on - p.off > g.gap + 0.6) flag('gap too long', p.off, `${g.kind} pause ${r2(n.on - p.off)} s (profile ${g.gap})`);
      if (n.on - p.off < g.gap - 0.25) flag('gap too short', p.off, `${g.kind} pause ${r2(n.on - p.off)} s (profile ${g.gap})`);
    }
  }
  return {
    programId: pid,
    episodeId: epEv.episodeId,
    length: r2(t1 - t0),
    body: r2(bodyEnd - bodyStart),
    shots: edit.length,
    cuts: cutsAll,
    cutsPerMin: r2((edit.length - 1) / editMinutes),
    shot: { min: r2(Math.min(...durs)), p10: r2(quant(durs, 0.1)), median: r2(quant(durs, 0.5)), max: r2(Math.max(...durs)) },
    target: { median: P.shots.median, cutsPerMinMax: P.shots.cutsPerMinMax, min: minShot },
    afterOpen: r2(afterOpen),
    beforeEndcard: r2(beforeEnd),
    endcardHold: r2(endcardHold),
    silences: silences.filter((s) => s.to - s.from > 1.0).map((s) => ({ from: r2(s.from), len: r2(s.to - s.from) })),
    moves: moveRows,
    gaps: gapRows,
    defects,
    count: defects.reduce((a, d) => ((a[d.kind] = (a[d.kind] || 0) + 1), a), {}),
    list: edit.map((s) => ({ at: r2(s.at), dur: r2(s.dur), shot: s.shot, framing: s.framing, focus: s.focus, k: r2(s.k), headX: s.headX ? Math.round(s.headX) : null })),
    next: nextStart ? { ev: nextStart.ev, at: r2(nextStart.t) } : null,
  };
}

const maxGap = (P) => Math.max(...Object.entries(P.gaps).filter(([k]) => k !== 'jitter').map(([, v]) => v));

/** One camera move, frame by frame: ease at both ends, accelerations, landmark speed, rounded steps that go back. */
function moveStats(mv, shots, solo, dt, flag) {
  const rows = mv.rows;
  const lm = rows.map((r) => landmarks(camOf(r.cam), r.focus, solo));
  const base = landmarks(camOf(rows[0].base), rows[0].focus, solo);
  const scale = lm.map((l) => l.k / base.k);
  // the neck's screen position per frame (the presenter: what the eye follows), the wall corner (the set)
  const sp = (key) => lm.map((l, i) => (i ? Math.hypot(l[key][0] - lm[i - 1][key][0], l[key][1] - lm[i - 1][key][1]) : 0));
  const vNeck = sp('neck');
  const vWall = sp('wall');
  const moving = vNeck.map((v, i) => i > 0 && (v > 1e-4 || vWall[i] > 1e-4));
  const first = moving.indexOf(true);
  const last = moving.lastIndexOf(true);
  const shot = shots.find((s) => rows[0].t >= s.at && rows[0].t < s.end);
  const cutAt = shot ? shot.at : null;
  const nextCut = shot ? shot.end : null;
  const peak = Math.max(...vNeck, ...vWall);
  const res = { at: r2(rows[0].t), framing: mv.framing, focus: mv.focus, type: mv.spec?.[0], amount: mv.spec?.[1], delay: mv.spec?.[2], dur: mv.spec?.[3], scaleEnd: r3(scale[scale.length - 1]), peakPxPerFrame: r3(peak), frames: rows.length };
  if (first < 0) {
    res.note = 'no motion on air';
    return res;
  }
  const v = vNeck.map((x, i) => Math.max(x, vWall[i]));
  res.startAfterCut = cutAt != null ? r2(rows[first].t - dt - cutAt) : null;
  res.endBeforeCut = nextCut != null ? r2(nextCut - rows[last].t) : null;
  res.startSpeed = r3(v[first] / peak); // share of the peak on the first moving frame (an ease starts near 0)
  res.endSpeed = r3(v[last] / peak);
  let jerk = 0;
  for (let i = first + 1; i <= last; i++) jerk = Math.max(jerk, Math.abs(v[i] - v[i - 1]) / peak);
  res.maxStepChange = r3(jerk);
  // rounded pixel steps of the neck and the wall corner: any that goes back is a shimmer
  let back = 0;
  for (const key of ['neck', 'wall', 'desk']) {
    let dir = 0;
    for (let i = 1; i < lm.length; i++) {
      for (const ax of [0, 1]) {
        const d = Math.round(lm[i][key][ax]) - Math.round(lm[i - 1][key][ax]);
        if (!d) continue;
        if (dir && Math.sign(d) !== Math.sign(dir) && ax === 0) back++;
        if (ax === 0) dir = d;
      }
    }
  }
  res.stepsBack = back;
  // the presenters are drawn at whole head pixels (camera.js quantScale): in a wide a move across a bucket edge makes
  // them jump a whole 4.5 % in one frame while the set glides
  const q = lm.map((l) => Math.round(22 * l.k));
  const jumps = q.filter((h, i) => i > 0 && h !== q[i - 1] && Math.min(h, q[i - 1]) < 40).length;
  res.sizeJumps = jumps;
  if (jumps) flag('presenters jump in size', rows[q.findIndex((h, i) => i > 0 && h !== q[i - 1])].t, `${mv.spec?.[0]} on ${mv.framing}: the presenters' heads step ${q[0]} → ${q[q.length - 1]} px mid-move (${Math.round((100 * Math.abs(q[q.length - 1] - q[0])) / q[0])} % in one frame)`);
  // a move still under way when the shot is cut (it never settles on screen)
  const cutWhileMoving = last === rows.length - 1 && mv.cutAfter != null && v[last] > 0.15 * peak;
  res.cutWhileMoving = cutWhileMoving;
  const where = `${mv.spec?.[0]} on ${mv.framing}`;
  if (res.startAfterCut != null && res.startAfterCut < 0.45) flag('move starts on the cut', rows[first].t, `${where} starts ${res.startAfterCut} s after its cut (0.5 s at least)`);
  if (res.startSpeed > 0.35) flag('move starts abruptly', rows[first].t, `${where}: first frame at ${Math.round(res.startSpeed * 100)} % of its peak speed`);
  if (cutWhileMoving) flag('move cut before it settles', rows[last].t, `${where} still moving at ${Math.round((v[last] / peak) * 100)} % of its peak when the shot is cut`);
  else if (res.endSpeed > 0.35) flag('move stops dead', rows[last].t, `${where}: last moving frame at ${Math.round(res.endSpeed * 100)} % of its peak speed`);
  if (res.endBeforeCut != null && res.endBeforeCut < 0.45 && !cutWhileMoving) flag('move ends on the cut', rows[last].t, `${where} ends ${res.endBeforeCut} s before the next cut (0.5 s at least)`);
  if (res.maxStepChange > 0.5) flag('move jerks', rows[first].t, `${where}: speed changes by ${Math.round(res.maxStepChange * 100)} % of its peak in one frame`);
  if (peak * (dt > 0 ? 1 / 60 / dt : 1) > 1.0001) flag('move too fast', rows[first].t, `${where}: ${r2(peak / (dt * 60))} px per 60 fps frame (1 at most)`);
  if (back) flag('move shimmers', rows[first].t, `${where}: ${back} rounded steps go back`);
  return res;
}

// ------------------------------------------------------------------ report
/** The markdown report of analysed programmes. */
export function reportMarkdown(all) {
const md = [];
for (const p of all) {
  md.push(`### ${p.programId} (${p.episodeId})`, '');
  md.push(`length ${p.length} s, body ${p.body} s; ${p.shots} shots, ${p.cutsPerMin} cuts/min (max ${p.target.cutsPerMinMax}); shot min ${p.shot.min} / p10 ${p.shot.p10} / median ${p.shot.median} (target ${p.target.median.join('-')}) / max ${p.shot.max}`);
  md.push(`open → first word ${p.afterOpen} s; last word → end-card stinger ${p.beforeEndcard} s; end card ${p.endcardHold} s; moves ${p.moves.length}`);
  for (const mv of p.moves) md.push(`- move @${mv.at} ${mv.type} ${mv.amount} on ${mv.framing}: after cut ${mv.startAfterCut} s, before next cut ${mv.endBeforeCut} s, start ${mv.startSpeed}, end ${mv.endSpeed}, step change ${mv.maxStepChange}, peak ${mv.peakPxPerFrame} px/frame, back ${mv.stepsBack}${mv.cutWhileMoving ? ', CUT WHILE MOVING' : ''}${mv.note ? ` (${mv.note})` : ''}`);
  md.push('', `defects (${p.defects.length}): ${Object.entries(p.count).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  for (const d of p.defects) md.push(`- ${d.at} s ${d.kind}: ${d.what}`);
  md.push('');
}
return md.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = [];
  for (const f of files) all.push(...analyse(f, opt('item')));
  const text = reportMarkdown(all);
  if (opt('md')) fs.writeFileSync(opt('md'), text);
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(all, null, 1));
  if (!args.includes('--quiet')) console.log(text);
}
