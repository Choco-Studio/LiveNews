// Pre-rendered playout's queue and filler (server/playout/queue.js; docs/publishing/playout.md §3-4): the playout airs
// each file at the time baked into it, back to back; a gap before the next file is filler up to its time; nothing
// queued is filler a granule at a time (never black); a file whose time has passed is dropped, never aired late with a
// wrong clock. The renderer renders while the buffer is under its target and waits when it is full; fallen behind, it
// renders for a later time and the playout fills the gap. Every frame carries exactly 1600 samples of sound.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planAir, bufferAhead, renderPlan, SpeedMeter, PlayoutStore, framesOf, samplesOf, endOf, PLAYOUT_DEFAULTS } from '../server/playout/queue.js';

const T = Date.parse('2026-10-17T20:00:00Z');
const seg = (id, at, seconds, extra = {}) => ({ id, airAt: at, frames: framesOf(seconds), fps: 30, ...extra });

test('every frame carries exactly 1600 samples (48 kHz at 30 fps): the joins never drift', () => {
  assert.equal(samplesOf(1), 1600);
  assert.equal(samplesOf(17999), 17999 * 1600);
  assert.equal(framesOf(2), 60);
  assert.equal(endOf(seg('a', T, 10)), T + 10_000);
});

test('the playout airs the file whose time it is, then the next back to back', () => {
  const q = [seg('b', T + 300_000, 60), seg('a', T, 300)];
  const s1 = planAir(q, T);
  assert.equal(s1.type, 'segment');
  assert.equal(s1.seg.id, 'a', 'the earliest first, whatever the order queued');
  const s2 = planAir(q.filter((x) => x.id !== 'a'), endOf(s1.seg));
  assert.equal(s2.type, 'segment');
  assert.equal(s2.seg.id, 'b');
  assert.equal(s2.offset, 0, 'gapless: the next file starts on the frame after the last');
});

test('a gap before the next file is filled, in whole frames, up to its time (then the schedule is joined)', () => {
  const q = [seg('b', T + 95_000, 60)];
  const s = planAir(q, T);
  assert.equal(s.type, 'filler');
  assert.equal(s.reason, 'gap');
  assert.equal(s.frames, 95 * 30);
  assert.equal(s.until, T + 95_000);
  assert.equal(s.next, 'b');
});

test('nothing queued: filler a granule (2 s) at a time, never black, logged as an underrun', () => {
  const s = planAir([], T);
  assert.equal(s.type, 'filler');
  assert.equal(s.reason, 'underrun');
  assert.equal(s.frames, PLAYOUT_DEFAULTS.granuleSeconds * 30);
  assert.equal(s.until, null);
});

test('a file whose time has passed is dropped (its clock would be wrong), a little late it still airs', () => {
  const late = planAir([seg('a', T, 300)], T + 9_000);
  assert.equal(late.type, 'drop');
  assert.equal(late.seg.id, 'a');
  assert.ok(late.late > 8.9 && late.late < 9.1);
  const close = planAir([seg('a', T, 300)], T + 1_000);
  assert.equal(close.type, 'segment', 'within the tolerance (the clock reads HH:MM)');
  // after the drop the next file is planned as usual
  const next = planAir([seg('b', T + 300_000, 60)], T + 9_000);
  assert.equal(next.type, 'filler');
  assert.equal(next.frames, Math.round((291_000 / 1000) * 30));
});

test('segments without frames or a time are never aired', () => {
  assert.equal(planAir([{ id: 'x', airAt: T, frames: 0 }, { id: 'y', frames: 30 }], T).type, 'filler');
});

test('the buffer is the programme queued from now on (gaps not counted, what aired not counted)', () => {
  const q = [seg('a', T - 60_000, 120), seg('b', T + 60_000, 600), seg('c', T + 3_600_000, 60)];
  assert.equal(bufferAhead(q, T), 60 + 600 + 60);
  assert.equal(bufferAhead([], T), 0);
});

test('the renderer renders while the buffer is under its target and waits when it is full', () => {
  const now = T;
  const full = renderPlan({ frontier: now + 3_700_000, now, target: 3600, expect: 300 });
  assert.equal(full.action, 'wait');
  assert.ok(full.waitSeconds >= 1 && full.waitSeconds <= 60);
  const go = renderPlan({ frontier: now + 1_800_000, now, target: 3600, expect: 300 });
  assert.equal(go.action, 'render');
  assert.equal(go.airAt, now + 1_800_000, 'the next unit airs where the last one ends');
  assert.equal(go.gap, 0);
});

test('fallen behind, the next unit renders for a later time (whole granules after the frontier): the gap is filler', () => {
  const now = T;
  const p = renderPlan({ frontier: now + 30_000, now, target: 3600, expect: 400, minLead: 90 });
  assert.equal(p.action, 'render');
  assert.ok(p.airAt >= now + 490_000, 'never sooner than its render time and the lead');
  assert.equal((p.airAt - (now + 30_000)) % 2000, 0, 'the gap is whole granules');
  assert.ok(p.gap > 0);
  // a cold start (no frontier): from now on
  const cold = renderPlan({ frontier: null, now, target: 3600, expect: 0, minLead: 0 });
  assert.equal(cold.airAt, now);
});

test('the speed meter: a running mean of air seconds made per real second, and the time a unit should take', () => {
  const m = new SpeedMeter({ initial: 1 });
  m.add(600, 300);
  assert.equal(m.speed, 2);
  m.add(600, 600);
  assert.ok(m.speed < 2 && m.speed > 1);
  assert.ok(Math.abs(m.expect(600, 1) - 600 / m.speed) < 1e-9);
  assert.equal(m.add(0, 10), m.speed, 'nothing measured, nothing changed');
});

test('the queue folder: the renderer enqueues, the playout moves what it aired, held units are kept with reasons', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playout-store-'));
  try {
    const st = new PlayoutStore(dir);
    st.enqueue(seg('b', T + 600_000, 60, { title: 'B' }));
    st.enqueue(seg('a', T, 600, { title: 'A' }));
    assert.deepEqual(st.queued().map((s) => s.id), ['a', 'b'], 'listed in air order');
    st.aired(st.queued()[0], { airedAt: 'x' });
    assert.deepEqual(st.queued().map((s) => s.id), ['b']);
    assert.equal(st.airedList()[0].airedAt, 'x');
    st.hold({ id: 'u1', airAt: T + 700_000, violations: [{ rule: 'verbatim', message: 'copied' }], files: [] });
    assert.equal(st.held()[0].violations[0].rule, 'verbatim');
    assert.ok(st.held()[0].heldAt > 0);
    st.event('underrun', { at: 'now' });
    assert.match(fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8'), /"type":"underrun"/);
    st.status('air', { onAir: 'A' });
    assert.equal(st.readStatus('air').onAir, 'A');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('one set of encoder settings: every file and the filler join byte to byte (no B-frames, closed 2 s GOPs, IDR first)', async () => {
  const { airVideoArgs, scaleFilter, parseSize, levelFor, AIR_DEFAULTS } = await import('../server/playout/encode.js');
  const a = airVideoArgs({});
  const val = (k) => a[a.indexOf(k) + 1];
  assert.equal(val('-bf'), '0');
  assert.equal(val('-g'), '60');
  assert.equal(val('-keyint_min'), '60');
  assert.equal(val('-sc_threshold'), '0');
  assert.equal(val('-preset'), AIR_DEFAULTS.preset);
  assert.match(val('-x264-params'), /open-gop=0/);
  assert.match(val('-x264-params'), /repeat-headers=1/);
  assert.equal(val('-level:v'), '4.1', '1080p30 (x5, the default) fits level 4.1');
  assert.equal(levelFor(parseSize('1152x648'), 30), '3.1');
  assert.deepEqual(airVideoArgs({}), airVideoArgs({}), 'the same every time');
  assert.equal(scaleFilter({ size: '1920x1080' }), 'scale=w=1920:h=1080:flags=neighbor:out_color_matrix=bt709:out_range=tv,format=yuv420p');
  assert.throws(() => scaleFilter({ size: '1280x720' }), /whole multiple/, 'x3.33 never reaches the encoder');
  assert.throws(() => parseSize('1281x720'), /even/);
  assert.throws(() => airVideoArgs({ bitrate: 'lots' }), /bitrate/);
  assert.throws(() => airVideoArgs({ preset: 'placebo' }), /preset/);
});
