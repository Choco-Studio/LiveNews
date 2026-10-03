// One clock for every graphic. Intl formatters are created once per zone and
// strings are refreshed at most once per second (Intl is slow). Lab pages and
// tests can freeze time with setNow(ms) to get deterministic frames.

let fixed = null;
/** Freeze the graphics clock at `ms` (epoch milliseconds), or pass null to follow real time. */
export function setNow(ms) {
  fixed = Number.isFinite(ms) ? ms : null;
}
export const nowMs = () => (fixed ?? Date.now());

export const STUDIO_TZ = 'Europe/London';

const FMT = new Map();
function fmt(tz, kind) {
  const key = `${tz}|${kind}`;
  let f = FMT.get(key);
  if (!f) {
    f = kind === 'time'
      ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      : new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
    FMT.set(key, f);
  }
  return f;
}

const CACHE = new Map();
/** { time: 'HH:MM', sec: 'SS', date: 'FRIDAY 2 OCTOBER' } for a zone, cached per second. */
export function clockIn(tz = STUDIO_TZ) {
  const ms = nowMs();
  const s = Math.floor(ms / 1000);
  let c = CACHE.get(tz);
  if (c && c.at === s) return c;
  let time = '--:--';
  let sec = '00';
  let date = '';
  try {
    const parts = fmt(tz, 'time').formatToParts(new Date(ms));
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '00';
    const hh = get('hour') === '24' ? '00' : get('hour');
    time = `${hh}:${get('minute')}`;
    sec = get('second');
    date = fmt(tz, 'date').format(new Date(ms)).replace(',', '').toUpperCase();
  } catch {
    /* unknown zone: keep the placeholders */
  }
  c = { at: s, time, sec, date };
  CACHE.set(tz, c);
  return c;
}
