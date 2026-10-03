#!/usr/bin/env node
// Pace analyser (owner: PACE stream): measures what runs too fast (or too slow)
// in a recorded programme. Reads the showcase recorder's <out>-timeline.json
// (tools/showcase/record-show.mjs) and, when the recorder's work folder is still
// there, its audio stems (<out>.work/{speechbus,voice,mix}.wav) for real voice
// onsets/offsets and dead air. Every number is compared with the programme's
// profile in public/js/pace.js (the targets), so before/after tables are one run.
//
//   node tools/pace/analyse.mjs show-timeline.json [more...] [--md out.md] [--json out.json]
//        [--server-log server.log] [--no-audio] [--quiet]
//
// What it reports per programme (docs/PACING.md explains each target):
//   length (open's first frame → end card's last), shots (min / p10 / median / p90 / max,
//   cuts per minute outside montages, shots under the minimum, same framing twice in a row,
//   same full-screen type runs), camera moves, dwell per shot type (map / picture / fact /
//   montage / studio), captions (page time vs chars per second), the pauses between
//   utterances by kind (story, hand-over, chat turn, block, before And finally...), speech
//   rate, open → first word, last word → end card, montage frames vs the teaser lines,
//   stingers and the shot before each, strap in-delay and flips, ticker holds, gestures and
//   listener reactions per presenter per minute, music cue changes, studio holds without any
//   move or reaction, silences in the programme body; breaks (ident, ads, promo).
// Pace traces (`ev: 'pace'`, public/js/pace.js paceTrace) add framings, moves, ticker pushes
// and the rig's gestures/looks; without them those rows read "n/a".

import fs from 'node:fs';
import path from 'node:path';
import { paceFor, gapKind, wordCount, CHANNEL } from '../../public/js/pace.js';

// ------------------------------------------------------------------ stats
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
function quant(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
function stats(arr) {
  const a = arr.filter(Number.isFinite);
  if (!a.length) return { n: 0 };
  return { n: a.length, min: r2(Math.min(...a)), p10: r2(quant(a, 0.1)), median: r2(quant(a, 0.5)), p90: r2(quant(a, 0.9)), max: r2(Math.max(...a)), mean: r2(a.reduce((x, y) => x + y, 0) / a.length) };
}

// ------------------------------------------------------------------ audio (streaming RMS)
/** RMS envelope (dBFS) of a float32/int16 WAV in `hop`-second windows, read in chunks (no full load). */
export function wavEnvelope(file, hop = 0.02) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(4096);
    fs.readSync(fd, head, 0, 4096, 0);
    if (head.toString('ascii', 0, 4) !== 'RIFF') return null;
    let o = 12;
    let fmt = null;
    let dataOff = -1;
    let dataLen = 0;
    while (o < 4088) {
      const id = head.toString('ascii', o, o + 4);
      const size = head.readUInt32LE(o + 4);
      if (id === 'fmt ') fmt = { format: head.readUInt16LE(o + 8), ch: head.readUInt16LE(o + 10), sr: head.readUInt32LE(o + 12), bits: head.readUInt16LE(o + 22) };
      if (id === 'data') {
        dataOff = o + 8;
        dataLen = size;
        break;
      }
      o += 8 + size + (size % 2);
    }
    if (!fmt || dataOff < 0) return null;
    const bps = fmt.bits / 8;
    const frame = bps * fmt.ch;
    const hopFrames = Math.max(1, Math.round(fmt.sr * hop));
    const stat = fs.fstatSync(fd);
    const total = Math.floor(Math.min(dataLen || Infinity, stat.size - dataOff) / frame);
    const out = new Float32Array(Math.ceil(total / hopFrames));
    const chunkFrames = hopFrames * 512;
    const buf = Buffer.alloc(chunkFrames * frame);
    let w = 0;
    for (let f0 = 0; f0 < total; f0 += chunkFrames) {
      const n = Math.min(chunkFrames, total - f0);
      fs.readSync(fd, buf, 0, n * frame, dataOff + f0 * frame);
      for (let h = 0; h < n; h += hopFrames) {
        let acc = 0;
        const m = Math.min(hopFrames, n - h);
        for (let k = 0; k < m; k++) {
          let v = 0;
          for (let c = 0; c < fmt.ch; c++) {
            const p = (h + k) * frame + c * bps;
            const x = fmt.format === 3 ? buf.readFloatLE(p) : buf.readInt16LE(p) / 32768;
            if (Math.abs(x) > Math.abs(v)) v = x;
          }
          acc += v * v;
        }
        out[w++] = 10 * Math.log10(acc / m + 1e-12);
      }
    }
    return { db: out.subarray(0, w), hop };
  } finally {
    fs.closeSync(fd);
  }
}

/** Element-wise max of two envelopes (same hop). */
function maxEnv(a, b) {
  if (!a) return b;
  if (!b) return a;
  const n = Math.max(a.db.length, b.db.length);
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) db[i] = Math.max(a.db[i] ?? -120, b.db[i] ?? -120);
  return { db, hop: a.hop };
}

/** Runs of the envelope below `thr` dB inside [t0, t1] longer than `minLen` s. */
function silentRuns(env, t0, t1, thr, minLen) {
  const out = [];
  if (!env) return out;
  const i0 = Math.max(0, Math.floor(t0 / env.hop));
  const i1 = Math.min(env.db.length, Math.ceil(t1 / env.hop));
  let start = -1;
  for (let i = i0; i <= i1; i++) {
    const quiet = i < i1 && env.db[i] < thr;
    if (quiet && start < 0) start = i;
    else if (!quiet && start >= 0) {
      const len = (i - start) * env.hop;
      if (len >= minLen) out.push({ from: r2(start * env.hop), to: r2(i * env.hop), len: r2(len) });
      start = -1;
    }
  }
  return out;
}

/** First / last voiced instant of an envelope inside [t0, t1] (null when silent). */
function voicedSpan(env, t0, t1, thr) {
  if (!env) return null;
  const i0 = Math.max(0, Math.floor(t0 / env.hop));
  const i1 = Math.min(env.db.length - 1, Math.ceil(t1 / env.hop));
  let a = -1;
  let b = -1;
  for (let i = i0; i <= i1; i++) {
    if (env.db[i] >= thr) {
      if (a < 0) a = i;
      b = i;
    }
  }
  return a < 0 ? null : { on: a * env.hop, off: (b + 1) * env.hop };
}

// ------------------------------------------------------------------ timeline helpers
const STUDIO = new Set(['wide', 'close']);
const FULLSCREEN = new Set(['full', 'map', 'fact']);
const NOT_BODY = new Set(['open', 'endcard', 'ident', 'ad', 'promo', 'standby', 'start', 'holding']);

function loadTimeline(file) {
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  t.events = (t.events || []).slice().sort((a, b) => a.t - b.t);
  return t;
}

function shotsOf(events) {
  const out = [];
  for (const e of events) {
    if (e.ev !== 'shot') continue;
    const at = Number.isFinite(e.at) ? e.at : e.t;
    const last = out[out.length - 1];
    if (last && Math.abs(last.at - at) < 1e-4 && last.shot === e.shot) continue;
    out.push({ shot: e.shot, at, focus: e.focus, storyId: e.storyId, card: e.card, programId: e.programId });
  }
  for (let i = 0; i < out.length; i++) out[i].dur = i + 1 < out.length ? out[i + 1].at - out[i].at : null;
  return out;
}

/** Programme spans: open cut → end of the end card (the next shot after it). */
function programmesOf(t, shots) {
  const eps = t.events.filter((e) => e.ev === 'playEpisode' && e.phase === 'start');
  const out = [];
  for (const ep of eps) {
    const open = shots.find((s) => s.shot === 'open' && s.at >= ep.t - 1);
    if (!open) continue;
    const end = shots.find((s) => s.shot === 'endcard' && s.at > open.at);
    const after = end ? shots.find((s) => s.at > end.at + 1e-3) : null;
    const endT = after ? after.at : end ? Math.min(t.meta?.seconds ?? Infinity, end.at + 30) : t.meta?.seconds ?? null;
    out.push({ ep, open, endcard: end, t0: open.at, t1: endT, partial: !end || !after });
  }
  return out;
}

function breaksOf(t, shots) {
  const out = [];
  const starts = t.events.filter((e) => e.ev === 'playBreak' && e.phase === 'start');
  for (const b of starts) {
    const end = t.events.find((e) => e.ev === 'playBreak' && e.phase === 'end' && Math.abs(e.ref - b.t) < 1e-3);
    const t1 = end ? end.t : null;
    const inside = shots.filter((s) => s.at >= b.t - 0.01 && (t1 == null || s.at < t1));
    const ident = inside.find((s) => s.shot === 'ident');
    const ads = inside.filter((s) => s.shot === 'ad' && s.card?.ad !== 'black').map((s) => ({ ad: s.card?.ad, dur: r2(s.dur) }));
    // the black between break elements (ads/index.js BREAK_BLACK; pace CHANNEL.breaks.blackGap)
    const blacks = inside.filter((s) => s.shot === 'ad' && s.card?.ad === 'black').map((s) => r2(s.dur));
    const promo = inside.find((s) => s.shot === 'promo');
    const stingers = t.events.filter((e) => e.ev === 'stinger' && e.at >= b.t - 0.01 && (t1 == null || e.at < t1)).length;
    out.push({ at: r2(b.t), filler: !!b.filler, length: t1 != null ? r2(t1 - b.t) : null, ident: ident ? r2(ident.dur) : null, ads, blacks, promo: promo ? r2(t1 != null ? t1 - promo.at : promo.dur) : null, stingers });
  }
  return out;
}

// ------------------------------------------------------------------ one programme
function analyseProgramme(t, prog, shots, env) {
  const { ep, t0, t1 } = prog;
  const pid = ep.programId;
  const P = paceFor(pid);
  const inSpan = (x) => x >= t0 - 1e-3 && x < t1 - 1e-3;
  const ev = t.events.filter((e) => inSpan(e.t));
  const pace = ev.filter((e) => e.ev === 'pace');
  let mine = shots.filter((s) => inSpan(s.at)).map((s) => ({ ...s }));
  for (const s of mine) if (s.dur == null || s.at + s.dur > t1) s.dur = t1 - s.at;
  // framings / moves from the pace traces (the Stage logs each cut it sees)
  const cuts = pace.filter((e) => e.k === 'cut');
  // What the viewer sees: with the Stage's cut traces, a studio shot the director re-set on the same
  // camera (a focus-only hand-over on the wide two-shot) is no cut; it extends the shot on air.
  if (cuts.length) {
    const seen = [];
    for (const s of mine) {
      const prev = seen[seen.length - 1];
      const visible = cuts.some((c) => Math.abs(c.t - s.at) < 0.35);
      if (prev && STUDIO.has(s.shot) && STUDIO.has(prev.shot) && !visible) {
        prev.dur += s.dur;
        prev.recuts = (prev.recuts || 0) + 1;
        continue;
      }
      seen.push(s);
    }
    mine = seen;
  } else {
    // no Stage traces (older recordings): on the v2 path a director re-set from one wide to another (a focus-only
    // hand-over) keeps the same two-shot camera, so count it as one shot, as the viewer saw it
    const seen = [];
    for (const s of mine) {
      const prev = seen[seen.length - 1];
      if (prev && s.shot === 'wide' && prev.shot === 'wide') {
        prev.dur += s.dur;
        prev.recuts = (prev.recuts || 0) + 1;
        continue;
      }
      seen.push(s);
    }
    mine = seen;
  }
  for (const s of mine) {
    const c = cuts.find((x) => Math.abs(x.t - s.at) < 0.25 && x.shot === s.shot) || cuts.find((x) => x.t >= s.at - 0.02 && x.t < s.at + (s.dur || 0) && x.shot === s.shot);
    if (c) {
      s.framing = c.framing ?? null;
      s.move = c.move ?? null;
    }
  }
  const body = mine.filter((s) => !NOT_BODY.has(s.shot));
  const bodyNoMontage = body.filter((s) => s.shot !== 'montage' && s.shot !== 'breakingCard');
  const bodyStart = body.length ? body[0].at : t0;
  const bodyEnd = prog.endcard ? prog.endcard.at : t1;
  const montageTime = body.filter((s) => s.shot === 'montage').reduce((a, s) => a + s.dur, 0);
  const editTime = Math.max(1, bodyEnd - bodyStart - montageTime);
  const durs = bodyNoMontage.map((s) => s.dur);
  const under = bodyNoMontage.filter((s) => s.dur < P.shots.min - 0.05).map((s) => ({ at: r2(s.at), shot: s.shot, framing: s.framing ?? null, dur: r2(s.dur) }));
  // repetition: identical studio framing (or shot+focus when no trace) twice in a row; same full-screen type runs
  const repeats = [];
  let typeRun = 1;
  let worstRun = 1;
  for (let i = 1; i < bodyNoMontage.length; i++) {
    const a = bodyNoMontage[i - 1];
    const b = bodyNoMontage[i];
    if (STUDIO.has(a.shot) && STUDIO.has(b.shot) && a.shot === b.shot && (a.framing ?? a.shot) === (b.framing ?? b.shot) && a.focus === b.focus && b.at - (a.at + a.dur) < 0.05) repeats.push({ at: r2(b.at), shot: b.shot, framing: b.framing ?? null, focus: b.focus });
    const roundup = b.card?.kind === 'map' && a.card?.kind === 'map' && a.storyId !== b.storyId;
    typeRun = FULLSCREEN.has(b.shot) && b.shot === a.shot && !roundup ? typeRun + 1 : 1;
    worstRun = Math.max(worstRun, typeRun);
  }
  const byType = {};
  for (const s of body) (byType[s.shot] ||= []).push(s.dur);
  const dwell = Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, stats(v)]));

  // utterances: say start/end + the recorded clip (or harness speech) + the voice stem
  const says = [];
  for (const e of t.events) {
    if (e.ev !== 'say' || e.phase !== 'start' || !inSpan(e.t)) continue;
    const end = t.events.find((x) => x.ev === 'say' && x.phase === 'end' && Math.abs(x.ref - e.t) < 1e-3);
    const clip = t.events.find((x) => x.ev === 'clip' && x.at >= e.t - 0.05 && x.at <= e.t + 1.5);
    let a = clip ? clip.at : null;
    let b = clip ? clip.at + clip.duration : null;
    if (!clip) {
      const sp = (t.speech || []).filter((s) => s.start >= e.t - 0.05 && s.start <= (end ? end.t : e.t + 60) + 0.3 && s.volume > 0);
      if (sp.length) {
        a = Math.min(...sp.map((s) => s.start + (s.firstWord || 0)));
        b = Math.max(...sp.map((s) => s.end));
      }
    }
    if (a == null) {
      a = e.t;
      b = end ? end.t : e.t;
    }
    const v = voicedSpan(env, a - 0.05, b + 0.1, -45);
    says.push({ t: e.t, end: end?.t ?? null, type: e.type, anchor: e.anchor, feature: e.feature, roundup: e.roundup, emotion: e.emotion, breaking: e.breaking, text: e.text || '', words: e.audio?.words ?? wordCount(e.text), on: v ? v.on : a, off: v ? v.off : b, measured: !!v });
  }
  const gaps = [];
  for (let i = 1; i < says.length; i++) {
    const p = says[i - 1];
    const n = says[i];
    const kind = gapKind(p, n);
    // a breaking card or another full-screen card between them is not a voice pause
    const card = mine.some((s) => s.shot === 'breakingCard' && s.at > p.off && s.at < n.on);
    gaps.push({ kind: card ? 'breakingCard' : kind, gap: r2(n.on - p.off), at: r2(p.off), target: P.gaps[kind] ?? null });
  }
  const gapsByKind = {};
  for (const g of gaps) (gapsByKind[g.kind] ||= []).push(g.gap);
  const gapStats = Object.fromEntries(Object.entries(gapsByKind).map(([k, v]) => [k, { ...stats(v), target: P.gaps[k] ?? null }]));
  // speech rate (words per minute of voiced time) and inner pauses
  const wpm = says.filter((s) => s.off - s.on > 2 && s.words > 3).map((s) => (s.words * 60) / (s.off - s.on));
  const inner = [];
  const innerLong = [];
  for (const s of says) {
    if (!env) break;
    for (const run of silentRuns(env, s.on, s.off, -45, 0.12)) {
      inner.push(run.len);
      if (run.len > 1.5) innerLong.push({ ...run, type: s.type });
    }
  }

  // captions
  const subs = ev.filter((e) => e.ev === 'subtitle');
  const caps = [];
  for (let i = 0; i < subs.length; i++) {
    if (!subs[i].text) continue;
    const next = subs[i + 1]?.t ?? t1;
    const dur = next - subs[i].t;
    caps.push({ dur, cps: subs[i].text.length / Math.max(0.1, dur), chars: subs[i].text.length });
  }

  // strap
  const straps = ev.filter((e) => e.ev === 'strap');
  const strapOn = [];
  let flips = 0;
  let outIn = 0;
  let cur = null;
  for (const e of straps) {
    if (e.headline && cur && cur.headline !== e.headline) flips++;
    if (e.headline && !cur) outIn++;
    if (cur && (!e.headline || cur.headline !== e.headline)) strapOn.push(e.t - cur.t);
    cur = e.headline ? e : null;
  }
  if (cur) strapOn.push(bodyEnd - cur.t);
  // the strap is SET with the story; it wipes in at lowerThird.since (the director's pace trace `at`)
  const strapTraces = pace.filter((e) => e.k === 'strap' && Number.isFinite(e.at));
  // without the director's trace the wipe-in instant is unknown (the strap is set before it enters)
  const strapDelay = (strapTraces.length ? straps : [])
    .filter((e) => e.headline)
    .map((e) => {
      const story = [...says].reverse().find((s) => s.t <= e.t + 0.05);
      const cut = [...mine].reverse().find((s) => s.at <= e.t + 0.05);
      const tr = strapTraces.find((x) => Math.abs(x.t - e.t) < 0.3);
      const inAt = tr ? tr.at : e.t;
      return story && cut ? inAt - Math.max(cut.at, story.t) : null;
    })
    .filter(Number.isFinite);

  // ticker (pace traces)
  const pushes = pace.filter((e) => e.k === 'ticker');
  const tickerHolds = [];
  for (let i = 1; i < pushes.length; i++) tickerHolds.push(pushes[i].t - pushes[i - 1].t);

  // gestures / looks (pace traces from the rig's cue clock)
  const perf = pace.filter((e) => e.k === 'perf');
  const slots = Object.keys(ep.cast || {});
  const speakingOf = (slot) => says.filter((s) => s.anchor === slot).reduce((a, s) => a + Math.max(0, s.off - s.on), 0);
  const speaking = (slot, x) => says.some((s) => s.anchor === slot && x >= s.on - 0.3 && x <= s.off + 0.3);
  const presenters = {};
  for (const slot of slots) {
    const list = perf.filter((e) => e.slot === slot);
    const g = list.filter((e) => e.kind === 'gesture');
    const marked = g.filter((e) => e.name !== 'nod');
    const markedTalk = marked.filter((e) => speaking(slot, e.t));
    const nodsListen = g.filter((e) => e.name === 'nod' && !speaking(slot, e.t));
    const looksListen = list.filter((e) => e.kind === 'look' && !speaking(slot, e.t));
    const talk = speakingOf(slot);
    const listen = Math.max(0, says.filter((s) => s.anchor !== slot).reduce((a, s) => a + (s.off - s.on), 0));
    let rep = 0;
    for (let i = 1; i < marked.length; i++) if (marked[i].name === marked[i - 1].name) rep++;
    const gapsG = [];
    for (let i = 1; i < markedTalk.length; i++) gapsG.push(markedTalk[i].t - markedTalk[i - 1].t);
    presenters[slot] = {
      id: ep.cast[slot],
      speaking: r2(talk),
      gestures: marked.length,
      gesturesPerMinTalking: talk > 0 ? r2((markedTalk.length * 60) / talk) : null,
      nodsSpeaking: g.filter((e) => e.name === 'nod' && speaking(slot, e.t)).length,
      minGapBetweenGestures: gapsG.length ? r2(Math.min(...gapsG)) : null,
      immediateRepeats: rep,
      names: Object.entries(marked.reduce((m, e) => ((m[e.name] = (m[e.name] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]),
      listenerNodsPerMin: listen > 0 ? r2((nodsListen.length * 60) / listen) : null,
      listenerLooksPerMin: listen > 0 ? r2((looksListen.length * 60) / listen) : null,
    };
  }

  // camera moves (cut traces)
  const moves = cuts.filter((c) => c.move);
  const moveGaps = [];
  for (let i = 1; i < moves.length; i++) moveGaps.push(moves[i].t - moves[i - 1].t);

  // music cue changes
  const music = (t.music || []).filter((m) => inSpan(m.t));
  const musicGaps = [];
  for (let i = 1; i < music.length; i++) musicGaps.push(music[i].t - music[i - 1].t);

  // stingers, and a too-short shot right before one (the studio flashing behind it)
  const stingers = ev.filter((e) => e.ev === 'stinger').map((e) => {
    const before = [...mine].reverse().find((s) => s.at < e.at - 0.01);
    return { at: r2(e.at), before: before?.shot ?? null, beforeDur: before ? r2(e.at - before.at) : null };
  });

  // montage frames vs teaser lines
  const montage = body
    .filter((s) => s.shot === 'montage')
    .map((s) => {
      const sub = subs.filter((x) => x.text && Math.abs(x.t - s.at) < 0.8).sort((a, b) => Math.abs(a.t - s.at) - Math.abs(b.t - s.at))[0];
      return { at: r2(s.at), dur: r2(s.dur), lag: sub ? r2(s.at - sub.t) : null, card: s.card?.index ?? null };
    });

  // open breathing room, last word → end card
  const openEnd = prog.open.at + (prog.open.dur || 0);
  const firstWord = says.length ? says[0].on - openEnd : null;
  const lastWord = says.length && prog.endcard ? prog.endcard.at - says[says.length - 1].off : null;

  // static studio holds: longer than staticMax without a camera move or any reaction in them
  const statics = bodyNoMontage
    .filter((s) => STUDIO.has(s.shot) && s.dur > P.shots.staticMax)
    .map((s) => {
      const life = perf.some((e) => e.t >= s.at && e.t < s.at + s.dur) || !!s.move;
      return { at: r2(s.at), dur: r2(s.dur), shot: s.shot, framing: s.framing ?? null, alive: perf.length || cuts.length ? life : null };
    });

  // silences: no voice > 1.5 s inside the body; dead air (whole mix quiet) > 1.5 s
  const voiceGaps = [];
  for (const g of gaps) if (g.gap > 1.5 && g.kind !== 'breakingCard') voiceGaps.push(g);
  const dead = env?.mix ? silentRuns(env.mix, bodyStart, bodyEnd, -50, 1.5) : null;

  const length = t1 - t0;
  const [lo, hi] = P.length.target;
  const report = {
    programId: pid,
    title: ep.title,
    episodeId: ep.episodeId,
    partial: prog.partial,
    span: [r2(t0), r2(t1)],
    length: r2(length),
    target: P.length.target,
    segments: (ep.segments || []).length,
    stories: (ep.segments || []).filter((s) => s.type === 'story').length,
    chats: (ep.segments || []).filter((s) => s.type === 'chat').length,
    speech: r2(says.reduce((a, s) => a + Math.max(0, s.off - s.on), 0)),
    shots: { ...stats(durs), cutsPerMin: r2((Math.max(0, bodyNoMontage.length - 1) * 60) / editTime), under: under.length, underList: under.slice(0, 12), sameFraming: repeats.length, sameFramingList: repeats.slice(0, 8), worstTypeRun: worstRun, framings: [...new Set(bodyNoMontage.map((s) => s.framing).filter(Boolean))] },
    dwell,
    moves: cuts.length ? { n: moves.length, perMin: r2((moves.length * 60) / Math.max(1, length)), minGap: moveGaps.length ? r2(Math.min(...moveGaps)) : null, list: moves.map((m) => ({ at: r2(m.t), move: m.move, amount: m.amount ?? null })) } : null,
    captions: { ...stats(caps.map((c) => c.dur)), cps: stats(caps.map((c) => c.cps)), over17cps: caps.filter((c) => c.cps > 17).length },
    gaps: gapStats,
    gapList: gaps,
    wpm: stats(wpm),
    innerPauses: env ? { ...stats(inner), over1_5: innerLong } : null,
    openToFirstWord: r2(firstWord),
    lastWordToEndcard: r2(lastWord),
    montage,
    stingers,
    strap: { onAir: stats(strapOn), inDelay: stats(strapDelay), flips, entries: outIn },
    ticker: pushes.length ? { ...stats(tickerHolds), pushes: pushes.length } : null,
    presenters: perf.length ? presenters : null,
    music: { cues: music.length, perMin: r2((music.length * 60) / Math.max(1, length)), minGap: musicGaps.length ? r2(Math.min(...musicGaps)) : null, moments: music.map((m) => m.moment) },
    statics,
    voiceGapsOver1_5: voiceGaps,
    deadAir: dead,
    audioMeasured: !!env,
    // the programme as the viewer saw it, relative to the open (public/lab/pace.html 'measured' view)
    strip: {
      shots: mine.map((x) => [r2(x.at - t0), r2(x.dur), x.shot, x.framing ?? null]),
      says: says.map((x) => [r2(x.on - t0), r2(x.off - t0), x.anchor, x.type]),
      gaps: gaps.map((x) => [r2(x.at - t0), x.gap, x.kind, x.target]),
    },
  };
  report.checks = checks(report, P, lo, hi);
  return report;
}

/** Pass / fail of each target (null when not measurable). */
function checks(r, P, lo, hi) {
  const c = {};
  c.length = r.partial ? null : r.length >= lo && r.length <= hi;
  c.shotMin = r.shots.n ? r.shots.under === 0 : null;
  c.shotMedian = r.shots.n ? r.shots.median >= P.shots.median[0] - 0.25 && r.shots.median <= P.shots.median[1] + 1.5 : null;
  c.cutsPerMin = r.shots.n ? r.shots.cutsPerMin <= P.shots.cutsPerMinMax : null;
  c.sameFraming = r.shots.n ? r.shots.sameFraming === 0 : null;
  c.mapDwell = r.dwell.map?.n ? r.dwell.map.min >= P.shots.map[0] - 0.6 : null;
  c.pictureDwell = r.dwell.full?.n ? r.dwell.full.min >= P.shots.picture[0] - 0.3 : null;
  const gk = Object.entries(r.gaps).filter(([k, g]) => g.target != null && k !== 'breakingCard');
  c.gaps = gk.length ? gk.every(([, g]) => g.median >= g.target * 0.75) : null;
  c.captionPage = r.captions.n ? r.captions.min >= 1.2 : null;
  c.ticker = r.ticker?.n ? r.ticker.min >= CHANNEL.ticker.minHold - 0.3 : null;
  c.statics = r.statics.length ? r.statics.every((s) => s.alive !== false) : true;
  c.silences = r.deadAir ? r.deadAir.length === 0 : null;
  c.openBreath = r.openToFirstWord != null ? r.openToFirstWord >= P.open.firstWord * 0.6 : null;
  return c;
}

// ------------------------------------------------------------------ markdown
const fmt = (v, d = 1) => (v == null ? 'n/a' : typeof v === 'number' ? (Number.isFinite(v) ? v.toFixed(d) : String(v)) : String(v));
const mark = (ok) => (ok == null ? '' : ok ? ' ✓' : ' ✗');
function mdProgramme(r) {
  const P = paceFor(r.programId);
  const s = r.shots;
  const g = r.gaps;
  const L = [];
  L.push(`### ${r.title} (${r.episodeId})${r.partial ? ' — partial' : ''}`);
  L.push('');
  L.push('| measure | value | target |');
  L.push('| --- | --- | --- |');
  L.push(`| length | ${fmt(r.length, 0)} s (${r.stories} stories, ${r.chats} chats, ${fmt(r.speech, 0)} s of speech)${mark(r.checks.length)} | ${r.target[0]}-${r.target[1]} s |`);
  L.push(`| shots (outside montages) | n ${s.n}, min ${fmt(s.min)}, p10 ${fmt(s.p10)}, median ${fmt(s.median)}, p90 ${fmt(s.p90)}, max ${fmt(s.max)}${mark(s.n ? r.checks.shotMin && r.checks.shotMedian : null)} | ≥ ${P.shots.min}, median ${P.shots.median.join('-')} |`);
  L.push(`| cuts per minute | ${fmt(s.cutsPerMin)}${mark(r.checks.cutsPerMin)} | ≤ ${P.shots.cutsPerMinMax} |`);
  L.push(`| shots under ${P.shots.min} s | ${s.under}${s.underList.length ? ` (${s.underList.slice(0, 4).map((u) => `${u.shot}${u.framing ? '/' + u.framing : ''} ${fmt(u.dur)} s @${fmt(u.at, 0)}`).join(', ')})` : ''} | 0 |`);
  L.push(`| same framing twice in a row | ${s.sameFraming}${mark(r.checks.sameFraming)} | 0 |`);
  for (const k of ['close', 'wide', 'full', 'map', 'fact', 'montage', 'breakingCard']) {
    const d = r.dwell[k];
    if (!d?.n) continue;
    const tgt = k === 'map' ? `${P.shots.map.join('-')}` : k === 'full' ? `${P.shots.picture.join('-')}` : k === 'fact' ? `≥ ${P.shots.factMin}` : k === 'montage' ? `≥ ${P.holds.montage} (voice-paced)` : k === 'breakingCard' ? `≤ 3` : `≤ ${P.shots.studioMax}`;
    L.push(`| ${k} dwell | n ${d.n}, min ${fmt(d.min)}, median ${fmt(d.median)}, max ${fmt(d.max)} | ${tgt} |`);
  }
  L.push(`| camera moves | ${r.moves ? `${r.moves.n} (${fmt(r.moves.perMin, 2)}/min, min gap ${fmt(r.moves.minGap)})` : 'n/a'} | ≤ ${P.moves.max}, gap ≥ ${P.moves.minGap} |`);
  for (const [k, v] of Object.entries(g)) L.push(`| pause: ${k} | n ${v.n}, min ${fmt(v.min, 2)}, median ${fmt(v.median, 2)}, max ${fmt(v.max, 2)} | ${v.target != null ? v.target : '—'} |`);
  L.push(`| speech rate (wpm, voiced) | median ${fmt(r.wpm.median, 0)} (${fmt(r.wpm.min, 0)}-${fmt(r.wpm.max, 0)}) | bible |`);
  if (r.innerPauses) L.push(`| pauses inside segments | median ${fmt(r.innerPauses.median, 2)}, p90 ${fmt(r.innerPauses.p90, 2)}, > 1.5 s: ${r.innerPauses.over1_5.length} | — |`);
  L.push(`| open → first word | ${fmt(r.openToFirstWord, 2)} s${mark(r.checks.openBreath)} | ${P.open.firstWord} |`);
  L.push(`| last word → end card | ${fmt(r.lastWordToEndcard, 2)} s | ${P.holds.signoff} + stinger/2 |`);
  if (r.montage.length) L.push(`| montage frames | ${r.montage.map((m) => `${fmt(m.dur)} s (lag ${fmt(m.lag, 2)})`).join(', ')} | on the line, ≥ ${P.holds.montage} |`);
  L.push(`| captions | page min ${fmt(r.captions.min)}, median ${fmt(r.captions.median)} s; cps median ${fmt(r.captions.cps.median)}, > 17 cps: ${r.captions.over17cps} | page ≥ 1.2 s, ≤ 17 cps |`);
  L.push(`| strap | on-air median ${fmt(r.strap.onAir.median)} s, in-delay median ${fmt(r.strap.inDelay.median, 2)} s, flips ${r.strap.flips}, entries ${r.strap.entries} | in ${P.strap.inAfterCut} s after the cut |`);
  L.push(`| ticker holds | ${r.ticker ? `n ${r.ticker.n}, min ${fmt(r.ticker.min)}, median ${fmt(r.ticker.median)}` : 'n/a'} | ≥ ${CHANNEL.ticker.minHold} |`);
  if (r.presenters) {
    for (const [slot, p] of Object.entries(r.presenters)) {
      L.push(`| ${p.id} (${slot}) gestures | ${p.gestures} marked (${fmt(p.gesturesPerMinTalking)}/min talking, min gap ${fmt(p.minGapBetweenGestures)} s, repeats ${p.immediateRepeats}), listener nods ${fmt(p.listenerNodsPerMin)}/min, looks ${fmt(p.listenerLooksPerMin)}/min | ≤ ${P.gestures.perMin}/min, gap ≥ ${P.gestures.minGap} |`);
    }
  } else L.push('| gestures / listener | n/a (no pace traces) | — |');
  L.push(`| music cues | ${r.music.cues} (${fmt(r.music.perMin, 2)}/min, min gap ${fmt(r.music.minGap)} s) | ≤ ${P.music.maxChangesPerMin}/min |`);
  L.push(`| studio holds > ${P.shots.staticMax} s | ${r.statics.length}${r.statics.length ? ` (${r.statics.map((x) => `${fmt(x.dur)} s${x.alive === false ? ' static' : ''}`).join(', ')})` : ''} | none static |`);
  L.push(`| voice gaps > 1.5 s | ${r.voiceGapsOver1_5.length}${r.voiceGapsOver1_5.length ? ` (${r.voiceGapsOver1_5.map((x) => `${x.kind} ${fmt(x.gap)}`).join(', ')})` : ''} | intended beats only |`);
  L.push(`| dead air > 1.5 s | ${r.deadAir ? r.deadAir.length : 'n/a'}${mark(r.checks.silences)} | 0 |`);
  if (r.stingers.length) L.push(`| stingers | ${r.stingers.map((x) => `@${fmt(x.at, 0)} after ${x.before} ${fmt(x.beforeDur)} s`).join(', ')} | shot before ≥ ${P.shots.min} |`);
  L.push('');
  return L.join('\n');
}

// ------------------------------------------------------------------ main
/** Analyse a parsed timeline (the recorder's or tools/pace/trace.mjs'). env: voice envelope (+ env.mix) or null. */
export function analyseTimeline(t, { env = null } = {}) {
  t.events = (t.events || []).slice().sort((a, b) => a.t - b.t);
  const shots = shotsOf(t.events);
  const progs = programmesOf(t, shots).map((p) => analyseProgramme(t, p, shots, env));
  return { meta: t.meta, programmes: progs, breaks: breaksOf(t, shots) };
}

function analyseFile(file, opt) {
  const t = loadTimeline(file);
  let env = null;
  if (opt.audio) {
    const work = file.replace(/-timeline\.json$/, '.work');
    try {
      const sb = fs.existsSync(path.join(work, 'speechbus.wav')) ? wavEnvelope(path.join(work, 'speechbus.wav')) : null;
      const vo = fs.existsSync(path.join(work, 'voice.wav')) ? wavEnvelope(path.join(work, 'voice.wav')) : null;
      const voice = maxEnv(sb, vo);
      if (voice) {
        env = voice;
        env.mix = fs.existsSync(path.join(work, 'mix.wav')) ? wavEnvelope(path.join(work, 'mix.wav')) : null;
      }
    } catch (err) {
      if (!opt.quiet) console.warn(`[pace] audio skipped: ${err.message}`);
    }
  }
  return { file, ...analyseTimeline(t, { env }) };
}

/** "[voice] WORLD NOW: 12/12 clips (2 cached), 108 s of speech in 84 s" + "[producer] ... ready in 84.3 s" */
export function production(text) {
  const out = [];
  for (const m of text.matchAll(/\[voice\] (.+?): (\d+)\/(\d+) clips(?: \((\d+) cached\))?, (\d+(?:\.\d+)?) s of speech in (\d+(?:\.\d+)?) s/g)) {
    out.push({ title: m[1], clips: +m[2], of: +m[3], cached: +(m[4] || 0), speech: +m[5], synth: +m[6], ratio: r2(+m[5] / +m[6]) });
  }
  const ready = [...text.matchAll(/\[producer\] (.+?) (\w+) ready in (\d+(?:\.\d+)?) s .*?, (\d+) stories/g)].map((m) => ({ title: m[1], id: m[2], ready: +m[3], stories: +m[4] }));
  return { voice: out, ready };
}

/** One programme's headline numbers, for before/after tables (docs/PACING.md). */
export function summary(p) {
  const g = (k) => p.gaps[k]?.median ?? null;
  const pr = p.presenters ? Object.values(p.presenters) : [];
  return {
    programme: p.title,
    partial: !!p.partial,
    length: p.length,
    stories: p.stories,
    shotMin: p.shots.min ?? null,
    shotMedian: p.shots.median ?? null,
    shotP10: p.shots.p10 ?? null,
    cutsPerMin: p.shots.cutsPerMin,
    under4: p.shots.under,
    sameFraming: p.shots.sameFraming,
    mapMin: p.dwell.map?.min ?? null,
    handover: g('handover'),
    story: g('story'),
    chatTurn: g('chatTurn'),
    block: g('block'),
    beforeFinally: g('beforeFinally'),
    allPausesMedian: (() => {
      const all = p.gapList.filter((x) => x.kind !== 'breakingCard').map((x) => x.gap);
      return all.length ? r2(quant(all, 0.5)) : null;
    })(),
    openToFirstWord: p.openToFirstWord,
    lastWordToEndcard: p.lastWordToEndcard,
    strapIn: p.strap.inDelay.median ?? null,
    tickerMin: p.ticker?.min ?? null,
    captionMin: p.captions.min ?? null,
    gesturesPerMin: pr.length ? r2(Math.max(...pr.map((x) => x.gesturesPerMinTalking ?? 0))) : null,
    gestureRepeats: pr.length ? pr.reduce((a, x) => a + x.immediateRepeats, 0) : null,
    musicPerMin: p.music.perMin,
    voiceGapsOver1_5: p.voiceGapsOver1_5.length,
    statics: p.statics.filter((x) => x.alive === false).length,
  };
}

function cli() {
  const argv = process.argv.slice(2);
  const files = [];
  const opt = { audio: true, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--md') opt.md = argv[++i];
    else if (a === '--json') opt.json = argv[++i];
    else if (a === '--server-log') opt.serverLog = argv[++i];
    else if (a === '--no-audio') opt.audio = false;
    else if (a === '--quiet') opt.quiet = true;
    else files.push(a);
  }
  if (!files.length) {
    console.error('usage: node tools/pace/analyse.mjs show-timeline.json [...] [--md out.md] [--json out.json] [--server-log log] [--no-audio]');
    process.exit(1);
  }
  const results = files.map((f) => analyseFile(f, opt));
  if (opt.serverLog) for (const r of results) r.production = production(fs.readFileSync(opt.serverLog, 'utf8'));
  const md = [];
  for (const r of results) {
    md.push(`## ${path.basename(r.file)}`);
    md.push('');
    for (const p of r.programmes) md.push(mdProgramme(p));
    if (r.breaks.length) {
      md.push('| break | length | ident | ads | black between | promo | stingers |');
      md.push('| --- | --- | --- | --- | --- | --- | --- |');
      for (const b of r.breaks) md.push(`| @${fmt(b.at, 0)}${b.filler ? ' filler' : ''} | ${fmt(b.length)} | ${fmt(b.ident)} | ${b.ads.map((a) => `${a.ad} ${fmt(a.dur)}`).join(', ')} | ${b.blacks.length ? b.blacks.map((x) => fmt(x, 2)).join(', ') : '—'} | ${fmt(b.promo)} | ${b.stingers} |`);
      md.push('');
    }
    if (r.production) {
      md.push('| production | speech | synthesis | speech/synth |');
      md.push('| --- | --- | --- | --- |');
      for (const v of r.production.voice) md.push(`| ${v.title} (${v.clips}/${v.of} clips, ${v.cached} cached) | ${v.speech} s | ${v.synth} s | ${v.ratio}x |`);
      for (const v of r.production.ready) md.push(`| ${v.title} ${v.id} ready (write + pictures + voice budget) | ${v.stories} stories | ${v.ready} s | |`);
      md.push('');
    }
  }
  const mdText = md.join('\n');
  if (opt.md) fs.writeFileSync(opt.md, mdText);
  if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(results.map((r) => ({ ...r, summaries: r.programmes.map(summary) })), null, 1));
  if (!opt.quiet) console.log(mdText);
}

if (import.meta.url === `file://${process.argv[1]}`) cli();
