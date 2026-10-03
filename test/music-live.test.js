// Live music beds (public/js/music/live.js and the director's cues): the lofi engine on the channel's own context,
// cued at the recorder's moments, ducking itself under the voices; off with ?beds=0 (owner 17:05).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveMusic } from '../public/js/music/live.js';
import { Director } from '../public/js/director.js';

function fakes() {
  const calls = [];
  const engine = {
    started: false,
    start() { this.started = true; },
    cue(moment, opts, at) { calls.push({ moment, opts, at }); },
    setSpeaking(on, at) { calls.push({ speaking: on, at }); },
    stop() { calls.push({ stop: true }); },
  };
  const audio = { context: { currentTime: 12.5 }, musicBus: {}, voiced: false, musicDuckDb: -20, sfx() {}, playTune: () => ({ stop() {} }), setVoices() {}, async speak() {} };
  return { calls, engine, audio, makeEngine: () => engine };
}

test('the engine starts on first use, on the channel\'s context, and the audio engine stops ducking its beds', () => {
  const { calls, engine, audio, makeEngine } = fakes();
  const m = new LiveMusic(audio, { makeEngine });
  m.setProgram('world-now');
  assert.equal(m.cue('story', { emotion: 'neutral', segment: 2 }), true);
  assert.ok(engine.started);
  assert.equal(audio.musicDuckDb, 0, 'the bed engine ducks itself');
  assert.deepEqual(calls[0], { moment: 'story', opts: { emotion: 'neutral', segment: 2, programId: 'world-now' }, at: 12.5 });
  m.stop();
});

test('accents reach only the programmes whose bible uses them; no context, no engine; ?beds=0 never starts', () => {
  const { calls, audio, makeEngine } = fakes();
  const m = new LiveMusic(audio, { makeEngine });
  m.setProgram('tech-bytes');
  assert.equal(m.cue('pip', { line: 0 }), false, 'pip is WORLD NOW\'s');
  m.setProgram('world-now');
  assert.equal(m.cue('pip', { line: 0 }), true);
  assert.equal(calls.filter((c) => c.moment).length, 1);
  m.stop();
  const early = new LiveMusic({ context: null, musicBus: null }, { makeEngine });
  assert.equal(early.cue('story'), false);
  const off = new LiveMusic(audio, { enabled: false, makeEngine });
  assert.equal(off.cue('story'), false);
  assert.equal(off.engine, null);
});

test('the duck follows what is heard (polled), and an engine error never escapes', () => {
  const { calls, audio, makeEngine, engine } = fakes();
  const m = new LiveMusic(audio, { makeEngine });
  m.cue('chat', { programId: 'world-now' });
  audio.voiced = true;
  m.tick();
  m.tick();
  audio.voiced = false;
  m.tick();
  assert.deepEqual(calls.filter((c) => 'speaking' in c).map((c) => c.speaking), [true, false]);
  engine.cue = () => { throw new Error('boom'); };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(m.cue('story', { programId: 'world-now' }), false);
  } finally {
    console.warn = warn;
  }
  m.stop();
});

test('the director cues the music at the recorder\'s moments: open, segments, break, spots, promo', async () => {
  const { calls, audio, makeEngine } = fakes();
  const d = new Director({ audio, channel: { name: 'T', slogan: '', presenters: {} } });
  d.music.stop();
  d.music = new LiveMusic(audio, { makeEngine });
  d.voices = { audioFor: async () => null, refreshAds() {}, prepareAd() {}, adLine: () => null, episode() {} };
  d.scene.program = { id: 'world-now' };
  d.scene.cast = { A: 'paco', B: 'lola' };
  d.music.setProgram('world-now');
  await d.say({ type: 'story', anchor: 'A', emotion: 'neutral', text: 'Lisbon opened a new tram line.', storyId: 's1' });
  await d.say({ type: 'story', anchor: 'B', emotion: 'serious', text: 'Floods hit Kerala.', storyId: 's2' });
  await d.say({ type: 'outro', anchor: 'A', emotion: 'neutral', text: 'That is all for now.' });
  d.setShot('endcard', { card: { line1: 'STAY WITH US' } });
  d.setShot('promo', { card: { next: { id: 'tech-bytes' } } });
  const moments = calls.filter((c) => c.moment).map((c) => c.moment + (c.opts.grave ? ':grave' : ''));
  assert.deepEqual(moments, ['story', 'story:grave', 'outro', 'signoffEnd', 'endcard', 'upNext']);
  assert.equal(calls.find((c) => c.moment === 'upNext').opts.programId, 'channel');
  d.music.stop();
});
