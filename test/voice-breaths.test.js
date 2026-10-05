// Owner 5 Oct: no breaths in the presenters' voices (laughs stay). Every request the
// planner sends to the Kokoro worker turns breaths off (tools/voice/engine.py reads it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentRequest, adLineRequest, BREATHS } from '../server/voice/plan.js';

test('breaths are off by owner decision', () => {
  assert.equal(BREATHS, false);
});

test('presenter and advert requests ask the worker for no breaths', () => {
  const presenter = { name: 'Paco Pixel', voice: { gender: 'male', lang: 'en-GB' } };
  const seg = { type: 'story', anchor: 'A', emotion: 'neutral', text: 'The storm moved inland. Forecasters expect two more days of rain.' };
  const req = segmentRequest(seg, { presenterId: 'paco', presenter, casting: {} });
  assert.equal(req.breaths, false);
  const ad = adLineRequest('Pixel Cola. Now with eight bits of flavour.', { cast: { voice: 'am_adam', speed: 1, lang: 'en-us' } });
  assert.equal(ad.breaths, false);
});
