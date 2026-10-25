// The publishing desk's experiments (server/publish/experiments.js; docs/publishing/shorts-v2.md B1 and §4): which
// clips take part, their arms alternated (never by chance) and kept on a run again, and the face hook's strip in the
// clip's graph (render.js FACES): the players rise in at the start and are gone by its end, through ffmpeg too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXPERIMENTS, runningFor, assignArm, armStore } from '../server/publish/experiments.js';
import { composeArgs, FACES } from '../server/publish/render.js';

test('an experiment takes the kinds it names, from its first day to its last', () => {
  const e = EXPERIMENTS.find((x) => x.id === 'face-hook-1');
  assert.ok(e && e.arms.length === 2 && e.arms[0] === 'control', 'its control first');
  const day = (d) => Date.parse(`${d}T12:00:00Z`);
  assert.equal(runningFor({ kind: 'quiz-question' }, { now: day('2026-10-24') }), null, 'not before its first day');
  assert.equal(runningFor({ kind: 'quiz-question' }, { now: day('2026-11-02') })?.id, 'face-hook-1');
  assert.equal(runningFor({ kind: 'story' }, { now: day('2026-11-02') }), null, 'a kind it does not name');
  const ended = [{ ...e, until: '2026-11-01' }];
  assert.equal(runningFor({ kind: 'quiz-question' }, { now: day('2026-11-02'), experiments: ended }), null, 'not after its last day');
});

test('the arms alternate clip by clip, and a clip made again keeps its own', () => {
  const store = armStore();
  const e = EXPERIMENTS[0];
  const got = ['m1', 'm2', 'm3', 'm4'].map((id) => assignArm(store, e, id));
  assert.deepEqual(got, ['control', 'face', 'control', 'face']);
  assert.equal(assignArm(store, e, 'm2'), 'face', 'the same moment, the same arm');
  assert.equal(assignArm(store, e, 'm5'), 'control', 'a run again took no turn');
  // kept in a file beside the queue, across runs
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arms-'));
  try {
    const file = path.join(dir, 'experiments.json');
    assignArm(armStore(file), e, 'a');
    assert.equal(assignArm(armStore(file), e, 'b'), 'face', 'the next run carries on the turn');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8'))[e.id], { n: 2, arms: { a: 'control', b: 'face' } });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the face hook\'s strip in the clip\'s graph: its own input, a window sliding to raise the players, gone at its end', () => {
  const window = { start: 10, end: 34, duration: 24 };
  const a = composeArgs({ master: 'm.mkv', hook: 'h.png', faces: { file: 'f.png', until: 2.6 }, endcard: 'e.mkv', window, format: 'vertical', out: 'o.mp4' });
  const graph = a[a.indexOf('-filter_complex') + 1];
  const inputs = a.filter((x, i) => a[i - 1] === '-i');
  assert.deepEqual(inputs, ['m.mkv', 'h.png', 'f.png', 'e.mkv'], 'master, hook, strip, end card');
  assert.match(graph, /\[2:v\]format=rgba,crop=w=iw:h=60:x=0:y='60\*min\(clip\(\(t-0\.15\)\/0\.30,0,1\),clip\(\(2\.60-t\)\/0\.30,0,1\)\)'\[fc\]/);
  assert.match(graph, new RegExp(`\\[h\\]\\[fc\\]overlay=0:${FACES.y}:enable='lt\\(t,2\\.60\\)'\\[o\\]`));
  assert.match(graph, /\[3:v\]fps=30,setsar=1\[ev\];\[3:a\]aresample=48000\[ea\]/, 'the end card after the strip');
  const plain = composeArgs({ master: 'm.mkv', hook: 'h.png', endcard: 'e.mkv', window, format: 'vertical', out: 'o.mp4' });
  assert.match(plain[plain.indexOf('-filter_complex') + 1], /\[h\]null\[o\]/, 'no strip, no overlay');
  assert.ok(!plain.includes('f.png'));
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('through ffmpeg: no players at the first frame, risen by 0.6 s, gone after their time', { skip: !hasFfmpeg && 'no ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faces-'));
  try {
    const ff = (args, opts = {}) => {
      const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 26, ...opts });
      assert.equal(r.status, 0, String(r.stderr));
      return r.stdout;
    };
    const master = path.join(dir, 'm.mkv');
    const strip = path.join(dir, 'f.png');
    const out = path.join(dir, 'o.mp4');
    ff(['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=216x384:r=30:d=4', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '4', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', master]);
    // the strip: its top half clear, its bottom half white (where the players stand)
    ff(['-v', 'error', '-f', 'lavfi', '-i', 'color=c=white@1:s=216x60,format=rgba', '-filter_complex', '[0]pad=216:120:0:60:color=black@0,format=rgba', '-frames:v', '1', strip]);
    ff(['-v', 'error', ...composeArgs({ master, hook: null, faces: { file: strip, until: 2.6 }, endcard: null, window: { start: 0, end: 4, duration: 4 }, format: 'vertical', out }).slice(2)]);
    // the band's middle row (y 290 at 1x, 1450 at 5x), its brightness at a few moments
    const lum = (t) => {
      const buf = ff(['-v', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', 'crop=1080:5:0:1450,format=gray', '-f', 'rawvideo', 'pipe:1']);
      return buf.reduce((s, x) => s + x, 0) / buf.length;
    };
    assert.ok(lum(0) < 30, `nothing at the first frame (${lum(0)})`);
    assert.ok(lum(0.8) > 200, `the players up by 0.8 s (${lum(0.8)})`);
    assert.ok(lum(3.2) < 30, `gone after 2.6 s (${lum(3.2)})`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
