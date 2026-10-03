// World weather for WORLD WEATHER (owner 3 Oct: "un programa del tiempo a nivel mundial, el mapamundi por zonas
// con la temperatura, lluvia, sol... y avisos de huracanes con un segundo panel"). The data is real and cited:
//   forecast  Open-Meteo (api.open-meteo.com, no key): every city of the six zones in ONE request, today and
//             tomorrow (WMO weather code, max/min, precipitation, rain chance, wind and gusts) plus the current hour
//   warnings  GDACS (www.gdacs.org, the UN/EC Global Disaster Alert and Coordination System): the weather
//             hazards on orange or red alert (tropical cyclones, floods, droughts, wildfires), with their official
//             names, levels and wind figures; earthquakes and volcanoes are not weather and are left out
// Offline (the fixture desk, WEATHER=fixture) the same parsers read config/fixtures/weather.json and the report
// says DEMO DATA on screen. A failed live fetch never falls back to the fixture: no data, no programme.
//
//   new WeatherDesk({ source, fetchImpl, fixtureFile, ttlMs }).report() -> report | null
//   parseOpenMeteo(json, cities) / parseGdacs(json) / conditionOf(code)   (exported for tests)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

const DAY_MS = 86_400_000;
export const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
export const GDACS = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';
export const FIXTURE = path.join(ROOT, 'config', 'fixtures', 'weather.json');

// The six zones in air order (a sweep from the Americas eastwards round the world), each with its cities.
// name: on-screen and spoken; say: how the presenter says a name when it differs from the screen.
export const ZONES = [
  {
    id: 'north-america', name: 'NORTH AMERICA', say: 'North America',
    cities: [
      ['vancouver', 'VANCOUVER', 49.28, -123.12], ['los-angeles', 'LOS ANGELES', 34.05, -118.24], ['mexico-city', 'MEXICO CITY', 19.43, -99.13],
      ['chicago', 'CHICAGO', 41.88, -87.63], ['toronto', 'TORONTO', 43.65, -79.38], ['new-york', 'NEW YORK', 40.71, -74.01], ['miami', 'MIAMI', 25.76, -80.19],
    ],
  },
  {
    id: 'south-america', name: 'SOUTH AMERICA', say: 'South America',
    cities: [
      ['bogota', 'BOGOTA', 4.71, -74.07, 'Bogotá'], ['lima', 'LIMA', -12.05, -77.04], ['manaus', 'MANAUS', -3.12, -60.02], ['sao-paulo', 'SAO PAULO', -23.55, -46.63, 'São Paulo'],
      ['rio', 'RIO', -22.91, -43.17, 'Rio de Janeiro'], ['buenos-aires', 'BUENOS AIRES', -34.6, -58.38], ['santiago', 'SANTIAGO', -33.45, -70.67],
    ],
  },
  {
    id: 'europe', name: 'EUROPE', say: 'Europe',
    cities: [
      ['london', 'LONDON', 51.51, -0.13], ['madrid', 'MADRID', 40.42, -3.7], ['paris', 'PARIS', 48.86, 2.35], ['berlin', 'BERLIN', 52.52, 13.41],
      ['rome', 'ROME', 41.9, 12.5], ['stockholm', 'STOCKHOLM', 59.33, 18.07], ['istanbul', 'ISTANBUL', 41.01, 28.98], ['moscow', 'MOSCOW', 55.76, 37.62],
    ],
  },
  {
    id: 'africa-middle-east', name: 'AFRICA & MIDDLE EAST', say: 'Africa and the Middle East',
    cities: [
      ['casablanca', 'CASABLANCA', 33.57, -7.59], ['lagos', 'LAGOS', 6.52, 3.38], ['cairo', 'CAIRO', 30.04, 31.24], ['nairobi', 'NAIROBI', -1.29, 36.82],
      ['johannesburg', 'JOHANNESBURG', -26.2, 28.05], ['riyadh', 'RIYADH', 24.71, 46.68], ['dubai', 'DUBAI', 25.2, 55.27],
    ],
  },
  {
    id: 'asia', name: 'ASIA', say: 'Asia',
    cities: [
      ['delhi', 'DELHI', 28.61, 77.21], ['mumbai', 'MUMBAI', 19.08, 72.88], ['bangkok', 'BANGKOK', 13.76, 100.5], ['beijing', 'BEIJING', 39.9, 116.41],
      ['shanghai', 'SHANGHAI', 31.23, 121.47], ['seoul', 'SEOUL', 37.57, 126.98], ['tokyo', 'TOKYO', 35.68, 139.69], ['manila', 'MANILA', 14.6, 120.98], ['jakarta', 'JAKARTA', -6.21, 106.85],
    ],
  },
  {
    id: 'oceania', name: 'OCEANIA', say: 'Australia and New Zealand',
    cities: [
      ['perth', 'PERTH', -31.95, 115.86], ['darwin', 'DARWIN', -12.46, 130.84], ['brisbane', 'BRISBANE', -27.47, 153.03], ['sydney', 'SYDNEY', -33.87, 151.21],
      ['melbourne', 'MELBOURNE', -37.81, 144.96], ['auckland', 'AUCKLAND', -36.85, 174.76],
    ],
  },
].map((z) => ({ ...z, cities: z.cities.map(([id, name, lat, lon, say]) => ({ id, name, lat, lon, say: say || titleCase(name) })) }));

export const CITIES = ZONES.flatMap((z) => z.cities.map((c) => ({ ...c, zone: z.id })));

function titleCase(s) {
  return String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// WMO weather interpretation codes (Open-Meteo): the icon kind and the words the presenter may use.
const KINDS = {
  clear: { text: 'sunny', night: 'clear', noun: 'sunshine' },
  partly: { text: 'sunny spells', noun: 'sunny spells' },
  cloudy: { text: 'cloudy', noun: 'cloud' },
  fog: { text: 'foggy', noun: 'fog' },
  drizzle: { text: 'drizzly', noun: 'drizzle' },
  rain: { text: 'rainy', noun: 'rain' },
  showers: { text: 'showery', noun: 'showers' },
  snow: { text: 'snowy', noun: 'snow' },
  storm: { text: 'stormy', noun: 'thunderstorms' },
};
const WET = new Set(['drizzle', 'rain', 'showers', 'snow', 'storm']);

/** { kind, text, noun, wet } for a WMO code (an unknown code reads as cloud, never as sun). */
export function conditionOf(code) {
  const c = code === null || code === undefined || code === '' ? NaN : Number(code);
  const kind =
    c === 0 ? 'clear'
      : c === 1 || c === 2 ? 'partly'
        : c === 3 ? 'cloudy'
          : c === 45 || c === 48 ? 'fog'
            : c >= 51 && c <= 57 ? 'drizzle'
              : (c >= 61 && c <= 67) ? 'rain'
                : c >= 80 && c <= 82 ? 'showers'
                  : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow'
                    : c >= 95 && c <= 99 ? 'storm'
                      : 'cloudy';
  return { kind, ...KINDS[kind], wet: WET.has(kind) };
}

const round = (v) => (Number.isFinite(Number(v)) && v !== null ? Math.round(Number(v)) : null);
const round1 = (v) => (Number.isFinite(Number(v)) && v !== null ? Math.round(Number(v) * 10) / 10 : null);

/** One day of an Open-Meteo `daily` block (index i), or null when its temperatures are missing. */
function dayOf(daily, i) {
  if (!daily || !Array.isArray(daily.time) || i >= daily.time.length) return null;
  const at = (k) => (Array.isArray(daily[k]) ? daily[k][i] : null);
  const max = round(at('temperature_2m_max')), min = round(at('temperature_2m_min'));
  if (max === null || min === null) return null;
  const code = round(at('weather_code') ?? at('weathercode'));
  return {
    date: String(daily.time[i]),
    max,
    min,
    code,
    ...pick(conditionOf(code)),
    rain: Math.max(0, round1(at('precipitation_sum')) ?? 0),
    prob: round(at('precipitation_probability_max')),
    wind: round(at('wind_speed_10m_max')),
    gust: round(at('wind_gusts_10m_max')),
  };
}
const pick = ({ kind, wet }) => ({ kind, wet });

/**
 * Open-Meteo forecast (an array for several locations, an object for one) matched to `cities` by order (the
 * request's order), each checked against its coordinates. -> Map cityId -> { now, today, tomorrow }.
 */
export function parseOpenMeteo(json, cities = CITIES) {
  const list = Array.isArray(json) ? json : json ? [json] : [];
  const out = new Map();
  for (let i = 0; i < cities.length && i < list.length; i++) {
    const r = list[i], c = cities[i];
    if (!r || typeof r !== 'object') continue;
    // the API snaps to its grid: a few tenths of a degree off is the same place, a different city is not
    if (Math.abs(Number(r.latitude) - c.lat) > 1 || Math.abs(Number(r.longitude) - c.lon) > 1) continue;
    const today = dayOf(r.daily, 0);
    if (!today) continue;
    const cur = r.current || {};
    const nowCode = round(cur.weather_code ?? cur.weathercode);
    out.set(c.id, {
      today,
      tomorrow: dayOf(r.daily, 1),
      now: Number.isFinite(Number(cur.temperature_2m)) && cur.temperature_2m !== null
        ? { temp: round(cur.temperature_2m), code: nowCode, ...pick(conditionOf(nowCode ?? today.code)), wind: round(cur.wind_speed_10m), day: cur.is_day === undefined ? null : !!cur.is_day }
        : null,
    });
  }
  return out;
}

// GDACS event types kept (weather), and how the presenter names them
const HAZARDS = {
  TC: { type: 'cyclone', label: 'TROPICAL CYCLONE' },
  FL: { type: 'flood', label: 'FLOOD WARNING' },
  DR: { type: 'drought', label: 'DROUGHT' },
  WF: { type: 'wildfire', label: 'WILDFIRE' },
};
const LEVELS = { red: 3, orange: 2 };

/** A storm's category from its maximum sustained wind (km/h): Saffir-Simpson, as the agencies give it. */
export function stormClass(kmh) {
  const v = Number(kmh);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v < 63) return { cat: 0, name: 'tropical depression' };
  if (v < 119) return { cat: 0, name: 'tropical storm' };
  const cat = v < 154 ? 1 : v < 178 ? 2 : v < 209 ? 3 : v < 252 ? 4 : 5;
  return { cat, name: `category ${cat}` };
}

const clean = (s, max = 80) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * GDACS event list (GeoJSON FeatureCollection) -> weather warnings, most severe first: [{ id, type, label, name,
 * level, lat, lon, country, wind (km/h, cyclones), cat, from, to, source: 'GDACS' }]. Unknown shapes give [].
 */
export function parseGdacs(json, { now = Date.now(), maxAgeDays = 10 } = {}) {
  const feats = Array.isArray(json?.features) ? json.features : [];
  const out = [];
  for (const f of feats) {
    const p = f?.properties || {};
    const hz = HAZARDS[String(p.eventtype || '').toUpperCase()];
    const level = String(p.alertlevel || '').toLowerCase();
    if (!hz || !LEVELS[level]) continue;
    const coords = f?.geometry?.type === 'Point' ? f.geometry.coordinates : null;
    const lon = Number(coords?.[0]), lat = Number(coords?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const to = Date.parse(p.todate || p.fromdate || '');
    if (Number.isFinite(to) && now - to > maxAgeDays * DAY_MS) continue; // over and done
    const sev = p.severitydata || {};
    const wind = hz.type === 'cyclone' && /km\/?h/i.test(String(sev.severityunit || 'km/h')) ? round(sev.severity) : null;
    // "Tropical Cyclone MILTON-24" -> MILTON; floods carry the country instead of a name
    let name = clean(p.name || p.eventname, 60);
    const m = /\b(?:tropical\s+(?:cyclone|storm|depression)|hurricane|typhoon|cyclone)\s+([A-Z][A-Z'-]+?)(?:-\d{2})?\b/i.exec(name);
    name = m ? m[1].toUpperCase() : hz.type === 'cyclone' ? clean(p.eventname, 24).toUpperCase() : '';
    out.push({
      id: `${p.eventtype}-${p.eventid ?? out.length}`,
      type: hz.type,
      label: hz.label,
      name,
      level,
      lat: round1(lat),
      lon: round1(lon),
      country: clean(p.country, 48),
      wind,
      cat: wind ? stormClass(wind) : null,
      from: p.fromdate || null,
      to: p.todate || null,
      source: 'GDACS',
    });
  }
  // red before orange, cyclones before the rest, the strongest storm first
  out.sort((a, b) => LEVELS[b.level] - LEVELS[a.level] || (b.type === 'cyclone') - (a.type === 'cyclone') || (b.wind || 0) - (a.wind || 0));
  return out.slice(0, 3);
}

/** The forecast URL for every city (one request). */
export function forecastUrl(cities = CITIES) {
  const q = new URLSearchParams({
    latitude: cities.map((c) => c.lat).join(','),
    longitude: cities.map((c) => c.lon).join(','),
    current: 'temperature_2m,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
    timezone: 'auto',
    forecast_days: '2',
  });
  return `${OPEN_METEO}?${q}`;
}

export function warningsUrl(now = Date.now()) {
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const q = new URLSearchParams({ eventlist: 'TC,FL,DR,WF', alertlevel: 'orange;red', fromDate: day(now - 7 * DAY_MS), toDate: day(now + DAY_MS) });
  return `${GDACS}?${q}`;
}

/** The day's standouts across the world, for the headlines and the round-up. */
export function extremesOf(zones) {
  let hottest = null, coldest = null, wettest = null, windiest = null;
  for (const z of zones) {
    for (const c of z.cities) {
      const d = c.today;
      if (!hottest || d.max > hottest.today.max) hottest = c;
      if (!coldest || d.min < coldest.today.min) coldest = c;
      if (d.rain >= 5 && (!wettest || d.rain > wettest.today.rain)) wettest = c;
      if (Number.isFinite(d.gust) && d.gust >= 50 && (!windiest || d.gust > windiest.today.gust)) windiest = c;
    }
  }
  const ref = (c, k) => (c ? { id: c.id, zone: c.zone, value: c.today[k] } : null);
  return { hottest: ref(hottest, 'max'), coldest: ref(coldest, 'min'), wettest: ref(wettest, 'rain'), windiest: ref(windiest, 'gust') };
}

/** Zones with each city's data (cities without data are dropped; a zone keeps at least 3 cities or is dropped). */
export function buildReport(byCity, warnings, { at = new Date().toISOString(), demo = false } = {}) {
  const zones = [];
  for (const z of ZONES) {
    const cities = z.cities.map((c) => (byCity.has(c.id) ? { ...c, zone: z.id, ...byCity.get(c.id) } : null)).filter(Boolean);
    if (cities.length >= 3) zones.push({ id: z.id, name: z.name, say: z.say, cities });
  }
  if (zones.length < 3) return null; // not a world forecast
  return {
    at,
    date: at.slice(0, 10),
    demo,
    source: demo ? 'DEMO DATA' : warnings.length ? 'OPEN-METEO · GDACS' : 'OPEN-METEO',
    zones,
    warnings,
    extremes: extremesOf(zones),
  };
}

export class WeatherDesk {
  /**
   * @param o.source 'open-meteo' (live) | 'fixture' (offline demo data, said on screen) | 'off' | 'auto' (the
   *                 fixture while the news desk is the offline fixture desk, `offline()`, else live)
   * @param o.warnings 'gdacs' | 'off'
   */
  constructor({ source = 'open-meteo', offline = () => false, warnings = 'gdacs', fetchImpl = globalThis.fetch, fixtureFile = FIXTURE, ttlMs = 30 * 60_000, timeoutMs = 12_000, log = console, now = () => Date.now() } = {}) {
    this.mode = source;
    this.offline = offline;
    this.warningsSource = warnings;
    this.fetchImpl = fetchImpl;
    this.fixtureFile = fixtureFile;
    this.ttlMs = ttlMs;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.now = now;
    this.cached = null; // { at, report }
    this.inflight = null;
    this.lastError = null;
    this.failedAt = null;
  }

  /** The source in use now ('auto' follows the news desk: offline fixture desk -> fixture data). */
  get source() {
    if (this.mode !== 'auto') return this.mode;
    try {
      return this.offline() ? 'fixture' : 'open-meteo';
    } catch {
      return 'open-meteo';
    }
  }

  get enabled() {
    return this.source === 'open-meteo' || this.source === 'fixture';
  }

  /** Worth trying now: data in hand, or no failure in the last 10 minutes (a dead network does not stall the rotation). */
  usable() {
    if (!this.enabled) return false;
    if (this.cached && this.now() - this.cached.at < 3 * 3600_000) return true;
    return this.failedAt == null || this.now() - this.failedAt > 10 * 60_000;
  }

  /** The latest report (refetched after ttl), or null when there is no data. Never throws. */
  async report() {
    if (!this.enabled) return null;
    if (this.cached && this.now() - this.cached.at < this.ttlMs) return this.cached.report;
    this.inflight ??= this.load().finally(() => (this.inflight = null));
    return this.inflight;
  }

  async load() {
    try {
      const report = this.source === 'fixture' ? this.fromFixture() : await this.fromNetwork();
      if (report) {
        this.cached = { at: this.now(), report };
        this.lastError = null;
        this.failedAt = null;
      } else {
        this.lastError = 'not enough cities with data';
        this.failedAt = this.now();
      }
      return report ?? this.cached?.report ?? null;
    } catch (err) {
      this.lastError = err.message;
      this.failedAt = this.now();
      this.log.warn?.(`[weather] ${err.message}`);
      // a report up to 3 hours old still airs (the forecast is a forecast); older is no report
      return this.cached && this.now() - this.cached.at < 3 * 3600_000 ? this.cached.report : null;
    }
  }

  fromFixture() {
    const raw = JSON.parse(fs.readFileSync(this.fixtureFile, 'utf8'));
    const byCity = parseOpenMeteo(raw.forecast, CITIES);
    const warnings = parseGdacs(raw.warnings, { now: Date.parse(raw.at) || this.now() });
    return buildReport(byCity, warnings, { at: raw.at || new Date(this.now()).toISOString(), demo: true });
  }

  async getJson(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'GLOBIT24-weather/1.0' } });
      if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`);
      const text = await res.text();
      if (text.length > 4_000_000) throw new Error(`${new URL(url).host}: response too large`);
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  async fromNetwork() {
    const [forecast, warnings] = await Promise.all([
      this.getJson(forecastUrl(CITIES)),
      this.warningsSource === 'gdacs'
        ? this.getJson(warningsUrl(this.now())).catch((err) => {
          // no warnings feed is not no forecast: the programme airs without the warnings panel
          this.log.warn?.(`[weather] warnings: ${err.message}`);
          return null;
        })
        : null,
    ]);
    return buildReport(parseOpenMeteo(forecast, CITIES), parseGdacs(warnings, { now: this.now() }), { at: new Date(this.now()).toISOString() });
  }
}
