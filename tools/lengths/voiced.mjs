// An edition's voiced length: the episode played through the real director (public/js/director.js, the default path) on
// the fake clock of tools/pace/fakeplay.mjs, each line spoken at its voice's measured Kokoro rate (server/voice/
// rates.json): the open, the headlines' beats, every pause of the pace profile, the boards' and links' timing, the
// sign-off hold and the end card included. What a viewer with the real voices sits through, to a few seconds; the
// station's own estimate (server/airtime.js voicedAir) is checked against it.
import fs from 'node:fs';
import path from 'node:path';
import { fakeClock } from '../pace/fakeplay.mjs';
import { Director } from '../../public/js/director.js';
import { splitSentences } from '../../public/js/audio/sentences.js';
import { rateOf } from '../../server/airtime.js';

const words = (t) => String(t || '').replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;
export { rateOf };

/** The voiced timeline of `ep`: { seconds (open to the end card), speech (s), firstWord (s) }. */
export async function voicedLength(ep) {
  const clock = fakeClock();
  let speech = 0;
  let firstWord = null;
  const t0 = clock.now();
  try {
    const audio = {
      mode: 'mute',
      setVoices() {},
      stop() {},
      playTune: () => ({ stop() {} }),
      sfx() {},
      speak(text, slot, { onSentence } = {}) {
        return new Promise((resolve) => {
          const lines = splitSentences(text);
          const wps = rateOf(ep, slot);
          if (firstWord === null) firstWord = clock.now() - t0;
          let i = 0;
          const step = () => {
            if (i >= lines.length) return resolve();
            onSentence?.(lines[i], i);
            const d = words(lines[i]) / wps;
            speech += d;
            i++;
            setTimeout(step, d * 1000);
          };
          step();
        });
      },
    };
    const d = new Director({ audio, channel: { name: 'GLOBIT 24', slogan: '', presenters: {} } });
    d.voices = { episode() {}, audioFor: () => Promise.resolve(null), refreshAds() {}, prepareAd() {}, adLine: () => null };
    d.prepareImages = async () => {};
    for (const r of ep.rundown || []) if (r.hasImage) d.images.set(r.storyId, { small: {}, full: {}, card: {} });
    await clock.run(d.playEpisode(structuredClone(ep)));
    return { seconds: clock.now() - t0, speech, firstWord };
  } finally {
    clock.restore();
  }
}

/** CLI: the voiced lengths of the editions a replay saved (tools/lengths/replay.mjs --out <dir>), per programme. */
async function cli() {
  const [dir, only] = process.argv.slice(2);
  if (!dir) {
    console.error('usage: node tools/lengths/voiced.mjs <replay dir> [programme]');
    process.exit(1);
  }
  const { episodeAir } = await import('../../server/station.js');
  const { voicedAir } = await import('../../server/airtime.js');
  const { loadChannel } = await import('../../server/channel.js');
  const channel = loadChannel();
  const by = {};
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+-[a-z0-9-]+\.json$/.test(x)).sort()) {
    const ep = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const id = ep.program?.id;
    if (!id || (only && id !== only)) continue;
    const v = await voicedLength(ep);
    (by[id] ||= []).push({ f, air: episodeAir(ep), voiced: v.seconds, est: voicedAir(ep) });
  }
  for (const [id, rows] of Object.entries(by)) {
    const [lo, hi] = channel.programs[id]?.targetSeconds || [0, Infinity];
    const avg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
    const vs = rows.map((r) => r.voiced).sort((a, b) => a - b);
    console.log(`${id}: ${rows.length} editions; station's estimate avg ${avg('air').toFixed(0)} s; voiced avg ${avg('voiced').toFixed(0)} s (min ${vs[0].toFixed(0)}, max ${vs.at(-1).toFixed(0)}), x${(avg('voiced') / avg('air')).toFixed(2)}; voiced within ${lo}-${hi}: ${rows.filter((r) => r.voiced >= lo && r.voiced <= hi).length}/${rows.length}; voicedAir off by at most ${Math.max(...rows.map((r) => Math.abs(r.est - r.voiced))).toFixed(2)} s`);
  }
}
if (import.meta.url === `file://${process.argv[1]}`) cli();
