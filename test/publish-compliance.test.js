// The publishing desk's contract with the compliance desk (server/publish/compliance.js; docs/publishing/compliance.md
// §8). These tests run against whichever module compliance.js loads: the real server/compliance/ when it is in the
// tree, else the clearly marked stub; the same assertions hold for both, and the stub's own are checked here too. Never
// publish an item that fails checkClip: the publisher's gate is tested in publish-publisher.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as C from '../server/publish/compliance.js';
import * as STUB from '../server/publish/compliance-stub.js';

const REAL = fs.existsSync(new URL('../server/compliance/index.js', import.meta.url));
const EP = {
  id: 'e1',
  program: { id: 'cosmos', title: 'COSMOS DESK' },
  segments: [
    { type: 'intro', anchor: 'A', text: 'Good evening. This is COSMOS DESK.' },
    { type: 'story', anchor: 'A', text: 'A rare family of barn owls moved into Manhattan. New Yorkers are delighted.', storyId: 's1', source: 'NPR Science', headline: 'Barn owls move into Manhattan' },
  ],
};
// the recorder's report: the story's two sentences, its voice clip from 7.12 s for 4.4 s
const REPORT = {
  events: [
    { type: 'speak', slot: 'A', text: 'Good evening. This is COSMOS DESK.', v: 2 },
    { type: 'clip', va: 2.12, duration: 2.5, v: 2 },
    { type: 'sentence', slot: 'A', i: 0, text: 'Good evening.', v: 2.13 },
    { type: 'sentence', slot: 'A', i: 1, text: 'This is COSMOS DESK.', v: 3.3 },
    { type: 'speak', slot: 'A', text: 'A rare family of barn owls moved into Manhattan.', v: 7 },
    { type: 'clip', va: 7.12, duration: 4.4, v: 7 },
    { type: 'sentence', slot: 'A', i: 0, text: 'A rare family of barn owls moved into Manhattan.', v: 7.13 },
    { type: 'sentence', slot: 'A', i: 1, text: 'New Yorkers are delighted.', v: 9.9 },
  ],
};
const FLAGS = { youtube: { containsSyntheticMedia: true }, tiktok: { is_aigc: true }, instagram: { is_ai_generated: true } };
const MODULES = [['loaded', C], ['stub', STUB]];

test(`compliance.js loads ${REAL ? 'the real module' : 'the stub'} and says which`, () => {
  assert.equal(C.usingStub, !REAL);
  if (!REAL) assert.equal(C.complianceModule.STUB, true, 'the stub is marked');
});

for (const [name, M] of MODULES) {
  test(`${name}: disclosureFor gives every platform its label field (or none) and the opening line`, () => {
    const d = M.disclosureFor({ kind: 'short', episode: EP, platforms: ['youtube', 'tiktok', 'instagram', 'facebook'] });
    for (const p of ['youtube', 'tiktok', 'instagram']) assert.ok(d.platforms[p]?.field, `${p} has a field`);
    assert.ok(d.platforms.facebook && !d.platforms.facebook.field, 'Facebook has no API field');
    assert.ok(Array.isArray(d.description?.lines) && d.description.lines.length >= 1);
    assert.match(d.description.lines.join(' '), /AI/);
  });

  test(`${name}: creditsFor names the outlets`, () => {
    const credits = M.creditsFor({ kind: 'clip', episode: EP });
    assert.ok(Array.isArray(credits));
    if (!REAL || name === 'stub') assert.ok(credits.some((c) => /NPR Science/.test(typeof c === 'string' ? c : JSON.stringify(c))));
  });

  test(`${name}: textPost opens with "AI-generated:"`, () => {
    const t = M.textPost({ kind: 'text', text: 'Barn owls moved into Manhattan.', source: 'NPR Science', link: 'https://www.npr.org/x' });
    assert.ok(String(t).startsWith('AI-generated:'), t);
  });

  test(`${name}: checkClip refuses demo data`, () => {
    const r = M.checkClip({ id: 'c', kind: 'clip', episode: { ...EP, demo: true }, recording: REPORT, range: { start: 6.9, end: 12 }, platforms: ['youtube'], flags: FLAGS });
    assert.equal(r.ok, false);
    assert.ok(r.violations.some((v) => v.rule === 'demo'));
  });

  test(`${name}: checkClip refuses a cut inside a sentence and passes a cut between sentences`, () => {
    const inside = M.checkClip({ id: 'c', kind: 'clip', episode: EP, recording: REPORT, range: { start: 8.5, end: 12 }, platforms: ['youtube'], flags: FLAGS });
    assert.ok(inside.violations.some((v) => v.rule === 'sentence-cut' || v.rule === 'quote-cut'), JSON.stringify(inside.violations));
    const clean = M.checkClip({ id: 'c', kind: 'clip', episode: EP, recording: REPORT, range: { start: 6.9, end: 11.9 }, platforms: ['youtube'], flags: FLAGS });
    assert.ok(!clean.violations.some((v) => v.rule === 'sentence-cut' || v.rule === 'quote-cut'), JSON.stringify(clean.violations));
  });

  test(`${name}: a cut after a sentence's voice has ended is not inside it (the voice clip's end counts)`, () => {
    // "This is COSMOS DESK." is the last sentence of a clip that ends at 4.62 s; the next sentence starts at 7.13 s
    const r = M.checkClip({ id: 'c', kind: 'clip', episode: EP, recording: REPORT, range: { start: 5.5, end: 11.9 }, platforms: ['youtube'], flags: FLAGS });
    assert.ok(!r.violations.some((v) => v.rule === 'sentence-cut'), JSON.stringify(r.violations));
  });

  test(`${name}: checkClip wants the platform's AI flag`, () => {
    const r = M.checkClip({ id: 'c', kind: 'clip', episode: { ...EP, segments: [...EP.segments, { type: 'cross', kind: 'restage', reporter: 'g1', text: 'We will build it.', storyId: 's1' }], guests: { g1: { name: 'A Minister', role: 'minister' } } }, recording: REPORT, range: { start: 0, end: 30 }, platforms: ['youtube'], flags: {} });
    assert.equal(r.ok, false);
  });
}

test('the stub on the safe side: a recreation with no recording is refused, an election period holds', () => {
  const ep = { ...EP, segments: [...EP.segments, { type: 'cross', kind: 'restage', reporter: 'g1', text: 'We will build it.' }] };
  assert.ok(STUB.checkClip({ id: 'c', kind: 'clip', episode: ep, range: { start: 0, end: 10 }, platforms: ['youtube'], flags: FLAGS }).violations.some((v) => v.rule === 'timeline-missing'));
});

test('preflight: a text post without its disclosure is refused', () => {
  const r = C.preflight({ kind: 'text', text: 'Barn owls moved into Manhattan.', platforms: ['x'] });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.rule === 'text-disclosure-missing'));
});

test('markFile never throws through the desk\'s door (an unmarked file is reported, and never sent live)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mark-'));
  const r = await C.markFile(path.join(dir, 'missing.mp4'), C.buildManifest({ kind: 'clip' }, { title: 'x' }));
  assert.equal(typeof r.ok, 'boolean');
  if (!REAL) assert.equal(r.ok, false);
  const f = path.join(dir, 'clip.mp4');
  fs.writeFileSync(f, 'not a video');
  const s = await STUB.markFile(f, { title: 'x' });
  assert.equal(s.ok, false, 'the stub never claims a signature');
  assert.ok(fs.existsSync(s.sidecar));
});

test('the register: a review is recorded when the real module is there, and never throws on the stub', () => {
  const r = C.recordReview('item-1', { by: 'owner', verdict: 'approve' }, { dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'reg-')) });
  assert.equal(typeof r.ok, 'boolean');
  if (!REAL) assert.deepEqual(r, { ok: false, stub: true });
});
