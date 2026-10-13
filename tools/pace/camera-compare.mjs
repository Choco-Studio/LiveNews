#!/usr/bin/env node
// Before / after table of tools/pace/camera.mjs reports (one programme per pair of JSON files), as markdown.
//   node tools/pace/camera-compare.mjs --label "WORLD NOW (offline)" before-camera.json after-camera.json [...more pairs]
// Each JSON is camera.mjs --json output; the first programme of each file is compared.

import fs from 'node:fs';
import { paceFor } from '../../public/js/pace.js';

const args = process.argv.slice(2);
const rows = [];
let label = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--label') label = args[++i];
  else files.push({ file: args[i], label });
}
const count = (p, kind) => p.count?.[kind] || 0;
const num = (v) => (v == null ? '—' : String(v));
function line(name, b, a, target, better = 'lower') {
  const ok = (v) => (target?.test ? (target.test(v) ? ' ✓' : ' ✗') : '');
  rows.push(`| ${name} | ${num(b)}${ok(b)} | ${num(a)}${ok(a)} | ${target?.text ?? ''} |`);
}
const out = [];
for (let i = 0; i + 1 < files.length; i += 2) {
  const [b] = JSON.parse(fs.readFileSync(files[i].file, 'utf8'));
  const [a] = JSON.parse(fs.readFileSync(files[i + 1].file, 'utf8'));
  const P = paceFor(a.programId);
  rows.length = 0;
  rows.push(`#### ${files[i].label || a.programId}`, '', '| measure | before | after | target |', '| --- | --- | --- | --- |');
  line('body (open cut → end card, s)', b.body, a.body);
  line('shots (outside the montage)', b.shots, a.shots);
  line('cuts per minute', b.cutsPerMin, a.cutsPerMin, { test: (v) => v <= P.shots.cutsPerMinMax + 0.05, text: `≤ ${P.shots.cutsPerMinMax}` });
  line('shortest shot (s)', b.shot.min, a.shot.min, { test: (v) => v >= P.shots.min - 0.05, text: `≥ ${P.shots.min}` });
  line('shot p10 (s)', b.shot.p10, a.shot.p10);
  line('median shot (s)', b.shot.median, a.shot.median, { test: (v) => v >= P.shots.median[0] - 0.05 && v <= P.shots.median[1] + 0.05, text: P.shots.median.join('-') });
  line('longest shot (s)', b.shot.max, a.shot.max);
  for (const [k, t] of [
    ['short shot', 'shots under the floor'],
    ['over its maximum', 'shots over their maximum'],
    ['cut inside a word', 'cuts inside a word'],
    ['cuts close together', 'two cuts < 2.5 s apart'],
    ['jump cut', 'jump cuts (same framing / size)'],
    ['repeat after a flash', 'a shot back after a flash'],
    ['eyeline', 'eyeline flags'],
    ['speaker off screen', 'voice off the single on air'],
    ['voice over the cut', 'previous voice under a segment cut'],
    ['dead air', 'dead air (> 1.5 s)'],
    ['shot over silence', 'shots held over silence'],
    ['gap too long', 'pauses > profile + 0.6 s'],
    ['gap too short', 'pauses < profile − 0.25 s'],
    ['stinger over speech', 'stinger over speech'],
  ]) if (count(b, k) || count(a, k)) line(t, count(b, k), count(a, k), { test: (v) => v === 0, text: '0' }); // (rows with nothing either side left out)
  line('open cut → first word (s)', b.afterOpen, a.afterOpen, { test: (v) => Math.abs(v - P.open.firstWord) <= 0.2, text: `${P.open.firstWord}` });
  line('last word → end-card stinger (s)', b.beforeEndcard, a.beforeEndcard, { test: (v) => Math.abs(v - P.holds.signoff) <= 0.25, text: `${P.holds.signoff}` });
  const moves = (p) => p.moves.length;
  const moveFlags = (p) => ['move starts on the cut', 'move starts abruptly', 'move stops dead', 'move cut before it settles', 'move ends on the cut', 'move jerks', 'move too fast', 'move shimmers', 'move pops back', 'presenters jump in size'].reduce((s, k) => s + count(p, k), 0);
  line('camera moves', moves(b), moves(a));
  line('camera-move defects', moveFlags(b), moveFlags(a), { test: (v) => v === 0, text: '0' });
  line('all flagged defects', b.defects.length, a.defects.length, { test: (v) => v === 0, text: '0' });
  out.push(rows.join('\n'), '');
}
console.log(out.join('\n'));
