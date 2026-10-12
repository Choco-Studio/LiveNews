// The highs and lows of the episode's sky matched frame to frame into tracks (no imports: the server's weather
// writer uses it too, to name only the systems the picture keeps on screen all day; sky.js refines and smooths them).
//
//   matchTracks(systems, frames) -> [{ id, kind, pts: [{ frame, lat, lon, hPa }] }]

const DEG = Math.PI / 180;
const wrapD = (d) => d - Math.round(d / 360) * 360;
/** Degrees apart on the sphere, near enough (longitude scaled by the mean latitude's cosine, the short way round). */
function apart(a, b) {
  return Math.hypot(wrapD(b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * DEG), b.lat - a.lat);
}

/**
 * Each system of a frame continues as the nearest system of the same kind in the next frame within 12 degrees (the
 * nearest pairs first, each used once); one not matched ends, a new one starts. On the grid's centres: no refining,
 * no smoothing (sky.js trackSystems does both).
 * -> [{ id, kind, pts: [{ frame, lat, lon, hPa }] }]
 */
export function matchTracks(systems, frames) {
  const by = Array.from({ length: frames }, () => []);
  for (const s of systems || []) by[s.frame]?.push(s);
  const tracks = [];
  let open = by[0].map((s) => {
    const t = { id: tracks.length, kind: s.kind, pts: [{ frame: 0, lat: s.lat, lon: s.lon, hPa: s.hPa }] };
    tracks.push(t);
    return t;
  });
  for (let f = 1; f < frames; f++) {
    const next = by[f];
    const pairs = [];
    open.forEach((t, i) => {
      const p = t.pts[t.pts.length - 1];
      next.forEach((s, j) => {
        if (s.kind !== t.kind) return;
        const d = apart(p, s);
        if (d <= 12) pairs.push([d, i, j]);
      });
    });
    pairs.sort((a, b) => a[0] - b[0]);
    const usedT = new Set(), usedS = new Set();
    const still = [];
    for (const [, i, j] of pairs) {
      if (usedT.has(i) || usedS.has(j)) continue;
      usedT.add(i);
      usedS.add(j);
      const s = next[j];
      open[i].pts.push({ frame: f, lat: s.lat, lon: s.lon, hPa: s.hPa });
      still.push(open[i]);
    }
    next.forEach((s, j) => {
      if (usedS.has(j)) return;
      const t = { id: tracks.length, kind: s.kind, pts: [{ frame: f, lat: s.lat, lon: s.lon, hPa: s.hPa }] };
      tracks.push(t);
      still.push(t);
    });
    open = still;
  }
  return tracks;
}
