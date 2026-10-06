#!/usr/bin/env node
// Planned-pace report (owner: PACE stream): lays every segment plan of an
// episode (public/js/v2/canvas25d/direction planSegment: shots, gestures,
// looks) on one clock, with the pauses between segments the director will
// hold, and measures what the plan would put on air: shot lengths, cuts per
// minute, identical framings in a row, marked gestures / nods / looks per
// presenter per minute. Deterministic (no browser, no recording): the tests
// (test/pace.test.js) and the lab page use the same functions.
//
//   node tools/pace/plans.mjs episode.json [more.json ...] [--gap legacy|pace] [--json out.json]
//   (an array of episodes, one episode, or /api/queue output)
//
// --gap legacy: the director's old fixed 0.3 s after every segment (the BEFORE
// rhythm); pace (default): public/js/pace.js gapAfter per segment.

import fs from 'node:fs';
import { planSegment } from '../../public/js/v2/canvas25d/direction/index.js';
import { paceFor, gapAfter } from '../../public/js/pace.js';

const STUDIO = new Set(['wide', 'close']);

/** Presenters from config/channel.json (voice rates matter for the estimated timing). */
export function channelPresenters(file = new URL('../../config/channel.json', import.meta.url)) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).presenters || {};
  } catch {
    return {};
  }
}

/**
 * Lay an episode's plans on one clock. → { shots: [{ t, len, shot, framing, focus, seg, beat, card, minLen }],
 * segs: [{ i, type, speaker, t0, dur, gap }], events: [{ t, kind, slot, name, target, seg }], total }
 */
export function layoutEpisode(ep, { presenters = channelPresenters(), gap = 'pace' } = {}) {
  const gapFn = gap === 'legacy' ? () => 0.3 : (i) => gapAfter(ep, i).gap;
  const shots = [];
  const segs = [];
  const events = [];
  let T = 0;
  (ep.segments || []).forEach((seg, i) => {
    const { ctx, events: evs } = planSegment(ep, i, { presenters, gapAfter: gapFn });
    if (!ctx) return;
    const g = gapFn(i);
    const first = shots.length;
    segs.push({ i, type: ctx.type, speaker: ctx.speaker, t0: T, dur: ctx.duration, gap: g, grave: ctx.grave });
    for (const e of evs) {
      if (e.kind === 'shot') {
        const prev = shots[shots.length - 1];
        const studio = !!e.framing;
        // not a cut: the same picture carrying on (CAMERA rule 3); a wide two-shot ignores who speaks;
        // the round-up's world view zooming to item 1 is a move inside one map shot
        if (prev && e.zoom && prev.shot === e.shot) continue;
        const same = prev && prev.shot === e.shot && prev.framing === e.framing && (e.framing === 'wide' || e.framing === 'two' || prev.focus === e.focus) && (studio || prev.seg === i) && (prev.card ?? null) === (e.card ?? null);
        if (same) continue;
        shots.push({ t: T + e.at, len: 0, shot: e.shot, framing: e.framing, focus: e.focus, seg: i, beat: e.beat, card: e.card ?? null, minLen: e.minLen ?? null, move: e.move || null, zoom: !!e.zoom });
      } else events.push({ t: T + e.at, kind: e.kind, slot: e.slot, name: e.name || null, target: e.target || null, seg: i, speaker: ctx.speaker, grave: ctx.grave, why: e.why || null });
    }
    // the director holds the segment's last shot for its minLen (a templated intro: at most 2 s past the voice)
    const last = shots.length > first ? shots[shots.length - 1] : null;
    const hold = last?.minLen ? Math.min(2, Math.max(0, last.t + last.minLen - (T + ctx.duration + g))) : 0;
    T += ctx.duration + g + hold;
  });
  for (let k = 0; k < shots.length; k++) shots[k].len = (k + 1 < shots.length ? shots[k + 1].t : T) - shots[k].t;
  return { shots, segs, events, total: T };
}

const q = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

/** Pace numbers of a layout against the programme profile. */
export function planReport(ep, layout = layoutEpisode(ep)) {
  const P = paceFor(ep.program?.id);
  const body = layout.shots.filter((s) => s.shot !== 'montage');
  const lens = body.map((s) => s.len);
  const montage = layout.shots.filter((s) => s.shot === 'montage').reduce((a, s) => a + s.len, 0);
  const minutes = Math.max(1e-6, (layout.total - montage) / 60);
  let same = 0;
  for (let k = 1; k < body.length; k++) {
    const a = body[k - 1];
    const b = body[k];
    if (STUDIO.has(a.shot) && STUDIO.has(b.shot) && a.framing === b.framing && a.focus === b.focus) same++;
  }
  const slots = Object.keys(ep.cast || {});
  const presenters = {};
  for (const slot of slots) {
    const talk = layout.segs.filter((s) => s.speaker === slot).reduce((a, s) => a + s.dur, 0);
    const listen = layout.segs.filter((s) => s.speaker !== slot).reduce((a, s) => a + s.dur, 0);
    const mine = layout.events.filter((e) => e.slot === slot);
    const marked = mine.filter((e) => e.kind === 'gesture' && e.name !== 'nod' && e.speaker === slot);
    const gaps = [];
    for (let k = 1; k < marked.length; k++) gaps.push(marked[k].t - marked[k - 1].t);
    let repeats = 0;
    for (let k = 1; k < marked.length; k++) if (marked[k].name === marked[k - 1].name) repeats++;
    presenters[slot] = {
      talk: r2(talk),
      marked: marked.length,
      markedPerMin: talk > 0 ? r2((marked.length * 60) / talk) : null,
      minGap: gaps.length ? r2(Math.min(...gaps)) : null,
      repeats,
      listenerNodsPerMin: listen > 0 ? r2((mine.filter((e) => e.kind === 'gesture' && e.name === 'nod' && e.speaker !== slot).length * 60) / listen) : null,
      listenerLooksPerMin: listen > 0 ? r2((mine.filter((e) => e.kind === 'look' && e.speaker !== slot).length * 60) / listen) : null,
    };
  }
  return {
    programId: ep.program?.id,
    episodeId: ep.id,
    total: r2(layout.total),
    shots: { n: body.length, min: r2(lens.length ? Math.min(...lens) : null), p10: r2(q(lens, 0.1)), median: r2(q(lens, 0.5)), p90: r2(q(lens, 0.9)), max: r2(lens.length ? Math.max(...lens) : null) },
    under: body.filter((s) => s.len < P.shots.min - 0.05).map((s) => ({ t: r2(s.t), shot: s.shot, framing: s.framing, beat: s.beat, len: r2(s.len) })),
    cutsPerMin: r2(Math.max(0, body.length - 1) / minutes),
    sameFraming: same,
    moves: layout.shots.filter((s) => s.move).length,
    presenters,
  };
}

// ------------------------------------------------------------------ CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const gi = argv.indexOf('--gap');
  const gap = gi >= 0 ? argv[gi + 1] : 'pace';
  const ji = argv.indexOf('--json');
  const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--gap' && argv[i - 1] !== '--json');
  const out = [];
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    const eps = (Array.isArray(data) ? data : [data]).filter((e) => e && Array.isArray(e.segments));
    for (const ep of eps) {
      const r = planReport(ep, layoutEpisode(ep, { gap }));
      out.push(r);
      const pr = Object.entries(r.presenters).map(([s, p]) => `${s}: ${p.marked} marked (${p.markedPerMin}/min, gap ≥ ${p.minGap}, rep ${p.repeats}), nods ${p.listenerNodsPerMin}/min, looks ${p.listenerLooksPerMin}/min`).join(' | ');
      console.log(`${r.programId} ${r.episodeId} ${r.total}s shots ${r.shots.n} min ${r.shots.min} med ${r.shots.median} max ${r.shots.max} cuts/min ${r.cutsPerMin} under ${r.under.length} same ${r.sameFraming} moves ${r.moves} | ${pr}`);
    }
  }
  if (ji >= 0) fs.writeFileSync(argv[ji + 1], JSON.stringify(out, null, 1));
}
