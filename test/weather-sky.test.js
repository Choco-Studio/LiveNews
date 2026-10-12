// WORLD WEATHER round 3: the moving sky (server/weathersky.js): the next 24 hours of cloud, rain, wind and pressure
// from the forecast's own fields, on a 3-degree grid, with the highs and lows found in the pressure.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePlaceSky, frameTimes, spreadSky, encodeLayer, decodeLayer, findSystems, buildSky, skyParams, SW, SH, SLAT0, SLON0, SSTEP, FRAMES } from '../server/weathersky.js';
import { FieldDesk, DEMO_SKY } from '../server/weatherfield.js';

const cell = (lat, lon) => Math.round((SLAT0 - lat) / SSTEP) * SW + Math.round((lon - SLON0) / SSTEP);

test('the frames: every 3 hours from the next whole UTC hour, read at UTC from local hours', () => {
  const t = frameTimes(Date.parse('2026-10-12T10:20:00Z'));
  assert.equal(t.length, FRAMES);
  assert.equal(new Date(t[0]).toISOString(), '2026-10-12T11:00:00.000Z');
  assert.equal(new Date(t[8]).toISOString(), '2026-10-13T11:00:00.000Z');
  assert.equal(Number(skyParams().forecast_hours), 26, 'the forecast covers the last frame');
  // Madrid is UTC+2: its local 13:00 is 11:00 UTC; a wind from the north (0 degrees) blows toward the south
  const r = { utc_offset_seconds: 7200, hourly: { time: ['2026-10-12T12:00', '2026-10-12T13:00'], cloud_cover: [10, 80], precipitation: [0, 1.4], wind_speed_10m: [5, 10], wind_direction_10m: [0, 90], pressure_msl: [1012, 1010] } };
  const [f] = parsePlaceSky(r, [Date.parse('2026-10-12T11:00:00Z')]);
  assert.deepEqual([f.cloud, f.rain, f.mslp], [80, 1.4, 1010]);
  assert.ok(Math.abs(f.u + 10) < 1e-9 && Math.abs(f.v) < 1e-9, 'a wind from the east blows toward the west');
  assert.equal(parsePlaceSky(r, [Date.parse('2026-10-12T20:00:00Z')])[0], null, 'an hour the answer lacks is null');
  assert.equal(parsePlaceSky({}, [0]), null);
});

test('the layers: spread onto the 3-degree grid, bytes in each layer\'s unit, back again', () => {
  const f = spreadSky([{ lat: 40, lon: -4, v: 90 }, { lat: 10, lon: 100, v: 5 }], { prior: 50 });
  assert.equal(f.length, SW * SH);
  assert.ok(Math.abs(f[cell(40.5, -4.5)] - 90) < 6);
  assert.ok(Math.abs(f[cell(-60, -120)] - 50) < 1, 'far from every place: the prior');
  for (const [kind, v, tol] of [['cloud', 73, 0.5], ['rain', 2.3, 0.05], ['u', -12, 0.5], ['mslp', 996, 0.5]]) {
    const back = decodeLayer(kind, encodeLayer(kind, new Float32Array(SW * SH).fill(v)));
    assert.ok(Math.abs(back[0] - v) <= tol, `${kind} ${back[0]}`);
  }
  assert.equal(decodeLayer('cloud', 'nope'), null);
});

test('the highs and lows: a deep low and a strong high found where the pressure says, nothing on a flat field', () => {
  const p = new Float32Array(SW * SH).fill(1013);
  for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
    const lat = SLAT0 - j * SSTEP, lon = SLON0 + i * SSTEP;
    p[j * SW + i] += -30 * Math.exp(-((lat - 60) ** 2 + (lon + 20) ** 2) / 120) + 18 * Math.exp(-((lat - 50) ** 2 + (lon - 100) ** 2) / 200);
  }
  const s = findSystems(p, 2);
  const low = s.find((x) => x.kind === 'L'), high = s.find((x) => x.kind === 'H');
  assert.ok(low && Math.abs(low.lat - 60) <= 3 && Math.abs(low.lon + 20) <= 3 && low.hPa <= 985 && low.frame === 2, JSON.stringify(low));
  assert.ok(high && Math.abs(high.lat - 50) <= 3 && Math.abs(high.lon - 100) <= 3 && high.hPa >= 1030, JSON.stringify(high));
  assert.deepEqual(findSystems(new Float32Array(SW * SH).fill(1013)), []);
});

test('the sky from the places: frames while 60 % answer, none under three frames', () => {
  const times = frameTimes(Date.parse('2026-10-12T10:00:00Z'));
  const frame = (k) => ({ cloud: 40, rain: 0.5, u: 3, v: -2, mslp: 1012 - k });
  const places = Array.from({ length: 50 }, (_, n) => ({ lat: -60 + (n % 10) * 13, lon: -170 + Math.floor(n / 10) * 70, frames: times.map((_, k) => (k < 5 || n < 20 ? frame(k) : null)) }));
  const sky = buildSky(places, times);
  assert.equal(sky.hours.length, 5, 'the time-lapse ends at the first frame too few places answer');
  assert.deepEqual(sky.hours, [0, 3, 6, 9, 12]);
  assert.equal(sky.cloud.length, 5);
  assert.equal(sky.start, '2026-10-12T10:00:00.000Z');
  assert.equal(buildSky(places.map((p) => ({ ...p, frames: p.frames.map((f, k) => (k < 2 ? f : null)) })), times), null);
});

test('the fixture: a real recorded forecast, aired offline as demo data with the heat map', () => {
  const doc = JSON.parse(fs.readFileSync(DEMO_SKY, 'utf8'));
  assert.match(doc._note, /real Open-Meteo forecast/);
  assert.equal(doc.w, SW);
  assert.ok(doc.hours.length >= 3 && doc.cloud.length === doc.hours.length);
  assert.ok(doc.systems.some((s) => s.kind === 'L') && doc.systems.some((s) => s.kind === 'H'));
  const cloud = decodeLayer('cloud', doc.cloud[0]);
  const mean = cloud.reduce((a, b) => a + b, 0) / cloud.length;
  assert.ok(mean > 20 && mean < 85, `the planet is partly cloudy (${mean.toFixed(0)} %)`);
  const desk = new FieldDesk({ source: 'fixture', log: { warn() {}, info() {} } });
  return desk.field({ zones: [] }).then(() => {
    const sky = desk.skyFor();
    assert.ok(sky?.demo, 'offline, the sky is the recording (demo data)');
  });
});
