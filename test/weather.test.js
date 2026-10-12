// WORLD WEATHER (owner 3 Oct): the data desk (Open-Meteo forecast, GDACS warnings, the offline demo data), the
// script written from the data alone, the producer's path, the director's segments, the temperature field and
// the weather symbols; round 3's weather centre (the moving sky, the studio, the shots, the time-lapse, the boards).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WeatherDesk, parseOpenMeteo, parseGdacs, conditionOf, stormClass, buildReport, forecastUrl, warningsUrl, hotColdOf, CITIES, PLACES, EXTRA, ZONES, FIXTURE } from '../server/weather.js';
import { writeWeather, seaOf, areaOf, deg, aN, weekday } from '../server/weatherwriter.js';
import { Producer } from '../server/producer.js';
import { validateChannel, loadChannel } from '../server/channel.js';
import { isSpoken } from '../server/voice/plan.js';
import { temperatureField, rampPos, tempColor, RAMP } from '../public/js/scenes/weather/field.js';
import { iconPixels, ICON_SIZE } from '../public/js/scenes/weather/icons.js';
import { P } from '../public/js/palette.js';

const quiet = { warn() {}, info() {}, error() {} };
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const fixtureReport = () => new WeatherDesk({ source: 'fixture', log: quiet }).report();

describe('weather data', () => {
  test('WMO codes: sun, cloud, rain, snow, storms; an unknown code is cloud, never sun', () => {
    assert.equal(conditionOf(0).kind, 'clear');
    assert.equal(conditionOf(2).kind, 'partly');
    assert.equal(conditionOf(3).kind, 'cloudy');
    assert.equal(conditionOf(45).kind, 'fog');
    assert.equal(conditionOf(53).kind, 'drizzle');
    assert.equal(conditionOf(63).kind, 'rain');
    assert.equal(conditionOf(81).kind, 'showers');
    assert.equal(conditionOf(73).kind, 'snow');
    assert.equal(conditionOf(95).kind, 'storm');
    assert.equal(conditionOf(999).kind, 'cloudy');
    assert.equal(conditionOf(null).kind, 'cloudy');
    assert.ok(conditionOf(63).wet && !conditionOf(0).wet);
  });

  test('Open-Meteo: one entry per place in request order, checked against the coordinates; bad entries are skipped', () => {
    const raw = fixture().forecast;
    const byCity = parseOpenMeteo(raw, PLACES);
    assert.equal(byCity.size, PLACES.length);
    const i = PLACES.findIndex((c) => c.id === 'madrid');
    const madrid = byCity.get('madrid');
    assert.deepEqual([madrid.today.max, madrid.today.min, madrid.today.code], [Math.round(raw[i].daily.temperature_2m_max[0]), Math.round(raw[i].daily.temperature_2m_min[0]), raw[i].daily.weather_code[0]]);
    assert.equal(madrid.tomorrow.max, Math.round(raw[i].daily.temperature_2m_max[1]));
    assert.equal(madrid.outlook.length, 3, 'tomorrow and two more days');
    assert.equal(madrid.outlook[2].date, raw[i].daily.time[3]);
    // a list shifted by one: no city gets another city's weather
    assert.equal(parseOpenMeteo(raw.slice(1), PLACES).size, 0);
    assert.equal(parseOpenMeteo(null).size, 0);
    assert.equal(parseOpenMeteo([{ latitude: 51.5, longitude: -0.1, daily: { time: ['x'], temperature_2m_max: [null] } }], CITIES).size, 0);
  });

  test('GDACS: weather hazards on orange/red only, most severe first; earthquakes and stale events left out', () => {
    const w = parseGdacs(fixture().warnings, { now: Date.parse('2026-10-03T06:00:00Z') });
    assert.equal(w.length, 1, 'the earthquake is not weather');
    assert.deepEqual([w[0].type, w[0].name, w[0].level, w[0].wind, w[0].cat.cat], ['cyclone', 'ORLA', 'orange', 165, 2]);
    const feat = (type, level, wind, to = '2026-10-02T00:00:00') => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [10, 10] }, properties: { eventtype: type, alertlevel: level, name: `Tropical Cyclone X${wind}-26`, todate: to, severitydata: { severity: wind, severityunit: 'km/h' } } });
    const list = parseGdacs({ features: [feat('FL', 'Orange', 0), feat('TC', 'Green', 300), feat('TC', 'Orange', 120), feat('TC', 'Red', 200), feat('WF', 'Red', 0, '2026-01-01T00:00:00')] }, { now: Date.parse('2026-10-03T00:00:00Z') });
    assert.deepEqual(list.map((x) => `${x.type}:${x.level}`), ['cyclone:red', 'cyclone:orange', 'flood:orange']);
    assert.deepEqual(parseGdacs({ nope: 1 }), []);
    assert.deepEqual(parseGdacs(null), []);
  });

  test('storm classes follow the sustained wind (Saffir-Simpson)', () => {
    assert.equal(stormClass(50).name, 'tropical depression');
    assert.equal(stormClass(100).name, 'tropical storm');
    assert.equal(stormClass(165).cat, 2);
    assert.equal(stormClass(260).cat, 5);
    assert.equal(stormClass(null), null);
  });

  test('the requests: every city in one forecast call; warnings for the last week', () => {
    const u = new URL(forecastUrl());
    assert.equal(u.host, 'api.open-meteo.com');
    assert.equal(u.searchParams.get('latitude').split(',').length, PLACES.length);
    assert.equal(PLACES.length, CITIES.length + EXTRA.length);
    assert.match(u.searchParams.get('daily'), /temperature_2m_max/);
    assert.equal(u.searchParams.get('forecast_days'), '4');
    const g = new URL(warningsUrl(Date.parse('2026-10-03T00:00:00Z')));
    assert.equal(g.host, 'www.gdacs.org');
    assert.equal(g.searchParams.get('fromDate'), '2026-09-26');
  });

  test('a report needs three zones of three cities; the extremes and HOT & COLD come from the data', () => {
    const byCity = parseOpenMeteo(fixture().forecast, PLACES);
    const r = buildReport(byCity, [], { at: '2026-10-03T06:00:00Z' });
    assert.equal(r.zones.length, ZONES.length);
    const zoned = r.zones.flatMap((z) => z.cities);
    assert.equal(r.extremes.hottest.value, Math.max(...zoned.map((c) => c.today.max)));
    assert.equal(r.source, 'OPEN-METEO');
    // HOT & COLD: the five highest highs and lowest lows of every place, the extra places included
    const all = [...zoned, ...r.extra];
    assert.equal(r.extra.length, EXTRA.length);
    assert.deepEqual(r.hotCold.hot.map((c) => c.value), all.map((c) => c.today.max).sort((a, b) => b - a).slice(0, 5));
    assert.deepEqual(r.hotCold.cold.map((c) => c.value), all.map((c) => c.today.min).sort((a, b) => a - b).slice(0, 5));
    assert.ok(r.hotCold.hot.some((c) => !c.zone) || r.hotCold.cold.some((c) => !c.zone), 'an extra place makes the board');
    assert.deepEqual(hotColdOf([]), { hot: [], cold: [] });
    const few = new Map([...byCity].slice(0, 5));
    assert.equal(buildReport(few, []), null);
  });

  test('the desk: the fixture says DEMO DATA; a live failure never falls back to it, and pauses the slot', async () => {
    const r = await fixtureReport();
    assert.equal(r.demo, true);
    assert.equal(r.source, 'DEMO DATA');
    let t = 0;
    const desk = new WeatherDesk({ source: 'open-meteo', fetchImpl: async () => { throw new Error('ENOTFOUND'); }, retryNetMs: 0, log: quiet, now: () => t });
    assert.equal(desk.usable(), true);
    assert.equal(await desk.report(), null);
    assert.match(desk.lastError, /ENOTFOUND/);
    assert.equal(desk.usable(), false, 'not retried at once');
    t += 11 * 60_000;
    assert.equal(desk.usable(), true);
    // auto: the fixture while the news desk is the offline fixture desk
    let offline = true;
    const auto = new WeatherDesk({ source: 'auto', offline: () => offline, log: quiet });
    assert.equal(auto.source, 'fixture');
    offline = false;
    assert.equal(auto.source, 'open-meteo');
    assert.equal(new WeatherDesk({ source: 'off' }).enabled, false);
  });

  test('the live path: forecast and warnings parsed; a dead warnings feed still airs the forecast', async () => {
    const raw = fixture();
    const fetchImpl = async (url) => {
      if (String(url).includes('gdacs')) throw new Error('timeout');
      return { ok: true, text: async () => JSON.stringify(raw.forecast) };
    };
    const r = await new WeatherDesk({ source: 'open-meteo', fetchImpl, log: quiet }).report();
    assert.equal(r.demo, false);
    assert.equal(r.warnings.length, 0);
    assert.equal(r.source, 'OPEN-METEO');
  });
});

describe('the script', () => {
  test('round 3: headline, the world, six zones west to east, HOT & COLD, the warning, three days, the sign-off', async () => {
    const report = await fixtureReport();
    const ep = writeWeather(report, { presenter: { name: 'Sam Night' }, channelName: 'GLOBIT 24', seed: 'a' });
    assert.deepEqual(ep.segments.map((s) => s.kind), ['headline', 'world', 'zone', 'zone', 'zone', 'zone', 'zone', 'zone', 'hotcold', 'warning', 'outlook', 'outro']);
    assert.deepEqual(ep.segments.map((s) => s.shot), ['mcu', 'graphic', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'board', 'warning', 'board', 'mcu']);
    assert.deepEqual(ep.segments.filter((s) => s.kind === 'zone').map((s) => s.zone), ZONES.map((z) => z.id));
    for (const s of ep.segments) {
      assert.equal(s.type, 'weather');
      assert.equal(s.anchor, 'A');
      assert.ok(isSpoken(s), 'the voice service voices it');
      assert.ok(!/undefined|NaN|null|\[object/.test(s.text), s.text);
    }
    assert.match(ep.segments[0].text, /I'm Sam Night, and this is WORLD WEATHER/);
    assert.equal(ep.segments.find((s) => s.kind === 'warning').emotion, 'serious');
    assert.match(ep.segments.at(-1).text, /GLOBIT 24/);
    assert.deepEqual(ep.storyIds, []);
    // shorter than round 2's list of every city (about 3.5 minutes of speech), still a programme
    const words = ep.segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
    assert.ok(words > 380 && words < 640, `${words} words`);
    for (const z of ep.segments.filter((s) => s.kind === 'zone')) {
      assert.ok(z.text.split(/\s+/).length <= 75, `a zone is a few standouts, not a list: ${z.text}`);
      assert.ok(new Set(z.marks.map((m) => m.city)).size >= 2, z.text);
    }
    // the boards carry what they show; the time-lapses run over the forecast's frames
    const hc = ep.segments.find((s) => s.kind === 'hotcold');
    assert.deepEqual(hc.board.hot, report.hotCold.hot);
    const ol = ep.segments.find((s) => s.kind === 'outlook');
    assert.ok(ol.board.cities.length >= 3 && ol.board.cities.length <= 5);
    assert.equal(ol.board.days.length, 3);
    for (const c of ol.board.cities) assert.equal(c.days.length, 3);
    assert.deepEqual(ep.segments.find((s) => s.kind === 'world').timelapse, { from: 0, to: report.sky.hours.at(-1) });
    assert.equal(ep.weather.sky, report.sky, 'the episode carries the moving sky');
  });

  test('every figure said is a figure of the forecast, and every mark points at the place named there', async () => {
    const report = await fixtureReport();
    const places = new Map([...report.zones.flatMap((z) => z.cities), ...report.extra].map((c) => [c.id, c]));
    const allowed = new Set();
    for (const c of places.values()) {
      for (const d of [c.today, c.tomorrow, ...(c.outlook || [])].filter(Boolean)) for (const v of [d.max, d.min, Math.round(d.rain), d.prob, d.gust]) if (v != null) allowed.add(String(Math.abs(v)));
    }
    for (const w of report.warnings) allowed.add(String(w.wind)).add(String(w.cat?.cat));
    const sys0 = report.sky.systems.filter((x) => x.frame === 0);
    for (const seed of ['a', 'b', 'c', 'd']) {
      const ep = writeWeather(report, { seed });
      for (const s of ep.segments) {
        let text = s.text.replace(/WORLD WEATHER|GLOBIT 24|24 hours/g, '');
        // a difference is checked against its two cities' highs below (the zones' comparisons test)
        text = text.replace(/ is \d+ degrees warmer than /g, ' ');
        const between = /That's (\d+) degrees between the two ends/.exec(text);
        if (between) {
          assert.equal(Number(between[1]), report.hotCold.hot[0].value - report.hotCold.cold[0].value);
          text = text.replace(between[0], '');
        }
        const nums = text.match(/\d+/g) || [];
        for (const n of nums) assert.ok(allowed.has(n), `${n} in "${s.text}"`);
        for (const m of s.marks) {
          const c = places.get(m.city);
          assert.ok(c, m.city);
          assert.ok(s.text.startsWith(c.say, m.char), `${c.say} at ${m.char} in "${s.text}"`);
        }
        for (const p of s.pins || []) assert.ok(sys0.some((x) => x.lat === p.lat && x.lon === p.lon && x.kind === p.kind), 'a pin is a high or low of the forecast');
      }
    }
  });

  test('the zones\' comparisons are the two cities\' own highs', async () => {
    const report = await fixtureReport();
    const byName = new Map(report.zones.flatMap((z) => z.cities).map((c) => [c.say, c]));
    let seen = 0;
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      for (const s of writeWeather(report, { seed }).segments) {
        for (const m of s.text.matchAll(/([A-ZÀ-Ý][\wÀ-ÿ .-]*?) is (\d+) degrees warmer than ([A-ZÀ-Ý][\wÀ-ÿ .-]*?)\./g)) {
          const hi = byName.get(m[1].replace(/^.*: /, '')), lo = byName.get(m[3]);
          assert.ok(hi && lo, m[0]);
          assert.equal(Number(m[2]), hi.today.max - lo.today.max, m[0]);
          seen++;
        }
      }
    }
    assert.ok(seen > 0, 'a contrast is said in some editions');
  });

  test('words: minus temperatures, an 82 percent, weekdays, broad areas', () => {
    assert.equal(deg(-4), 'minus 4');
    assert.equal(deg(21), '21');
    assert.deepEqual([8, 11, 18, 82, 70, 93, 100].map(aN), ['an', 'an', 'an', 'an', 'a', 'a', 'a']);
    assert.equal(weekday('2026-10-15'), 'Thursday');
    assert.equal(areaOf(65, 100), 'Siberia');
    assert.equal(areaOf(45, -30), 'the North Atlantic');
    assert.equal(areaOf(-60, 0), 'the Southern Ocean');
  });

  test('phrasing varies with the seed and is not repeated within a bulletin', async () => {
    const report = await fixtureReport();
    const a = writeWeather(report, { seed: '1' }).segments.map((s) => s.text).join(' ');
    const b = writeWeather(report, { seed: '2' }).segments.map((s) => s.text).join(' ');
    assert.notEqual(a, b);
    for (const phrase of ['loses the sunshine', 'Sun for some, rain for others', 'A mixed picture']) assert.ok((a.match(new RegExp(phrase, 'g')) || []).length <= 1, phrase);
  });

  test('storm positions in words; a report without zones gives no script', () => {
    assert.equal(seaOf(24.6, -62.4), 'the Atlantic');
    assert.equal(seaOf(25, -90), 'the Gulf of Mexico');
    assert.equal(seaOf(15, 130), 'the western Pacific');
    assert.equal(writeWeather(null), null);
  });
});

describe('the programme on the channel', () => {
  test('WORLD WEATHER is in the line-up and the rotation; a weather programme needs no stories', () => {
    const ch = loadChannel();
    assert.equal(ch.programs['world-weather'].kind, 'weather');
    assert.ok(ch.rotation.includes('world-weather'));
    assert.doesNotThrow(() => validateChannel(ch));
    const bad = structuredClone(ch);
    bad.programs['world-weather'].kind = 'radio';
    assert.throws(() => validateChannel(bad), /unknown "kind"/);
  });

  test('the producer writes it from the desk and voices it; no data, no programme', async () => {
    const ch = loadChannel();
    const voiced = [];
    const voice = { enabled: true, voiceEpisode: async (ctx) => (voiced.push(ctx.episode.segments.length), { voice: 'kokoro' }) };
    const p = new Producer({ config: {}, newsDesk: {}, chain: null, voice, weather: new WeatherDesk({ source: 'fixture', log: quiet }), log: quiet });
    assert.equal(p.canProduce(ch, 'world-weather'), true);
    const ep = await p.produce(ch, 'world-weather');
    assert.equal(ep.program.id, 'world-weather');
    assert.equal(ep.provider, 'weather');
    assert.deepEqual(ep.cast, { A: 'sam' });
    assert.deepEqual(ep.pipeline.map((x) => x.stage), ['weather', 'voice']);
    assert.equal(voiced[0], ep.segments.length);
    assert.equal(ep.weather.zones.length, 6);
    assert.ok(ep.weather.demo);
    assert.equal(p.canProduce(ch, 'world-weather'), false, 'never twice in a row');
    p.newsSinceWeather = 3;
    assert.equal(p.canProduce(ch, 'world-weather'), true, 'after three news programmes');
    const none = new Producer({ config: {}, newsDesk: {}, chain: null, weather: null, log: quiet });
    assert.equal(none.canProduce(ch, 'world-weather'), false);
    const dead = new Producer({ config: {}, newsDesk: {}, chain: null, weather: new WeatherDesk({ source: 'open-meteo', fetchImpl: async () => { throw new Error('down'); }, retryNetMs: 0, log: quiet }), log: quiet });
    assert.equal(await dead.produce(ch, 'world-weather'), null);
  });
});

describe('the weather centre (client)', () => {
  test('the temperature field: cities set the colour near them, the climate far away', async () => {
    const report = await fixtureReport();
    const cities = report.zones.flatMap((z) => z.cities);
    const f = temperatureField(cities, 'today');
    const riyadh = cities.find((c) => c.id === 'riyadh'), moscow = cities.find((c) => c.id === 'moscow');
    assert.ok(Math.abs(f.at(24.7, 46.7) - riyadh.today.max) < 2.5, `Riyadh ${f.at(24.7, 46.7)}`);
    assert.ok(Math.abs(f.at(55.8, 37.6) - moscow.today.max) < 2.5, `Moscow ${f.at(55.8, 37.6)}`);
    assert.ok(f.at(-80, 0) < 0, 'Antarctica stays cold');
    assert.ok(f.at(75, 100) < 6, 'the Siberian Arctic stays cold');
    const palette = new Set(Object.values(P).map((c) => c.toLowerCase()));
    for (const [, c] of RAMP) assert.ok(palette.has(c.toLowerCase()));
    assert.equal(rampPos(-50), 0);
    assert.equal(rampPos(60), RAMP.length - 1);
    assert.equal(tempColor(37), RAMP.at(-1)[1]);
    // the tint returns palette colours only (two neighbouring steps, dithered)
    const packed = new Set(RAMP.map(([, c]) => {
      const n = parseInt(c.slice(1), 16);
      return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
    }));
    for (let x = 0; x < 8; x++) assert.ok(packed.has(f.tint(40, -3, x, x >> 1)));
  });

  test('the symbols: palette colours only, outlined, every kind drawn, rain falls, the bolt flashes', () => {
    const palette = new Set(Object.values(P));
    for (const kind of ['clear', 'night', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'showers', 'snow', 'storm']) {
      const px = iconPixels(kind, 0);
      assert.equal(px.length, ICON_SIZE.w * ICON_SIZE.h);
      const used = px.filter(Boolean);
      assert.ok(used.length > 20, `${kind} is drawn`);
      for (const c of used) assert.ok(palette.has(c), `${kind}: ${c}`);
      assert.ok(used.includes(P.black), `${kind} is outlined`);
    }
    assert.notDeepEqual(iconPixels('rain', 0), iconPixels('rain', 1));
    assert.ok(iconPixels('storm', 0).includes(P.yellow) && !iconPixels('storm', 3).includes(P.yellow));
  });
});

describe('the heat map: real temperatures at many places (round 2)', async () => {
  const { decodeField, encodeField, sampleField, spread, tieToCities, gridPoints, gridUrl, parseGrid, FieldDesk, FW, FH } = await import('../server/weatherfield.js');
  const { gridField } = await import('../public/js/scenes/weather/field.js');

  test('the sample places cover the land (a point every 5 degrees), in batches of one request each', () => {
    const pts = gridPoints();
    assert.ok(pts.length > 600 && pts.length < 1000, `${pts.length} places`);
    assert.ok(pts.some((p) => Math.abs(p.lat - 40) < 3 && Math.abs(p.lon + 4) < 3), 'Spain is sampled');
    assert.ok(!pts.some((p) => Math.abs(p.lat) < 5 && p.lon > -150 && p.lon < -100), 'the open Pacific is not');
    const u = new URL(gridUrl(pts.slice(0, 120)));
    assert.equal(u.searchParams.get('latitude').split(',').length, 120);
    assert.equal(u.searchParams.get('daily'), 'temperature_2m_max');
    assert.equal(u.searchParams.get('hourly'), null, 'the sky only when asked');
    // round 3: the sky's hours in the same request, at the land's points and the open sea's
    const sky = new URL(gridUrl(pts.slice(0, 2), { sky: true }));
    assert.match(sky.searchParams.get('hourly'), /cloud_cover.*precipitation.*pressure_msl/);
    const all = gridPoints(undefined, { sea: true });
    const sea = all.filter((p) => p.sea);
    assert.ok(sea.length > 150 && sea.length < 400, `${sea.length} sea points`);
    assert.ok(sea.some((p) => Math.abs(p.lat) < 5 && p.lon > -150 && p.lon < -100), 'the open Pacific has sky points');
  });

  test('the field: spread from places, encoded in half degrees, tied to the cities on screen', () => {
    const f = spread([{ lat: 40, lon: -4, v: 30 }, { lat: 60, lon: 30, v: 5 }]);
    assert.ok(Math.abs(sampleField(f, 40, -4) - 30) < 1.5);
    assert.ok(Math.abs(sampleField(f, 60, 30) - 5) < 1.5);
    const back = decodeField(encodeField(f));
    assert.equal(back.length, FW * FH);
    assert.ok(Math.abs(back[1000] - f[1000]) <= 0.25);
    const tied = tieToCities(f, [{ lat: 40, lon: -4, today: { max: 24 } }], 'today');
    assert.ok(Math.abs(sampleField(tied, 40, -4) - 24) < 1, 'the colour under a chip agrees with the chip');
  });

  test('offline: the ERA-Interim field (real reanalysis) tied to the forecast; the client reads the same grid', async () => {
    const r = await fixtureReport();
    assert.match(r.field.source, /ERA-INTERIM/);
    const f = decodeField(r.field.today);
    // the real structure stays: the Tibetan plateau colder than the plain of India, the Sahara hot, Greenland frozen
    assert.ok(sampleField(f, 33, 88) < sampleField(f, 26, 80) - 10);
    assert.ok(sampleField(f, 23, 10) > 25);
    assert.ok(sampleField(f, 72, -40) < -5);
    const madrid = r.zones.flatMap((z) => z.cities).find((c) => c.id === 'madrid');
    assert.ok(Math.abs(sampleField(f, madrid.lat, madrid.lon) - madrid.today.max) < 1);
    const g = gridField(r.field, 'today');
    assert.ok(Math.abs(g.at(madrid.lat, madrid.lon) - madrid.today.max) < 1);
    assert.equal(gridField({ today: 'nope', w: 360, h: 180 }, 'today'), null);
    const ep = writeWeather(r, { seed: 'x' });
    assert.equal(ep.weather.field, r.field, 'the episode carries the heat map');
  });

  test('live: every batch asked, answers matched by position, a field of daily highs; too few answers is no field', async () => {
    const pts = gridPoints(undefined, { sea: true });
    let calls = 0;
    const fetchImpl = async (url) => {
      calls++;
      const q = new URL(url).searchParams;
      const la = q.get('latitude').split(',').map(Number), lo = q.get('longitude').split(',').map(Number);
      return { ok: true, text: async () => JSON.stringify(la.map((v, i) => ({ latitude: v, longitude: lo[i], daily: { time: ['a', 'b'], temperature_2m_max: [30 - Math.abs(v) * 0.5, 29 - Math.abs(v) * 0.5] } }))) };
    };
    const desk = new FieldDesk({ source: 'open-meteo', fetchImpl, log: quiet });
    const out = await desk.field({ zones: [] });
    assert.equal(calls, Math.ceil(pts.length / 120));
    assert.equal(out.source, 'OPEN-METEO');
    assert.equal(out.kind, 'daily-max');
    assert.ok(Math.abs(sampleField(decodeField(out.today), 0, 20) - 29) < 1.5); // the places nearby say 28.75
    await desk.field({ zones: [] });
    assert.equal(calls, Math.ceil(pts.length / 120), 'cached for hours (the free tier budget)');
    const half = new FieldDesk({ source: 'open-meteo', fetchImpl: async (url) => ({ ok: true, text: async () => '[]' }), log: quiet });
    assert.equal(await half.field({ zones: [] }), null);
    assert.deepEqual(parseGrid([{ latitude: 10, longitude: 10, daily: { temperature_2m_max: [20, 21] } }], [{ lat: 40, lon: 40 }]), []);
  });

  test('live GDACS: an ended storm is not a warning; a list of countries is spoken and shown whole', async () => {
    const { parseGdacs, placesOf } = await import('../server/weather.js');
    const now = Date.parse('2026-10-04T10:00:00Z');
    const ev = (type, todate, country, name = '') => ({ geometry: { type: 'Point', coordinates: [-108, 30.5] }, properties: { eventtype: type, alertlevel: 'red', todate, fromdate: '2026-09-21T00:00:00', country, name, severitydata: { severity: 200, severityunit: 'km/h' }, eventid: Math.round(Math.random() * 1e6) } });
    const got = parseGdacs({ features: [
      ev('TC', '2026-09-30T03:00:00', 'Mexico', 'Tropical Cyclone POLO-26'), // last advised 4 days ago: over
      ev('TC', '2026-10-04T03:00:00', 'Mexico', 'Tropical Cyclone RAY-26'),
      ev('DR', '2026-10-02T00:00:00', 'Austria, Bosnia & Herzegovina, Belgium, Belarus, Croatia'),
    ] }, { now });
    assert.deepEqual(got.map((w) => w.name || w.type), ['RAY', 'drought']);
    const dr = got[1];
    // many countries: named by the region at the event's point (here -108, 30.5: North America)
    assert.equal(dr.country, 'parts of North America');
    assert.equal(dr.area, 'North America');
    assert.equal(placesOf('Austria, Belgium, Croatia, Czechia, Germany', 48.8, 13.7).country, 'parts of central Europe');
    assert.equal(placesOf('Chile, Peru, Bolivia', -15, -70).country, 'Chile, Peru and Bolivia');
    assert.deepEqual(placesOf('Chile, Peru'), { countries: ['Chile', 'Peru'], country: 'Chile and Peru', area: 'Chile · Peru' });
    assert.equal(placesOf('').country, '');
    const ep = writeWeather({ ...(await fixtureReport()), warnings: got }, { seed: 'w' });
    const lines = ep.segments.filter((s) => s.kind === 'warning').map((s) => s.text);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^Now our weather warnings\./);
    assert.doesNotMatch(lines[1], /Now our weather warnings/, 'the second warning follows on');
    assert.match(lines[1], /Drought across parts of North America is on red alert/);
    assert.doesNotMatch(lines.join(' '), /,\s+is on|&/);
  });

  test('the free tier: a 429 is asked again; the forecast never waits for the grid, which joins it when it lands', async () => {
    const pts = gridPoints(undefined, { sea: true });
    const answer = (url) => {
      const q = new URL(url).searchParams;
      const la = q.get('latitude').split(',').map(Number), lo = q.get('longitude').split(',').map(Number);
      return JSON.stringify(la.map((v, i) => ({ latitude: v, longitude: lo[i], daily: { time: ['a', 'b'], temperature_2m_max: [25, 24] } })));
    };
    let calls = 0, refused = 0;
    const flaky = async (url) => {
      calls++;
      if (calls === 2) {
        refused++;
        return { ok: false, status: 429, text: async () => 'too many' };
      }
      return { ok: true, status: 200, text: async () => answer(url) };
    };
    const desk = new FieldDesk({ source: 'open-meteo', fetchImpl: flaky, log: quiet });
    assert.ok(await desk.field({ zones: [] }), 'the field arrives after the retry');
    assert.equal(refused, 1);
    assert.equal(calls, Math.ceil(pts.length / 120) + 1);
    // the report does not wait (fieldWaitMs 0): no field at first, then the grid joins the cached report
    const raw = JSON.parse(fs.readFileSync(new URL('../config/fixtures/weather.json', import.meta.url), 'utf8'));
    let release;
    const gate = new Promise((r) => (release = r));
    const fetchImpl = async (url) => {
      if (String(url).includes('gdacs')) return { ok: true, status: 200, text: async () => JSON.stringify(raw.warnings) };
      if (String(url).includes('temperature_2m_max') && !String(url).includes('weather_code')) {
        await gate;
        return { ok: true, status: 200, text: async () => answer(url) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(raw.forecast) };
    };
    const { WeatherDesk: Desk } = await import('../server/weather.js');
    const wd = new Desk({ source: 'open-meteo', fetchImpl, fieldWaitMs: 0, log: quiet });
    const first = await wd.report();
    assert.ok(first && !first.field, 'the forecast airs without waiting for the grid');
    release();
    for (let i = 0; i < 50 && !wd.fields.ready(); i++) await new Promise((r) => setTimeout(r, 5));
    const again = await wd.report();
    assert.ok(again.field && again.field.source === 'OPEN-METEO', 'the grid joined the cached report');
  });
});

describe('the weather presenter (round 2): planted steps, aimed points', async () => {
  const { Standing } = await import('../public/js/v2/canvas25d/runtime/standing.js');
  const { Presenter, aimedPoint } = await import('../public/js/scenes/weather/presenter.js');
  const { evaluate } = await import('../public/js/v2/canvas25d/rig.js');
  const { lookFor } = await import('../public/js/v2/canvas25d/cast/index.js');

  test('a walk is side-steps that end with the feet together around the mark, never wide apart', () => {
    const p = new Presenter(new Standing('sam'), { scale: 1.2 });
    p.place(66);
    const dur = p.walkTo(318, 10);
    assert.ok(dur > 1.5 && dur < 5, `${dur}`);
    let widest = 0;
    for (let t = 10; t <= 10 + dur + 0.2; t += 1 / 60) {
      p.update(t);
      widest = Math.max(widest, Math.abs(p.feet[1].x - p.feet[0].x));
    }
    assert.ok(widest < 64, `feet at most ${widest} px apart`);
    assert.ok(Math.abs((p.feet[0].x + p.feet[1].x) / 2 - 318) < 1);
    assert.ok(Math.abs(p.feet[1].x - p.feet[0].x - 22.6) < 1, 'standing stance');
    // a new walk before the last one ends still arrives closed
    p.walkTo(66, 20);
    p.update(20.7);
    const d2 = p.walkTo(200, 20.7);
    for (let t = 20.7; t <= 20.7 + d2 + 0.2; t += 1 / 60) p.update(t);
    assert.ok(Math.abs(p.feet[1].x - p.feet[0].x - 22.6) < 1);
  });

  test('a point aims the hand at the target: right, down, left, with the nearer arm', () => {
    const L = lookFor('sam');
    const wrist = (dx, dy) => evaluate(L, { side: 1, gestures: [{ name: aimedPoint(dx, dy), t0: 0 }], emotions: [], look: [] }, 0.9).wrist;
    const flat = wrist(130, 0), low = wrist(130, 60);
    assert.ok(flat[0] > 25 && Math.abs(flat[1]) < 3, flat.join());
    assert.ok(low[1] > 8, 'lower target, lower hand');
    const p = new Presenter(new Standing('sam'), { scale: 1.2, neckY: 60 });
    p.place(300);
    assert.ok(p.pointAt(100, 120, 1));
    assert.equal(p.perf.side, -1, 'a target on the left: the left arm');
    assert.equal(p.pointAt(100, 120, 2), false, 'not on top of the last gesture');
    assert.ok(p.pointAt(100, 120, 3.5));
  });
});

describe('the weather centre, round 3: shots, the moving sky, the studio, the boards', async () => {
  const sky = await import('../public/js/scenes/weather/sky.js');
  const studio = await import('../public/js/scenes/weather/studio.js');
  const boards = await import('../public/js/scenes/weather/boards.js');
  const centre = await import('../public/js/scenes/weather/index.js');
  const packed = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
  };
  const PALETTE = new Set(Object.values(P).map(packed));
  const onlyPalette = (px, what) => {
    for (let i = 0; i < px.length; i++) if (px[i] && !PALETTE.has(px[i] >>> 0)) assert.fail(`${what}: pixel ${i} is ${(px[i] >>> 0).toString(16)}, not a palette colour`);
  };
  const report = await fixtureReport();
  const S = sky.decodeSky(report.sky);

  test('the sky decodes from the episode (null-safe), each layer in its own unit', () => {
    assert.ok(S, 'the recorded sky decodes');
    assert.equal(S.frames, report.sky.hours.length);
    assert.equal(S.cloud[0].length, S.w * S.h);
    const range = (a) => a.reduce(([lo, hi], v) => [Math.min(lo, v), Math.max(hi, v)], [Infinity, -Infinity]);
    const [c0, c1] = range(S.cloud[0]), [r0] = range(S.rain[0]), [p0, p1] = range(S.mslp[0]);
    assert.ok(c0 >= 0 && c1 <= 100, 'cloud cover in %');
    assert.ok(r0 >= 0, 'rain never negative');
    assert.ok(p0 > 940 && p1 < 1061, 'pressure in hPa');
    assert.equal(sky.decodeSky(report.sky), S, 'decoded once per sky');
    assert.equal(sky.decodeSky(null), null);
    assert.equal(sky.decodeSky({ ...report.sky, cloud: ['nonsense'] }), null, 'a broken layer: no sky (the map plays still)');
    assert.equal(sky.decodeSky({ ...report.sky, hours: [0] }), null, 'one frame is no time-lapse');
  });

  test('the layers between frames: a smooth tween through the frames, in range; bilinear in space, longitude wrapping', () => {
    const clock = new sky.SkyClock(S);
    const at3 = Float32Array.from(clock.at(3).mslp);
    assert.deepEqual(at3, S.mslp[1], 'on a frame: the frame');
    const mid = clock.at(4.5).cloud;
    for (let i = 0; i < mid.length; i++) assert.ok(mid[i] >= 0 && mid[i] <= 100);
    // no kink at a frame: the step before a frame matches the step after it (Catmull-Rom is C1)
    const c = new sky.SkyClock(S);
    const k = 1234;
    const v = (h) => c.at(h).mslp[k];
    const before = v(3) - v(2.9), after = v(3.1) - v(3);
    assert.ok(Math.abs(before - after) < 0.25, `${before} vs ${after}`);
    assert.equal(sky.frameOf(S, 0), 0);
    assert.equal(sky.frameOf(S, 13.5), 4.5);
    assert.equal(sky.frameOf(S, 99), S.frames - 1);
    // a cell's centre reads the cell; the date line wraps
    const g = S.mslp[0];
    const j = 20, i = 7;
    assert.ok(Math.abs(sky.sampleLayer(S, g, S.lat0 - j * S.step, S.lon0 + i * S.step) - g[j * S.w + i]) < 1e-3);
    assert.ok(Math.abs(sky.sampleLayer(S, g, 10, 179.9) - sky.sampleLayer(S, g, 10, -180.1)) < 1e-3);
  });

  test('the highs and lows: matched frame to frame, refined between cells, moving smoothly; a named one is held', () => {
    assert.ok(S.tracks.length > 0);
    const long = S.tracks.filter((t) => t.pts.length >= 4);
    assert.ok(long.length >= 4, 'most systems last through several frames');
    for (const t of long) {
      for (let q = 1; q < t.pts.length; q++) {
        const a = t.pts[q - 1], b = t.pts[q];
        assert.equal(b.frame, a.frame + 1);
        const d = Math.hypot((((b.lon - a.lon + 540) % 360) - 180) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat);
        assert.ok(d <= 12.5, `a track jumps ${d} degrees`);
      }
    }
    // the centre to a fraction of a cell: never more than half a cell from the grid's own
    for (const s of S.systems.slice(0, 20)) {
      const r = sky.refineCentre(S, s);
      assert.ok(Math.abs(r.lat - s.lat) <= S.step / 2 + 1e-9 && Math.abs(r.lon - s.lon) <= S.step / 2 + 1e-9);
    }
    // between two frames a system sits between its two places
    const t = long[0];
    const [a, b] = t.pts;
    const m = sky.systemsAt(S.tracks, a.frame + 0.5).find((x) => x.id === t.id);
    assert.ok(m && m.lat >= Math.min(a.lat, b.lat) - 1e-9 && m.lat <= Math.max(a.lat, b.lat) + 1e-9);
    // a track that has ended shows only while it is being named
    const ended = S.tracks.find((x) => x.pts.at(-1).frame < S.frames - 2);
    if (ended) {
      const f = S.frames - 1;
      assert.ok(!sky.systemsAt(S.tracks, f).some((x) => x.id === ended.id));
      assert.ok(sky.systemsAt(S.tracks, f, [], ended.id).some((x) => x.id === ended.id));
    }
  });

  test('isobars: marching squares find the contour where the field crosses the level', () => {
    const w = 40, h = 30, f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = 1000 + Math.hypot(x - 20, y - 15);
    const segs = sky.isobarSegments(f, w, h, 1008);
    assert.ok(segs.length >= 4 * 20, 'a closed ring of segments');
    for (let q = 0; q < segs.length; q += 2) {
      const r = Math.hypot(segs[q] - 20, segs[q + 1] - 15);
      assert.ok(Math.abs(r - 8) < 0.6, `a point at radius ${r}`);
    }
    assert.equal(sky.isobarSegments(f, w, h, 900).length, 0, 'a level the field never reaches: nothing');
  });

  test('the cloud texture: tileable fBm, equalised at every mip (a cover of 40 % leaves 40 % of the area cloud)', () => {
    const T = sky.cloudTexture();
    assert.deepEqual(T.map((l) => l.size), [256, 128, 64, 32]);
    for (const { data } of T) {
      const above = data.filter((v) => v / 255 > 1 - 0.4).length / data.length;
      assert.ok(Math.abs(above - 0.4) < 0.02, `${above}`);
    }
    // tileable: the last column runs on into the first as smoothly as any two neighbours do
    const d = T[0].data, n = 256;
    let seam = 0, inner = 0;
    for (let y = 0; y < n; y++) {
      seam += Math.abs(d[y * n + n - 1] - d[y * n]);
      inner += Math.abs(d[y * n + 100] - d[y * n + 101]);
    }
    assert.ok(seam < inner * 2.5, `seam ${seam} vs ${inner}`);
  });

  test('the compositor: palette colours only; cloud where the cover is, rain in radar colours, isobars', () => {
    const w = 96, h = 54;
    const base = new Uint32Array(w * h).fill(packed(P.navy));
    const dst = new Uint32Array(w * h);
    const view = { clon: 0, clat: 0, s: w / 360, kx: 1 };
    const flat = (cloud, rain = 0, mslp = 1013) => ({ cloud: new Float32Array(S.n).fill(cloud), rain: new Float32Array(S.n).fill(rain), u: new Float32Array(S.n), v: new Float32Array(S.n), mslp: new Float32Array(S.n).fill(mslp) });
    sky.composeSky(dst, base, w, h, view, S, flat(0));
    assert.ok(dst.every((c) => c === packed(P.navy)), 'no cover: the map untouched');
    sky.composeSky(dst, base, w, h, view, S, flat(100));
    const veiled = dst.filter((c) => c !== packed(P.navy)).length / dst.length;
    assert.ok(veiled > 0.85, `a full cover veils the map (${veiled})`);
    onlyPalette(dst, 'cloud');
    sky.composeSky(dst, base, w, h, view, S, flat(90, 6));
    const radar = new Set(sky.RADAR.map((r) => r.c));
    assert.ok(dst.some((c) => radar.has(c)), 'heavy rain draws radar colours');
    onlyPalette(dst, 'rain');
    // the real sky at a real moment, isobars on
    sky.composeSky(dst, base, w, h, view, S, new sky.SkyClock(S).at(7), { tau: 7, isobars: true, isoColor: packed(P.fog) });
    onlyPalette(dst, 'the sky');
    assert.ok(dst.some((c) => c === packed(P.fog)), 'isobars are drawn');
    // the veil: palette colours, lighter at each level (never darker than the colour under it)
    const L = (c) => 0.2126 * (c & 255) + 0.7152 * ((c >>> 8) & 255) + 0.0722 * ((c >>> 16) & 255);
    for (const c of PALETTE) {
      let last = L(c);
      for (const m of sky.VEIL) {
        const v = m.get(c);
        assert.ok(PALETTE.has(v));
        assert.ok(L(v) >= last - 18, 'a thicker veil is not darker');
        last = Math.max(last, L(v));
      }
    }
    assert.deepEqual([0.2, 0.35, 0.9, 2, 4, 9].map(sky.radarBand), [-1, 0, 1, 2, 3, 4]);
  });

  test('the studio: the curved wall bows outward, maps both ways, and draws palette colours only; the light on him', () => {
    const cam = new studio.WallCam().set(0);
    assert.ok(cam.top[0] < cam.top[192] && cam.bot[0] > cam.bot[192], 'a concave wall: its ends nearer the lens, taller');
    for (const [x, y] of [[40, 60], [192, 100], [350, 150]]) {
      const w = cam.toWall(x, y), s = cam.toScreen(w.u, w.v);
      assert.ok(Math.abs(s.x - x) < 1.01 && Math.abs(s.y - y) < 1.01, `${x},${y} -> ${s.x},${s.y}`);
    }
    const panned = new studio.WallCam().set(12);
    assert.ok(panned.toWall(192, 100).u > cam.toWall(192, 100).u, 'a camera panned right sees further along the wall');
    const wb = new Uint32Array(cam.wbw * cam.wbh);
    for (let i = 0; i < wb.length; i++) wb[i] = [...PALETTE][i % PALETTE.size];
    const fb = new Uint32Array(384 * 216);
    studio.drawSet(fb, cam, wb, {});
    assert.ok(fb.every((c) => PALETTE.has(c)), 'the set and the wall');
    studio.drawSet(fb, cam, wb, { led: 'orange' });
    assert.ok(fb.includes(packed(P.orange)), 'a warning turns the LED line orange');
    const small = new Uint32Array(64 * 36);
    for (let i = 0; i < small.length; i++) small[i] = (i >> 3) % 2 ? packed(P.navy) : packed(P.tan);
    studio.softWall(fb, small, 64, 36, { k: 6, dim: 1 });
    assert.ok(fb.every((c) => PALETTE.has(c)), 'the out-of-focus wall');
    // the light on a figure: only its own pixels change, to palette colours, the rim side lit
    const fig = new Uint32Array(384 * 216);
    for (let y = 50; y < 150; y++) for (let x = 100; x < 140; x++) fig[y * 384 + x] = packed(P.slate);
    const box = studio.lightFigure(fig, { rim: 1, spill: 3 });
    assert.deepEqual(box, [100, 50, 139, 149]);
    assert.equal(fig[100 * 384 + 139], packed(P.steel), 'the edge facing the wall goes a step up');
    assert.equal(fig[100 * 384 + 99], 0, 'nothing drawn outside him');
    onlyPalette(fig, 'his light');
  });

  test('the shots: each segment of the script gets its shot; an older script still plays', async () => {
    const ep = writeWeather(report, { seed: 'shots' });
    const shots = ep.segments.map(centre.shotOf);
    assert.equal(shots[0], 'mcu');
    assert.equal(shots.at(-1), 'mcu');
    assert.ok(shots.includes('graphic') && shots.includes('wall') && shots.includes('board'));
    for (const seg of ep.segments) assert.ok(centre.SHOTS.includes(centre.shotOf(seg)));
    assert.equal(centre.shotOf({ kind: 'zone' }), 'wall', 'round 2 kinds');
    assert.equal(centre.shotOf({ kind: 'intro' }), 'mcu');
    assert.equal(centre.shotOf({ kind: 'warning', shot: 'nonsense' }), 'warning');
    // the camera's targets: a zone on its side of the wall, the warning on the storm, the boards full frame
    const { targetOf } = centre.__test;
    for (const seg of ep.segments) {
      const t = targetOf(ep.weather, seg, 0);
      assert.equal(t.shot, centre.shotOf(seg));
      if (seg.kind === 'zone') assert.ok(t.zone && (t.side === 'left' || t.side === 'right'));
      if (seg.kind === 'warning') assert.ok(t.warning);
    }
  });

  test('the time-lapse: the world plays 24 hours over most of its segment; a zone plays 12 then settles on now', () => {
    const world = { kind: 'world', shot: 'graphic', timelapse: { from: 0, to: 24 } };
    const at = (t) => centre.skyMoment(world, t, { since: 0, dur: 25 });
    assert.equal(at(0).hour, 0);
    assert.ok(at(10).hour > 4 && at(10).hour < 20);
    assert.equal(at(24).hour, 24);
    assert.ok(at(1).clock && at(10).clock);
    let last = -1;
    for (let t = 0; t <= 25; t += 0.25) {
      const h = at(t).hour;
      assert.ok(h >= last, 'the clock never runs back');
      last = h;
    }
    const zone = { kind: 'zone', shot: 'wall', timelapse: { from: 0, to: 12 } };
    const z = (t) => centre.skyMoment(zone, t, { since: 0, dur: 20, arrive: 2 });
    assert.equal(z(1).hour, 0);
    assert.ok(z(4).hour > 0 && z(4).clock);
    assert.equal(z(7).hour, 12);
    assert.equal(z(12).back, 1, 'settled back on now');
    assert.equal(z(12).clock, false);
    assert.equal(centre.skyMoment({ kind: 'headline', shot: 'mcu' }, 5).hour, 0, 'no time-lapse: now');
    assert.match(centre.clockLabel(Date.parse('2026-10-13T13:00:00Z')), /^TUE 14:00$/, 'the studio clock (London)');
  });

  test('the boards: palette colours only; HOT & COLD counts down 3, 2, 1, the places not said wait dimmed', () => {
    const ep = writeWeather(report, { seed: 'boards' });
    const hc = ep.segments.find((s) => s.kind === 'hotcold').board, ol = ep.segments.find((s) => s.kind === 'outlook').board;
    const rows = boards.hotColdRows(hc.hot);
    assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3, 4, 5]);
    assert.deepEqual(rows.map((r) => r.said), [true, true, true, false, false]);
    // a canvas that records every colour it is given
    const used = new Set();
    const ctx2d = () => ({
      _f: '#000000',
      set fillStyle(v) { used.add(String(v).toLowerCase()); this._f = v; },
      get fillStyle() { return this._f; },
      fillRect() {}, drawImage() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    });
    const had = globalThis.document;
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d() }) };
    try {
      const ctx = ctx2d();
      const spoken = new Map();
      for (const t of [0.1, 0.5, 1, 3]) boards.drawHotCold(ctx, t, hc, { since: 0, spoken, hot: null, hotAt: 0, done: null });
      [...hc.hot.slice(0, 3), ...hc.cold.slice(0, 3)].forEach((p, i) => spoken.set(p.id, 2 + i));
      for (const t of [2.2, 5, 9, 10]) boards.drawHotCold(ctx, t, hc, { since: 0, spoken, hot: hc.cold[0].id, hotAt: 7, done: 8.6 });
      for (const t of [0.2, 1, 4]) boards.drawOutlook(ctx, t, ol, { since: 0, spoken: new Map([[ol.cities[0].id, 2]]), hot: ol.cities[0].id, hotAt: 2, anySaid: true });
    } finally {
      if (had === undefined) delete globalThis.document;
      else globalThis.document = had;
    }
    const pal = new Set(Object.values(P).map((c) => c.toLowerCase()));
    for (const c of used) assert.ok(pal.has(c), `the boards use ${c}`);
    assert.ok(used.has(tempColor(hc.hot[0].value).toLowerCase()), 'a temperature on a chip of its colour');
  });
});
