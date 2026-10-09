// The hourly clock (WAVE3.md §1, owner decision 1 of 5 Oct: "parrilla por horas, preparada para programas que no son
// informativos"): which programme airs at which minute of the hour, instead of the rotation. config/schedule.json.
//
//   loadSchedule(file?) -> schedule | null        (null: no file, or "clock": false; the station keeps the rotation)
//   slotsFrom(schedule, fromMs, count) -> [slot]   the next slots at or after fromMs, in order
//   slot: { at: ms, program: id, fixed: bool, key: 'yyyy-mm-ddThh:mm' }
//
// The schedule:
//   { clock: true, timezone: 'Europe/London', hour: [ { at: 'mm:ss', program: id } | { at, rotate: [ids] },
//     with optional fixed: true (the station lands it within its tolerance), days: [0-6], hours: [from, to] ] }
// A "rotate" slot takes the next programme of its list each hour (by the hour of the day), so a slot shared by
// TECH BYTES, COSMOS and WORLD WEATHER gives each its turn. Minutes are the same in every time zone the channel
// uses (whole-hour offsets); the hour and the day are read in the schedule's time zone.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

const HOUR = 3600_000;

export function loadSchedule(file = path.join(ROOT, 'config', 'schedule.json')) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!raw?.clock || !Array.isArray(raw.hour) || !raw.hour.length) return null;
  const hour = raw.hour
    .map((s) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(s.at || ''));
      if (!m) return null;
      const offset = (Number(m[1]) * 60 + Number(m[2])) * 1000;
      if (offset >= HOUR) return null;
      const programs = s.rotate ? s.rotate.filter(Boolean) : s.program ? [s.program] : [];
      if (!programs.length) return null;
      return { offset, programs, rotate: !!s.rotate, fixed: !!s.fixed, days: Array.isArray(s.days) ? s.days : null, hours: Array.isArray(s.hours) && s.hours.length === 2 ? s.hours : null };
    })
    .filter(Boolean)
    .sort((a, b) => a.offset - b.offset);
  return hour.length ? { timezone: raw.timezone || 'UTC', hour, tolerance: Number(raw.tolerance) || 90, lateSkip: Number(raw.lateSkip) || 180 } : null;
}

/** The hour of the day (0-23) and the day of the week (0 Sunday) of `ms` in `timezone`. */
export function localHour(ms, timezone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ms));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value) % 24;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value);
  return { hour, day };
}

const inHours = ([from, to], h) => (from <= to ? h >= from && h < to : h >= from || h < to);

/** The next `count` slots at or after `fromMs` (a slot whose day or hours exclude it is not a slot then). */
export function slotsFrom(schedule, fromMs, count = 4) {
  const out = [];
  let hourStart = Math.floor(fromMs / HOUR) * HOUR;
  for (let guard = 0; out.length < count && guard < 48; guard++, hourStart += HOUR) {
    const { hour, day } = localHour(hourStart, schedule.timezone);
    for (const s of schedule.hour) {
      const at = hourStart + s.offset;
      if (at < fromMs) continue;
      if (s.days && !s.days.includes(day)) continue;
      if (s.hours && !inHours(s.hours, hour)) continue;
      const program = s.rotate ? s.programs[hour % s.programs.length] : s.programs[0];
      out.push({ at, program, fixed: s.fixed, key: new Date(at).toISOString().slice(0, 16) });
      if (out.length >= count) break;
    }
  }
  return out;
}
