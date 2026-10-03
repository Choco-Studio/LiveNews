// WORLD WEATHER's heat map (owner 3 Oct: "los colores del mapa quiero que sean reales: un script que saque la
// temperatura de muchos sitios y con ellas haga un mapa de calor estilo pixel art"). The land's colours come
// from real temperatures sampled at many places, not from a few cities:
//   live     Open-Meteo: the day's high and tomorrow's at the 841 land points of config/weather-grid.json (a
//            point every 5 degrees, tools/weather/make-grid.mjs), in batches, every 3 hours (the free tier's
//            daily budget), spread onto a 1-degree grid by inverse distance on the sphere
//   offline  the ERA-Interim reanalysis (ECMWF), October's mean 2 m temperature on a 1-degree grid
//            (config/fixtures/weather-field.json, tools/weather/make-demo-field.py): real, but a monthly mean
// Either way the field is then tied to the forecast's cities (the figures on screen): the difference between a
// city's high and the field at the city is spread around it (and its mean far away), so the colour under a
// chip always agrees with the chip.
//
//   new FieldDesk({ source, fetchImpl, ttlMs }).field(report) -> { today, tomorrow, w, h, lat0, lon0, step,
//     scale, source, kind } | null   (today / tomorrow: base64 int8, half degrees; rows north to south)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';
import { OPEN_METEO } from './weather.js';

export const GRID_FILE = path.join(ROOT, 'config', 'weather-grid.json');
export const DEMO_FIELD = path.join(ROOT, 'config', 'fixtures', 'weather-field.json');
export const FW = 360, FH = 180, LAT0 = 89.5, LON0 = -179.5, SCALE = 0.5;
const DEG = Math.PI / 180;
const BATCH = 120; // places per request

/** A field (Float32Array FW x FH, degrees C) from the base64 int8 form. */
export function decodeField(b64, scale = SCALE) {
  const buf = Buffer.from(String(b64 || ''), 'base64');
  if (buf.length !== FW * FH) return null;
  const out = new Float32Array(FW * FH);
  for (let i = 0; i < out.length; i++) out[i] = ((buf[i] << 24) >> 24) * scale;
  return out;
}

/** The base64 int8 form (half degrees, clamped to -63.5 .. 63.5). */
export function encodeField(f) {
  const buf = Buffer.alloc(FW * FH);
  for (let i = 0; i < buf.length; i++) {
    const v = Number.isFinite(f[i]) ? Math.round(f[i] / SCALE) : 0;
    buf[i] = Math.max(-127, Math.min(127, v)) & 255;
  }
  return buf.toString('base64');
}

/** The field at (lat, lon), bilinear. */
export function sampleField(f, lat, lon) {
  const v = Math.max(0, Math.min(FH - 1.0001, LAT0 - lat));
  let u = (lon - LON0) % 360;
  if (u < 0) u += 360;
  const i0 = Math.floor(u), j0 = Math.floor(v);
  const i1 = (i0 + 1) % FW, j1 = Math.min(FH - 1, j0 + 1);
  const fu = u - i0, fv = v - j0;
  const a = f[j0 * FW + (i0 % FW)], b = f[j0 * FW + i1], c = f[j1 * FW + (i0 % FW)], d = f[j1 * FW + i1];
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}

/** A gentle latitude climate (where no place was sampled: the poles, open sea far from any coast). */
export function climate(lat) {
  const a = Math.abs(lat);
  return a <= 15 ? 27 : 27 - (a - 15) * 0.62;
}

/**
 * Spread values at places onto the 1-degree grid: inverse distance on the sphere (power 2) over the places within
 * `reach` degrees, eased into `prior(lat, lon)` beyond them. Places are bucketed by 10-degree cells, so a cell
 * looks at a handful of places.
 */
export function spread(points, { reach = 12, prior = (lat) => climate(lat), priorDist = reach } = {}) {
  const BK = 10, BW = 36, BH = 18;
  const buckets = Array.from({ length: BW * BH }, () => []);
  const pts = [];
  for (const p of points) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon) || !Number.isFinite(p?.v)) continue;
    const q = { la: p.lat * DEG, lo: p.lon * DEG, sl: Math.sin(p.lat * DEG), cl: Math.cos(p.lat * DEG), v: p.v };
    pts.push(q);
    const bx = Math.min(BW - 1, Math.floor((((p.lon + 180) % 360) + 360) % 360 / BK)), by = Math.min(BH - 1, Math.floor((90 - p.lat) / BK));
    buckets[by * BW + bx].push(q);
  }
  const out = new Float32Array(FW * FH);
  const cosR = Math.cos(reach * DEG);
  const w0 = 1 / (priorDist * priorDist);
  for (let j = 0; j < FH; j++) {
    const lat = LAT0 - j;
    const sl = Math.sin(lat * DEG), cl = Math.cos(lat * DEG);
    const by = Math.floor((90 - lat) / BK);
    const span = Math.min(BW, Math.ceil(reach / BK / Math.max(0.15, cl)) + 1);
    for (let i = 0; i < FW; i++) {
      const lon = LON0 + i;
      const bx = Math.floor((lon + 180) / BK);
      let ws = w0, vs = prior(lat, lon) * w0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = by + dy;
        if (yy < 0 || yy >= BH) continue;
        for (let dx = -span; dx <= span; dx++) {
          const list = buckets[yy * BW + ((((bx + dx) % BW) + BW) % BW)];
          for (const q of list) {
            const c = sl * q.sl + cl * q.cl * Math.cos(lon * DEG - q.lo);
            if (c < cosR) continue;
            const d = Math.acos(Math.min(1, c)) / DEG;
            const w = 1 / (d * d + 0.8);
            ws += w;
            vs += w * q.v;
          }
        }
      }
      out[j * FW + i] = vs / ws;
    }
  }
  return out;
}

/**
 * Tie a field to the forecast's cities: each city's difference (its `day` high minus the field there) spread
 * around it (reach 18 degrees), the cities' mean difference far from all of them.
 */
export function tieToCities(field, cities, day = 'today') {
  const diffs = [];
  for (const c of cities || []) {
    const v = c?.[day]?.max;
    if (!Number.isFinite(v)) continue;
    diffs.push({ lat: c.lat, lon: c.lon, v: v - sampleField(field, c.lat, c.lon) });
  }
  if (!diffs.length) return field;
  const mean = diffs.reduce((s, d) => s + d.v, 0) / diffs.length;
  const corr = spread(diffs, { reach: 18, prior: () => mean, priorDist: 14 });
  const out = new Float32Array(field.length);
  for (let i = 0; i < out.length; i++) out[i] = field[i] + corr[i];
  return out;
}

/** The sample places (config/weather-grid.json). */
export function gridPoints(file = GRID_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).points.map(([lat, lon]) => ({ lat, lon }));
  } catch {
    return [];
  }
}

/** One Open-Meteo request for a batch of places: today's and tomorrow's highs. */
export function gridUrl(batch) {
  const q = new URLSearchParams({
    latitude: batch.map((p) => p.lat).join(','),
    longitude: batch.map((p) => p.lon).join(','),
    daily: 'temperature_2m_max',
    timezone: 'auto',
    forecast_days: '2',
  });
  return `${OPEN_METEO}?${q}`;
}

/** The highs of a batch from its response (matched by order and position). */
export function parseGrid(json, batch) {
  const list = Array.isArray(json) ? json : json ? [json] : [];
  const out = [];
  for (let k = 0; k < batch.length && k < list.length; k++) {
    const r = list[k], p = batch[k];
    if (!r || Math.abs(Number(r.latitude) - p.lat) > 1.5 || Math.abs(Number(r.longitude) - p.lon) > 1.5) continue;
    const mx = r.daily?.temperature_2m_max;
    if (!Array.isArray(mx)) continue;
    out.push({ lat: p.lat, lon: p.lon, today: Number.isFinite(mx[0]) ? mx[0] : null, tomorrow: Number.isFinite(mx[1]) ? mx[1] : null });
  }
  return out;
}

export class FieldDesk {
  /** @param o.source 'open-meteo' | 'fixture' | 'off' (a function: the WeatherDesk's current source) */
  constructor({ source = 'open-meteo', fetchImpl = globalThis.fetch, ttlMs = 3 * 3600_000, timeoutMs = 20_000, gridFile = GRID_FILE, demoFile = DEMO_FIELD, log = console, now = () => Date.now() } = {}) {
    this.sourceOf = typeof source === 'function' ? source : () => source;
    this.fetchImpl = fetchImpl;
    this.ttlMs = ttlMs;
    this.timeoutMs = timeoutMs;
    this.gridFile = gridFile;
    this.demoFile = demoFile;
    this.log = log;
    this.now = now;
    this.cached = null; // { at, source, base: { today, tomorrow }, meta }
    this.lastError = null;
  }

  /** The heat map for a report (tied to its cities), or null (the client falls back to the cities alone). */
  async field(report) {
    try {
      const base = await this.base();
      if (!base) return null;
      const cities = (report?.zones || []).flatMap((z) => z.cities);
      return {
        today: encodeField(tieToCities(base.today, cities, 'today')),
        tomorrow: encodeField(tieToCities(base.tomorrow, cities, 'tomorrow')),
        w: FW, h: FH, lat0: LAT0, lon0: LON0, step: 1, scale: SCALE,
        source: base.meta.source,
        kind: base.meta.kind,
        places: base.meta.places ?? null,
      };
    } catch (err) {
      this.lastError = err.message;
      this.log.warn?.(`[weather] heat map: ${err.message}`);
      return null;
    }
  }

  async base() {
    const source = this.sourceOf();
    if (source !== 'open-meteo' && source !== 'fixture') return null;
    if (this.cached && this.cached.source === source && this.now() - this.cached.at < this.ttlMs) return this.cached;
    const b = source === 'fixture' ? this.fromDemo() : await this.fromNetwork();
    if (b) this.cached = { at: this.now(), source, ...b };
    return b ? this.cached : this.cached?.source === source ? this.cached : null;
  }

  fromDemo() {
    const doc = JSON.parse(fs.readFileSync(this.demoFile, 'utf8'));
    const f = decodeField(doc.data, doc.scale ?? SCALE);
    if (!f) throw new Error('demo field: bad size');
    // a monthly mean for both days: the tie to the cities turns it into each day's highs
    return { base: null, today: f, tomorrow: f, meta: { source: `${doc.source} ${doc.period}`, kind: doc.kind } };
  }

  async getJson(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'GLOBIT24-weather/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(await res.text());
    } finally {
      clearTimeout(timer);
    }
  }

  async fromNetwork() {
    const places = gridPoints(this.gridFile);
    if (!places.length) throw new Error('no sample places (config/weather-grid.json)');
    const got = [];
    for (let i = 0; i < places.length; i += BATCH) {
      const batch = places.slice(i, i + BATCH);
      got.push(...parseGrid(await this.getJson(gridUrl(batch)), batch));
    }
    if (got.length < places.length * 0.6) throw new Error(`only ${got.length} of ${places.length} places answered`);
    const today = spread(got.map((p) => ({ lat: p.lat, lon: p.lon, v: p.today })));
    const tomorrow = spread(got.map((p) => ({ lat: p.lat, lon: p.lon, v: p.tomorrow ?? p.today })));
    return { today, tomorrow, meta: { source: 'OPEN-METEO', kind: 'daily-max', places: got.length } };
  }
}
