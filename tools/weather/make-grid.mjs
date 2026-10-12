#!/usr/bin/env node
// The places WORLD WEATHER samples for its heat map (server/weatherfield.js): a point every STEP degrees on
// land (Natural Earth mask, the map's own), a point on the coast where a cell holds a little land, and for the
// moving sky (server/weathersky.js: cloud, rain, wind and pressure over the oceans too) a point every SEA degrees
// on the open sea. Writes config/weather-grid.json.
//   node tools/weather/make-grid.mjs [--step 5] [--sea 10]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeLandBits } from '../../public/js/scenes/worldmap.js';
import { LAND } from '../../public/js/scenes/worlddata.js';

const arg = (k, d) => (process.argv.includes(k) ? Number(process.argv[process.argv.indexOf(k) + 1]) || d : d);
const step = arg('--step', 5);
const seaStep = arg('--sea', 10);
const { bits } = decodeLandBits(LAND.rle, LAND.w, LAND.h);
const stride = (LAND.w + 7) >> 3;
const land = (lat, lon) => {
  const x = Math.floor((((lon + 180) % 360) + 360) % 360 / 360 * LAND.w);
  const y = Math.min(LAND.h - 1, Math.max(0, Math.floor((90 - lat) / 180 * LAND.h)));
  return (bits[y * stride + (x >> 3)] >> (x & 7)) & 1;
};
const points = [];
for (let lat = 90 - step / 2; lat > -90; lat -= step) {
  if (lat < -62) continue; // Antarctica: the map's climate prior does it (no forecast worth a call)
  for (let lon = -180 + step / 2; lon < 180; lon += step) {
    // share of land in the cell (5 x 5 samples): a point when at least 2 samples are land
    let n = 0, sx = 0, sy = 0;
    for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
      const la = lat - step / 2 + (a + 0.5) * (step / 5), lo = lon - step / 2 + (b + 0.5) * (step / 5);
      if (land(la, lo)) { n++; sx += lo; sy += la; }
    }
    if (n >= 2) points.push([Math.round((sy / n) * 100) / 100, Math.round((sx / n) * 100) / 100]); // the land's centre in the cell
  }
}
// the open sea, every seaStep degrees between 66 S and 72 N, where the cell holds no land at all (the land points cover
// the coasts): enough for the ocean's cloud and rain systems, at a fifth of the land's cost
const sea = [];
for (let lat = 72 - seaStep / 2; lat > -66; lat -= seaStep) {
  for (let lon = -180 + seaStep / 2; lon < 180; lon += seaStep) {
    let n = 0;
    for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) n += land(lat - seaStep / 2 + (a + 0.5) * (seaStep / 5), lon - seaStep / 2 + (b + 0.5) * (seaStep / 5));
    if (n === 0) sea.push([lat, lon]);
  }
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'config', 'weather-grid.json');
fs.writeFileSync(out, JSON.stringify({ _note: `WORLD WEATHER sample points: land every ${step} degrees (heat map and sky), open sea every ${seaStep} degrees (sky) (tools/weather/make-grid.mjs)`, step, points, seaStep, sea }));
console.log(`${points.length} land points, ${sea.length} sea points -> ${out}`);
