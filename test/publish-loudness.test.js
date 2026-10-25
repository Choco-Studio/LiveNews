// A clip at the feeds' loudness (server/publish/render.js LOUDNESS, docs/publishing/shorts-v2.md A1): its sound measured
// as it will be mixed, one linear gain to -14 LUFS that never takes its true peak past the ceiling, the made file
// measured again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { composeArgs, loudnessArgs, measureArgs, parseLoudness, loudnessGain, LOUDNESS } from '../server/publish/render.js';

const LOG = `[Parsed_ebur128_0 @ 0x55] Summary:

  Integrated loudness:
    I:         -15.9 LUFS
    Threshold: -26.6 LUFS

  Loudness range:
    LRA:         4.7 LU
    Threshold: -36.6 LUFS
    LRA low:   -19.5 LUFS
    LRA high:  -14.8 LUFS

  True peak:
    Peak:       -5.3 dBFS
`;

test('parseLoudness reads the summary: integrated loudness and true peak; silence and a log with no summary give null', () => {
  assert.deepEqual(parseLoudness(LOG), { lufs: -15.9, truePeak: -5.3 });
  assert.deepEqual(parseLoudness(`frames... I: -20.0 LUFS\n${LOG}`), { lufs: -15.9, truePeak: -5.3 }, 'the summary, not a frame line');
  assert.deepEqual(parseLoudness(LOG.replace('-15.9 LUFS', '-inf LUFS').replace('-5.3 dBFS', '-inf dBFS')), { lufs: null, truePeak: null });
  assert.deepEqual(parseLoudness('size=N/A time=00:00:27.60'), { lufs: null, truePeak: null });
});

test('loudnessGain: to the target, never past the ceiling, never more than a tenth over, nothing for silence', () => {
  assert.equal(LOUDNESS.target, -14);
  assert.ok(LOUDNESS.ceiling <= -1, 'under the feeds\' -1 dBTP');
  assert.equal(loudnessGain({ lufs: -15.9, truePeak: -5.3 }), 1.9, 'the clips of 24 Oct: +1.9 dB');
  assert.equal(loudnessGain({ lufs: -16.04, truePeak: -6 }), 2, 'a tenth under the exact gain at most (2.04 -> 2.0)');
  assert.equal(loudnessGain({ lufs: -20, truePeak: -3 }), 1.5, 'the ceiling holds: the peak ends at -1.5 dBTP');
  assert.equal(loudnessGain({ lufs: -10, truePeak: -0.5 }), -4, 'a loud clip comes down');
  assert.equal(loudnessGain({ lufs: -40, truePeak: -30 }), 12, 'at most 12 dB');
  assert.equal(loudnessGain({ lufs: null, truePeak: null }), 0);
  assert.equal(loudnessGain({ lufs: -70, truePeak: -60 }), 0, 'too faint to measure: nothing to lift');
  assert.equal(loudnessGain({ lufs: -14.03, truePeak: -4 }), 0, 'at the target: no gain');
});

test('composeArgs lifts the whole sound, the end card too, by the gain; loudnessArgs measures that same sound', () => {
  const window = { start: 12.5, end: 40, duration: 27.5 };
  const v = composeArgs({ master: 'm.mkv', hook: 'h.png', endcard: 'e.mkv', window, format: 'vertical', out: 'o.mp4', gain: 1.9 });
  const graph = v[v.indexOf('-filter_complex') + 1];
  assert.match(graph, /concat=n=2:v=1:a=1\[v\]\[ac\];\[ac\]volume=1\.9dB\[aa\]/, 'after the end card is joined: one gain for the whole');
  const flat = composeArgs({ master: 'm.mkv', hook: null, endcard: null, window, format: 'horizontal', out: 'o.mp4' });
  assert.match(flat[flat.indexOf('-filter_complex') + 1], /\[ac\]anull\[aa\]/, 'no gain: the sound as it is');
  const m = loudnessArgs({ master: 'm.mkv', endcard: 'e.mkv', window });
  const mg = m[m.indexOf('-filter_complex') + 1];
  assert.equal(m[m.indexOf('-ss') + 1], '12.500');
  assert.equal(m[m.indexOf('-t') + 1], '27.500');
  // the same fades as the clip
  assert.ok(mg.includes(graph.split(';').find((p) => p.startsWith('[0:a]'))), mg);
  assert.match(mg, /\[1:a\]aresample=48000\[ea\];\[a\]\[ea\]concat=n=2:v=0:a=1\[ac\];\[ac\]ebur128=peak=true/);
  assert.ok(!m.includes('-v'), 'the summary is logged at the info level');
  assert.deepEqual(measureArgs('c.mp4'), ['-hide_banner', '-nostats', '-i', 'c.mp4', '-map', '0:a', '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('through ffmpeg: a quiet clip comes out at -14 LUFS, its true peak under -1 dBTP', { skip: !hasFfmpeg && 'no ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loud-'));
  try {
    const ff = (args) => {
      const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return r.stderr;
    };
    // a master (a tone at about -23 LUFS over a still picture) and an end card a second long
    const master = path.join(dir, 'm.mkv');
    const card = path.join(dir, 'e.mkv');
    const out = path.join(dir, 'o.mp4');
    ff(['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=216x384:r=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:d=4', '-filter_complex', '[1:a]volume=-2dB[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', master]);
    ff(['-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:s=216x384:r=30:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:d=1', '-filter_complex', '[1:a]volume=-20dB[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', card]);
    const window = { start: 0.5, end: 3.5, duration: 3 };
    const before = parseLoudness(ff(loudnessArgs({ master, endcard: card, window })));
    assert.ok(before.lufs < -16 && before.lufs > -30, JSON.stringify(before));
    const gain = loudnessGain(before);
    assert.ok(gain > 1, `a quiet clip is lifted (${gain} dB)`);
    ff(composeArgs({ master, hook: null, endcard: card, window, format: 'vertical', out, gain }));
    const made = parseLoudness(ff(measureArgs(out)));
    assert.ok(Math.abs(made.lufs - LOUDNESS.target) <= 0.6, `made at ${made.lufs} LUFS`);
    assert.ok(made.truePeak <= -1, `true peak ${made.truePeak} dBTP`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
