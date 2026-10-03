// WORLD WEATHER (owner 3 Oct): the data desk (Open-Meteo forecast, GDACS warnings, the offline demo data), the
// script written from the data alone, the producer's path, the director's segments, the temperature field and
// the weather symbols.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WeatherDesk, parseOpenMeteo, parseGdacs, conditionOf, stormClass, buildReport, forecastUrl, warningsUrl, CITIES, ZONES, FIXTURE } from '../server/weather.js';
import { writeWeather, seaOf } from '../server/weatherwriter.js';
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

  test('Open-Meteo: one entry per city in request order, checked against the coordinates; bad entries are skipped', () => {
    const raw = fixture().forecast;
    const byCity = parseOpenMeteo(raw, CITIES);
    assert.equal(byCity.size, CITIES.length);
    const madrid = byCity.get('madrid');
    assert.deepEqual([madrid.today.max, madrid.today.min, madrid.today.kind], [23, 12, 'clear']);
    assert.equal(madrid.tomorrow.max, 24);
    // a list shifted by one: no city gets another city's weather
    assert.equal(parseOpenMeteo(raw.slice(1), CITIES).size, 0);
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
    assert.equal(u.searchParams.get('latitude').split(',').length, CITIES.length);
    assert.match(u.searchParams.get('daily'), /temperature_2m_max/);
    const g = new URL(warningsUrl(Date.parse('2026-10-03T00:00:00Z')));
    assert.equal(g.host, 'www.gdacs.org');
    assert.equal(g.searchParams.get('fromDate'), '2026-09-26');
  });

  test('a report needs three zones of three cities; the extremes come from the data', () => {
    const byCity = parseOpenMeteo(fixture().forecast, CITIES);
    const r = buildReport(byCity, [], { at: '2026-10-03T06:00:00Z' });
    assert.equal(r.zones.length, ZONES.length);
    assert.equal(r.extremes.hottest.id, 'riyadh');
    assert.equal(r.source, 'OPEN-METEO');
    const few = new Map([...byCity].slice(0, 5));
    assert.equal(buildReport(few, []), null);
  });

  test('the desk: the fixture says DEMO DATA; a live failure never falls back to it, and pauses the slot', async () => {
    const r = await fixtureReport();
    assert.equal(r.demo, true);
    assert.equal(r.source, 'DEMO DATA');
    let t = 0;
    const desk = new WeatherDesk({ source: 'open-meteo', fetchImpl: async () => { throw new Error('ENOTFOUND'); }, log: quiet, now: () => t });
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
  test('intro, six zones west to east, the warning, tomorrow, the sign-off; all spoken by the presenter', async () => {
    const ep = writeWeather(await fixtureReport(), { presenter: { name: 'Sam Night' }, channelName: 'GLOBIT 24', seed: 'a' });
    assert.deepEqual(ep.segments.map((s) => s.kind), ['intro', 'zone', 'zone', 'zone', 'zone', 'zone', 'zone', 'warning', 'tomorrow', 'outro']);
    assert.deepEqual(ep.segments.filter((s) => s.kind === 'zone').map((s) => s.zone), ZONES.map((z) => z.id));
    for (const s of ep.segments) {
      assert.equal(s.type, 'weather');
      assert.equal(s.anchor, 'A');
      assert.ok(isSpoken(s), 'the voice service voices it');
      assert.ok(!/undefined|NaN|null/.test(s.text), s.text);
    }
    assert.match(ep.segments[0].text, /I'm Sam Night, and this is WORLD WEATHER/);
    assert.equal(ep.segments.find((s) => s.kind === 'warning').emotion, 'serious');
    assert.match(ep.segments.at(-1).text, /GLOBIT 24/);
    assert.deepEqual(ep.storyIds, []);
    const chars = ep.segments.reduce((n, s) => n + s.text.length, 0);
    assert.ok(chars > 3000, `a programme of several minutes (${chars} characters)`);
  });

  test('every figure said is a figure of the forecast, and every mark points at the city named there', async () => {
    const report = await fixtureReport();
    const cities = new Map(report.zones.flatMap((z) => z.cities).map((c) => [c.id, c]));
    const allowed = new Set();
    for (const c of cities.values()) {
      for (const d of [c.today, c.tomorrow].filter(Boolean)) for (const v of [d.max, d.min, Math.round(d.rain), d.prob, d.gust]) if (v != null) allowed.add(String(v));
    }
    for (const w of report.warnings) allowed.add(String(w.wind)).add(String(w.cat?.cat));
    for (const seed of ['a', 'b', 'c', 'd']) {
      const ep = writeWeather(report, { seed });
      for (const s of ep.segments) {
        const nums = s.text.replace(/WORLD WEATHER|GLOBIT 24/g, '').match(/\d+/g) || [];
        for (const n of nums) assert.ok(allowed.has(n), `${n} in "${s.text}"`);
        for (const m of s.marks) {
          const c = cities.get(m.city);
          assert.ok(c, m.city);
          assert.ok(s.text.startsWith(c.say, m.char), `${c.say} at ${m.char} in "${s.text}"`);
        }
      }
      // the zones name most of their cities
      const zone = ep.segments.find((s) => s.zone === 'europe');
      assert.ok(new Set(zone.marks.map((m) => m.city)).size >= 6);
    }
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
    const dead = new Producer({ config: {}, newsDesk: {}, chain: null, weather: new WeatherDesk({ source: 'open-meteo', fetchImpl: async () => { throw new Error('down'); }, log: quiet }), log: quiet });
    assert.equal(await dead.produce(ch, 'world-weather'), null);
  });
});

describe('the weather centre (client)', () => {
  test('the temperature field: cities set the colour near them, the climate far away', async () => {
    const report = await fixtureReport();
    const f = temperatureField(report.zones.flatMap((z) => z.cities), 'today');
    assert.ok(Math.abs(f.at(24.7, 46.7) - 37) < 2.5, `Riyadh ${f.at(24.7, 46.7)}`);
    assert.ok(Math.abs(f.at(55.8, 37.6) - 10) < 2.5, `Moscow ${f.at(55.8, 37.6)}`);
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
