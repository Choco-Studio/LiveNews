// Commercial breaks: joke adverts for completely fictional pixel-world
// products. Each ad draws the full 384x216 frame from (t, dt, info) alone.
import bitfizz from './bitfizz.js';
import screechnet from './screechnet.js';
import safesector from './safesector.js';
import grandbuffer from './grandbuffer.js';
import cloudbrella from './cloudbrella.js';

export const ADS = [bitfizz, screechnet, safesector, grandbuffer, cloudbrella];

/** `count` distinct ads in random order, avoiding `recentIds` when possible. */
export function pickAds(count, recentIds = []) {
  const n = Math.max(0, Math.min(Math.floor(count) || 0, ADS.length));
  const recent = new Set(recentIds);
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const fresh = shuffle(ADS.filter((ad) => !recent.has(ad.id)));
  const stale = shuffle(ADS.filter((ad) => recent.has(ad.id)));
  return shuffle([...fresh, ...stale].slice(0, n));
}
