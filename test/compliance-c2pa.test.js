// Machine-readable marking (server/compliance/c2pa.js; compliance.md §4): every exported video and image carries a
// signed C2PA manifest that reads back as AI-produced (IPTC compositeWithTrainedAlgorithmicMedia), with the
// channel's disclosure; a file without one is refused at publish time; the audio watermark's pipeline (extract,
// mark, re-mux, then sign) works with the embedder when it is installed (here a stand-in, since the real one could
// not be fetched). The end-to-end tests need the C2PA SDK (pip install -r tools/c2pa/requirements.txt) and ffmpeg;
// without them they are skipped with the reason, and the publish-time check refuses every file instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildManifest, markFile, readMark, c2paStatus, watermarkStatus, watermarkFile, SOURCE_TYPE } from '../server/compliance/c2pa.js';
import { preflight } from '../server/compliance/index.js';

const sdk = c2paStatus();
const ffmpeg = !spawnSync('ffmpeg', ['-version']).error;
const openssl = !spawnSync('openssl', ['version']).error;
const skip = !sdk.ok ? `C2PA SDK not installed (${sdk.reason})` : !ffmpeg ? 'ffmpeg not installed' : !openssl ? 'openssl not installed' : false;
const QUIET = { generatedAt: new Date().toISOString(), elections: [] };
const ENV = { EDITORIAL_CONTACT: 'editor@example.org' };

const ep = {
  id: 'e1',
  provider: 'mock',
  program: { id: 'world-now', title: 'WORLD NOW' },
  storyIds: ['s1'],
  guests: { rp_1: { id: 'rp_1', name: 'Ana Silva', role: 'mayor of Lisbon' } },
  segments: [
    { type: 'story', storyId: 's1', text: 'Lisbon opened its tram line.', source: 'Harbour Herald', linkKind: 'restage' },
    { type: 'cross', kind: 'restage', recreation: true, reporter: 'rp_1', anchor: 'R1', storyId: 's1', text: 'We will publish the plan next week.', quoteRef: { outlet: 'Harbour Herald', by: 'Ana Silva' } },
  ],
};

test('the manifest says what is AI and what is not, the programme, the recreation and the sources', () => {
  const m = buildManifest({ kind: 'episode', episode: ep }, { sources: ['Harbour Herald', 'Harbour Herald'], credits: ['Map data: Natural Earth'] });
  const act = m.assertions.find((a) => a.label === 'c2pa.actions.v2').data.actions[0];
  assert.equal(act.action, 'c2pa.created');
  assert.equal(act.digitalSourceType, SOURCE_TYPE.composite);
  const d = m.assertions.find((a) => a.label === 'org.globit24.disclosure').data;
  assert.equal(d.label, 'AI-PRODUCED NEWS');
  assert.equal(d.ai.voices, true);
  assert.equal(d.ai.textBy, 'software');
  assert.match(d.ai.pictures, /never AI-generated/);
  assert.deepEqual(d.recreations.map((r) => r.name), ['Ana Silva']);
  assert.deepEqual(d.sources, ['Harbour Herald']);
  assert.ok(!JSON.stringify(m).match(/@|password|token/i), 'no personal data, no secrets');
});

function media(dir) {
  const mp4 = path.join(dir, 'clip.mp4');
  const png = path.join(dir, 'thumb.png');
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=384x216:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4]);
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=384x216', '-frames:v', '1', png]);
  return { mp4, png };
}

test('a video and a thumbnail are marked in place and read back as AI-produced; an unmarked file is refused', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2pa-'));
  try {
    const { mp4, png } = media(dir);
    assert.equal(readMark(mp4).ok, false, 'nothing before');
    const before = preflight({ id: 'e1', kind: 'episode', episode: { ...ep, segments: ep.segments.slice(0, 1) }, files: [mp4], platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: false, selfDeclaredMadeForKids: false } } }, { calendar: QUIET, env: ENV, requireReview: false });
    assert.ok(before.violations.some((v) => v.rule === 'unmarked'), 'refused while unmarked');
    for (const f of [mp4, png]) {
      const r = markFile(f, buildManifest({ kind: 'episode', episode: ep }), { dataDir: dir, tsa: '' });
      assert.equal(r.ok, true);
      assert.equal(r.path, f);
      assert.equal(r.devCert, true, 'a development certificate here (C2PA_CERT for launch)');
      const back = readMark(f);
      assert.equal(back.ok, true);
      assert.equal(back.aiGenerated, true);
      assert.equal(back.sourceType, SOURCE_TYPE.composite);
      assert.equal(back.disclosure.label, 'AI-PRODUCED NEWS');
      assert.ok(back.validation.every((s) => s.code === 'signingCredential.untrusted'), back.validation.map((s) => s.code).join());
      assert.equal(back.state, 'Valid');
    }
    const after = preflight({ id: 'e1', kind: 'episode', episode: { ...ep, segments: ep.segments.slice(0, 1) }, files: [mp4, png], platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: false, selfDeclaredMadeForKids: false } } }, { calendar: QUIET, env: ENV, requireReview: false });
    assert.deepEqual(after.violations.filter((v) => v.rule === 'unmarked'), []);
    // the signing key never leaves data/compliance/c2pa, readable by its owner only
    const key = path.join(dir, 'compliance', 'c2pa', 'sign.key');
    assert.equal(fs.statSync(key).mode & 0o077, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a tampered file no longer verifies (the hard binding), and a manifest that does not read back throws', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2pa-'));
  try {
    const { png } = media(dir);
    markFile(png, buildManifest({ kind: 'image', episode: ep }), { dataDir: dir, tsa: '' });
    const buf = fs.readFileSync(png);
    // flip bytes in the image data (after the manifest box, before the end)
    const at = buf.length - 64;
    buf[at] ^= 0xff;
    buf[at + 1] ^= 0xff;
    fs.writeFileSync(png, buf);
    const back = readMark(png);
    assert.ok(back.validation.some((s) => /mismatch|invalid/i.test(s.code)) || back.ok === false, `tampering detected: ${back.validation.map((s) => s.code).join()}`);
    assert.throws(() => markFile(path.join(dir, 'nope.mp4'), {}, { dataDir: dir }), /no file/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the audio watermark: off when the embedder is missing (said why); extract, mark, re-mux, then sign when it is there', { skip: !ffmpeg || !sdk.ok ? 'ffmpeg or the C2PA SDK missing' : false }, () => {
  const st = watermarkStatus({ watermarkBin: '/nonexistent/audiowmark' });
  assert.equal(st.ok, false);
  assert.match(st.reason, /not installed/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-'));
  try {
    // a stand-in embedder with the real one's command line ("audiowmark add IN OUT PAYLOAD"): it copies the sound
    const fake = path.join(dir, 'audiowmark');
    fs.writeFileSync(fake, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "stand-in 0.0"; exit 0; fi\nif [ "$1" = "add" ]; then cp "$2" "$3"; echo "$4" > "$3.payload"; exit 0; fi\nexit 1\n');
    fs.chmodSync(fake, 0o755);
    const { mp4 } = media(dir);
    const w = watermarkFile(mp4, { watermarkBin: fake, outDir: dir, payload: 'c0ffee' });
    assert.equal(w.ok, true, w.reason);
    assert.equal(fs.readFileSync(path.join(dir, 'voice.marked.wav.payload'), 'utf8').trim(), 'c0ffee00000000000000000000000000');
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', w.path], { encoding: 'utf8' }).stdout.trim().split('\n').sort();
    assert.deepEqual(probe, ['audio', 'video'], 'picture kept, sound back in');
    const r = markFile(mp4, buildManifest({ kind: 'episode', episode: ep }), { dataDir: dir, tsa: '', watermarkBin: fake });
    assert.deepEqual(r.watermark, { ok: true, backend: 'audiowmark' });
    assert.equal(readMark(mp4).aiGenerated, true, 'signed after the watermark: the manifest binds the marked file');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
