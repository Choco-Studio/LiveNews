// The WORLD WEATHER script, written from the data alone (server/weather.js report): every figure the presenter
// says is a figure of the forecast, every place is a city on the map, every warning is GDACS's own. No AI is
// needed to write it, so it can never invent a storm or a temperature; the phrasing varies with a seed (the
// date and the edition) so a 24/7 rotation does not hear the same bulletin twice.
//
// Running order (about 5-6 minutes): intro (the world, the day's three headlines) → the six zones, west to east,
// the presenter walking to each and pointing at every city as he names it → the warnings panel (a tropical
// cyclone, a flood: GDACS orange/red alerts, serious tone, advice to follow the local services) → tomorrow
// round the world → sign-off.
//
//   writeWeather(report, { presenter, channelName, title, seed }) -> { title, segments, storyIds: [], weather }
// Each segment: { type: 'weather', kind: 'intro'|'zone'|'warning'|'tomorrow'|'outro', anchor: 'A', emotion,
//   text, zone?, warning?, marks: [{ char, city }] } - marks are where a city's name starts in the text (the map
//   lights the city and the presenter points at it on that word).

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

/** Text with the cities it names: parts are strings or { city } (the city's spoken name). */
class Line {
  constructor() {
    this.text = '';
    this.marks = [];
  }

  add(...parts) {
    for (const p of parts) {
      if (p == null || p === '') continue;
      if (typeof p === 'object') {
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

  done() {
    return { text: this.text.trim(), marks: this.marks };
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
const numList = (nums) => listOf(nums.map(String));
/** ', at 23 and 21 degrees' / ', both at 23 degrees' */
const atTemps = (lead, nums) => (nums.length === 2 && nums[0] === nums[1] ? [`, both ${lead}${nums[0]} ${UNIT}`] : [`, ${lead}`, ...numList(nums), ` ${UNIT}`]);

function mm(v) {
  const r = Math.round(v);
  return r <= 1 ? 'a little rain' : `${r} millimetres of rain`;
}

const isDry = (d) => !d.wet && d.rain < 1;
const isStorm = (d) => d.kind === 'storm';
const isWet = (d) => d.wet || d.rain >= 2;

/** Groups of a zone's cities by what is worth saying (each city in one group at most). */
function groupsOf(cities) {
  const used = new Set();
  const take = (f, sort) => {
    const list = cities.filter((c) => !used.has(c.id) && f(c.today)).sort(sort);
    return list;
  };
  const mark = (list) => {
    for (const c of list) used.add(c.id);
    return list;
  };
  const byRain = (a, b) => b.today.rain - a.today.rain;
  const byMax = (a, b) => b.today.max - a.today.max;
  const storms = mark(take(isStorm, byRain).slice(0, 2));
  const wet = mark(take(isWet, byRain).slice(0, 2));
  const hot = mark(take((d) => isDry(d) && d.max >= 30, byMax).slice(0, 2));
  const fine = mark(take((d) => isDry(d) && d.max >= 18 && (d.kind === 'clear' || d.kind === 'partly'), byMax).slice(0, 2));
  const cool = mark(take((d) => d.max <= 16, (a, b) => a.today.max - b.today.max).slice(0, 1));
  const grey = mark(take((d) => d.kind === 'cloudy' || d.kind === 'fog', byMax).slice(0, 1));
  const windy = cities.filter((c) => Number.isFinite(c.today.gust) && c.today.gust >= 50).sort((a, b) => b.today.gust - a.today.gust).slice(0, 1);
  return { storms, wet, hot, fine, cool, grey, windy };
}

const OPENERS = {
  dry: ['Mostly settled across {z} today.', 'A largely fine day across {z}.', 'Mainly dry across {z} today.', 'Fine weather for most of {z}.', 'Settled and dry for much of {z}.'],
  mixed: ['A mixed picture across {z} today.', 'Something of everything in {z} today.', 'Sun for some, rain for others across {z}.', 'Changeable weather across {z} today.', 'Plenty of variety across {z} today.'],
  wet: ['An unsettled day for much of {z}.', 'A wet day for a good part of {z}.', 'Plenty of rain around {z} today.', 'Rain for many parts of {z} today.', 'A soggy day for parts of {z}.'],
};
const fill = (s, z) => s.replace('{z}', z);

function zoneLine(zone, pick) {
  const L = new Line();
  const days = zone.cities.map((c) => c.today);
  const wetShare = days.filter(isWet).length / days.length;
  const mood = wetShare >= 0.55 ? 'wet' : wetShare <= 0.2 ? 'dry' : 'mixed';
  L.add(fill(pick(OPENERS[mood]), zone.say)).add(' ');
  // the spread of the day's highs, coolest to warmest
  const byMax = [...zone.cities].sort((a, b) => a.today.max - b.today.max);
  const lo = byMax[0], hi = byMax[byMax.length - 1];
  const said = new Set();
  if (hi.today.max - lo.today.max >= 6) {
    L.add(pick(['Highs range from ', 'Top temperatures run from ', 'Temperatures go from ']), `${lo.today.max} ${UNIT} in `, lo, ` to ${hi.today.max} in `, hi).stop();
    said.add(lo.id).add(hi.id);
  }
  const g = groupsOf(zone.cities);
  // the fine weather first on a dry day, the rain first on a wet one
  const order = mood === 'wet' ? ['storms', 'wet', 'hot', 'fine', 'cool', 'grey'] : ['hot', 'fine', 'storms', 'wet', 'cool', 'grey'];
  let groups = 0;
  const t = (c) => c.today;
  for (const k of order) {
    const list = g[k];
    if (!list.length || groups >= 5) continue;
    groups++;
    for (const c of list) said.add(c.id);
    switch (k) {
      case 'hot':
        if (list.length === 2) L.add(pick(['Hot and sunny in ', 'Real heat for ', 'Hot sunshine for ']), ...listOf(list), ...atTemps('with highs of ', list.map((c) => t(c).max))).stop();
        else L.add(list[0], pick([' bakes at ', ' climbs to ', ' heats up to ']), `${t(list[0]).max} ${UNIT} under clear skies`).stop();
        break;
      case 'fine':
        if (list.length === 2) L.add(pick(['Sunshine for ', 'Fine and bright in ', 'Pleasant in ']), ...listOf(list), ...atTemps('at ', list.map((c) => t(c).max))).stop();
        else L.add(list[0], pick([' stays bright, ', ' enjoys sunshine, ', ' looks fine, ']), `with a top of ${t(list[0]).max} ${UNIT}`).stop();
        break;
      case 'storms':
        if (list.length === 2) L.add(pick(['Thunderstorms around ', 'Storms break out over ']), ...listOf(list), `, where up to ${Math.round(t(list[0]).rain)} millimetres of rain could fall`).stop();
        else L.add(pick(['Thunderstorms for ', 'Storms build over ', 'Some heavy thunderstorms around ']), list[0], `, with up to ${Math.round(t(list[0]).rain)} millimetres of rain and ${t(list[0]).max} ${UNIT}`).stop();
        break;
      case 'wet': {
        const c = list[0];
        const kind = t(c).kind === 'showers' ? 'showers' : t(c).kind === 'drizzle' ? 'drizzle' : 'rain';
        if (list.length === 2) L.add(kind === 'showers' ? pick(['Showers for ', 'Some showers in ']) : pick(['Rain for ', 'Wet in ']), ...listOf(list), ...atTemps('with tops of ', list.map((x) => t(x).max))).stop();
        else if (kind === 'drizzle') L.add('Grey with some drizzle in ', c, `, ${t(c).max} ${UNIT}`).stop();
        else L.add(c, pick([' gets ', ' can expect ', ' sees ']), kind === 'showers' ? `showers, around ${mm(t(c).rain)}` : mm(t(c).rain), `, and ${t(c).max} ${UNIT}`).stop();
        if (Number.isFinite(t(c).prob) && t(c).prob >= 70) L.add(pick([`The chance of rain in `, `Rain is very likely in `]), c, pick([`: ${t(c).prob} percent`, `, ${t(c).prob} percent`])).stop();
        break;
      }
      case 'cool':
        L.add(pick(['Cooler in ', 'Fresher in ', 'Chilly in ']), list[0], `, just ${t(list[0]).max} ${UNIT}`).stop();
        break;
      case 'grey':
        L.add(list[0], t(list[0]).kind === 'fog' ? ' starts foggy' : pick([' stays grey', ' keeps the cloud', ' stays under the cloud']), `, ${t(list[0]).max} ${UNIT}`).stop();
        break;
      default:
    }
  }
  // the cities not named yet, in one sentence, so every city on the map is read out
  const rest = zone.cities.filter((c) => !said.has(c.id)).slice(0, 2);
  if (rest.length === 2) L.add(pick(['Elsewhere, ', 'Meanwhile, ', 'And ']), rest[0], ` ${t(rest[0]).max}`, ` and `, rest[1], ` ${t(rest[1]).max} ${UNIT}`).stop();
  else if (rest.length === 1) L.add(pick(['Elsewhere, ', 'Meanwhile, ']), rest[0], ` ${pick(['sits at', 'reaches', 'gets to'])} ${t(rest[0]).max} ${UNIT}`).stop();
  // the coldest night of the zone, when it is worth a mention
  const night = [...zone.cities].sort((a, b) => a.today.min - b.today.min)[0];
  if (night.today.min <= 8) L.add(pick(['Overnight, ', 'Tonight, ', 'After dark, ']), night, ` ${pick(['drops to', 'falls to', 'goes down to'])} ${night.today.min} ${UNIT}`).stop();
  else if (night.today.min >= 24) L.add(pick(['A warm night too: ', 'No relief overnight: ']), night, ` stays at ${night.today.min} ${UNIT} or above`).stop();
  const w = g.windy[0];
  if (w) L.add(pick(['And it is windy in ', 'Watch the wind in ', 'Blustery in ']), w, `, with gusts of up to ${w.today.gust} kilometres an hour`).stop();
  return L.done();
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

function warningLine(w, pick) {
  const L = new Line();
  if (w.type === 'cyclone') {
    const name = w.name ? w.name[0] + w.name.slice(1).toLowerCase() : '';
    const where = w.country ? `near ${w.country}` : `over ${seaOf(w.lat, w.lon)}`;
    L.add(`Now our weather warnings. Tropical Cyclone ${name} is ${where}, on ${w.level} alert from GDACS, the global disaster alert system`).stop();
    if (w.wind) L.add(`Its strongest winds are around ${w.wind} kilometres an hour`, w.cat?.cat ? `, which makes it a ${w.cat.name} storm` : `, a ${w.cat?.name || 'tropical storm'}`).stop();
    L.add(w.country ? 'If you are in its path, follow your national weather service and the local authorities' : pick(['It is over open water for now, and we will keep watching it', 'For now it is out at sea, and we will keep an eye on it'])).stop();
  } else {
    const what = { flood: 'Flooding', drought: 'Drought', wildfire: 'Wildfires' }[w.type] || 'A weather hazard';
    L.add(`Now our weather warnings. ${what} ${w.country ? `in ${w.country} ` : ''}is on ${w.level} alert from GDACS, the global disaster alert system`).stop();
    L.add('If you are in the area, follow the advice of the local authorities').stop();
  }
  return L.done();
}

/** Cities whose tomorrow differs most from today (a turn to rain, to dry, a big change in temperature). */
function tomorrowPicks(report, n = 6) {
  const all = report.zones.flatMap((z) => z.cities).filter((c) => c.tomorrow);
  const score = (c) => {
    const a = c.today, b = c.tomorrow;
    const turn = isWet(a) !== isWet(b) ? 6 : 0;
    return turn + Math.abs(b.max - a.max) + (b.kind === 'storm' ? 3 : 0);
  };
  const seen = new Set();
  const out = [];
  for (const c of all.sort((a, b) => score(b) - score(a))) {
    if (out.length >= n) break;
    if (seen.has(c.zone) || score(c) < 1) continue; // one city per zone, round the world
    seen.add(c.zone);
    out.push(c);
  }
  return out;
}

function tomorrowLine(report, pick) {
  const L = new Line();
  const cities = tomorrowPicks(report);
  L.add(pick(['Now a look ahead to tomorrow.', 'And looking ahead to tomorrow.', 'Before we go, tomorrow round the world.'])).add(' ');
  if (!cities.length) {
    L.add('Not much change: more of the same for most of the cities we have seen').stop();
    return L.done();
  }
  // round the world in air order (west to east), never the same turn of phrase twice
  const zoneAt = new Map(report.zones.map((z, i) => [z.id, i]));
  cities.sort((x, y) => zoneAt.get(x.zone) - zoneAt.get(y.zone));
  for (const c of cities) {
    const a = c.today, b = c.tomorrow;
    const sunny = a.kind === 'clear' || a.kind === 'partly';
    if (isWet(b) && !isWet(a)) {
      if (b.kind === 'storm') L.add('Storms reach ', c, `, ${b.max} ${UNIT}`).stop();
      else L.add(c, pick(sunny ? [' loses the sunshine', ' turns wetter', ' clouds over with some rain'] : [' turns wetter', ' sees some rain', ' gets a spell of rain']), `, ${b.max} ${UNIT}`).stop();
    } else if (!isWet(b) && isWet(a)) L.add(c, pick([' dries out', ' brightens up', ' sees the rain clear']), `, with ${b.max} ${UNIT}`).stop();
    else if (b.max - a.max >= 2) L.add(c, pick([' warms up to ', ' climbs to ', ' gets warmer, ']), `${b.max} ${UNIT}`).stop();
    else if (a.max - b.max >= 2) L.add(c, pick([' cools down to ', ' turns cooler, ', ' drops to ']), `${b.max} ${UNIT}`).stop();
    else if (b.kind === 'storm') L.add('More storms for ', c, `, ${b.max} ${UNIT}`).stop();
    else L.add(c, pick([' holds at around ', ' stays near ', ' keeps to about ']), `${b.max} ${UNIT}`).stop();
  }
  return L.done();
}

function introLine(report, { name, title }, pick) {
  const L = new Line();
  const city = (ref) => (ref ? report.zones.find((z) => z.id === ref.zone)?.cities.find((c) => c.id === ref.id) : null);
  L.add(pick(['Hello', 'Hello there', 'Good to have you with us']), `, I'm ${name}, and this is ${title}`).stop();
  const heads = [];
  const hot = city(report.extremes.hottest);
  if (hot) heads.push(['real heat in ', hot, ` at ${hot.today.max} ${UNIT}`]);
  const wet = city(report.extremes.wettest);
  if (wet) heads.push([isStorm(wet.today) ? 'storms over ' : 'heavy rain for ', wet]);
  const w = report.warnings[0];
  if (w?.type === 'cyclone' && w.name) heads.push([`a tropical cyclone, ${w.name[0]}${w.name.slice(1).toLowerCase()}, to watch`]);
  else {
    const cold = city(report.extremes.coldest);
    if (cold) heads.push(['a chilly start in ', cold, ` at ${cold.today.min} ${UNIT}`]);
  }
  if (heads.length) {
    L.add('Today: ');
    heads.forEach((h, i) => {
      if (i > 0) L.add(i === heads.length - 1 ? ', and ' : ', ');
      L.add(...h);
    });
    L.stop();
  }
  L.add(pick(["Let's take a look around the world", "Let's see what the world has in store", "Let's go round the world"])).stop();
  return L.done();
}

function outroLine({ name, channelName }, pick) {
  const L = new Line();
  L.add(pick(["That's the world's weather for now", "And that's your world weather", "That's the weather round the world"])).stop();
  L.add(`I'm ${name}`).stop();
  L.add(pick(['Wherever you are, have a good day', 'Enjoy your day, whatever the sky is doing', 'Take care out there'])).stop();
  L.add(`Stay with us on ${channelName}`).stop();
  return L.done();
}

/**
 * The WORLD WEATHER episode body from a weather report: { title, segments, storyIds, weather }.
 * `weather` is the report as the client needs it (zones, cities, today/tomorrow, warnings, source).
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
  const seg = (kind, line, extra = {}) => ({ type: 'weather', kind, anchor: 'A', emotion: 'neutral', text: line.text, marks: line.marks, cues: [], ...extra });
  const segments = [seg('intro', introLine(report, { name, title }, pick), { emotion: 'happy' })];
  for (const z of report.zones) segments.push(seg('zone', zoneLine(z, pick), { zone: z.id }));
  for (const w of report.warnings.slice(0, 2)) segments.push(seg('warning', warningLine(w, pick), { warning: w.id, emotion: 'serious' }));
  segments.push(seg('tomorrow', tomorrowLine(report, pick)));
  segments.push(seg('outro', outroLine({ name, channelName }, pick), { emotion: 'happy' }));
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
      zones: report.zones.map((z) => ({ id: z.id, name: z.name, cities: z.cities.map(({ id, name: n, lat, lon, today, tomorrow, now }) => ({ id, name: n, lat, lon, today, tomorrow, now })) })),
      warnings: report.warnings,
    },
  };
}
