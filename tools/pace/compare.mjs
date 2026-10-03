#!/usr/bin/env node
// Before/after table (owner: PACE stream): reads two or more analyser outputs
// (node tools/pace/analyse.mjs ... --json out.json) and prints, per programme,
// one markdown table with a column per run and the pace target, for
// docs/PACING.md.
//
//   node tools/pace/compare.mjs before.json after.json [--labels before,after] [--md out.md]

import fs from 'node:fs';
import { paceFor, CHANNEL } from '../../public/js/pace.js';

const argv = process.argv.slice(2);
const li = argv.indexOf('--labels');
const mi = argv.indexOf('--md');
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--labels' && argv[i - 1] !== '--md');
const labels = li >= 0 ? argv[li + 1].split(',') : files.map((f, i) => (i === 0 ? 'before' : files.length === 2 ? 'after' : `run ${i}`));
const runs = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const ID = { 'WORLD NOW': 'world-now', 'TECH BYTES': 'tech-bytes', 'NEWS IN 60': 'news-60', 'COSMOS DESK': 'cosmos', COSMOS: 'cosmos', 'MONEY MINUTE': 'money-minute' };

// [key, label, target(profile) → string]
const ROWS = [
  ['length', 'length (s)', (P) => `${P.length.target[0]}-${P.length.target[1]}`],
  ['stories', 'stories', () => '—'],
  ['shotMin', 'shortest shot (s)', (P) => `≥ ${P.shots.min}`],
  ['shotP10', 'shot p10 (s)', () => '—'],
  ['shotMedian', 'shot median (s)', (P) => P.shots.median.join('-')],
  ['under4', 'shots under 4 s', () => '0'],
  ['cutsPerMin', 'cuts per minute', (P) => `≤ ${P.shots.cutsPerMinMax}`],
  ['sameFraming', 'same framing twice', () => '0'],
  ['mapMin', 'shortest map (s)', (P) => `≥ ${P.shots.map[0]}`],
  ['allPausesMedian', 'pause between segments, median (s)', () => '0.7-1.5'],
  ['handover', 'hand-over pause (s)', (P) => P.gaps.handover],
  ['story', 'story-to-story pause (s)', (P) => P.gaps.story],
  ['chatTurn', 'chat turn pause (s)', (P) => P.gaps.chatTurn],
  ['block', 'block pause (s)', (P) => P.gaps.block],
  ['beforeFinally', 'before And finally (s)', (P) => P.gaps.beforeFinally],
  ['openToFirstWord', 'open → first word (s)', (P) => P.open.firstWord],
  ['lastWordToEndcard', 'last word → end card (s)', (P) => `${P.holds.signoff} + ${CHANNEL.stinger / 2}`],
  ['strapIn', 'strap in after the cut (s)', (P) => P.strap.inAfterCut],
  ['tickerMin', 'shortest ticker item (s)', () => `≥ ${CHANNEL.ticker.minHold}`],
  ['captionMin', 'shortest caption (s)', () => '≥ 1.2'],
  ['gesturesPerMin', 'marked gestures / min talking (max presenter)', (P) => `≤ ${P.gestures.perMin}`],
  ['gestureRepeats', 'same gesture twice in a row', () => '0'],
  ['musicPerMin', 'music cue calls / min', (P) => `≤ ${P.music.maxChangesPerMin} bed changes`],
  ['voiceGapsOver1_5', 'voice gaps > 1.5 s (not cards)', () => '0'],
];
const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
const out = [];
const titles = [...new Set(runs.flatMap((r) => r.flatMap((f) => f.summaries || []).filter((s) => !s.partial).map((s) => s.programme)))];
for (const title of titles) {
  const P = paceFor(ID[title] || 'world-now');
  const cols = runs.map((r) => r.flatMap((f) => f.summaries || []).find((s) => s.programme === title && !s.partial) || null);
  out.push(`#### ${title}`, '', `| measure | ${labels.join(' | ')} | target |`, `| --- | ${labels.map(() => '---').join(' | ')} | --- |`);
  for (const [k, label, tgt] of ROWS) out.push(`| ${label} | ${cols.map((c) => fmt(c?.[k])).join(' | ')} | ${tgt(P)} |`);
  out.push('');
}
const md = out.join('\n');
if (mi >= 0) fs.writeFileSync(argv[mi + 1], md);
console.log(md);
