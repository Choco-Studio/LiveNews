// WORLD WEATHER's moving sky (round 3, owner 12 Oct: "el programa del tiempo necesita mejoras enormes"): the next
// 24 hours of cloud, rain, wind and pressure round the whole world, so the map can play the day's weather as a
// time-lapse (cloud that drifts and builds, rain bands, the highs and lows), as every real weather bulletin does.
// They are the forecast's own fields, never drawn by hand:
//   live     Open-Meteo's hourly forecast at the land points of config/weather-grid.json (the heat map's) and at
//            its open-sea points (`sea`, every 10 degrees), fetched with the heat map's highs in the same requests
//            (server/weatherfield.js FieldDesk), every 6 hours: about 1,100 places x 4 a day, within the free tier
//   offline  a recorded real forecast (config/fixtures/weather-sky.json, tools/weather/record-sky.mjs), on air as
//            DEMO DATA like the rest of the offline report
//
// The layers travel on a 3-degree grid (120 x 60, rows north to south, the first cell centred on 88.5 N 178.5 W),
// one frame every 3 hours from the forecast's first hour, as base64 bytes:
//   cloud  total cloud cover, % (0..100)          rain   precipitation, tenths of a mm per hour (0..255)
//   u, v   wind at 10 m toward east / north, m/s (int8)   mslp   sea-level pressure, hPa - 940 (0..120, ~1 hPa)
// plus `systems`: the highs and lows of each frame ({ kind: 'H' | 'L', lat, lon, hPa, frame }).
export const SW = 120, SH = 60, SLAT0 = 88.5, SLON0 = -178.5, SSTEP = 3;
export const FRAME_HOURS = 3; // a frame every 3 hours
export const FRAMES = 9; // 0 .. 24 hours
export const SKY_HOURLY = 'cloud_cover,precipitation,wind_speed_10m,wind_direction_10m,pressure_msl';
const DEG = Math.PI / 180;

/** The hourly part of a grid request (FieldDesk adds it to the heat map's daily highs). */
export function skyParams() {
  // the forecast's hours start at the current local hour; the frames from the next whole hour: one more to cover them
  return { hourly: SKY_HOURLY, forecast_hours: String((FRAMES - 1) * FRAME_HOURS + 2), wind_speed_unit: 'ms' };
}

/**
 * One place's frames from its response: the hours are local (timezone=auto), so they are put back on UTC with the
 * place's offset and read at the report's frame hours (UTC ms). Missing values stay null.
 */
export function parsePlaceSky(r, frameTimes) {
  const h = r?.hourly;
  if (!h || !Array.isArray(h.time)) return null;
  const off = Number(r.utc_offset_seconds) || 0;
  const at = new Map();
  h.time.forEach((t, i) => at.set(Date.parse(`${t}:00Z`) - off * 1000, i));
  const num = (arr, i) => (Array.isArray(arr) && Number.isFinite(arr[i]) ? arr[i] : null);
  return frameTimes.map((ms) => {
    const i = at.get(ms);
    if (i == null) return null;
    const s = num(h.wind_speed_10m, i), d = num(h.wind_direction_10m, i);
    // the direction is where the wind comes FROM (meteorological): the vector points the other way
    const u = s != null && d != null ? -s * Math.sin(d * DEG) : null;
    const v = s != null && d != null ? -s * Math.cos(d * DEG) : null;
    return { cloud: num(h.cloud_cover, i), rain: num(h.precipitation, i), u, v, mslp: num(h.pressure_msl, i) };
  });
}

/** The report's frame hours: the next whole UTC hour on from `startMs` (the first hour the forecast gives), every 3 h. */
export function frameTimes(startMs) {
  const h0 = Math.ceil(startMs / 3600_000) * 3600_000;
  return Array.from({ length: FRAMES }, (_, k) => h0 + k * FRAME_HOURS * 3600_000);
}

/**
 * Values at places onto the 3-degree grid: inverse distance on the sphere over the places within `reach` degrees
 * (the sea points are 10 degrees apart), eased into `prior` beyond them.
 */
export function spreadSky(points, { reach = 9, prior = 0, priorDist = reach } = {}) {
  const BK = 10, BW = 36, BH = 18;
  const buckets = Array.from({ length: BW * BH }, () => []);
  for (const p of points) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon) || !Number.isFinite(p?.v)) continue;
    const q = { lo: p.lon * DEG, sl: Math.sin(p.lat * DEG), cl: Math.cos(p.lat * DEG), v: p.v };
    const bx = Math.min(BW - 1, Math.floor((((p.lon + 180) % 360) + 360) % 360 / BK)), by = Math.min(BH - 1, Math.max(0, Math.floor((90 - p.lat) / BK)));
    buckets[by * BW + bx].push(q);
  }
  const out = new Float32Array(SW * SH);
  const cosR = Math.cos(reach * DEG);
  const w0 = 1 / (priorDist * priorDist);
  for (let j = 0; j < SH; j++) {
    const lat = SLAT0 - j * SSTEP;
    const sl = Math.sin(lat * DEG), cl = Math.cos(lat * DEG);
    const by = Math.floor((90 - lat) / BK);
    const span = Math.min(BW, Math.ceil(reach / BK / Math.max(0.15, cl)) + 1);
    for (let i = 0; i < SW; i++) {
      const lon = SLON0 + i * SSTEP;
      const bx = Math.floor((lon + 180) / BK);
      let ws = w0, vs = prior * w0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = by + dy;
        if (yy < 0 || yy >= BH) continue;
        for (let dx = -span; dx <= span; dx++) {
          const list = buckets[yy * BW + ((((bx + dx) % BW) + BW) % BW)];
          for (const q of list) {
            const c = sl * q.sl + cl * q.cl * Math.cos(lon * DEG - q.lo);
            if (c < cosR) continue;
            const d = Math.acos(Math.min(1, c)) / DEG;
            const w = 1 / (d * d + 1.5);
            ws += w;
            vs += w * q.v;
          }
        }
      }
      out[j * SW + i] = vs / ws;
    }
  }
  return out;
}

const b64 = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
const clampByte = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

/** Bytes of a layer (see the header for each one's unit). */
export function encodeLayer(kind, f) {
  if (kind === 'u' || kind === 'v') {
    const out = new Int8Array(f.length);
    for (let i = 0; i < f.length; i++) out[i] = clampByte(f[i], -127, 127);
    return b64(out);
  }
  const out = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) {
    out[i] = kind === 'cloud' ? clampByte(f[i], 0, 100) : kind === 'rain' ? clampByte(f[i] * 10, 0, 255) : clampByte(f[i] - 940, 0, 120);
  }
  return b64(out);
}

/** A layer back as numbers in its own unit (% / mm per hour / m/s / hPa). */
export function decodeLayer(kind, s) {
  const buf = Buffer.from(String(s || ''), 'base64');
  if (buf.length !== SW * SH) return null;
  const out = new Float32Array(SW * SH);
  for (let i = 0; i < out.length; i++) {
    const b = buf[i];
    out[i] = kind === 'u' || kind === 'v' ? (b << 24) >> 24 : kind === 'cloud' ? b : kind === 'rain' ? b / 10 : b + 940;
  }
  return out;
}

/**
 * The highs and lows of a pressure frame: a low is the lowest cell within 12 degrees and under 1006 hPa, a high the
 * highest within 15 degrees and over 1020 hPa (the bulletins' H and L); the deepest lows and strongest highs first,
 * at most `max` of each, none poleward of 75 degrees (the grid's top rows are thin there).
 */
export function findSystems(mslp, frame = 0, { max = 8 } = {}) {
  const out = [];
  // the cell is the extreme of its neighbourhood; of two equal cells the first one in the grid wins (a low centred
  // between two rows reads the same in both)
  const look = (j, i, r, sign) => {
    const k = j * SW + i;
    const v = mslp[k] * sign;
    const rc = Math.ceil(r / SSTEP);
    const lat = SLAT0 - j * SSTEP;
    const rx = Math.ceil(rc / Math.max(0.2, Math.cos(lat * DEG)));
    for (let dj = -rc; dj <= rc; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj >= SH) continue;
      for (let di = -rx; di <= rx; di++) {
        if (!dj && !di) continue;
        const kk = jj * SW + ((((i + di) % SW) + SW) % SW);
        const w = mslp[kk] * sign;
        if (w < v || (w === v && kk < k)) return false;
      }
    }
    return true;
  };
  const lows = [], highs = [];
  for (let j = 0; j < SH; j++) {
    const lat = SLAT0 - j * SSTEP;
    if (Math.abs(lat) > 75) continue;
    for (let i = 0; i < SW; i++) {
      const v = mslp[j * SW + i];
      const lon = SLON0 + i * SSTEP;
      if (v < 1006 && look(j, i, 12, 1)) lows.push({ kind: 'L', lat, lon, hPa: Math.round(v), frame });
      else if (v > 1020 && look(j, i, 15, -1)) highs.push({ kind: 'H', lat, lon, hPa: Math.round(v), frame });
    }
  }
  lows.sort((a, b) => a.hPa - b.hPa);
  highs.sort((a, b) => b.hPa - a.hPa);
  out.push(...lows.slice(0, max), ...highs.slice(0, max));
  return out;
}

/**
 * The sky from the places' frames: [{ lat, lon, frames: [{ cloud, rain, u, v, mslp } | null] }]. A frame needs at
 * least 60 % of the places to answer; the first frame that does not ends the time-lapse (fewer than 3: no sky).
 */
export function buildSky(places, times, { source = 'OPEN-METEO' } = {}) {
  const layers = { cloud: [], rain: [], u: [], v: [], mslp: [] };
  const systems = [];
  const PRIOR = { cloud: 50, rain: 0, u: 0, v: 0, mslp: 1013 };
  let frames = 0;
  for (let k = 0; k < times.length; k++) {
    const got = places.filter((p) => p.frames?.[k] && Number.isFinite(p.frames[k].mslp));
    if (got.length < places.length * 0.6) break;
    for (const kind of Object.keys(layers)) {
      const f = spreadSky(got.map((p) => ({ lat: p.lat, lon: p.lon, v: p.frames[k][kind] })), { prior: PRIOR[kind] });
      layers[kind].push(encodeLayer(kind, f));
      if (kind === 'mslp') systems.push(...findSystems(f, k));
    }
    frames++;
  }
  if (frames < 3) return null;
  return {
    w: SW, h: SH, lat0: SLAT0, lon0: SLON0, step: SSTEP,
    start: new Date(times[0]).toISOString(),
    hours: Array.from({ length: frames }, (_, k) => k * FRAME_HOURS),
    ...layers,
    systems,
    source,
    places: places.length,
  };
}
