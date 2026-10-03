// WORLD WEATHER's weather centre (owner 3 Oct): a presenter standing in front of a wall-sized world map, walking
// from zone to zone with the camera following him, pointing at each city as he names it; the land coloured by
// the day's highs, a symbol and a temperature on every city, and a second panel for the warnings (a tropical
// cyclone turning over the sea, its official alert level and winds). Same map as the news locator (the owner
// likes it), same palette, no blends.
//
//   drawWeather(ctx, t, scene, audio)    scene.weather = { data, seg, since, hot, hotAt } (director.playWeather)
//
// The camera: each segment has a target (the world for the intro, tomorrow and the sign-off; the zone's cities
// framed beside the presenter; the warnings panel). When the segment changes, the view, the presenter's mark and
// the panel offset travel together over WALK seconds (ease in-out): the map slides under the walking presenter,
// as a camera tracking him along the wall. A city lights up (white brackets, inverted chip) when its name is
// spoken (director: the voice reaches the mark), and the presenter points toward it.
import { P } from '../../palette.js';
import { drawText, measureText } from '../../font.js';
import { drawWorldMap } from '../worldmap.js';
import { temperatureField, tempColor, RAMP } from './field.js';
import { drawIcon, drawCyclone } from './icons.js';
import { Standing } from '../../v2/canvas25d/runtime/standing.js';
import { liveSpeech } from '../../v2/canvas25d/speech.js';
import { Presenter } from './presenter.js';

const W = 384, H = 216;
export const WALK = 2.1; // s: the camera's move when he does not walk (his walk sets it otherwise)
const SCALE = 1.2; // the presenter: px per cm (head to mid-shin in frame)
const NECK_Y = 60;
const MARK = { left: 66, right: 318, centre: 92 };
// how far he may step from his mark toward the map while he talks (screen px), on each side
const ROOM = { left: [44, 112], right: [272, 340] };
const WORLD = { lat: 14, lon: 12, zoom: 1.12 };
const AREA = { top: 30, bottom: 172 }; // the map's free band (under the top row, over the strap and captions)
const DEG = Math.PI / 180;
const ACCENT = P.blue;

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (d) => d - Math.round(d / 360) * 360;

// ------------------------------------------------------------------------------------------- state
const ST = {
  key: null, // the report (a new episode resets the camera)
  fields: new Map(), // day -> temperature field
  seg: null,
  view: { ...WORLD },
  from: null,
  to: null,
  px: MARK.left,
  pFrom: MARK.left,
  pTo: MARK.left,
  panel: 0,
  panelFrom: 0,
  panelTo: 0,
  moveAt: -1e9,
  walked: 0,
  lastX: MARK.left,
  standing: null,
  epoch: 0,
  speechFor: null,
  pointed: null,
  facing: 1,
  presenter: null,
  moveDur: WALK,
  pending: null, // a point waiting for the end of a step: { id, at }
  presented: false,
};

function fieldFor(data, day) {
  let f = ST.fields.get(day);
  if (!f) {
    const cities = data.zones.flatMap((z) => z.cities);
    ST.fields.set(day, (f = temperatureField(cities, day, data.field)));
  }
  return f;
}

/** Fit a zone's cities into the map's free area beside the presenter's mark. */
function zoneView(zone, side) {
  const cs = zone.cities;
  const lon0 = cs[0].lon;
  let minLo = Infinity, maxLo = -Infinity, minLa = Infinity, maxLa = -Infinity;
  for (const c of cs) {
    const lo = lon0 + wrap(c.lon - lon0);
    minLo = Math.min(minLo, lo);
    maxLo = Math.max(maxLo, lo);
    minLa = Math.min(minLa, c.lat);
    maxLa = Math.max(maxLa, c.lat);
  }
  const clat = (minLa + maxLa) / 2, clon = (minLo + maxLo) / 2;
  const kx = Math.min(1, Math.max(0.5, Math.cos(clat * DEG)));
  const s0 = W / 360;
  // the free area: the side away from the presenter, with room for labels around the cities
  const x0 = side === 'left' ? 138 : 22, x1 = side === 'left' ? 360 : 246;
  const aw = x1 - x0 - 40, ah = AREA.bottom - AREA.top - 36;
  const zoom = Math.max(1.6, Math.min(9, aw / Math.max(4, (maxLo - minLo) * s0 * kx), ah / Math.max(3, (maxLa - minLa) * s0)));
  const s = s0 * zoom;
  const cx = (x0 + x1) / 2, cy = (AREA.top + AREA.bottom) / 2 + 4;
  return { lat: clat + (cy - H / 2) / s, lon: clon - (cx - W / 2) / (s * kx), zoom };
}

/** Where the camera and the presenter go for a segment. */
function targetOf(data, seg, index) {
  if (seg.kind === 'zone') {
    const zi = data.zones.findIndex((z) => z.id === seg.zone);
    const zone = data.zones[zi];
    if (zone) {
      const side = zi % 2 === 0 ? 'left' : 'right';
      return { view: zoneView(zone, side), mark: MARK[side], panel: 0, day: 'today', zone, side };
    }
  }
  if (seg.kind === 'warning') {
    const w = (data.warnings || []).find((x) => x.id === seg.warning) || data.warnings?.[0];
    if (w) {
      // the storm on the wall at x ~ 150 (between his mark and the facts panel), a regional view
      const zoom = 3.4;
      const s = (W / 360) * zoom;
      const kx = Math.min(1, Math.max(0.5, Math.cos(w.lat * DEG)));
      return { view: { lat: w.lat + (H / 2 - 104) / s, lon: w.lon - (150 - W / 2) / (s * kx), zoom }, mark: MARK.left, panel: 1, day: 'today', side: 'left', warning: w };
    }
    return { view: { ...WORLD }, mark: MARK.left, panel: 1, day: 'today', side: 'left' };
  }
  if (seg.kind === 'tomorrow') return { view: { ...WORLD, lon: WORLD.lon + 6 }, mark: MARK.right, panel: 0, day: 'tomorrow', side: 'right' };
  if (seg.kind === 'outro') return { view: { ...WORLD }, mark: MARK.centre, panel: 0, day: 'today', side: 'left' };
  return { view: { ...WORLD }, mark: index === 0 ? MARK.left : MARK.centre, panel: 0, day: 'today', side: 'left' };
}

// ------------------------------------------------------------------------------------------- city markers
const BOX = [];
function overlaps(x0, y0, x1, y1) {
  for (const b of BOX) if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return true;
  return false;
}

function chip(ctx, x, y, temp, hot) {
  const txt = `${temp}`;
  const tw = measureText(txt);
  const w = tw + 7, h = 9;
  ctx.fillStyle = hot ? P.white : P.black;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = tempColor(temp);
  ctx.fillRect(x, y + h - 2, w, 2);
  drawText(ctx, txt, x + 2, y + 1, { color: hot ? P.black : P.white });
  // the degree mark
  ctx.fillStyle = hot ? P.black : P.white;
  ctx.fillRect(x + 2 + tw + 1, y + 1, 2, 2);
  return w;
}

function brackets(ctx, x0, y0, x1, y1, color) {
  ctx.fillStyle = color;
  const L = 3;
  for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.fillRect(dx > 0 ? x : x - L + 1, y, L, 1);
    ctx.fillRect(x, dy > 0 ? y : y - L + 1, 1, L);
  }
}

/** A city: its symbol on the spot, the day's high on a chip beside it, its name under (zone views). */
function drawCity(ctx, t, c, x, y, day, { names, hot, hotK, phase }) {
  const d = c[day] || c.today;
  if (!d) return null;
  const night = day === 'today' && c.now && c.now.day === false && d.kind === 'clear';
  // the chip and the name to the right of the symbol, else the left, else under
  const tw = measureText(`${d.max}`) + 7;
  const nw = names ? measureText(c.name, 1, 'micro') : 0;
  const bw = Math.max(tw, nw);
  const options = [[x + 8, y - 6], [x - 8 - bw, y - 6], [x - bw / 2, y + 7], [x - bw / 2, y - 20 - (names ? 7 : 0)]];
  let lx = options[0][0], ly = options[0][1];
  for (const [ox, oy] of options) {
    const bh = names ? 16 : 9;
    if (ox < 4 || ox + bw > W - 4 || oy < AREA.top - 8 || oy + bh > AREA.bottom + 22) continue;
    if (!overlaps(ox, oy, ox + bw, oy + bh)) {
      lx = ox;
      ly = oy;
      break;
    }
  }
  BOX.push([x - 8, y - 7, x + 8, y + 7], [lx, ly, lx + bw, ly + (names ? 16 : 9)]);
  drawIcon(ctx, d.kind, x, y, t, { night, phase });
  chip(ctx, Math.round(lx), Math.round(ly), d.max, hot);
  if (names) {
    ctx.fillStyle = P.black;
    ctx.fillRect(Math.round(lx), Math.round(ly) + 9, nw + 2, 7);
    drawText(ctx, c.name, Math.round(lx) + 1, Math.round(ly) + 10, { color: hot ? P.white : P.silver, font: 'micro' });
  }
  if (hot) {
    const pad = 2 + Math.round(1 - hotK);
    brackets(ctx, Math.min(x - 8, lx) - pad, Math.min(y - 7, ly) - pad, Math.max(x + 8, lx + bw) + pad, Math.max(y + 7, ly + (names ? 16 : 9)) + pad, P.white);
  }
  return { x, y };
}

// ------------------------------------------------------------------------------------------- panels
function drawTab(ctx, label, sub, accent = ACCENT, x = 13) {
  const y = 24;
  const w = measureText(label) + 8;
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, w, 11);
  drawText(ctx, label, x + 4, y + 2, { color: P.white });
  if (sub) {
    const sw = measureText(sub, 1, 'micro') + 6;
    ctx.fillStyle = P.black;
    ctx.fillRect(x + w, y, sw, 11);
    drawText(ctx, sub, x + w + 3, y + 3, { color: P.silver, font: 'micro' });
  }
}

/** The temperature scale (bottom right, over the map). */
function drawLegend(ctx, x, y) {
  const steps = RAMP.length;
  ctx.fillStyle = P.black;
  ctx.fillRect(x - 2, y - 2, steps * 6 + 3, 15);
  for (let i = 0; i < steps; i++) {
    ctx.fillStyle = RAMP[i][1];
    ctx.fillRect(x + i * 6, y, 6, 4);
  }
  drawText(ctx, `${RAMP[0][0]}`, x, y + 6, { color: P.silver, font: 'micro' });
  const hi = `${RAMP[steps - 1][0]}`;
  drawText(ctx, hi, x + steps * 6 - measureText(hi, 1, 'micro'), y + 6, { color: P.silver, font: 'micro' });
}

/** The data's source, under the temperature scale (the foot of the frame belongs to the captions). */
function drawSource(ctx, data, right = W - 13, y = 40) {
  const txt = data.demo ? 'DEMO DATA · NOT A REAL FORECAST' : `DATA: ${data.source}`;
  const w = measureText(txt, 1, 'micro') + 6;
  ctx.fillStyle = P.black;
  ctx.fillRect(right - w, y - 1, w, 8);
  drawText(ctx, txt, right - w + 3, y, { color: data.demo ? P.yellow : P.fog, font: 'micro' });
}

const LEVEL_COLOR = { red: P.red, orange: P.orange };

/**
 * The warnings panel: a second screen sliding in on the right (k: 0 out .. 1 in) with the facts as GDACS gives
 * them; the storm itself turns on the wall, at its place on the map.
 */
const PANEL = { w: 156, h: 136, y: 32 };
function drawWarningPanel(ctx, t, k, warn, data) {
  if (!warn || k <= 0) return;
  const pw = PANEL.w, ph = PANEL.h, py = PANEL.y;
  const px = Math.round(W - 13 - pw + (1 - ease(k)) * (pw + 24));
  const col = LEVEL_COLOR[warn.level] || P.orange;
  // the screen: bezel, glass, the alert colour along the top
  ctx.fillStyle = P.black;
  ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
  ctx.fillStyle = P.ink;
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = col;
  ctx.fillRect(px, py, pw, 13);
  // a warning triangle that blinks slowly
  const on = Math.floor(t * 1.2) % 2 === 0;
  ctx.fillStyle = on ? P.black : col;
  for (let r = 0; r < 7; r++) ctx.fillRect(px + 8 - (r >> 1), py + 3 + r, 1 + 2 * (r >> 1), 1);
  drawText(ctx, 'WARNING', px + 16, py + 3, { color: P.black });
  const lvl = `${warn.level.toUpperCase()} ALERT`;
  drawText(ctx, lvl, px + pw - 5 - measureText(lvl, 1, 'micro'), py + 4, { color: P.black, font: 'micro' });
  let ty = py + 19;
  const tx = px + 7;
  const line = (txt, color = P.white, font = 'body', gap = 12) => {
    drawText(ctx, txt, tx, ty, { color, font });
    ty += gap;
  };
  line(warn.label, col, 'micro', 10);
  if (warn.name) {
    drawText(ctx, warn.name, tx, ty, { color: P.white, scale: 2 });
    ty += 20;
  }
  if (warn.cat?.name) line(warn.cat.name.toUpperCase(), P.cream);
  if (warn.wind) {
    line('MAX WINDS', P.fog, 'micro', 8);
    line(`${warn.wind} KM/H`, P.white, 'body', 14);
  }
  line(warn.country ? warn.country.toUpperCase() : seaLabel(warn.lat, warn.lon), P.silver, 'micro', 9);
  drawText(ctx, data.demo ? 'DEMO DATA' : 'SOURCE: GDACS', tx, py + ph - 10, { color: data.demo ? P.yellow : P.fog, font: 'micro' });
  // the alert level as a bar: orange two of three, red three of three
  const n = warn.level === 'red' ? 3 : 2;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < n ? col : P.slate;
    ctx.fillRect(px + pw - 7 - (3 - i) * 9, py + ph - 10, 7, 5);
  }
}

function seaLabel(lat, lon) {
  if (lat >= 0 && lon > -100 && lon <= -10) return 'NORTH ATLANTIC';
  if (lat >= 0 && lon > -180 && lon <= -100) return 'EASTERN PACIFIC';
  if (lat >= 0 && lon > 100) return 'WESTERN PACIFIC';
  if (lat >= 0) return 'NORTHERN INDIAN OCEAN';
  return lon > 100 ? 'SOUTH PACIFIC' : 'SOUTHERN INDIAN OCEAN';
}

// ------------------------------------------------------------------------------------------- the frame
export function drawWeather(ctx, t, scene, audio) {
  const W8 = scene.weather;
  const data = W8?.data;
  if (!data?.zones?.length) {
    ctx.fillStyle = P.navy;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  // a new report: fresh fields and the camera on the world
  if (ST.key !== data) {
    ST.key = data;
    ST.fields.clear();
    ST.seg = null;
    ST.view = { ...WORLD };
    ST.px = ST.pFrom = ST.pTo = ST.lastX = MARK.left;
    ST.panel = ST.panelFrom = ST.panelTo = 0;
    ST.epoch = t;
    ST.presenter?.place(MARK.left);
  }
  // the presenter (once per programme's cast)
  const id = scene.cast?.A || 'sam';
  if (!ST.standing || ST.standing.actor.id !== id) {
    ST.standing = new Standing(id, scene.channel?.presenters?.[id] || null);
    ST.speechFor = null;
  }
  const st = ST.standing;
  const perf = st.actor.perf;
  if (!ST.presenter || ST.presenter.st !== st) {
    ST.presenter = new Presenter(st, { scale: SCALE, neckY: NECK_Y, seed: 7 });
    ST.presenter.place(MARK.left);
  }
  const pr = ST.presenter;
  const rt = t - ST.epoch; // the rig's clock
  if (ST.speechFor !== audio) {
    perf.speech = audio && typeof audio.speechFrame === 'function' ? liveSpeech(audio, 'A', (rt) => (rt + ST.epoch) * 1000) : null;
    ST.speechFor = audio;
  }
  const seg = W8.seg || { kind: 'intro' };
  const index = data && W8.index != null ? W8.index : 0;
  // a new segment: the walk and the camera move start from where they are
  if (ST.seg !== seg) {
    const tgt = targetOf(data, seg, index);
    ST.from = { ...ST.view };
    ST.to = tgt.view;
    ST.panelFrom = ST.panel;
    ST.panelTo = tgt.panel;
    ST.moveAt = Number.isFinite(W8.since) ? W8.since : t;
    ST.target = tgt;
    ST.seg = seg;
    // he faces the map while he speaks: the map is on the side away from his mark
    ST.facing = tgt.mark > W / 2 ? -1 : 1;
    // he walks to his mark (side-steps, planted feet); the camera travels with him over the same time
    const walk = pr.walkTo(tgt.mark, ST.moveAt - ST.epoch);
    ST.moveDur = Math.max(1.4, walk || WALK);
    if (!walk) perf.side = ST.facing;
    ST.pointed = null;
    ST.pending = null;
    ST.presented = false;
  }
  pr.update(rt);
  ST.px = pr.x;
  const k = ease((t - ST.moveAt) / ST.moveDur);
  const tgt = ST.target;
  // the camera: the map view (a long hop pulls out a little on the way, like the locator's pans)
  const hop = Math.hypot(wrap(ST.to.lon - ST.from.lon) * 0.6, ST.to.lat - ST.from.lat);
  const dip = Math.min(0.45, hop / 160) * Math.sin(Math.PI * k);
  const zoom = Math.exp(lerp(Math.log(ST.from.zoom), Math.log(ST.to.zoom), k)) * (1 - dip);
  ST.view = { lat: lerp(ST.from.lat, ST.to.lat, k), lon: ST.from.lon + wrap(ST.to.lon - ST.from.lon) * k, zoom };
  ST.panel = lerp(ST.panelFrom, ST.panelTo, k);
  const walking = pr.walking;

  // the wall: the map (the camera's view of it)
  const pan = 0;
  const day = tgt.day;
  const field = fieldFor(data, day);
  const v = drawWorldMap(ctx, t, 0, { x: -pan, y: 0, w: W, h: H, view: ST.view, tint: field.tint, tintKey: field });
  // the cities: in a zone view every city of the zone with names; on the world, the ones the segment names
  BOX.length = 0;
  const since = t - (W8.hotAt || 0);
  const hotId = W8.hot && since >= 0 && since < 2.6 ? W8.hot : null;
  const hotK = hotId ? Math.min(1, (t - W8.hotAt) / 0.25) : 0;
  const named = new Set((seg.marks || []).map((m) => m.city));
  const zoneView = tgt.zone && k > 0.55;
  const zoneIds = zoneView ? new Set(tgt.zone.cities.map((c) => c.id)) : null;
  let hotXY = null;
  const where = new Map(); // city id -> screen position (for his points)
  if (v && !tgt.warning) {
    const sx = v.s * v.kx;
    const list = [];
    for (const z of data.zones) {
      for (const c of z.cities) {
        if (zoneIds && !zoneIds.has(c.id)) continue;
        const x = W / 2 + wrap(c.lon - v.clon) * sx - pan;
        const y = H / 2 + (v.clat - c.lat) * v.s;
        if (x < 6 || x > W - 6 || y < AREA.top - 4 || y > AREA.bottom + 12) continue;
        where.set(c.id, { x, y });
        list.push({ c, x: Math.round(x), y: Math.round(y) });
      }
    }
    // the world: every city that has room (the named ones and the day's extremes first, then the rest),
    // symbol and temperature, no names; a zone: all its cities with their names
    let shown = list;
    if (!zoneIds) {
      const ext = new Set(Object.values(data.extremes || {}).filter(Boolean).map((e) => e.id));
      const rank = (it) => (it.c.id === hotId ? 0 : named.has(it.c.id) ? 1 : ext.has(it.c.id) ? 2 : 3);
      const order = [...list].sort((a, b) => rank(a) - rank(b));
      shown = [];
      for (const it of order) {
        if (Math.abs(it.x - ST.px) < 26 && it.y > NECK_Y - 30) continue; // not under the presenter
        if (shown.some((o) => Math.abs(o.x - it.x) < 34 && Math.abs(o.y - it.y) < 15)) continue;
        shown.push(it);
      }
    }
    // the named city last (on top), northern cities first (their labels go right / down)
    shown.sort((a, b) => (a.c.id === hotId) - (b.c.id === hotId) || a.y - b.y);
    shown.forEach((it, i) => {
      const hot = it.c.id === hotId;
      const r = drawCity(ctx, t, it.c, it.x, it.y, day, { names: !!zoneIds, hot, hotK, phase: i * 0.37 });
      if (hot && r) hotXY = r;
    });
  }
  // the warning: the storm turning at its place on the wall, the facts on the second screen
  const warn = tgt.warning || (ST.panel > 0.02 ? data.warnings?.[0] : null);
  if (warn && v) {
    const x = W / 2 + wrap(warn.lon - v.clon) * v.s * v.kx;
    const y = H / 2 + (v.clat - warn.lat) * v.s;
    if (warn.type === 'cyclone') drawCyclone(ctx, x, y, t, Math.round(lerp(6, 15, ST.panel)), { south: warn.lat < 0 });
    else {
      ctx.fillStyle = LEVEL_COLOR[warn.level] || P.orange;
      ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7);
    }
    hotXY = { x, y };
  }
  drawWarningPanel(ctx, t, ST.panel, warn, data);
  // the presenter: a point at the city the voice has just named, aimed at it; a step toward it first when it
  // is far across the map and he has room; an open hand to the zone when he arrives with no city yet named;
  // the storm once he has reached his mark beside it
  const room = ST.facing > 0 ? ROOM.left : ROOM.right;
  if (hotId && ST.pointed !== `${hotId}:${W8.hotAt}`) {
    ST.pointed = `${hotId}:${W8.hotAt}`;
    const p = where.get(hotId) || hotXY;
    if (p && !walking) {
      if (Math.abs(p.x - pr.x) > 170 && rt - pr.lastGesture > 2.3 && pr.stepToward(p.x, rt, room[0], room[1])) ST.pending = { id: hotId, at: W8.hotAt };
      else pr.pointAt(p.x, p.y, rt);
    } else if (p) ST.pending = { id: hotId, at: W8.hotAt };
  }
  if (ST.pending && !pr.walking) {
    const p = ST.pending.id === 'storm' ? hotXY : where.get(ST.pending.id);
    // still worth it while the city is lit (or the storm on the wall)
    if (p && (ST.pending.id === 'storm' || t - ST.pending.at < 2.2)) pr.pointAt(p.x, p.y, rt);
    ST.pending = null;
  }
  if (tgt.warning && k >= 1 && ST.pointed !== `storm:${tgt.warning.id}` && hotXY) {
    ST.pointed = `storm:${tgt.warning.id}`;
    if (!pr.pointAt(hotXY.x, hotXY.y, rt)) ST.pending = { id: 'storm' };
  }
  if (!ST.presented && !walking && k >= 1 && (seg.kind === 'zone' || seg.kind === 'tomorrow')) {
    ST.presented = true;
    // an open hand to the map, unless a city is about to be named anyway (its point comes then)
    const first = (seg.marks || [])[0];
    const soon = first && first.char / 15 - (t - ST.moveAt) < 1.6;
    if (!hotId && !soon) pr.present(rt, ST.facing);
  }
  pr.draw(ctx, rt);

  // the graphics of the weather centre: the zone tab, the scale, the source
  const title = seg.kind === 'zone' && tgt.zone ? tgt.zone.name : seg.kind === 'warning' ? 'WARNINGS' : seg.kind === 'tomorrow' ? 'TOMORROW' : 'WORLD WEATHER';
  const sub = seg.kind === 'tomorrow' ? 'HIGHS' : seg.kind === 'warning' ? 'GDACS ALERTS' : 'TODAY · HIGHS';
  // on the map's side of the frame, clear of the presenter (and of the bug and the clock above)
  const mapLeft = ST.px > W / 2;
  const tabX = mapLeft ? 13 : 132;
  drawTab(ctx, title, sub, seg.kind === 'warning' ? P.orange : ACCENT, tabX);
  if (ST.panel < 0.5) {
    drawLegend(ctx, mapLeft ? 250 - RAMP.length * 6 : W - 13 - RAMP.length * 6, 24);
    drawSource(ctx, data, mapLeft ? 250 : W - 13);
  }
}

export const __test = { targetOf, zoneView, ST };
