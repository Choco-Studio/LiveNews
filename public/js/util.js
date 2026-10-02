// Small shared helpers for the pixel renderer.
export const r = (ctx, x, y, w, h, c) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The studio is "located" in London: sky colour and the main clock follow it.
export const STUDIO_TZ = 'Europe/London';

// Intl formatters are expensive to build, and the clock is read every frame:
// keep one formatter per zone and recompute the label once per minute.
const formatters = new Map();
function formatter(key, options) {
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', options);
    formatters.set(key, f);
  }
  return f;
}
const toMs = (now) => (typeof now === 'number' ? now : now instanceof Date ? now.getTime() : Date.now());

const zoneMemo = new Map(); // timeZone -> { minute, value }
/** Wall-clock time in `timeZone`: frozen { h, m, label: 'HH:MM' }. `now` is a Date or epoch ms. */
export function zoneTime(timeZone = STUDIO_TZ, now = Date.now()) {
  const ms = toMs(now);
  const minute = Math.floor(ms / 60000);
  const hit = zoneMemo.get(timeZone);
  if (hit && hit.minute === minute) return hit.value;
  const parts = formatter(`t|${timeZone}`, { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(ms);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  const hh = get('hour') === '24' ? '00' : get('hour');
  const value = Object.freeze({ h: Number(hh), m: Number(get('minute')), label: `${hh}:${get('minute')}` });
  zoneMemo.set(timeZone, { minute, value });
  return value;
}

let dateMemo = { minute: -1, value: '' };
/** Studio date, e.g. "Friday 2 October". `now` is a Date or epoch ms. */
export function longDate(now = Date.now()) {
  const ms = toMs(now);
  const minute = Math.floor(ms / 60000);
  if (dateMemo.minute === minute) return dateMemo.value;
  const value = formatter('date', { timeZone: STUDIO_TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(ms);
  dateMemo = { minute, value };
  return value;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
export const lerp = (a, b, k) => a + (b - a) * k;
// Cubic easing (no overshoot): the one set of curves for graphics, logo and set.
export const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3;
export const easeIn = (x) => clamp01(x) ** 3;
export const easeInOut = (x) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
