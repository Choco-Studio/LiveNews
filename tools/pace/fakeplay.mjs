// Fake-clock playout (owner: PACE stream): plays a whole episode through the real default-path Director
// (public/js/director.js) in node, with setTimeout and performance.now() on a virtual clock and a speech stub
// that speaks every sentence at 15 characters per second (0.3 s between sentences). Everything that airs is
// logged: shots (and the shots as the viewer sees them: a focus change on the same wide is no cut), voice
// on/off, sound cues. test/pace.test.js asserts the pace rules on it; `node tools/pace/fakeplay.mjs ep.json`
// prints the timeline.
import fs from 'node:fs';
import { Director } from '../../public/js/director.js';
import { splitSentences } from '../../public/js/audio/sentences.js';

export function fakeClock() {
  let t = 1e6; // ms
  let seq = 0;
  const timers = new Map();
  const real = { st: globalThis.setTimeout, ct: globalThis.clearTimeout, perf: Object.getOwnPropertyDescriptor(globalThis, 'performance') };
  globalThis.setTimeout = (fn, ms = 0, ...a) => {
    const id = ++seq;
    timers.set(id, { at: t + Math.max(0, Number(ms) || 0), fn: () => fn(...a), seq: id });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  Object.defineProperty(globalThis, 'performance', { value: { now: () => t }, configurable: true, writable: true });
  const settle = () => new Promise((r) => setImmediate(r));
  return {
    now: () => t / 1000,
    async run(promise) {
      let done = false;
      let error = null;
      promise.then(() => (done = true), (e) => ((done = true), (error = e)));
      for (let steps = 0; !done; steps++) {
        for (let k = 0; k < 4 && !done; k++) await settle();
        if (done) break;
        let next = null;
        for (const [id, x] of timers) if (!next || x.at < next.at || (x.at === next.at && x.seq < next.seq)) next = { id, ...x };
        if (!next || steps > 200000) throw new Error('fake clock: nothing left to run');
        timers.delete(next.id);
        t = Math.max(t, next.at);
        next.fn();
      }
      if (error) throw error;
    },
    restore() {
      globalThis.setTimeout = real.st;
      globalThis.clearTimeout = real.ct;
      Object.defineProperty(globalThis, 'performance', real.perf);
    },
  };
}

/** Play `ep` on the default path (no v2) on the fake clock: { shots, says, sfx, sleeps }. */
export async function playDefault(ep, { pictures = true, mode = 'mute' } = {}) {
  const clock = fakeClock();
  const log = { shots: [], says: [], sfx: [] };
  try {
    const audio = {
      mode,
      setVoices() {},
      stop() {},
      playTune: () => ({ stop() {} }),
      sfx: (name, o) => log.sfx.push({ name, t: clock.now(), startAt: o?.startAt != null ? o.startAt / 1000 : null }),
      speak(text, slot, { onSentence } = {}) {
        return new Promise((resolve) => {
          const lines = splitSentences(text);
          const say = { text, slot, on: clock.now(), off: null };
          log.says.push(say);
          let i = 0;
          const step = () => {
            if (i >= lines.length) {
              say.off = clock.now();
              resolve();
              return;
            }
            onSentence?.(lines[i], i);
            const d = lines[i].length / 15 + (i + 1 < lines.length ? 0.3 : 0);
            i++;
            setTimeout(step, d * 1000);
          };
          step();
        });
      },
    };
    const d = new Director({ audio, channel: { name: 'GLOBIT 24', slogan: '', presenters: {} } });
    d.voices = { episode() {}, audioFor: async () => null, refreshAds() {}, prepareAd() {}, adLine: () => null };
    d.prepareImages = async () => {};
    if (pictures) for (const r of ep.rundown || []) if (r.hasImage) d.images.set(r.storyId, { small: {}, full: {}, card: {} });
    const setShot = d.setShot.bind(d);
    d.setShot = (shot, extra = {}) => {
      const before = d.scene.shotSince;
      setShot(shot, extra);
      if (d.scene.shotSince !== before) log.shots.push({ shot, focus: d.scene.focus, storyId: d.scene.storyId, t: clock.now() });
    };
    await clock.run(d.playEpisode(structuredClone(ep)));
    log.end = clock.now();
  } finally {
    clock.restore();
  }
  // shots as the viewer sees them: a re-set of the same wide (a focus change) is no cut
  const seen = [];
  for (const x of log.shots) {
    const prev = seen[seen.length - 1];
    if (prev && prev.shot === 'wide' && x.shot === 'wide') continue;
    seen.push({ ...x });
  }
  for (let i = 0; i < seen.length; i++) seen[i].len = (i + 1 < seen.length ? seen[i + 1].t : log.end) - seen[i].t;
  log.seen = seen;
  return log;
}


/** CLI: print the default-path timeline of an episode JSON (a saved /api/queue episode or a fixture). */
async function cli() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node tools/pace/fakeplay.mjs episode.json [--no-pictures]');
    process.exit(1);
  }
  const ep = JSON.parse(fs.readFileSync(file, 'utf8'));
  const log = await playDefault(ep, { pictures: !process.argv.includes('--no-pictures') });
  const t0 = log.seen[0]?.t ?? 0;
  const ev = [
    ...log.seen.map((x) => ({ t: x.t, s: `SHOT ${x.shot.padEnd(12)} ${String(x.focus || '').padEnd(2)} ${x.len.toFixed(2)} s` })),
    ...log.says.map((x) => ({ t: x.on, s: `  SAY ${x.slot} ${(x.off - x.on).toFixed(2)} s  ${x.text.slice(0, 70)}` })),
    ...log.sfx.map((x) => ({ t: x.startAt ?? x.t, s: `  SFX ${x.name}` })),
  ].sort((a, b) => a.t - b.t);
  for (const e of ev) console.log(`${(e.t - t0).toFixed(2).padStart(7)}  ${e.s}`);
}
if (import.meta.url === `file://${process.argv[1]}`) cli();
