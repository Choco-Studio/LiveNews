// The face reader's verdicts (server/faces.js): a sober portrait is one face, big enough, calm, no smile; a face in
// the foreground is noted (a FILE picture of an event under a grave story shows none)
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { faceVerdict, FaceStore, SOBER } from '../server/faces.js';

const face = (h, emotions, extra = {}) => ({ x: 0.3, y: 0.1, w: h * 0.8, h, score: 0.97, emotions, ...extra });

describe('the verdict', () => {
  test('one calm face, big enough: sober', () => {
    const v = faceVerdict({ faces: [face(0.35, { neutral: 0.9, sadness: 0.05, happiness: 0.01 })] });
    assert.equal(v.sober, true);
    assert.equal(v.expression, 'neutral');
    assert.equal(v.foreground, true);
  });
  test('a smile, a grin, surprise, no face, a small face, two people: not sober', () => {
    assert.match(faceVerdict({ faces: [face(0.35, { neutral: 0.3, happiness: 0.7 })] }).why, /^smiling/);
    assert.match(faceVerdict({ faces: [face(0.35, { neutral: 0.75, happiness: 0.25 })] }).why, /^smiling/, 'a faint smile is a smile');
    assert.equal(faceVerdict({ faces: [face(0.35, { neutral: 0.4, surprise: 0.6 })] }).why, 'surprised');
    assert.equal(faceVerdict({ faces: [] }).why, 'no face found');
    assert.equal(faceVerdict({ faces: [face(0.05, { neutral: 1 })] }).why, 'face too small for a portrait');
    assert.equal(faceVerdict({ faces: [face(0.3, { neutral: 1 }), face(0.25, { neutral: 1 }, { x: 0.6 })] }).why, 'two people');
    assert.equal(faceVerdict({ faces: [face(0.3, { anger: 0.8, neutral: 0.2 })] }).why, 'not calm (anger)');
    assert.equal(faceVerdict(null), null);
  });
  test('the foreground: a face this share of the height or more', () => {
    assert.equal(faceVerdict({ faces: [face(SOBER.foreground + 0.01, { neutral: 1 })] }).foreground, true);
    assert.equal(faceVerdict({ faces: [face(0.03, { neutral: 1 }), face(0.04, { neutral: 1 })] }).foreground, false);
    assert.equal(faceVerdict({ faces: [face(0.2, { neutral: 1 }, { score: 0.5 })] }).foreground, false, 'not surely a face');
  });
});

describe('the store', () => {
  test('a queue of pictures to read, the readings kept on disk, read again when the reader writes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faces-'));
    try {
      const store = new FaceStore({ dir });
      assert.equal(store.verdict('https://x/a.jpg'), null);
      store.want('https://x/a.jpg', 'sober portrait: A');
      store.want('https://x/a.jpg', 'again');
      assert.deepEqual(store.queue(), [{ url: 'https://x/a.jpg', why: 'sober portrait: A' }]);
      // the reader (another process) reads the queue and writes its readings
      const reader = new FaceStore({ dir });
      assert.equal(reader.queue().length, 1);
      reader.record('https://x/a.jpg', { faces: [face(0.35, { neutral: 1 })] });
      reader.save();
      assert.equal(store.verdict('https://x/a.jpg').sober, true, 'the desk reads the new file');
      assert.equal(store.queue().length, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  test('a picture that would not download was never read (asked again, never "no face")', () => {
    const store = new FaceStore({});
    store.record('https://x/b.jpg', { faces: [], failed: 'download' });
    assert.equal(store.verdict('https://x/b.jpg'), null);
    store.want('https://x/b.jpg', 'retry');
    assert.equal(store.queue().length, 1);
  });
});
