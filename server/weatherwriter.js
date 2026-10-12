// The WORLD WEATHER script, written from the data alone (server/weather.js report): every figure the presenter
// says is a figure of the forecast, every place is a place we have data for, every high and low is the forecast's
// pressure field (server/weathersky.js), every warning is GDACS's own. No AI writes it, so it can never invent a
// storm or a temperature; the phrasing varies with a seed (the date and the edition) so a 24/7 rotation does not
// hear the same bulletin twice.
//
// Round 3 (owner 12 Oct: "el programa del tiempo necesita mejoras enormes"; programmes must entertain, not only
// inform): story-led and shorter, about 3.5 minutes of speech instead of a 4-minute list of every city.
//   headline  (mcu)      the greeting and the day's big weather story, what is coming
//   world     (graphic)  the next 24 hours round the planet: the highs and lows, where the rain is
//   zone x6   (wall)     each zone in two to four standouts and one line for the people who live there
//   hotcold   (board)    HOT & COLD: the five hottest and five coldest places on the planet today, counted down
//   warning   (warning)  GDACS's orange and red alerts, serious tone, advice to follow the local services
//   outlook   (board)    THE NEXT THREE DAYS for five cities round the world
//   outro     (mcu)      a last line for the viewer, the sign-off
//
//   writeWeather(report, { presenter, channelName, title, seed }) -> { title, segments, storyIds: [], weather }
// Each segment: { type: 'weather', kind, shot, anchor: 'A', emotion, text, marks: [{ char, city }], zone?, warning?,
//   board?, pins?, timelapse? } - marks are where a place's name starts in the text (the map lights the city, the
//   board lights its row, the presenter points); pins are where a high or low is named ({ char, kind, lat, lon }).
import { decodeLayer } from './weathersky.js';

const UNIT = 'degrees';

function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A temperature as said: "minus 4", "21". */
export const deg = (v) => (v < 0 ? `minus ${-v}` : `${v}`);
/** The article before a percentage said aloud: "an 82", "an 11", "a 70". */
export const aN = (n) => {
  const v = Math.round(n);
  return v === 8 || v === 11 || v === 18 || (v >= 80 && v <= 89) ? 'an' : 'a';
};

/** Text with the places it names: parts are strings, { city } (a place: its spoken name) or { pin } (a high or low). */
class Line {
  constructor() {
    this.text = '';
    this.marks = [];
    this.pins = [];
  }

  add(...parts) {
    for (const p of parts) {
      if (p == null || p === '') continue;
      if (typeof p === 'object' && p.pin) {
        this.pins.push({ char: this.text.length, kind: p.pin.kind, lat: p.pin.lat, lon: p.pin.lon });
        this.text += p.say;
      } else if (typeof p === 'object') {
        this.marks.push({ char: this.text.length, city: p.id });
        this.text += p.say;
      } else this.text += p;
    }
    return this;
  }

  /** End the sentence and start the next one. */
  stop(end = '.') {
    this.text = this.text.replace(/\s+$/, '') + end + ' ';
    return this;
  }

  get words() {
    return this.text.split(/\s+/).filter(Boolean).length;
  }

  done() {
    return { text: this.text.trim(), marks: this.marks, pins: this.pins };
  }
}

const listOf = (items) => {
  // ['A'] / ['A', ' and ', 'B'] / ['A', ', ', 'B', ' and ', 'C']
  const out = [];
  items.forEach((x, i) => {
    if (i > 0) out.push(i === items.length - 1 ? ' and ' : ', ');
    out.push(x);
  });
  return out;
};
const numList = (nums) => listOf(nums.map(deg));
/** ', at 23 and 21 degrees' / ', both at 23 degrees' */
const atTemps = (lead, nums) => (nums.length === 2 && nums[0] === nums[1] ? [`, both ${lead}${deg(nums[0])} ${UNIT}`] : [`, ${lead}`, ...numList(nums), ` ${UNIT}`]);

function mm(v) {
  const r = Math.round(v);
  return r <= 1 ? 'a little rain' : `${r} millimetres of rain`;
}

const isDry = (d) => !d.wet && d.rain < 1;
const isStorm = (d) => d.kind === 'storm';
const isWet = (d) => d.wet || d.rain >= 2;
const isSunny = (d) => d.kind === 'clear' || d.kind === 'partly';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** The weekday of a forecast date ('2026-10-14' -> 'Wednesday'). */
export const weekday = (date) => DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()] || '';

// ---------------------------------------------------------------------------------------------- places

/** The great-circle distance in km. */
function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const s = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Where a storm is, in words (open sea names; a country when GDACS names one). */
export function seaOf(lat, lon) {
  if (lat >= 18 && lat <= 31 && lon >= -98 && lon <= -81) return 'the Gulf of Mexico';
  if (lat >= 9 && lat < 22 && lon >= -88 && lon <= -60) return 'the Caribbean Sea';
  if (lat >= 0 && lon > -100 && lon <= -10) return 'the Atlantic';
  if (lat >= 0 && lon > -180 && lon <= -100) return 'the eastern Pacific';
  if (lat >= 5 && lon >= 105 && lon <= 120 && lat <= 23) return 'the South China Sea';
  if (lat >= 0 && lon > 120 && lon <= 180) return 'the western Pacific';
  if (lat >= 5 && lon >= 80 && lon < 100) return 'the Bay of Bengal';
  if (lat >= 5 && lon >= 50 && lon < 80) return 'the Arabian Sea';
  if (lat < 0 && lon >= 20 && lon < 110) return 'the southern Indian Ocean';
  if (lat < 0 && lon >= 140 && lon < 170) return 'the Coral Sea';
  return lat >= 0 ? 'open sea in the north' : 'open sea in the south';
}

/** A broad area for a high or a low: an ocean or a land mass, in words ("the North Atlantic", "Siberia"). */
export function areaOf(lat, lon) {
  const L = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (lat <= -50) return 'the Southern Ocean';
  // land masses first (the boxes are broad: the nearest place usually names the spot better)
  if (lat >= 50 && L >= 60 && L <= 180) return 'Siberia';
  if (lat >= 30 && lat < 50 && L >= 75 && L <= 125) return 'China and Mongolia';
  if (lat >= 36 && lat <= 71 && L >= -10 && L < 40) return lat >= 55 ? 'Scandinavia' : 'Europe';
  if (lat >= 40 && lat <= 70 && L >= 40 && L < 60) return 'western Russia';
  if (lat >= 25 && lat <= 70 && L >= -125 && L <= -65) return lat >= 50 ? 'Canada' : 'the United States';
  if (lat >= -45 && lat <= -10 && L >= 113 && L <= 154) return 'Australia';
  if (lat >= -35 && lat <= 35 && L >= -17 && L <= 51) return 'Africa';
  if (lat >= -56 && lat < 12 && L >= -82 && L <= -34) return 'South America';
  // then the seas
  if (lat >= 55 && L > -60 && L < -10) return 'Greenland and Iceland';
  if (lat >= 0 && L > -80 && L < -10) return lat >= 35 ? 'the North Atlantic' : 'the tropical Atlantic';
  if (lat < 0 && L > -70 && L < 20) return 'the South Atlantic';
  if (lat >= 0 && (L >= 120 || L <= -110)) return lat >= 35 ? 'the North Pacific' : 'the tropical Pacific';
  if (lat < 0 && (L >= 150 || L <= -70)) return 'the South Pacific';
  if (L >= 40 && L < 120 && lat < 30) return 'the Indian Ocean';
  return lat >= 0 ? 'the far north' : 'the far south';
}

/** The nearest place we have data for within `maxKm`, or null. */
function nearestPlace(places, p, maxKm = 1200) {
  let best = null, bd = Infinity;
  for (const c of places) {
    const d = km(c, p);
    if (d < bd) [best, bd] = [c, d];
  }
  return bd <= maxKm ? best : null;
}

// ---------------------------------------------------------------------------------------------- the zones

/** Groups of a zone's cities by what is worth saying (each city in one group at most). */
function groupsOf(cities) {
  const used = new Set();
  const take = (f, sort) => cities.filter((c) => !used.has(c.id) && f(c.today)).sort(sort);
  const mark = (list) => {
    for (const c of list) used.add(c.id);
    return list;
  };
  const byRain = (a, b) => b.today.rain - a.today.rain;
  const byMax = (a, b) => b.today.max - a.today.max;
  const storms = mark(take(isStorm, byRain).slice(0, 2));
  const wet = mark(take(isWet, byRain).slice(0, 2));
  const hot = mark(take((d) => isDry(d) && d.max >= 30, byMax).slice(0, 2));
  const fine = mark(take((d) => isDry(d) && d.max >= 18 && isSunny(d), byMax).slice(0, 2));
  const cool = mark(take((d) => d.max <= 16, (a, b) => a.today.max - b.today.max).slice(0, 1));
  const grey = mark(take((d) => d.kind === 'cloudy' || d.kind === 'fog', byMax).slice(0, 1));
  const windy = cities.filter((c) => Number.isFinite(c.today.gust) && c.today.gust >= 50).sort((a, b) => b.today.gust - a.today.gust).slice(0, 1);
  return { storms, wet, hot, fine, cool, grey, windy };
}

const OPENERS = {
  dry: ['Mostly settled across {z} today.', 'A largely fine day across {z}.', 'Mainly dry across {z}.', 'Fine weather for most of {z}.', 'Settled and dry for much of {z}.'],
  mixed: ['A mixed picture across {z}.', 'Something of everything in {z} today.', 'Sun for some, rain for others across {z}.', 'Changeable across {z} today.', 'Plenty of variety across {z}.'],
  wet: ['An unsettled day for much of {z}.', 'A wet day for a good part of {z}.', 'Plenty of rain around {z} today.', 'Rain for many parts of {z}.', 'A soggy day for parts of {z}.'],
};
const fill = (s, z) => s.replace('{z}', z);

/**
 * The line for the people who live there (round 3: a weather presenter talks to someone deciding what to wear):
 * one city of the zone and what its day means, from its own figures.
 */
function lifeLine(L, cities, pick, said) {
  const t = (c) => c.today;
  const options = [];
  for (const c of cities) {
    const d = t(c);
    const fresh = said.has(c.id) ? 0 : 1.5; // a city not named yet is worth more than one just named
    if (isStorm(d)) options.push([5 + fresh, () => L.add(pick(['Keep an eye on the sky in ', 'Have an indoor plan B in ', 'Listen out for thunder in ']), c, pick([' this afternoon', ' today', ' later on'])).stop()]);
    else if (d.max >= 35 && isDry(d)) options.push([4 + fresh, () => L.add(pick(['Stay in the shade and keep drinking water in ', 'A day for the shade in ', 'Take it easy in the heat in ']), c).stop()]);
    else if (Number.isFinite(d.prob) && d.prob >= 70 && isWet(d)) options.push([4 + fresh, () => L.add(pick(['Take an umbrella if you are heading out in ', 'Umbrella weather in ', 'Pack the umbrella in ']), c, `: ${aN(d.prob)} ${d.prob} percent chance of rain`).stop()]);
    else if (Number.isFinite(d.gust) && d.gust >= 55) options.push([3 + fresh, () => L.add(pick(['Hold on to your hat in ', 'A blustery one in ']), c, `, with gusts of ${d.gust} kilometres an hour`).stop()]);
    else if (d.max <= 6) options.push([3 + fresh, () => L.add(pick(['Wrap up warm in ', 'Coats and scarves in ', 'A chilly one in ']), c, `, just ${deg(d.max)} ${UNIT} at best`).stop()]);
    else if (isSunny(d) && isDry(d) && d.max >= 21 && d.max <= 30) options.push([2 + fresh, () => L.add(pick(['A day for the terrace in ', 'Sunglasses weather in ', 'Lovely for a walk in ']), c, `, ${deg(d.max)} ${UNIT} and sunshine`).stop()]);
    else if (d.min <= 3) options.push([2 + fresh, () => L.add(pick(['A cold start in ', 'Frosty first thing in ']), c, `, with ${deg(d.min)} ${UNIT} early on`).stop()]);
  }
  if (!options.length) return false;
  // the strongest reason first; a city not named yet beats one just named for the same weather
  options.sort((a, b) => b[0] - a[0]);
  options[0][1]();
  return true;
}

function zoneLine(zone, pick, { short = false } = {}) {
  const L = new Line();
  const days = zone.cities.map((c) => c.today);
  const wetShare = days.filter(isWet).length / days.length;
  const mood = wetShare >= 0.55 ? 'wet' : wetShare <= 0.2 ? 'dry' : 'mixed';
  L.add(fill(pick(OPENERS[mood]), zone.say)).add(' ');
  const g = groupsOf(zone.cities);
  // the fine weather first on a dry day, the rain first on a wet one; two or three groups, not every city
  const order = mood === 'wet' ? ['storms', 'wet', 'hot', 'fine', 'cool', 'grey'] : ['hot', 'fine', 'storms', 'wet', 'cool', 'grey'];
  const said = new Set();
  let groups = 0;
  const t = (c) => c.today;
  const maxGroups = short ? 2 : 3;
  for (const k of order) {
    const list = g[k];
    if (!list.length || groups >= maxGroups) continue;
    groups++;
    for (const c of list) said.add(c.id);
    switch (k) {
      case 'hot':
        if (list.length === 2) L.add(pick(['Hot and sunny in ', 'Real heat for ', 'Hot sunshine for ']), ...listOf(list), ...atTemps('with highs of ', list.map((c) => t(c).max))).stop();
        else L.add(list[0], pick([' bakes at ', ' climbs to ', ' heats up to ']), `${deg(t(list[0]).max)} ${UNIT} under clear skies`).stop();
        break;
      case 'fine':
        if (list.length === 2) L.add(pick(['Sunshine for ', 'Fine and bright in ', 'Pleasant in ']), ...listOf(list), ...atTemps('at ', list.map((c) => t(c).max))).stop();
        else L.add(list[0], pick([' stays bright, ', ' enjoys sunshine, ', ' looks fine, ']), `with a top of ${deg(t(list[0]).max)} ${UNIT}`).stop();
        break;
      case 'storms':
        if (list.length === 2) L.add(pick(['Thunderstorms around ', 'Storms break out over ']), ...listOf(list), `, with up to ${Math.round(t(list[0]).rain)} millimetres of rain`).stop();
        else L.add(pick(['Thunderstorms for ', 'Storms build over ', 'Some heavy thunderstorms around ']), list[0], `, with up to ${Math.round(t(list[0]).rain)} millimetres of rain`).stop();
        break;
      case 'wet': {
        const c = list[0];
        const kind = t(c).kind === 'showers' ? 'showers' : t(c).kind === 'drizzle' ? 'drizzle' : t(c).kind === 'snow' ? 'snow' : 'rain';
        if (kind === 'snow') L.add(pick(['Snow for ', 'Some snow in ']), c, `, ${deg(t(c).max)} ${UNIT}`).stop();
        else if (list.length === 2) L.add(kind === 'showers' ? pick(['Showers for ', 'Some showers in ']) : pick(['Rain for ', 'Wet in ']), ...listOf(list), ...atTemps('with tops of ', list.map((x) => t(x).max))).stop();
        else if (kind === 'drizzle') L.add('Grey with some drizzle in ', c, `, ${deg(t(c).max)} ${UNIT}`).stop();
        else L.add(c, pick([' gets ', ' can expect ', ' sees ']), kind === 'showers' ? `showers, around ${mm(t(c).rain)}` : mm(t(c).rain), `, and ${deg(t(c).max)} ${UNIT}`).stop();
        break;
      }
      case 'cool':
        L.add(pick(['Cooler in ', 'Fresher in ', 'Chilly in ']), list[0], `, just ${deg(t(list[0]).max)} ${UNIT}`).stop();
        break;
      case 'grey':
        L.add(list[0], t(list[0]).kind === 'fog' ? ' starts foggy' : pick([' stays grey', ' keeps the cloud', ' stays under the cloud']), `, ${deg(t(list[0]).max)} ${UNIT}`).stop();
        break;
      default:
    }
  }
  // a comparison when the zone has a real contrast (the warmest and the coolest of the zone, both on the map)
  const byMax = [...zone.cities].sort((a, b) => a.today.max - b.today.max);
  const lo = byMax[0], hi = byMax[byMax.length - 1];
  const gap = hi.today.max - lo.today.max;
  if (!short && gap >= 12 && !(said.has(lo.id) && said.has(hi.id))) {
    L.add(pick(['Quite a contrast: ', 'Big differences, too: ', 'And what a spread: ']), hi, ` is ${gap} ${UNIT} warmer than `, lo).stop();
  }
  lifeLine(L, zone.cities, pick, said);
  return L.done();
}

// ---------------------------------------------------------------------------------------------- the world

/** The highs and lows worth naming: the deepest low and the strongest high of the first frame, with where they go. */
export function namedSystems(sky, places) {
  if (!sky?.systems?.length) return [];
  const last = Math.max(...sky.systems.map((s) => s.frame));
  // the systems that matter to people: within 1,500 km of a place we have data for (a deep low by Antarctica is
  // not the day's weather for anyone watching), poleward of 62 degrees only when nothing nearer qualifies
  const at0 = sky.systems.filter((s) => s.frame === 0 && Math.abs(s.lat) <= 62 && nearestPlace(places, s, 1500));
  const pickOne = (kind) => {
    const list = at0.filter((s) => s.kind === kind).sort((a, b) => (kind === 'L' ? a.hPa - b.hPa : b.hPa - a.hPa));
    const s = list[0];
    if (!s) return null;
    // where it is a day later: the same kind within 15 degrees in the last frame
    const later = sky.systems.filter((x) => x.frame === last && x.kind === kind).sort((a, b) => km(a, s) - km(b, s))[0];
    const moved = later && km(later, s) < 1700 ? later : null;
    const near = nearestPlace(places, s, 900);
    return { ...s, area: areaOf(s.lat, s.lon), near, to: moved && km(moved, s) > 450 ? moved : null };
  };
  return [pickOne('L'), pickOne('H')].filter(Boolean);
}

/** The wettest broad area of the next day from the rain layer (the most rain summed over the frames), or null. */
export function rainiestArea(sky, places = null) {
  if (!sky?.rain?.length) return null;
  const sum = new Float32Array(sky.w * sky.h);
  for (const f of sky.rain) {
    const r = decodeLayer('rain', f);
    if (r) for (let i = 0; i < sum.length; i++) sum[i] += r[i];
  }
  // only where people are (within 1,000 km of a place we have data for), when places are given
  const near = (i) => !places || !!nearestPlace(places, { lat: sky.lat0 - Math.floor(i / sky.w) * sky.step, lon: sky.lon0 + (i % sky.w) * sky.step }, 1000);
  let best = -1, bi = -1;
  for (let i = 0; i < sum.length; i++) if (sum[i] > best && near(i)) [best, bi] = [sum[i], i];
  if (bi < 0) return null;
  if (best / sky.rain.length < 1.5) return null; // under 1.5 mm an hour at its wettest: no rain story
  const lat = sky.lat0 - Math.floor(bi / sky.w) * sky.step, lon = sky.lon0 + (bi % sky.w) * sky.step;
  return { lat, lon, area: areaOf(lat, lon), mmh: Math.round((best / sky.rain.length) * 10) / 10 };
}

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function headingOf(a, b) {
  const dx = (((b.lon - a.lon + 540) % 360) - 180) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dy = b.lat - a.lat;
  const ang = (Math.atan2(dx, dy) * 180) / Math.PI;
  return DIRS[Math.round(((ang + 360) % 360) / 45) % 8];
}

function worldLine(report, places, pick) {
  const L = new Line();
  const sky = report.sky;
  L.add(pick(["Here's how the next 24 hours look round the planet.", 'First, the big picture for the next 24 hours.', "Let's run the clock forward through the next day."])).add(' ');
  const sys = namedSystems(sky, places);
  const low = sys.find((s) => s.kind === 'L');
  const high = sys.find((s) => s.kind === 'H');
  if (low) {
    const pin = { pin: low, say: pick(['a deep area of low pressure', 'a deep low', 'an area of low pressure']) };
    L.add(low.hPa <= 985 ? pick(['The stormiest spot is ', 'The deepest weather system is ']) : 'There is ', pin, ` over ${low.area}`);
    if (low.near) L.add(', not far from ', low.near);
    L.add(low.to ? `, moving ${headingOf(low, low.to)}` : '', low.hPa <= 985 ? ', with wind and rain wrapped around it' : ', bringing cloud and rain').stop();
  }
  if (high) {
    const pin = { pin: high, say: pick(['high pressure', 'a big area of high pressure']) };
    L.add(low ? pick(['Meanwhile, ', 'Elsewhere, ', 'By contrast, ']) : '', pin, ` over ${high.area} keeps things settled there`, high.lat > 35 || high.lat < -35 ? pick([', with clear skies and a chilly night', ', quiet and mostly dry']) : '').stop();
  }
  const wet = rainiestArea(sky, places);
  if (wet && (!low || km(wet, low) > 1500)) L.add(pick(['The heaviest rain falls over ', 'The wettest weather is over ']), wet.area, pick([', where downpours keep coming', ' through the day', ''])).stop();
  if (!low && !high && !wet) L.add('A quiet day for the big weather systems, so let us go straight round the world').stop();
  return L.done();
}

// ---------------------------------------------------------------------------------------------- the boards

function hotColdLine(hc, pick) {
  const L = new Line();
  L.add(pick(["Now it's time for HOT and COLD: the hottest and coldest places on the planet today.", "Time for HOT and COLD, our countdown of the planet's extremes.", "Let's count down HOT and COLD: where the world is hottest, and coldest, today."])).add(' ');
  // the hot side counted down (third, second, first), then the cold side in one sentence ending on the coldest
  const [h1, h2, h3] = hc.hot;
  if (h3) L.add('In third place, ', h3, ` at ${deg(h3.value)}`).stop();
  if (h2) L.add(pick(['In second, ', 'Second, ']), h2, ` at ${deg(h2.value)}`).stop();
  if (h2 && h2.value === h1.value) L.add(pick(['And level with it at the top: ', 'And sharing top spot: ']), h1, `, also on ${deg(h1.value)} ${UNIT}`).stop();
  else L.add(pick(['And the hottest place on our list today: ', 'Top of the list: ', 'And the hottest of all: ']), h1, `, ${deg(h1.value)} ${UNIT}`).stop();
  const [c1, c2, c3] = hc.cold;
  L.add(pick(['At the other end of the scale, ', 'And at the chilly end, ', 'Now the cold side: ']));
  if (c3) L.add(c3, ` ${pick(['drops to', 'goes down to'])} ${deg(c3.value)}, `);
  if (c2) L.add(c2, ` to ${deg(c2.value)}, `);
  L.add(c3 || c2 ? 'and ' : '', pick(['the coldest place on our list is ', 'the coldest of all is ']), c1, `, with ${deg(c1.value)} ${UNIT}`).stop();
  // the gap between the two ends
  L.add(`That's ${h1.value - c1.value} ${UNIT} between the two ends of the planet`).stop();
  return L.done();
}

/** Five cities for THE NEXT THREE DAYS: one per zone (six zones: the dullest is left out), the one whose days change most. */
function outlookCities(report, rand) {
  const score = (c) => {
    const days = [c.today, ...(c.outlook || [])];
    let s = 0;
    for (let i = 1; i < days.length; i++) {
      s += Math.abs(days[i].max - days[i - 1].max) + (isWet(days[i]) !== isWet(days[i - 1]) ? 4 : 0) + (isStorm(days[i]) ? 2 : 0);
    }
    return s + rand() * 1.5; // a little variety between editions
  };
  const picks = report.zones
    .map((z) => z.cities.filter((c) => (c.outlook || []).length >= 3).map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s)[0])
    .filter(Boolean);
  // the five most changeable, in air order (west to east)
  const keep = new Set([...picks].sort((a, b) => b.s - a.s).slice(0, 5).map((p) => p.c.id));
  return picks.filter((p) => keep.has(p.c.id)).map((p) => p.c);
}

function dayPhrase(prev, d, pick) {
  if (isStorm(d)) return pick(['storms', 'thunderstorms']);
  if (d.kind === 'snow') return 'snow';
  if (isWet(d)) return isWet(prev) ? pick(['more rain', 'still wet']) : pick(['rain arrives', 'turning wet', 'some rain']);
  if (isWet(prev) && !isWet(d)) return pick(['drying out', 'brighter', 'the rain clears']);
  if (isSunny(d)) return d.max - prev.max >= 3 ? 'sunny and warmer' : prev.max - d.max >= 3 ? 'sunny but cooler' : 'sunny';
  return d.max - prev.max >= 3 ? 'warmer' : prev.max - d.max >= 3 ? 'cooler' : d.kind === 'fog' ? 'foggy' : 'cloudy';
}

function outlookLine(cities, pick) {
  const L = new Line();
  L.add(pick(["And here's the next three days.", 'Now, the next three days round the world.', 'Looking further ahead, the next three days.'])).add(' ');
  for (const c of cities) {
    const [d1, d2, d3] = c.outlook;
    // each day said against the one the viewer heard before it (today, then tomorrow)
    const p1 = dayPhrase(c.today, d1, pick), p3 = dayPhrase(d1, d3, pick);
    L.add(c, `: ${p1} tomorrow`, p3 !== p1 ? `, ${p3} by ${weekday(d3.date)}` : '', `, ${deg(d3.max)} ${UNIT}`).stop();
  }
  return L.done();
}

// ---------------------------------------------------------------------------------------------- warnings

function warningLine(w, pick, i = 0) {
  const L = new Line();
  // the first warning opens the block and names the source in full; the next one follows on
  const open = i === 0 ? 'Now our weather warnings. ' : pick(['Also on our watch list: ', 'And one more warning. ']);
  const gdacs = i === 0 ? 'GDACS, the global disaster alert system' : 'GDACS';
  if (w.type === 'cyclone') {
    const name = w.name ? w.name[0] + w.name.slice(1).toLowerCase() : '';
    const where = w.country ? `near ${w.country}` : `over ${seaOf(w.lat, w.lon)}`;
    L.add(`${open}Tropical Cyclone ${name} is ${where}, on ${w.level} alert from ${gdacs}`).stop();
    if (w.wind) L.add(`Its strongest winds are around ${w.wind} kilometres an hour`, w.cat?.cat ? `, which makes it a ${w.cat.name} storm` : `, a ${w.cat?.name || 'tropical storm'}`).stop();
    L.add(w.country ? 'If you are in its path, follow your national weather service and the local authorities' : pick(['It is over open water for now, and we will keep watching it', 'For now it is out at sea, and we will keep an eye on it'])).stop();
  } else {
    const what = { flood: 'Flooding', drought: 'Drought', wildfire: 'Wildfires' }[w.type] || 'A weather hazard';
    const where = w.country ? `${(w.countries?.length || 1) > 1 ? 'across' : 'in'} ${w.country} ` : '';
    L.add(`${open}${what} ${where}is on ${w.level} alert from ${gdacs}`).stop();
    L.add('If you are in the area, follow the advice of the local authorities').stop();
  }
  return L.done();
}

// ---------------------------------------------------------------------------------------------- open and close

const capName = (n) => (n ? n[0] + n.slice(1).toLowerCase() : '');

/** The day's big weather story, strongest first: a cyclone, an orange or red flood, extreme heat, a deluge, real cold, a contrast. */
function bigStory(report, places) {
  const all = places;
  const w = report.warnings[0];
  if (w?.type === 'cyclone' && w.name) return { kind: 'cyclone', w };
  if (w?.type === 'flood' && w.country) return { kind: 'flood', w };
  const hot = [...all].sort((a, b) => b.today.max - a.today.max)[0];
  if (hot && hot.today.max >= 40) return { kind: 'heat', c: hot };
  const wet = all.filter((c) => !c.extra).sort((a, b) => b.today.rain - a.today.rain)[0];
  if (wet && wet.today.rain >= 25) return { kind: 'deluge', c: wet };
  const cold = [...all].sort((a, b) => a.today.min - b.today.min)[0];
  if (cold && cold.today.min <= -10) return { kind: 'cold', c: cold };
  if (hot && cold) return { kind: 'contrast', hot, cold };
  return null;
}

function headlineLine(report, places, { name, title, hasHotCold, hasOutlook }, pick) {
  const L = new Line();
  L.add(pick(['Hello', 'Hello there', 'Good to have you with us']), `, I'm ${name}, and this is ${title}`).stop();
  const s = bigStory(report, places);
  if (s?.kind === 'cyclone') {
    L.add(pick(['The big weather story today: ', 'Top of our watch list today: ']), `Tropical Cyclone ${capName(s.w.name)}`, s.w.cat?.cat ? `, a ${s.w.cat.name} storm` : '', ` over ${s.w.country || seaOf(s.w.lat, s.w.lon)}`).stop();
  } else if (s?.kind === 'flood') {
    L.add(pick(['The big weather story today: ', 'Top of our watch list: ']), `flooding in ${s.w.country}, on ${s.w.level} alert`).stop();
  } else if (s?.kind === 'heat') {
    L.add(pick(['The big story today is the heat: ', 'Extreme heat leads the way today: ']), s.c, ` reaches ${deg(s.c.today.max)} ${UNIT}`).stop();
  } else if (s?.kind === 'deluge') {
    L.add(pick(['The big story today is the rain: ', 'A deluge leads the way today: ']), s.c, ` could see ${Math.round(s.c.today.rain)} millimetres`).stop();
  } else if (s?.kind === 'cold') {
    L.add(pick(['The big story today is the cold: ', 'A bitter start leads the way: ']), s.c, ` wakes up to ${deg(s.c.today.min)} ${UNIT}`).stop();
  } else if (s?.kind === 'contrast') {
    L.add(pick(['A world of contrasts today: from ', 'Quite a range on the planet today: from ']), `${deg(s.hot.today.max)} ${UNIT} in `, s.hot, ` to ${deg(s.cold.today.min)} in `, s.cold).stop();
  }
  const coming = [hasHotCold ? pick(['the hottest and coldest places on Earth', 'our countdown of the planet\'s extremes']) : null, hasOutlook ? 'the next three days' : null].filter(Boolean);
  L.add(pick(["We'll go round the world", "Coming up, a trip round the world", "We'll take you round the world"]), coming.length ? `, then ${coming.join(' and ')}` : '').stop();
  return L.done();
}

function outroLine(report, places, { name, channelName }, pick) {
  const L = new Line();
  // a last thought for the viewer from the day's figures: the sunniest warm city, else the wettest, else none
  const warm = places.filter((c) => !c.extra && isSunny(c.today) && isDry(c.today) && c.today.max >= 22 && c.today.max <= 32).sort((a, b) => b.today.max - a.today.max)[0];
  const wet = places.filter((c) => !c.extra && isWet(c.today)).sort((a, b) => b.today.rain - a.today.rain)[0];
  if (warm && wet) L.add(pick(['Wherever you are, I hope you get ', 'If you can, find yourself ']), warm, `'s sunshine, not `, wet, `'s rain`).stop();
  L.add(pick(["That's the world's weather for now", "And that's your world weather", "That's the weather round the world"])).stop();
  L.add(`I'm ${name}`).stop();
  L.add(pick(['Have a good day', 'Enjoy your day, whatever the sky is doing', 'Take care out there'])).stop();
  L.add(`Stay with us on ${channelName}`).stop();
  return L.done();
}

/**
 * The WORLD WEATHER episode body from a weather report: { title, segments, storyIds, weather }.
 * `weather` is the report as the client needs it (zones, cities, today/tomorrow/outlook, warnings, HOT & COLD, the
 * heat map and the moving sky, the source).
 */
export function writeWeather(report, { presenter = { name: 'Sam Night' }, channelName = 'GLOBIT 24', title = 'WORLD WEATHER', seed = '' } = {}) {
  if (!report?.zones?.length) return null;
  const rand = rng(`${report.date}|${seed}`);
  const used = new Set();
  // a phrase is used once per bulletin while the list has one left (then the least repeated)
  const pick = (arr) => {
    const fresh = arr.filter((x) => !used.has(x));
    const from = fresh.length ? fresh : arr;
    const x = from[Math.floor(rand() * from.length) % from.length];
    used.add(x);
    return x;
  };
  const name = presenter.name || 'Sam Night';
  const places = [...report.zones.flatMap((z) => z.cities), ...(report.extra || [])];
  const hotCold = report.hotCold?.hot?.length >= 3 && report.hotCold?.cold?.length >= 3 ? report.hotCold : null;
  const outlook = outlookCities(report, rand);
  const seg = (kind, shot, line, extra = {}) => ({ type: 'weather', kind, shot, anchor: 'A', emotion: 'neutral', text: line.text, marks: line.marks, ...(line.pins?.length ? { pins: line.pins } : {}), cues: [], ...extra });
  const segments = [seg('headline', 'mcu', headlineLine(report, places, { name, title, hasHotCold: !!hotCold, hasOutlook: outlook.length >= 3 }, pick), { emotion: 'happy' })];
  if (report.sky) segments.push(seg('world', 'graphic', worldLine(report, places, pick), { timelapse: { from: 0, to: report.sky.hours.at(-1) } }));
  // six zones would be a list again: the quietest zones get the short form (two groups, no comparison)
  report.zones.forEach((z, i) => segments.push(seg('zone', 'wall', zoneLine(z, pick, { short: i % 2 === 1 }), { zone: z.id, ...(report.sky ? { timelapse: { from: 0, to: 12 } } : {}) })));
  if (hotCold) segments.push(seg('hotcold', 'board', hotColdLine(hotCold, pick), { board: { kind: 'hotcold', hot: hotCold.hot, cold: hotCold.cold }, emotion: 'happy' }));
  report.warnings.slice(0, 2).forEach((w, i) => segments.push(seg('warning', 'warning', warningLine(w, pick, i), { warning: w.id, emotion: 'serious' })));
  if (outlook.length >= 3) {
    segments.push(seg('outlook', 'board', outlookLine(outlook, pick), {
      board: { kind: 'outlook', days: outlook[0].outlook.map((d) => ({ date: d.date, name: weekday(d.date).slice(0, 3).toUpperCase() })), cities: outlook.map((c) => ({ id: c.id, name: c.name, zone: c.zone, today: c.today, days: c.outlook })) },
    }));
  }
  segments.push(seg('outro', 'mcu', outroLine(report, places, { name, channelName }, pick), { emotion: 'happy' }));
  return {
    title,
    segments,
    storyIds: [],
    rundown: [], // no stories: the playout's picture and headline code sees an empty running order
    weather: {
      date: report.date,
      at: report.at,
      demo: !!report.demo,
      source: report.source,
      zones: report.zones.map((z) => ({ id: z.id, name: z.name, cities: z.cities.map(({ id, name: n, lat, lon, today, tomorrow, outlook: o, now }) => ({ id, name: n, lat, lon, today, tomorrow, outlook: o || [], now })) })),
      extra: (report.extra || []).map(({ id, name: n, lat, lon, today }) => ({ id, name: n, lat, lon, today })),
      warnings: report.warnings,
      hotCold: hotCold || null,
      field: report.field || null, // the heat map (server/weatherfield.js): real temperatures at many places
      sky: report.sky || null, // the moving sky (server/weathersky.js): the next 24 hours of cloud, rain, wind and pressure
    },
  };
}
