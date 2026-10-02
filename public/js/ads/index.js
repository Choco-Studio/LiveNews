// Commercial breaks: joke adverts for completely fictional pixel-world
// products. Each ad draws the full 384x216 frame from (t, dt, info) alone.
// Other ad areas may add one import line and one ADS entry for a new ad here;
// pickAds() below is shared break logic (owned by ads-1).
import bitfizz from './bitfizz.js';
import screechnet from './screechnet.js';
import safesector from './safesector.js';
import grandbuffer from './grandbuffer.js';
import cloudbrella from './cloudbrella.js';
import hiresgym from './hiresgym.js';
import corners from './corners.js';
import serene from './serene.js';

export const ADS = [bitfizz, screechnet, safesector, grandbuffer, cloudbrella, hiresgym, corners, serene];

/**
 * `count` distinct ads for a break. Ads never seen in `recentIds` (the play
 * history, oldest first) come first in random order; after that a random pick
 * among the least recently played (up to the 2 x needed oldest, never the most
 * recent ones), so once every ad has aired the order does not settle into a
 * fixed carousel of fixed pairs. The break never opens with the ad that played
 * last, so an ad cannot repeat back to back across breaks. `rand` is injectable
 * (seeded) for tests and deterministic playout.
 */
export function pickAds(count, recentIds = [], { ads = ADS, rand = Math.random } = {}) {
  const n = Math.max(0, Math.min(Math.floor(count) || 0, ads.length));
  const lastSeen = new Map();
  recentIds.forEach((id, i) => lastSeen.set(id, i));
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const fresh = shuffle(ads.filter((ad) => !lastSeen.has(ad.id))).slice(0, n);
  const stale = ads.filter((ad) => lastSeen.has(ad.id)).sort((a, b) => lastSeen.get(a.id) - lastSeen.get(b.id));
  const need = n - fresh.length;
  const window = Math.max(need, Math.min(stale.length - need, 2 * need));
  const picked = shuffle([...fresh, ...shuffle(stale.slice(0, window)).slice(0, need)]);
  const last = recentIds[recentIds.length - 1];
  if (picked.length > 1 && picked[0].id === last) picked.push(picked.shift());
  return picked;
}
