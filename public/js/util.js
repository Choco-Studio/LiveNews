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

export function zoneTime(timeZone = STUDIO_TZ, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '00';
  const hh = get('hour') === '24' ? '00' : get('hour');
  return { h: Number(hh), m: Number(get('minute')), label: `${hh}:${get('minute')}` };
}

export function longDate(now = new Date()) {
  return now.toLocaleDateString('en-GB', { timeZone: STUDIO_TZ, weekday: 'long', day: 'numeric', month: 'long' });
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;
export const easeInOut = (x) => {
  const v = clamp(x, 0, 1);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
