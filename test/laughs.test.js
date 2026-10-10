// Owner decision 7 (5 Oct): laughs yes, soft and natural. A [chuckle] at the start of a line is heard as a quiet
// laugh in the speaker's own voice before the words (tools/voice/engine.py) and seen as a closed-mouth smile; one per
// programme, light banter only, never in COSMOS, NEWS IN 60 or MONEY MINUTE, never from UNIT-8, never on a grave story.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as speech from '../public/js/voice/speechtext.js';
import { ACTIONS, parseCues } from '../public/js/cues.js';
import { HEADS } from '../public/js/v2/canvas25d/gestures/heads.js';
import { BIBLE } from '../public/js/v2/canvas25d/direction/gestures.js';
import { segmentRequest, wantsChuckle, clipId } from '../server/voice/plan.js';
import { normalizeBulletin, buildPrompt } from '../server/writer.js';
import { loadChannel } from '../server/channel.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASTING = JSON.parse(fs.readFileSync(path.join(REPO, 'server', 'voice', 'casting.json'), 'utf8'));
const CHANNEL = loadChannel();
const program = (id) => ({ id, ...CHANNEL.programs[id] });

test('chuckle is a light head gesture: dropped on a grave story, a soft v2 head move with every track back at rest', () => {
  assert.equal(ACTIONS.chuckle.kind, 'head');
  assert.ok(ACTIONS.chuckle.light);
  assert.deepEqual(parseCues('[chuckle] Fair enough.', { grave: true }).cues, []);
  assert.deepEqual(parseCues('[chuckle] Fair enough.').cues, [{ char: 0, slot: null, action: 'chuckle' }]);
  const h = HEADS.chuckle;
  assert.ok(h.dur < HEADS.laugh.dur, 'smaller than the laugh');
  for (const [name, track] of Object.entries(h.tracks)) assert.equal(track.at(-1)[1], 0, name);
  assert.ok(Math.max(...h.tracks.smile.map((k) => k[1])) < Math.max(...HEADS.laugh.tracks.smile.map((k) => k[1])));
});

test('who may chuckle: WORLD NOW and TECH BYTES presenters; never COSMOS (UNIT-8 included), NEWS IN 60 or MONEY MINUTE', () => {
  assert.ok(CHANNEL.programs['world-now'].gestures.allow.includes('chuckle'));
  assert.ok(CHANNEL.programs['tech-bytes'].gestures.allow.max.includes('chuckle') && CHANNEL.programs['tech-bytes'].gestures.allow.ada.includes('chuckle'));
  assert.ok(CHANNEL.programs.cosmos.gestures.deny.includes('chuckle'));
  for (const id of ['news-60', 'money-minute']) assert.ok(!CHANNEL.programs[id].gestures.allow.includes('chuckle'), id);
  assert.ok(BIBLE.cosmos.banned.includes('chuckle'));
  assert.ok(BIBLE['world-now'].speaker.includes('chuckle'));
});

test('the voice: the line\'s own chuckle at its start marks the first phrase for the worker; a robot never chuckles', () => {
  const seg = { type: 'outro', anchor: 'B', emotion: 'neutral', text: "That's TECH BYTES. From Ada Volt and from me, thanks for watching.", cues: [{ char: 0, slot: null, action: 'chuckle' }, { char: 19, slot: null, action: 'nod' }] };
  assert.ok(wantsChuckle(seg));
  const req = segmentRequest(seg, { presenterId: 'max', presenter: CHANNEL.presenters.max, casting: CASTING, speech });
  assert.equal(req.phrases[0].chuckle, true);
  assert.ok(req.phrases.slice(1).every((p) => !p.chuckle));
  const plain = segmentRequest({ ...seg, cues: [] }, { presenterId: 'max', presenter: CHANNEL.presenters.max, casting: CASTING, speech });
  assert.notEqual(clipId(req), clipId(plain), 'a chuckled line is its own clip');
  assert.ok(!wantsChuckle({ ...seg, cues: [{ char: 30, slot: null, action: 'chuckle' }] }), 'only at the start of the line');
  assert.ok(!wantsChuckle({ ...seg, cues: [{ char: 0, slot: 'A', action: 'chuckle' }] }), 'only the speaker\'s own');
  const robot = segmentRequest(seg, { presenterId: 'unit8', presenter: CHANNEL.presenters.unit8, casting: CASTING, speech });
  assert.ok(!robot.chuckle && !(robot.phrases || []).some((p) => p.chuckle), 'UNIT-8 is a machine');
  // without a phrase plan the request itself asks for it
  const bare = segmentRequest(seg, { presenterId: 'max', presenter: CHANNEL.presenters.max, casting: CASTING, speech: null });
  assert.equal(bare.chuckle, true);
});

test('the writer: one chuckle per programme, only at the start of a line, never in COSMOS; the prompt says when', () => {
  const STORY = { id: 'g1', title: 'Museum unveils replica of famous supercomputer', summary: 'A computing museum has unveiled a full-scale replica of the Cray-1 supercomputer, powered by old desktop computers.', source: 'Ledger Line', category: 'tech', image: null };
  const segs = (chat2) => [
    { type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening.' },
    { type: 'story', storyId: 'g1', anchor: 'A', emotion: 'neutral', headline: 'Museum unveils supercomputer replica', text: 'A computing museum has unveiled a full-scale replica of the Cray-1 supercomputer.', shot: 'wide' },
    { type: 'chat', anchor: 'B', emotion: 'happy', text: '[chuckle] A supercomputer that fits in a cupboard.' },
    { type: 'chat', anchor: 'A', emotion: 'happy', text: chat2 },
    { type: 'outro', anchor: 'A', emotion: 'neutral', text: "[chuckle] That's TECH BYTES." },
  ];
  const DUO = { A: { id: 'max', ...CHANNEL.presenters.max }, B: { id: 'ada', ...CHANNEL.presenters.ada } };
  const out = normalizeBulletin({ title: 'T', segments: segs('It is very [chuckle] old hardware.') }, [STORY], { program: program('tech-bytes'), presenters: DUO });
  const chuckles = out.segments.flatMap((s) => (s.cues || []).filter((c) => c.action === 'chuckle').map(() => s.type));
  assert.deepEqual(chuckles, ['chat'], 'the first one only (the mid-line one never)');
  const NOVA = { A: { id: 'nova', ...CHANNEL.presenters.nova }, B: { id: 'unit8', ...CHANNEL.presenters.unit8 } };
  const cosmos = normalizeBulletin({ title: 'T', segments: segs('Old hardware.') }, [STORY], { program: program('cosmos'), presenters: NOVA });
  assert.ok(!cosmos.segments.some((s) => (s.cues || []).some((c) => c.action === 'chuckle')), 'nobody laughs in COSMOS');
  const prompt = (id, P) => buildPrompt({ channelName: 'GLOBIT 24', program: program(id), presenters: P, stories: [STORY], count: 1 });
  assert.match(prompt('tech-bytes', DUO), /\[chuckle\]" \(a soft, closed-mouth chuckle/);
  assert.doesNotMatch(prompt('cosmos', NOVA), /\[chuckle\]" \(a soft/);
});
