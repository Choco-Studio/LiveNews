#!/usr/bin/env node
// Pure checks for the showcase recorder (no browser, no Kokoro):
//   node tools/showcase/selftest.mjs
// Music cue rules on a synthetic WORLD NOW timeline, speech regions, voice
// casting, quiet intervals and the onset detector used by the sync checks.

import assert from 'node:assert/strict';
import { deriveCues, speechRegions, quietIntervals } from './lib/music.mjs';
import { voiceFor } from './lib/voices.mjs';
import { envelope, onsetAfter } from './lib/analysis.mjs';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

// A WORLD NOW episode as the page logs it (ms on the page clock).
const S = (t, end, text) => ({ ev: 'speech', t, end, text, volume: 0.8 });
const log = [
  { ev: 'playEpisode', phase: 'start', t: 1000, programId: 'world-now' },
  { ev: 'shot', shot: 'open', at: 1400, t: 1400, programId: 'world-now' },
  { ev: 'shot', shot: 'montage', at: 5000, t: 5010, programId: 'world-now' },
  { ev: 'say', phase: 'start', t: 5000, type: 'intro', emotion: 'neutral' },
  S(5105, 8000, 'Panama Canal reopens after a day-long closure.'),
  S(8200, 11000, 'Wind farm starts supplying power.'),
  S(11200, 13000, 'Lisbon opens a tram line.'),
  S(13200, 15500, 'Good evening, and welcome to World now.'),
  { ev: 'say', phase: 'end', t: 15600, ref: 5000 },
  { ev: 'say', phase: 'start', t: 16000, type: 'story', emotion: 'serious', feature: null },
  S(16100, 24000, 'A grave story.'),
  { ev: 'say', phase: 'end', t: 24100, ref: 16000 },
  { ev: 'say', phase: 'start', t: 24500, type: 'story', emotion: 'neutral', feature: 'roundup' },
  S(24600, 28000, 'Around the world.'),
  { ev: 'say', phase: 'end', t: 28100, ref: 24500 },
  { ev: 'say', phase: 'start', t: 28500, type: 'story', emotion: 'happy', feature: 'lighter' },
  S(28600, 33000, 'And finally.'),
  { ev: 'say', phase: 'end', t: 33100, ref: 28500 },
  { ev: 'say', phase: 'start', t: 33500, type: 'outro', emotion: 'neutral' },
  S(33600, 36000, 'Good night.'),
  { ev: 'say', phase: 'end', t: 36100, ref: 33500 },
  { ev: 'shot', shot: 'endcard', at: 36800, t: 36800, programId: 'world-now' },
  { ev: 'playBreak', phase: 'start', t: 40000 },
  { ev: 'playAd', phase: 'start', t: 44000, adId: 'corners' },
  { ev: 'playAd', phase: 'end', t: 67000, ref: 44000 },
];

test('cues follow the director moments of the lofi cue sheet', () => {
  const cues = deriveCues(log);
  const seq = cues.map((c) => c.moment);
  assert.equal(seq[0], 'open');
  assert.deepEqual(seq.filter((m) => m === 'headlines').length, 3);
  assert.deepEqual(seq.filter((m) => m === 'pip').length, 3, 'one pip per headline line (WORLD NOW)');
  assert.ok(seq.includes('greeting'));
  const grave = cues.find((c) => c.moment === 'story');
  assert.equal(grave.opts.grave, true);
  assert.equal(grave.opts.emotion, 'serious');
  assert.ok(seq.includes('roundup') && seq.includes('finally') && seq.includes('outro'));
  const signoff = cues.find((c) => c.moment === 'signoffEnd');
  assert.equal(signoff.t, 36000 + 120, 'signoffEnd right after the last word');
  assert.ok(seq.includes('endcard') && seq.includes('silence') && seq.includes('ad'));
  // Headline cue leads its sentence; pip follows it.
  const h0 = cues.find((c) => c.moment === 'headlines' && c.opts.line === 0);
  const p0 = cues.find((c) => c.moment === 'pip' && c.opts.line === 0);
  assert.ok(h0.t <= 5105 && h0.t >= 5000);
  assert.equal(p0.t, 8000 + 100);
  // Sorted, programme stamped.
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].t >= cues[i - 1].t);
  assert.equal(cues.find((c) => c.moment === 'roundup').opts.programId, 'world-now');
});

test('accents go only to the programmes that use them', () => {
  const tech = log.map((e) => (e.programId ? { ...e, programId: 'tech-bytes' } : e));
  const seq = deriveCues(tech).map((c) => c.moment);
  assert.ok(!seq.includes('pip'), 'TECH BYTES has no pips (its policy would answer silence)');
  assert.ok(seq.includes('featureEnd'), 'TECH BYTES buttons the end of a feature');
  const cosmos = log.map((e) => (e.programId ? { ...e, programId: 'cosmos' } : e));
  const cs = deriveCues(cosmos).map((c) => c.moment);
  assert.ok(cs.includes('coldOpen') && !cs.includes('headlines'));
});

test('speech regions bridge short gaps', () => {
  assert.deepEqual(speechRegions([{ start: 0, end: 1 }, { start: 1.3, end: 2 }, { start: 3, end: 4 }]), [[0, 2], [3, 4]]);
  assert.deepEqual(speechRegions([{ start: 2, end: 2 }]), []);
});

test('quiet intervals: grave stories (after the fade) and ads', () => {
  const q = quietIntervals(log, 0);
  assert.deepEqual(q.map((x) => x.kind), ['grave', 'ad']);
  assert.equal(q[0].from, 16 + 3);
  assert.equal(q[1].to, 67);
});

test('voice casting: presenter presets, announcers for ads, browser voice fallback', () => {
  const presets = { ids: new Set(['paco', 'lola']) };
  assert.equal(voiceFor({ presenter: 'paco', slot: 'A' }, presets).voice, 'paco');
  assert.equal(voiceFor({ presenter: 'nova', slot: 'A' }, presets).voice, 'af_nova', 'default cast without a preset');
  const ad = voiceFor({ slot: 'ad', ad: { id: 'x', voice: { gender: 'female', lang: 'en-GB', rate: 0.86 } } }, presets);
  assert.match(ad.voice, /^bf_alice/);
  assert.ok(ad.speed >= 0.86 && ad.speed <= 1);
  const fb = voiceFor({ slot: 'B', voiceName: 'Kokoro Bella (female)', lang: 'en-US', rate: 1.06 }, presets);
  assert.equal(fb.voice, 'af_bella');
});

test('onset detector finds a click 120 ms into a quiet signal', () => {
  const sr = 48000;
  const x = new Float32Array(sr);
  for (let i = 0; i < x.length; i++) x[i] = (Math.sin(i * 0.37) * 0.001);
  for (let i = Math.round(0.62 * sr); i < Math.round(0.7 * sr); i++) x[i] = Math.sin(i * 0.2) * 0.5;
  const o = onsetAfter(envelope(x, sr), 0.5, 0.9);
  assert.ok(o && Math.abs(o.t - 0.62) < 0.006, `onset ${o?.t}`);
});

console.log(`${passed} passed`);
