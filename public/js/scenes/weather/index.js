// WORLD WEATHER's weather centre (owner 3 Oct; round 3, 12 Oct: "el programa del tiempo necesita mejoras enormes"):
// a studio with a curved video wall, a presenter at a natural size in front of it, and the camera cutting between
// shots as a weather bulletin does. The wall plays the forecast's own moving sky (sky.js: cloud drifting and
// building, rain in radar colours, isobars, the highs and lows travelling) over the heat map of the day's highs.
//
//   drawWeather(ctx, t, scene, audio)    scene.weather = { data, seg, index, since, dur, hot, hotAt, pin, pinAt }
//                                        (director.playWeather: hot is the place the voice has just named, pin the
//                                        high or low; dur the segment's length when known)
//
// The shots (seg.shot, writer: server/weatherwriter.js):
//   mcu      the presenter waist-up, off-centre, talking to camera; the wall soft behind him (the map's colours in
//            big out-of-focus shapes, the clouds still drifting), its far end turning away into the dark set with an
//            LED strip out of focus; small open-hand beats
//   graphic  the wall's picture full frame: the world with its isobars, the highs and lows, the cloud and rain
//            playing the next 24 hours as a time-lapse with its clock; a place lights up when it is named
//   wall     the presenter knee-up beside the wall, which fills most of the frame (studio.js: its curve, the rig
//            above, the floor mirroring it); round 2's walk along the wall with the camera tracking him, the
//            zone's cities on the wall, the brackets and the aimed point when the voice reaches a city; a zone
//            plays the next 12 hours in its first seconds, then settles back on now
//   board    HOT & COLD or THE NEXT THREE DAYS full frame (boards.js) over the wall's picture out of focus
//   warning  the wall shot held still on the storm, the warnings panel on the wall, the set's LED line orange
// A new shot cuts on the segment's first word; into a board and from the opening close-up to the world it wipes
// (an accent bar crossing the frame). Consecutive zones are one move: he walks, the wall flies to the next zone.
import { P } from '../../palette.js';
import { drawText, measureText } from '../../font.js';
import { viewMapPixels } from '../worldmap.js';
import { temperatureField, tempColor, RAMP } from './field.js';
import { drawIcon } from './icons.js';
import { drawStormCloud, stormRadius } from './storm.js';
import { Standing } from '../../v2/canvas25d/runtime/standing.js';
import { liveSpeech } from '../../v2/canvas25d/speech.js';
import { Presenter } from './presenter.js';
import { decodeSky, SkyClock, frameOf, systemsAt, composeSky, PK } from './sky.js';
import { WallCam, drawSet, softWall, lightFigure, darker } from './studio.js';
import { drawHotCold, drawOutlook } from './boards.js';
import { STUDIO_TZ } from '../../util.js';

const W = 384, H = 216;
export const WALK = 2.1; // s: the camera's move when he does not walk (his walk sets it otherwise)
const CPS = 14.5; // characters a second when the segment's length is unknown (director.js CPS_EST)
const DEG = Math.PI / 180;
const ACCENT = P.blue;
const BAY = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => (v + 0.5) / 16);

// the shots, and the shot an older script's segment kind stands for
export const SHOTS = ['mcu', 'wall', 'graphic', 'board', 'warning'];
const LEGACY = { intro: 'mcu', headline: 'mcu', world: 'graphic', zone: 'wall', hotcold: 'board', warning: 'warning', outlook: 'board', tomorrow: 'graphic', outro: 'mcu' };
/** The shot a segment plays in: its own `shot`, else the one its kind stands for. */
export const shotOf = (seg) => (SHOTS.includes(seg?.shot) ? seg.shot : LEGACY[seg?.kind] || 'mcu');
// the cuts that wipe (an accent bar crossing the frame); every other change of shot is a straight cut
const WIPES = new Set(['mcu>graphic', 'wall>board', 'warning>board', 'board>board', 'graphic>board', 'mcu>board']);
const WIPE_DUR = 0.42;

// the wall shot: the presenter at a natural size beside the wall (px per cm, neck row), his marks and how far he
// may step from them while he talks; the wall's free area for a zone's cities (screen px)
const WALLP = { scale: 1.0, neckY: 92 };
const MARK = { left: 76, right: 308, centre: 192 };
const ROOM = { left: [58, 118], right: [266, 326] };
const FREE = { left: [128, 368], right: [16, 256], top: 58, bottom: 154 };
const PAN = 0.1; // the camera follows a tenth of his walk (the wall slides the other way behind him)
// the close-up: waist-up, a third in from the side
const MCUP = { scale: 1.9, neckY: 101, left: 112, right: 272 };
const WORLD = { lat: 14, lon: 12, zoom: 1.12 };
const SKY_DRIFT = 0.12; // sky hours a second the cloud texture keeps drifting outside a time-lapse
// the smallest radius (px) of a cyclone's cloud on the world graphic and the wall: a symbol stays legible however
// far out the view (a category 2 is 6 px at the world's scale)
const STORM_MIN = { graphic: 10, wall: 9, soft: 3.5 };
/** A cyclone's radius in a picture's px (its symbol's, storm.js). */
const stormPx = (s, scale, min) => Math.max(min, stormRadius(s.cat?.cat ?? s.cat) * scale);

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
const easeOut = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - (1 - u) ** 3);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (d) => d - Math.round(d / 360) * 360;

// ------------------------------------------------------------------------------------------- state
const ST = {
  key: null, // the report (a new episode resets the camera)
  fields: new Map(), // day -> temperature field
  seg: null,
  shot: null,
  cutAt: -1e9,
  wipe: null, // { at } while the last frame of the old shot is wiped off
  view: { ...WORLD },
  from: null,
  to: null,
  moveAt: -1e9,
  moveDur: WALK,
  target: null,
  standing: null,
  presenter: null, // the wall shot's
  closeup: null, // the close-up's
  epoch: 0,
  speechFor: null,
  pointed: null,
  facing: 1,
  pending: null, // a point waiting for the end of a step: { id, at }
  presented: false,
  spoken: new Map(), // places named in this segment (id -> t)
  lastHotAt: -1,
  pinId: null, // the high or low named last (its track) and when
  pinAt: -1e9,
  lastPinAt: -1,
  sky: null, // decoded sky
  clock: null, // SkyClock
  clock2: null, // a second moment (a zone settling back on now)
  blend: null, // the two moments' mix
  tau: 0, // sky hours of wind the cloud texture has travelled (always forward)
  lastT: null,
  beats: [], // the close-up's small gestures: [{ at, name, variant }]
};

// frame buffers: the frame, the wall's picture, the close-up's small wall
const FB = new Uint32Array(W * H);
let IMG = null; // ImageData over FB
const CAM = new WallCam();
const FIT = new WallCam(); // for fitting a zone at its target camera
const WB = new Uint32Array(CAM.wbw * CAM.wbh);
const GB = new Uint32Array(W * H);
const SW = 64, SH = 36; // the out-of-focus wall's picture (shown 6x)
const SB = new Uint32Array(SW * SH);
let SNAP = null; // the last frame drawn (for a wipe)

function fieldFor(data, day) {
  let f = ST.fields.get(day);
  if (!f) {
    const cities = data.zones.flatMap((z) => z.cities);
    ST.fields.set(day, (f = temperatureField(cities, day, data.field)));
  }
  return f;
}

/** A view that fits `pts` ({ lat, lon }) into the rectangle (x0..x1, y0..y1) of a w x h picture. */
function fitView(pts, x0, x1, y0, y1, w, h, { min = 1.6, max = 9 } = {}) {
  const lon0 = pts[0].lon;
  let minLo = Infinity, maxLo = -Infinity, minLa = Infinity, maxLa = -Infinity;
  for (const c of pts) {
    const lo = lon0 + wrap(c.lon - lon0);
    minLo = Math.min(minLo, lo);
    maxLo = Math.max(maxLo, lo);
    minLa = Math.min(minLa, c.lat);
    maxLa = Math.max(maxLa, c.lat);
  }
  const clat = (minLa + maxLa) / 2, clon = (minLo + maxLo) / 2;
  const kx = Math.min(1, Math.max(0.5, Math.cos(clat * DEG)));
  const s0 = w / 360;
  const aw = x1 - x0 - 40, ah = y1 - y0 - 30;
  const zoom = Math.max(min, Math.min(max, aw / Math.max(4, (maxLo - minLo) * s0 * kx), ah / Math.max(3, (maxLa - minLa) * s0)));
  const s = s0 * zoom;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 4;
  return { lat: clat + (cy - h / 2) / s, lon: clon - (cx - w / 2) / (s * kx), zoom };
}

/** Fit a zone's cities into the wall's free area beside the presenter's mark (the wall's own pixels). */
function zoneView(zone, side) {
  FIT.set((MARK[side] - W / 2) * PAN);
  const [sx0, sx1] = FREE[side];
  const a = FIT.toWall(sx0, FREE.top), b = FIT.toWall(sx1, FREE.bottom);
  return fitView(zone.cities, a.u, b.u, a.v, b.v, CAM.wbw, CAM.wbh);
}

/** Where the camera and the presenter go for a segment. */
function targetOf(data, seg, index) {
  const shot = shotOf(seg);
  if (shot === 'wall' && seg.zone) {
    const zi = data.zones.findIndex((z) => z.id === seg.zone);
    const zone = data.zones[zi];
    if (zone) {
      const side = zi % 2 === 0 ? 'left' : 'right';
      return { shot, view: zoneView(zone, side), mark: MARK[side], day: 'today', zone, side };
    }
  }
  if (shot === 'warning' || (shot === 'wall' && seg.kind === 'warning')) {
    const w = (data.warnings || []).find((x) => x.id === seg.warning) || data.warnings?.[0];
    const side = 'left';
    if (w) {
      // the storm on the wall a little right of him, the panel beside it on the right
      const zoom = 3.4;
      const s = (CAM.wbw / 360) * zoom;
      const kx = Math.min(1, Math.max(0.5, Math.cos(w.lat * DEG)));
      FIT.set((MARK.left - W / 2) * PAN);
      const at = FIT.toWall(158, 100);
      return { shot: 'warning', view: { lat: w.lat + (at.v - CAM.wbh / 2) / s, lon: w.lon - (at.u - CAM.wbw / 2) / (s * kx), zoom }, mark: MARK.left, day: 'today', side, warning: w };
    }
    return { shot: 'warning', view: { lat: 20, lon: -40, zoom: 1.6 }, mark: MARK.left, day: 'today', side };
  }
  if (shot === 'graphic') return { shot, view: { ...WORLD }, mark: MARK.left, day: seg.kind === 'tomorrow' ? 'tomorrow' : 'today', side: 'left' };
  if (shot === 'board') return { shot, view: { ...WORLD }, mark: MARK.left, day: 'today', side: 'left' };
  // the close-up: the opening on the left third, the sign-off on the right
  const right = seg.kind === 'outro';
  return { shot: 'mcu', view: { ...WORLD }, mark: MARK.left, day: 'today', side: right ? 'right' : 'left', mcuX: right ? MCUP.right : MCUP.left };
}

// ------------------------------------------------------------------------------------------- the sky's clock
const CLOCK_FMT = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-GB', { timeZone: STUDIO_TZ, weekday: 'short', hour: '2-digit', hour12: false }) : null;
const CLOCK_MEMO = new Map();
/** "TUE 14:00" in the studio's time (the channel's clock is London's) for a moment of the sky. */
export function clockLabel(ms) {
  const hour = Math.floor(ms / 3600_000);
  let s = CLOCK_MEMO.get(hour);
  if (s) return s;
  if (CLOCK_FMT) {
    const parts = CLOCK_FMT.formatToParts(hour * 3600_000);
    const wd = (parts.find((p) => p.type === 'weekday')?.value || '').slice(0, 3).toUpperCase();
    const hh = parts.find((p) => p.type === 'hour')?.value || '00';
    s = `${wd} ${hh === '24' ? '00' : hh}:00`;
  } else s = `${String(new Date(hour * 3600_000).getUTCHours()).padStart(2, '0')}:00`;
  if (CLOCK_MEMO.size > 200) CLOCK_MEMO.clear();
  CLOCK_MEMO.set(hour, s);
  return s;
}

/**
 * The moment of the sky a segment shows at t: { hour, rate (sky hours a second), clock (show the clock plate),
 * prog (0..1 through the time-lapse), back (0..1: a zone settling back from its last hour to now), to }.
 *   world   the time-lapse plays from -> to over most of the segment (eased), then holds
 *   zone    the time-lapse plays in its first seconds once the camera has arrived, holds a beat, then the sky
 *           settles back on now (the layers morph; the cloud texture keeps drifting forward)
 */
export function skyMoment(seg, t, { since = 0, dur = 0, arrive = 0 } = {}) {
  const tl = seg?.timelapse;
  const out = { hour: 0, rate: SKY_DRIFT, clock: false, prog: 0, back: 0, from: 0, to: 0 };
  if (!tl || !(tl.to > tl.from)) return out;
  out.from = tl.from;
  out.to = tl.to;
  const span = tl.to - tl.from;
  if (shotOf(seg) === 'graphic') {
    const t0 = since + 0.8, len = Math.max(6, (dur || 20) * 0.84 - 0.8);
    const u = (t - t0) / len;
    out.prog = ease(u);
    out.hour = tl.from + span * out.prog;
    // the slope of the eased curve (sky hours a second), so the texture moves with the clock
    out.rate = u > 0 && u < 1 ? (span / len) * (u < 0.5 ? 4 * u : 4 * (1 - u)) : SKY_DRIFT;
    out.clock = t >= since + 0.3;
    return out;
  }
  const t0 = arrive + 0.25, len = 4.6, hold = 0.7, back = 1.0;
  const u = (t - t0) / len;
  if (u < 1) {
    out.prog = smooth(u);
    out.hour = tl.from + span * out.prog;
    out.rate = u > 0 ? Math.max(SKY_DRIFT, (span / len) * 6 * u * (1 - u)) : SKY_DRIFT;
    out.clock = t >= arrive - 0.2;
    return out;
  }
  out.prog = 1;
  out.hour = tl.to;
  const b = (t - t0 - len - hold) / back;
  out.back = smooth(b);
  out.clock = b < 0;
  return out;
}

// ------------------------------------------------------------------------------------------- city markers
const BOX = [];
const SYSBOX = []; // the highs and lows drawn this frame (a city's symbol never covers one)
/** How many pixels of the box (x0, y0)-(x1, y1) are already taken. */
function overlapArea(x0, y0, x1, y1) {
  let a = 0;
  for (const b of BOX) a += Math.max(0, Math.min(x1, b[2]) - Math.max(x0, b[0])) * Math.max(0, Math.min(y1, b[3]) - Math.max(y0, b[1]));
  return a;
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
function drawCity(ctx, t, c, x, y, day, { names, hot, hotK, phase, area }) {
  const d = c[day] || c.today;
  if (!d) return null;
  const night = day === 'today' && c.now && c.now.day === false && d.kind === 'clear';
  const tw = measureText(`${d.max}`) + 7;
  const nw = names ? measureText(c.name, 1, 'micro') : 0;
  const bw = Math.max(tw, nw);
  const options = [[x + 8, y - 6], [x - 8 - bw, y - 6], [x - bw / 2, y + 7], [x - bw / 2, y - 20 - (names ? 7 : 0)], [x + 8, y + 3], [x - 8 - bw, y + 3], [x + 8, y - 15], [x - 8 - bw, y - 15]];
  // the first free place; when none is free, the one with the least overlap (never blindly the first)
  let lx = options[0][0], ly = options[0][1], best = Infinity;
  const bh = names ? 16 : 9;
  for (const [ox, oy] of options) {
    if (ox < area.x0 || ox + bw > area.x1 || oy < area.y0 || oy + bh > area.y1) continue;
    const a = overlapArea(ox, oy, ox + bw, oy + bh);
    if (a < best) {
      best = a;
      lx = ox;
      ly = oy;
      if (a === 0) break;
    }
  }
  BOX.push([x - 8, y - 7, x + 8, y + 7], [lx, ly, lx + bw, ly + bh]);
  // its symbol, unless that would cover a high or a low: then a dot marks the place (the chip says the weather)
  if (!SYSBOX.some((b) => x - 8 < b[2] && x + 8 > b[0] && y - 7 < b[3] && y + 7 > b[1])) drawIcon(ctx, d.kind, x, y, t, { night, phase });
  else {
    ctx.fillStyle = P.black;
    ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = P.white;
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }
  chip(ctx, Math.round(lx), Math.round(ly), d.max, hot);
  if (names) {
    ctx.fillStyle = P.black;
    ctx.fillRect(Math.round(lx), Math.round(ly) + 9, nw + 2, 7);
    drawText(ctx, c.name, Math.round(lx) + 1, Math.round(ly) + 10, { color: hot ? P.white : P.silver, font: 'micro' });
  }
  if (hot) {
    const pad = 2 + Math.round(1 - hotK);
    brackets(ctx, Math.min(x - 8, lx) - pad, Math.min(y - 7, ly) - pad, Math.max(x + 8, lx + bw) + pad, Math.max(y + 7, ly + bh) + pad, P.white);
  }
  return { x, y };
}

/**
 * The cities on the wall or the graphic: `proj(lat, lon)` -> screen { x, y } | null. A zone shows all its cities
 * with their names; the world shows the ones the voice has named (and, with `all`, every city that has room).
 */
function drawCities(ctx, t, data, seg, { proj, zone, day, hotId, hotK, area, avoid = null, named = null, all = false, reveal = null }) {
  const where = new Map();
  const list = [];
  const zoneIds = zone ? new Set(zone.cities.map((c) => c.id)) : null;
  // the zones' cities, and on the world the extra places too when the voice names one (Nuuk, Yakutsk...)
  const places = zoneIds ? zone.cities : [...data.zones.flatMap((z) => z.cities), ...(data.extra || [])];
  for (const c of places) {
    if (!zoneIds && !all && !(named && named.has(c.id)) && c.id !== hotId) continue;
    if (!c.today) continue;
    const p = proj(c.lat, c.lon);
    if (!p || p.x < area.x0 + 2 || p.x > area.x1 - 2 || p.y < area.y0 + 4 || p.y > area.y1 - 4) continue;
    where.set(c.id, p);
    list.push({ c, x: Math.round(p.x), y: Math.round(p.y) });
  }
  let shown = list;
  if (!zoneIds) {
    shown = [];
    const rank = (it) => (it.c.id === hotId ? 0 : 1);
    for (const it of [...list].sort((a, b) => rank(a) - rank(b))) {
      if (avoid && avoid(it.x, it.y)) continue;
      if (shown.some((o) => Math.abs(o.x - it.x) < 34 && Math.abs(o.y - it.y) < 15)) continue;
      shown.push(it);
    }
  }
  // the named city last (on top), northern cities first; every symbol is claimed before any label is placed
  shown.sort((a, b) => (a.c.id === hotId) - (b.c.id === hotId) || a.y - b.y);
  for (const it of shown) BOX.push([it.x - 8, it.y - 7, it.x + 8, it.y + 7]);
  // a zone names all its cities; the world names the places the voice has named (who knows where Nuuk is)
  // reveal(i): how far in (0..1) the i-th city from the west is; one partly in is wiped down from the top
  const west = reveal ? new Map([...shown].sort((a, b) => a.x - b.x).map((it, i) => [it, i])) : null;
  shown.forEach((it, i) => {
    const r = reveal ? reveal(west.get(it)) : 1;
    if (r <= 0) return;
    if (r < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(it.x - 70, it.y - 32, 140, Math.round(64 * easeOut(r)));
      ctx.clip();
    }
    drawCity(ctx, t, it.c, it.x, it.y, day, { names: !!zoneIds || !!named?.has(it.c.id), hot: it.c.id === hotId, hotK, phase: i * 0.37, area });
    if (r < 1) ctx.restore();
  });
  return where;
}

// ------------------------------------------------------------------------------------------- highs and lows
function outlined(ctx, text, x, y, color, scale = 1, font = 'body') {
  for (const [dx, dy] of OUTLINE) drawText(ctx, text, x + dx, y + dy, { color: P.black, scale, font });
  drawText(ctx, text, x, y, { color, scale, font });
}
const OUTLINE = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

/**
 * The highs and lows at the sky's moment: a blue H, a red L at 2x, the pressure small under it; the one the voice
 * names (ST.pinId) rings twice and is framed while it is said.
 */
function drawSystems(ctx, t, S, hour, proj, area, { small = false, avoid = null, reveal = 1 } = {}) {
  SYSBOX.length = 0;
  if (reveal <= 0) return;
  if (!S?.tracks?.length) return;
  const f = frameOf(S, hour);
  const held = ST.pinId != null && t - ST.pinAt < 2.8 ? ST.pinId : null;
  const list = systemsAt(S.tracks, f, SYS, held);
  // the one being named last, on top
  list.sort((a, b) => (a.id === held) - (b.id === held));
  for (const s of list) {
    const p = proj(s.lat, s.lon);
    if (!p || p.x < area.x0 + 6 || p.x > area.x1 - 6 || p.y < area.y0 + 8 || p.y > area.y1 - 10) continue;
    const x = Math.round(p.x), y = Math.round(p.y);
    const col = s.kind === 'H' ? P.blue : P.red;
    const lit = s.id === ST.pinId && t - ST.pinAt < 2.8;
    // never under the wall's graphics or another system's letters, nor at the presenter (the one named always shows)
    if (!lit && (overlapArea(x - 7, y - 8, x + 7, y + 13) > 0 || (avoid && avoid(x, y)))) continue;
    if (lit) {
      // two rings out from it, then it sits on a black plate in brackets while it is said (it reads over any cloud)
      for (const off of [0, 0.45]) {
        const u = (t - ST.pinAt - off) / 0.8;
        if (u <= 0 || u >= 1) continue;
        ring(ctx, x, y, 7 + 16 * easeOut(u), u < 0.55 ? P.yellow : col);
      }
      ctx.fillStyle = P.black;
      ctx.fillRect(x - 8, y - 9, 17, 24);
      brackets(ctx, x - 10, y - 11, x + 10, y + 16, P.white);
    }
    BOX.push([x - 7, y - 8, x + 7, y + 13]);
    SYSBOX.push([x - 6, y - 8, x + 6, y + 13]);
    // a reveal: the letter rises into its place inside its own box (the cards' motion)
    const rise = reveal < 1 ? Math.round((1 - easeOut(reveal)) * 10) : 0;
    if (rise) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 9, y - 10, 19, 25);
      ctx.clip();
    }
    if (small) outlined(ctx, s.kind, x - 2, y - 3 + rise, col);
    else {
      outlined(ctx, s.kind, x - 4, y - 7 + rise, col, 2);
      outlined(ctx, `${s.hPa}`, x - Math.round(measureText(`${s.hPa}`, 1, 'micro') / 2), y + 8 + rise, lit ? P.yellow : P.white, 1, 'micro');
    }
    if (rise) ctx.restore();
  }
}
const SYS = [];

function ring(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const n = Math.max(16, Math.round(r * 5));
  let lx = NaN, ly = NaN;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
    if (x === lx && y === ly) continue;
    ctx.fillRect(x, y, 1, 1);
    lx = x;
    ly = y;
  }
}

/**
 * The world time-lapse waits for the voice: the clock never runs past the last hour a high or low still to be named
 * is on screen (its track's last frame and a little), nor away from one while it is being named (PIN_HOLD seconds);
 * once named, the clock catches up with the plan at up to twice the plan's mean speed. Always forward. So "high
 * pressure over Siberia keeps things settled" rings the high where it is, never after it has faded.
 */
const PIN_HOLD = 2.8;
function voiceGate(mo, seg, t, dt, dur, W8) {
  const S = ST.sky;
  if (ST.gateSeg !== seg) {
    ST.gateSeg = seg;
    ST.gateHour = mo.from;
    const step = S.hours.length > 1 ? S.hours[1] - S.hours[0] : 3;
    ST.gates = (Array.isArray(seg.pins) ? seg.pins : []).map((pin) => {
      const tr = S.tracks[trackOfPin(S, pin)];
      return { pin, at: null, last: tr ? S.hours[tr.pts[tr.pts.length - 1].frame] + 0.4 * step : Infinity };
    });
  }
  let cap = Infinity;
  for (const g of ST.gates) {
    if (g.at == null && W8.pin === g.pin) g.at = W8.pinAt;
    if (g.at == null || t - g.at < PIN_HOLD) cap = Math.min(cap, g.last);
  }
  const mean = (mo.to - mo.from) / Math.max(6, dur * 0.84 - 0.8);
  const was = ST.gateHour;
  const want = Math.max(was, Math.min(mo.hour, cap));
  ST.gateHour = Math.min(want, was + 2 * mean * dt);
  mo.hour = ST.gateHour;
  mo.prog = mo.to > mo.from ? (mo.hour - mo.from) / (mo.to - mo.from) : 0;
  mo.rate = dt > 0 ? Math.max(SKY_DRIFT, (mo.hour - was) / dt) : mo.rate;
}

/** The track of the high or low a pin names: the one of its kind nearest the pin at the sky's first frame. */
function trackOfPin(S, pin) {
  if (!S?.tracks || !pin) return null;
  let best = null, bd = Infinity;
  for (const tr of S.tracks) {
    if (tr.kind !== pin.kind) continue;
    const p = tr.pts[0];
    const d = Math.hypot(wrap(p.lon - pin.lon) * Math.cos(p.lat * DEG), p.lat - pin.lat) + p.frame * 4;
    if (d < bd) [bd, best] = [d, tr];
  }
  return best && bd < 12 ? best.id : null;
}

// ------------------------------------------------------------------------------------------- graphics on the wall
function drawTab(ctx, label, sub, x, y, accent = ACCENT) {
  const w = measureText(label) + 8;
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, w, 11);
  drawText(ctx, label, x + 4, y + 2, { color: P.white });
  let sw = 0;
  if (sub) {
    sw = measureText(sub, 1, 'micro') + 6;
    ctx.fillStyle = P.black;
    ctx.fillRect(x + w, y, sw, 11);
    drawText(ctx, sub, x + w + 3, y + 3, { color: P.silver, font: 'micro' });
  }
  return [x - 1, y - 1, x + w + sw + 1, y + 12];
}

/** The temperature scale. */
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
  return [x - 3, y - 3, x + steps * 6 + 2, y + 14];
}

/** The radar scale: RAIN and its five colours (the world graphic). */
function drawRainKey(ctx, x, y) {
  const cols = [P.cyan, P.blue, P.green, P.yellow, P.red];
  const lw = measureText('RAIN', 1, 'micro');
  ctx.fillStyle = P.black;
  ctx.fillRect(x - 2, y - 2, lw + 4 + cols.length * 5 + 3, 9);
  drawText(ctx, 'RAIN', x, y, { color: P.silver, font: 'micro' });
  cols.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + lw + 3 + i * 5, y, 5, 5);
  });
  return [x - 3, y - 3, x + lw + 4 + cols.length * 5 + 2, y + 8];
}

/**
 * The data's credit as its licences ask (docs/publishing/compliance.md §6): Open-Meteo's data are CC BY 4.0 and ask
 * for "Weather data by Open-Meteo.com" where they are shown; GDACS is named as the alerts' source.
 */
export function weatherCredit(source) {
  const s = String(source || '').toUpperCase();
  return `DATA: ${s.replace(/\bOPEN-METEO(?:\.COM)?\b/, 'OPEN-METEO.COM (CC BY 4.0)')}`;
}

/** The data's source in micro type on a black strip, right-aligned at `right`. */
function drawSource(ctx, data, right, y) {
  const txt = data.demo ? 'DEMO DATA · NOT A REAL FORECAST' : weatherCredit(data.source);
  const w = measureText(txt, 1, 'micro') + 6;
  ctx.fillStyle = P.black;
  ctx.fillRect(right - w, y - 1, w, 8);
  drawText(ctx, txt, right - w + 3, y, { color: data.demo ? P.yellow : P.fog, font: 'micro' });
  return [right - w - 1, y - 2, right + 1, y + 8];
}

/**
 * The time-lapse's clock: the day and hour on a black plate with a small turning dial, the run's progress as an
 * accent rule under it, `line` (what is playing) in micro type under that.
 */
function drawClock(ctx, label, prog, x, y, k = 1, line = '') {
  const tw = measureText('MON 00:00');
  const lw = line ? measureText(line, 1, 'micro') + 6 : 0;
  const w = Math.max(tw + 14, lw), h = 15 + (line ? 8 : 0);
  const vis = Math.round(w * easeOut(k));
  if (vis <= 0) return null;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, vis, h);
    ctx.clip();
    ctx.fillStyle = P.black;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = P.fog;
    for (const [dx, dy] of DIAL) ctx.fillRect(x + 6 + dx, y + 6 + dy, 1, 1);
    const a = prog * Math.PI * 4 - Math.PI / 2;
    ctx.fillStyle = P.white;
    ctx.fillRect(x + 6, y + 6, 1, 1);
    ctx.fillRect(Math.round(x + 6 + Math.cos(a) * 1.6), Math.round(y + 6 + Math.sin(a) * 1.6), 1, 1);
    drawText(ctx, label, x + 11, y + 3, { color: P.white });
    ctx.fillStyle = P.slate;
    ctx.fillRect(x + 2, y + 12, w - 4, 1);
    ctx.fillStyle = P.cyan;
    ctx.fillRect(x + 2, y + 12, Math.round((w - 4) * prog), 1);
    if (line) drawText(ctx, line, x + 3, y + 15, { color: P.silver, font: 'micro' });
  } finally {
    ctx.restore();
  }
  return [x - 1, y - 1, x + w + 1, y + h + 1];
}
const DIAL = [[-1, -3], [0, -3], [1, -3], [-1, 3], [0, 3], [1, 3], [-3, -1], [-3, 0], [-3, 1], [3, -1], [3, 0], [3, 1], [-2, -2], [2, -2], [-2, 2], [2, 2]];

const LEVEL_COLOR = { red: P.red, orange: P.orange };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** "2025-12-21T00:00:00" -> "21 DEC 2025" (GDACS's dates are UTC), or '' */
function dayMonth(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || ''} ${m[1]}` : '';
}
function seaLabel(lat, lon) {
  if (lat >= 0 && lon > -100 && lon <= -10) return 'NORTH ATLANTIC';
  if (lat >= 0 && lon > -180 && lon <= -100) return 'EASTERN PACIFIC';
  if (lat >= 0 && lon > 100) return 'WESTERN PACIFIC';
  if (lat >= 0) return 'NORTHERN INDIAN OCEAN';
  return lon > 100 ? 'SOUTH PACIFIC' : 'SOUTHERN INDIAN OCEAN';
}

/**
 * The warnings panel on the wall (k: 0 out .. 1 in, sliding in from the wall's right): the facts as GDACS gives
 * them under the alert colour, the level as a bar of three.
 */
const PANEL = { w: 148, h: 122 };
function drawWarningPanel(ctx, t, k, warn, data, right, py) {
  if (!warn || k <= 0) return null;
  const pw = PANEL.w, ph = PANEL.h;
  const px = Math.round(right - pw + (1 - ease(k)) * (pw + 30));
  const col = LEVEL_COLOR[warn.level] || P.orange;
  ctx.fillStyle = P.black;
  ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
  ctx.fillStyle = P.ink;
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = col;
  ctx.fillRect(px, py, pw, 13);
  // a warning triangle (steady: the bulletin is calm)
  ctx.fillStyle = P.black;
  for (let r = 0; r < 7; r++) ctx.fillRect(px + 8 - (r >> 1), py + 3 + r, 1 + 2 * (r >> 1), 1);
  ctx.fillStyle = col;
  ctx.fillRect(px + 8, py + 5, 1, 2);
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
  line((warn.area || warn.country) ? (warn.area || warn.country).toUpperCase() : seaLabel(warn.lat, warn.lon), P.silver, 'micro', 12);
  if (!warn.wind) {
    const n = warn.countries?.length || 0;
    if (n > 1) {
      line('COUNTRIES', P.fog, 'micro', 8);
      line(`${n}`, P.white, 'body', 14);
    }
    const since = dayMonth(warn.from);
    if (since) {
      line('ACTIVE SINCE', P.fog, 'micro', 8);
      line(since, P.white, 'body', 14);
    }
  }
  drawText(ctx, data.demo ? 'DEMO DATA' : 'SOURCE: GDACS', tx, py + ph - 10, { color: data.demo ? P.yellow : P.fog, font: 'micro' });
  const n = warn.level === 'red' ? 3 : 2;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < n ? col : P.slate;
    ctx.fillRect(px + pw - 7 - (3 - i) * 9, py + ph - 10, 7, 5);
  }
  return [px - 3, py - 3, px + pw + 3, py + ph + 3];
}

// ------------------------------------------------------------------------------------------- frame helpers
// the lab's cost breakdown: globalThis.__wxProf = {} collects ms per section (off on air)
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function prof(name, t0) {
  const P8 = globalThis.__wxProf;
  if (P8) P8[name] = (P8[name] || 0) + now() - t0;
}

function present(ctx) {
  if (!IMG) {
    IMG = typeof ImageData === 'function' ? new ImageData(new Uint8ClampedArray(FB.buffer), W, H) : null;
    if (!IMG) return;
  }
  ctx.putImageData(IMG, 0, 0);
}

/**
 * The wall's picture: the map of the view with the sky over it (the moment `sky`, the texture at opts.tau), and the
 * tropical cyclones of the warnings over that (storm.js: a symbol in the cloud's veils, turning; opts.stormMin its
 * smallest radius in px). While the view holds still it is recomposed 15 times a second (the frame between keeps the
 * last picture).
 */
const PICS = new Map(); // buffer -> { clon, clat, s, kx, step }
function wallPicture(out, w, h, view, field, sky, opts, t = 0) {
  let t0 = now();
  const m = viewMapPixels(w, h, view, field.tint, field);
  prof('map', t0);
  if (!m) {
    out.fill(PK.navy);
    return null;
  }
  const v = { clon: m.view.clon, clat: m.view.clat, s: m.view.s, kx: m.view.kx };
  let last = PICS.get(out);
  if (!last) PICS.set(out, (last = { clon: NaN, clat: NaN, s: NaN, kx: NaN, step: NaN, field: null }));
  const step = Math.floor(t * 15);
  if (last.clon === v.clon && last.clat === v.clat && last.s === v.s && last.kx === v.kx && last.field === field && last.step === step) return v;
  Object.assign(last, v, { step, field });
  t0 = now();
  if (sky) composeSky(out, m.u32, w, h, v, ST.sky, sky, opts);
  else out.set(m.u32);
  for (const s of cyclones(ST.key)) drawStormCloud(out, m.u32, w, h, v, s, t, { minR: opts.stormMin || 0 });
  prof('sky', t0);
  ST.picN = (ST.picN || 0) + 1; // a new picture (the set redraws the wall from it)
  return v;
}

/** The report's tropical cyclones (GDACS's, with a place), cached per report. */
const CYCLONES = new WeakMap();
function cyclones(data) {
  if (!data) return [];
  let c = CYCLONES.get(data);
  if (!c) CYCLONES.set(data, (c = (data.warnings || []).filter((w) => w.type === 'cyclone' && Number.isFinite(w.lat) && Number.isFinite(w.lon))));
  return c;
}

/** Each cyclone's core (screen px, rOf its radius) taken in BOX, so no high, low or chip covers it. */
function claimStorms(proj, rOf) {
  for (const s of cyclones(ST.key)) {
    const p = proj(s.lat, s.lon);
    if (!p) continue;
    const r = rOf(s) * 0.55;
    BOX.push([p.x - r, p.y - r, p.x + r, p.y + r]);
  }
}

/**
 * A storm's name under its cloud on the world and the zones (micro type on a black plate, the cards' language), where
 * it has room; the warning shot's panel names it there.
 */
function drawStormTags(ctx, proj, area, rOf) {
  for (const s of cyclones(ST.key)) {
    if (!s.name) continue;
    const p = proj(s.lat, s.lon);
    if (!p) continue;
    const label = s.name.toUpperCase();
    const tw = measureText(label, 1, 'micro') + 4;
    const x = Math.round(p.x - tw / 2), y = Math.round(p.y + rOf(s) * 0.85 + 1);
    if (x < area.x0 || x + tw > area.x1 || y < area.y0 || y + 7 > area.y1) continue;
    if (overlapArea(x, y, x + tw, y + 7) > 0) continue;
    ctx.fillStyle = P.black;
    ctx.fillRect(x, y, tw, 7);
    drawText(ctx, label, x + 2, y + 1, { color: P.white, font: 'micro' });
    BOX.push([x - 1, y - 1, x + tw + 1, y + 8]);
  }
}

/** The layers at the segment's moment (a zone settling back mixes its last hour with now). */
function skyLayers(mo) {
  const S = ST.sky;
  if (!S) return null;
  if (!ST.clock || ST.clock.S !== S) {
    ST.clock = new SkyClock(S);
    ST.clock2 = new SkyClock(S);
    ST.blend = { cloud: new Float32Array(S.n), rain: new Float32Array(S.n), u: new Float32Array(S.n), v: new Float32Array(S.n), mslp: new Float32Array(S.n) };
  }
  const a = ST.clock.at(mo.hour);
  if (!(mo.back > 0)) return a;
  if (mo.back >= 1) return ST.clock2.at(mo.from);
  const b = ST.clock2.at(mo.from);
  const k = mo.back;
  for (const key of ['cloud', 'rain', 'u', 'v', 'mslp']) {
    const o = ST.blend[key], x = a[key], y = b[key];
    for (let i = 0; i < o.length; i++) o[i] = x[i] + (y[i] - x[i]) * k;
  }
  return ST.blend;
}

/** The hour the highs and lows stand at (a zone settling back shows now's). */
const systemsHour = (mo) => (mo.back >= 0.5 ? mo.from : mo.hour);

// ------------------------------------------------------------------------------------------- the frame
export function drawWeather(ctx, t, scene, audio) {
  const W8 = scene.weather;
  const data = W8?.data;
  if (!data?.zones?.length) {
    ctx.fillStyle = P.navy;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  // a new report: fresh fields, the sky decoded, the camera on the world
  if (ST.key !== data) {
    ST.key = data;
    ST.fields.clear();
    ST.seg = null;
    ST.shot = null;
    ST.view = { ...WORLD };
    ST.epoch = t;
    ST.sky = decodeSky(data.sky);
    ST.clock = null;
    ST.tau = 0;
    ST.lastT = null;
    ST.presenter?.place(MARK.left);
  }
  const dtF = ST.lastT == null ? 0 : Math.max(0, Math.min(0.1, t - ST.lastT));
  ST.lastT = t;
  // the presenter (once per programme's cast): the wall shot's and the close-up's share the rig
  const id = scene.cast?.A || 'sam';
  if (!ST.standing || ST.standing.actor.id !== id) {
    ST.standing = new Standing(id, scene.channel?.presenters?.[id] || null);
    ST.speechFor = null;
  }
  const st = ST.standing;
  const perf = st.actor.perf;
  if (!ST.presenter || ST.presenter.st !== st) {
    ST.presenter = new Presenter(st, { scale: WALLP.scale, neckY: WALLP.neckY, seed: 7 });
    ST.presenter.place(MARK.left);
    ST.closeup = new Presenter(st, { scale: MCUP.scale, neckY: MCUP.neckY, seed: 11 });
    ST.closeup.place(MCUP.left);
  }
  const pr = ST.presenter;
  const rt = t - ST.epoch; // the rig's clock
  if (ST.speechFor !== audio) {
    perf.speech = audio && typeof audio.speechFrame === 'function' ? liveSpeech(audio, 'A', (x) => (x + ST.epoch) * 1000) : null;
    ST.speechFor = audio;
  }
  const seg = W8.seg || { kind: 'headline', shot: 'mcu', text: '' };
  const index = W8.index != null ? W8.index : 0;
  const since = Number.isFinite(W8.since) ? W8.since : t;
  const segDur = Number.isFinite(W8.dur) && W8.dur > 0 ? W8.dur : String(seg.text || '').length / CPS;
  // a new segment: the shot, the camera's move, the walk
  if (ST.seg !== seg) {
    const tgt = targetOf(data, seg, index);
    const prevShot = ST.shot;
    const cut = prevShot !== tgt.shot;
    if (cut) {
      ST.cutAt = since;
      ST.wipe = prevShot && WIPES.has(`${prevShot}>${tgt.shot}`) && SNAP ? { at: since } : null;
      // a cut into the wall starts the move from a wider view of the same place (the wall flies in)
      if (tgt.shot === 'wall' || tgt.shot === 'warning') ST.view = { lat: tgt.view.lat, lon: tgt.view.lon, zoom: Math.max(1, tgt.view.zoom * 0.55) };
    } else if (tgt.shot === 'board') ST.wipe = SNAP ? { at: since } : null;
    ST.from = { ...ST.view };
    ST.to = tgt.view;
    ST.moveAt = since;
    ST.prevTarget = cut ? null : ST.target;
    ST.target = tgt;
    ST.seg = seg;
    ST.shot = tgt.shot;
    ST.facing = tgt.mark > W / 2 ? -1 : 1;
    if (tgt.shot === 'wall' || tgt.shot === 'warning') {
      // a cut puts him on his mark (a new camera); along the wall he walks to it, the camera with him
      if (cut) {
        pr.place(tgt.mark);
        ST.moveDur = 1.6;
        perf.side = ST.facing;
      } else {
        const walk = pr.walkTo(tgt.mark, ST.moveAt - ST.epoch);
        ST.moveDur = Math.max(1.4, walk || WALK);
        if (!walk) perf.side = ST.facing;
      }
    } else ST.moveDur = 0.01;
    if (tgt.shot === 'mcu') {
      ST.closeup.place(tgt.mcuX);
      perf.side = tgt.side === 'right' ? -1 : 1;
      ST.beats = beatsFor(seg, since, segDur);
    }
    ST.pointed = null;
    ST.pending = null;
    ST.presented = false;
    ST.spoken = new Map();
    ST.pinId = null;
    ST.gateSeg = null; // the voice gate starts again (voiceGate)
    // (the cloud's wind clock, ST.tau, runs on through the programme: the flow map (sky.js FLOW) never carries a
    // shape long enough for the shear to draw it into streaks, so it no longer starts again at each segment)
  }
  // the places and the highs and lows the voice has reached
  if (W8.hot && W8.hotAt !== ST.lastHotAt) {
    ST.lastHotAt = W8.hotAt;
    if (!ST.spoken.has(W8.hot)) ST.spoken.set(W8.hot, W8.hotAt);
  }
  if (W8.pin && W8.pinAt !== ST.lastPinAt) {
    ST.lastPinAt = W8.pinAt;
    ST.pinId = trackOfPin(ST.sky, W8.pin);
    ST.pinAt = W8.pinAt;
  }
  const tgt = ST.target;
  const shot = ST.shot;
  const k = ease((t - ST.moveAt) / ST.moveDur);
  const arrive = ST.moveAt + ST.moveDur;
  // the sky's moment; the cloud texture travels with the clock in a time-lapse, drifts slowly otherwise
  const mo = skyMoment(seg, t, { since, dur: segDur, arrive });
  if (shot === 'graphic' && ST.sky?.tracks && seg.timelapse) voiceGate(mo, seg, t, dtF, segDur, W8);
  ST.tau += dtF * mo.rate;
  const layers = ST.sky ? skyLayers(mo) : null;
  const hotSince = t - (W8.hotAt || 0);
  const hotId = W8.hot && hotSince >= 0 && hotSince < 2.6 ? W8.hot : null;
  const hotK = hotId ? Math.min(1, hotSince / 0.25) : 0;

  if (shot === 'graphic') drawGraphic(ctx, t, data, seg, tgt, mo, layers, hotId, hotK);
  else if (shot === 'board') drawBoard(ctx, t, data, seg, since, layers);
  else if (shot === 'mcu') drawCloseup(ctx, t, rt, data, seg, tgt, layers, W8);
  else drawWallShot(ctx, t, rt, data, seg, tgt, k, mo, layers, hotId, hotK, W8);

  // the wipe: the old shot's last frame slides off behind an accent bar
  if (ST.wipe) {
    const u = (t - ST.wipe.at) / WIPE_DUR;
    if (u >= 1 || u < 0) ST.wipe = null;
    else {
      const edge = Math.round(ease(u) * (W + 6));
      if (edge < W) ctx.drawImage(SNAP, edge, 0, W - edge, H, edge, 0, W - edge, H);
      ctx.fillStyle = P.cyan;
      ctx.fillRect(edge - 6, 0, 1, H);
      ctx.fillStyle = ACCENT;
      ctx.fillRect(edge - 5, 0, 4, H);
      ctx.fillStyle = P.navy;
      ctx.fillRect(edge - 1, 0, 1, H);
    }
  }
  ST.frameN = (ST.frameN || 0) + 1;
  const nearEnd = t - since > segDur - 2;
  if (!ST.wipe && typeof document !== 'undefined' && ST.frameN % (nearEnd ? 3 : 12) === 0) {
    if (!SNAP) {
      SNAP = document.createElement('canvas');
      SNAP.width = W;
      SNAP.height = H;
      SNAP.cctx = SNAP.getContext('2d');
    }
    const t0 = now();
    SNAP.cctx.drawImage(ctx.canvas, 0, 0);
    prof('snap', t0);
  }
}

// ------------------------------------------------------------------------------------------- graphic
function drawGraphic(ctx, t, data, seg, tgt, mo, layers, hotId, hotK) {
  const field = fieldFor(data, tgt.day);
  const v = wallPicture(GB, W, H, tgt.view, field, layers, { tau: ST.tau, isobars: true, isoColor: PK.fog, opacity: 0.9, stormMin: STORM_MIN.graphic }, t);
  FB.set(GB);
  ST.fbFor = 'graphic';
  let t0 = now();
  present(ctx);
  prof('present', t0);
  if (!v) return;
  t0 = now();
  const proj = (lat, lon) => ({ x: W / 2 + wrap(lon - v.clon) * v.s * v.kx, y: H / 2 + (v.clat - lat) * v.s });
  BOX.length = 0;
  SYSBOX.length = 0;
  // the graphics first (the labels avoid them): the time-lapse's clock (or the tab), the source; the map itself
  // carries the rest (the highs and lows, the rain's colours are the bulletins' own)
  if (ST.sky && seg.timelapse) {
    const r = drawClock(ctx, clockLabel(ST.sky.start + mo.hour * 3600_000), mo.prog, 13, 26, (t - ST.cutAt - 0.3) / 0.35, 'THE NEXT 24 HOURS');
    BOX.push(r || [12, 25, 88, 50]); // its place is kept while it wipes in
  } else {
    const tab = seg.kind === 'tomorrow' ? ['TOMORROW', 'HIGHS'] : ['WORLD WEATHER', 'TODAY · HIGHS'];
    BOX.push(drawTab(ctx, tab[0], tab[1], 13, 26));
    BOX.push(drawLegend(ctx, W - 13 - RAMP.length * 6, 34));
  }
  BOX.push(drawSource(ctx, data, W - 13, 25));
  const area = { x0: 4, x1: W - 4, y0: 24, y1: 168 };
  // a cyclone's core is kept clear of the highs and lows and the chips; its name goes under it once they are placed
  const rOf = (s) => stormPx(s, v.s, STORM_MIN.graphic);
  claimStorms(proj, rOf);
  drawSystems(ctx, t, ST.sky, systemsHour(mo), proj, area);
  const named = new Set([...ST.spoken.keys()]);
  drawCities(ctx, t, data, seg, { proj, zone: null, day: tgt.day, hotId, hotK, area, named, all: !ST.sky });
  drawStormTags(ctx, proj, area, rOf);
  prof('overlay', t0);
}

// ------------------------------------------------------------------------------------------- the wall shot
function drawWallShot(ctx, t, rt, data, seg, tgt, k, mo, layers, hotId, hotK, W8) {
  const pr = ST.presenter;
  pr.update(rt);
  const walking = pr.walking;
  // the camera: the wall's picture flies to the target view (a long hop pulls out a little on the way), the camera
  // follows a tenth of his walk
  const hop = Math.hypot(wrap(ST.to.lon - ST.from.lon) * 0.6, ST.to.lat - ST.from.lat);
  const dip = Math.min(0.45, hop / 160) * Math.sin(Math.PI * k);
  const zoom = Math.exp(lerp(Math.log(ST.from.zoom), Math.log(ST.to.zoom), k)) * (1 - dip);
  ST.view = { lat: lerp(ST.from.lat, ST.to.lat, k), lon: ST.from.lon + wrap(ST.to.lon - ST.from.lon) * k, zoom: Math.max(1, zoom) };
  CAM.set((pr.x - W / 2) * PAN);
  const field = fieldFor(data, tgt.day);
  const v = wallPicture(WB, CAM.wbw, CAM.wbh, ST.view, field, layers, { tau: ST.tau, isobars: false, opacity: 0.8, stormMin: STORM_MIN.wall }, t);
  const warning = tgt.shot === 'warning';
  let t0 = now();
  // the set and the wall again only when the picture or the camera changed (the frame keeps them otherwise)
  const setKey = `${ST.picN}|${CAM.pan}|${warning}`;
  if (ST.setKey !== setKey || ST.fbFor !== 'wall') {
    ST.setKey = setKey;
    drawSet(FB, CAM, WB, { led: warning ? 'orange' : 'cyan', t });
  }
  ST.fbFor = 'wall';
  prof('set', t0);
  t0 = now();
  present(ctx);
  prof('present', t0);
  if (!v) return;
  const proj = (lat, lon) => CAM.toScreen(CAM.wbw / 2 + wrap(lon - v.clon) * v.s * v.kx, CAM.wbh / 2 + (v.clat - lat) * v.s);
  const glassTop = CAM.top[Math.round(CAM.xc)] ?? CAM.yT;
  BOX.length = 0;
  SYSBOX.length = 0;
  // the wall's graphics on the free side (they ride with the wall): the tab, the clock, the scale, the source; the
  // last zone's layout holds while the wall leaves it, the new one comes with the new zone
  const lay = k < 0.5 && ST.prevTarget?.zone ? ST.prevTarget : tgt;
  const side = tgt.side, lside = lay.side;
  const fx0 = lside === 'left' ? FREE.left[0] : FREE.right[0], fx1 = lside === 'left' ? FREE.left[1] : FREE.right[1];
  const pan = CAM.pan;
  const tabX = Math.round(fx0 - pan), topY = glassTop + 5;
  if (lay.zone) BOX.push(drawTab(ctx, lay.zone.name, 'TODAY · HIGHS', tabX, topY));
  else if (warning) BOX.push(drawTab(ctx, 'WARNINGS', 'GDACS ALERTS', 14, topY, P.orange));
  if (mo.clock && ST.sky && !warning) {
    const r = drawClock(ctx, clockLabel(ST.sky.start + mo.hour * 3600_000), mo.prog, tabX, topY + 14, (t - (ST.moveAt + ST.moveDur) + 0.2) / 0.35);
    if (r) BOX.push(r);
  }
  if (!warning) {
    BOX.push(drawLegend(ctx, Math.round(fx1 - pan) - RAMP.length * 6, topY + 2));
    BOX.push(drawSource(ctx, data, Math.round(fx1 - pan), topY + 16));
  }
  const area = { x0: 4, x1: W - 4, y0: glassTop + 4, y1: CAM.yB - 4 };
  // the cities (a zone once he has arrived beside them), the highs and lows in view
  const zoneOn = tgt.zone && (ST.chipsFor === seg || (k >= 1 && !walking)); // (once in, they stay for his steps)
  let where = new Map();
  let stormXY = null;
  const panel = warning ? ease((t - ST.moveAt - 0.3) / 0.9) : 0;
  let panelRect = null;
  if (warning && tgt.warning) panelRect = drawWarningPanel(ctx, t, panel, tgt.warning, data, Math.round(W - 18 - pan), glassTop + 8);
  if (panelRect) BOX.push(panelRect);
  const nearHim = (x, y) => Math.abs(x - pr.x) < 36 && y > WALLP.neckY - 40;
  // a cyclone's cloud is in the wall's picture (storm.js); its core is kept clear of the highs, lows and chips
  const rOf = (s) => stormPx(s, v.s, STORM_MIN.wall);
  if (k >= 1 || warning) claimStorms(proj, rOf);
  // the highs and lows once the wall has arrived (in the move they would flicker past at every zoom), rising in
  if (k >= 1) drawSystems(ctx, t, ST.sky, systemsHour(mo), proj, { x0: 4, x1: panelRect ? panelRect[0] - 4 : W - 4, y0: area.y0, y1: area.y1 }, { avoid: nearHim, reveal: (t - ST.moveAt - ST.moveDur) / 0.3 });
  if (zoneOn) {
    // the zone's cities come in once he has arrived beside them (walking over from the last zone he would cross
    // their chips), wiped down one after another from west to east as the cards come in
    if (ST.chipsFor !== seg) [ST.chipsFor, ST.chipsAt] = [seg, t];
    const t0c = ST.chipsAt;
    where = drawCities(ctx, t, data, seg, { proj, zone: tgt.zone, day: tgt.day, hotId, hotK, area, reveal: (i) => (t - t0c - i * 0.06) / 0.24 });
  }
  if (zoneOn && k >= 1) drawStormTags(ctx, proj, { ...area, x1: W - 4 }, rOf);
  if (warning && tgt.warning) {
    const w = tgt.warning;
    const p = proj(w.lat, w.lon);
    // a cyclone is its cloud on the wall; any other hazard a square of its alert colour at its place
    if (w.type !== 'cyclone') {
      ctx.fillStyle = LEVEL_COLOR[w.level] || P.orange;
      ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 7, 7);
    }
    stormXY = p;
  }
  // the presenter: a point at the city the voice has just named, aimed at it; a step toward it first when it is
  // far across the wall and he has room; an open hand to the zone when he arrives with no city yet named; the storm
  // once he is on his mark beside it (and then the stillness of a warning)
  const room = ST.facing > 0 ? ROOM.left : ROOM.right;
  if (hotId && ST.pointed !== `${hotId}:${W8.hotAt}`) {
    ST.pointed = `${hotId}:${W8.hotAt}`;
    const p = where.get(hotId);
    if (p && !walking) {
      if (Math.abs(p.x - pr.x) > 150 && rt - pr.lastGesture > 2.3 && pr.stepToward(p.x, rt, room[0], room[1])) ST.pending = { id: hotId, at: W8.hotAt };
      else pr.pointAt(p.x, p.y, rt);
    } else if (p) ST.pending = { id: hotId, at: W8.hotAt };
  }
  if (ST.pending && !pr.walking) {
    const p = ST.pending.id === 'storm' ? stormXY : where.get(ST.pending.id);
    if (p && (ST.pending.id === 'storm' || t - ST.pending.at < 2.2)) pr.pointAt(p.x, p.y, rt);
    ST.pending = null;
  }
  if (warning && k >= 1 && stormXY && ST.pointed !== `storm:${tgt.warning?.id}`) {
    ST.pointed = `storm:${tgt.warning?.id}`;
    if (!pr.pointAt(stormXY.x, stormXY.y, rt)) ST.pending = { id: 'storm' };
  }
  if (!ST.presented && !walking && k >= 1 && tgt.zone) {
    ST.presented = true;
    const first = (seg.marks || [])[0];
    const soon = first && first.char / CPS - (t - ST.moveAt) < 1.6;
    if (!hotId && !soon) pr.present(rt, ST.facing);
  }
  const rim = side === 'left' ? 1 : -1;
  t0 = now();
  pr.draw(ctx, rt, (px) => {
    prof('rig', t0);
    const t1 = now();
    lightFigure(px, { rim, spill: 2, both: 0, from: pr.x - 80, to: pr.x + 80, litTo: CAM.bot[Math.max(0, Math.min(W - 1, Math.round(pr.x)))] });
    prof('light', t1);
    t0 = now();
  });
  prof('figureDraw', t0);
}

// ------------------------------------------------------------------------------------------- the close-up
/**
 * The close-up's small beats between his gestures. A script with gestures on its words (seg.gestures: presenter.js,
 * the writer's cues) keeps a beat only at a sentence's end in a long quiet stretch (3.6 s clear of any gesture on both
 * sides), a palm lifting beside the body, the hands taking turns; an older script without them gets an open hand on
 * every other sentence, as before.
 */
export function beatsFor(seg, since, dur) {
  const text = String(seg.text || '');
  const len = Math.max(1, text.length);
  const out = [];
  const re = /[.!?]\s+/g;
  let m, n = 0;
  const cued = Array.isArray(seg.gestures) && seg.gestures.length > 0;
  if (cued) {
    const at = seg.gestures.filter((g) => g.kind !== 'nod').map((g) => since + (g.char / len) * dur);
    const names = [['raise_hand', 'lift'], ['raise_hand', 'lift_far'], ['raise_hand', 'offer']];
    let k = 0;
    while ((m = re.exec(text))) {
      const t = since + ((m.index + m[0].length) / len) * dur + 0.15;
      if (t > since + dur - 1.6 || at.some((a) => Math.abs(a - t) < 3.6)) continue;
      const [name, variant] = names[k++ % names.length];
      out.push({ at: t, name, variant });
    }
    return out;
  }
  const names = [['raise_hand', 'offer'], ['raise_hand', 'lift'], ['point_screen', 'open'], ['raise_hand', 'box']];
  while ((m = re.exec(text))) {
    const at = since + ((m.index + m[0].length) / len) * dur + 0.15;
    if (n % 2 === 0 && at < since + dur - 1.6) out.push({ at, name: names[(n >> 1) % names.length][0], variant: names[(n >> 1) % names.length][1] });
    n++;
  }
  return out;
}

/**
 * Where a close-up gesture's place is on screen: on the out-of-focus wall behind him (the small picture `v` shown 6x),
 * kept on the open side of the frame, the side he faces into (a place behind him or past the wall's far end is shown
 * at the open side's height for it). -> { x, y }
 */
export function closeupTarget(v, lat, lon, px, side) {
  let x = px + side * 150, y = 112;
  if (v && Number.isFinite(lat) && Number.isFinite(lon)) {
    x = (SW / 2 + wrap(lon - v.clon) * v.s * v.kx) * 6;
    y = (SH / 2 + (v.clat - lat) * v.s) * 6;
  }
  const lo = side > 0 ? px + 70 : 40, hi = side > 0 ? W - 42 : px - 70;
  if (!(x >= lo && x <= hi)) x = Math.max(lo, Math.min(hi, px + side * 150));
  return { x, y: Math.max(64, Math.min(160, y)) };
}

/** A gesture cue (seg.gestures) as the voice reaches it: the presenter's own gesture for it (presenter.js). */
function playCue(pm, g, rt, v) {
  const perf = ST.standing.actor.perf;
  const side = perf.side || 1;
  if (g.kind === 'nod') {
    // a small nod with his name (a head gesture: the hands are free)
    perf.gestures = [...(perf.gestures || []).filter((e) => rt - e.t0 < 3).slice(-2), { name: 'nod', variant: 'single', t0: rt }];
    return true;
  }
  if (g.kind === 'place') {
    const p = closeupTarget(v, g.lat, g.lon, pm.x, side);
    return pm.gesture('place', rt, { tx: p.x, ty: p.y, gap: 1.6 });
  }
  if (g.kind === 'world') return pm.gesture('world', rt, { variant: g.variant, gap: 1.6 });
  if (g.kind === 'sweep') {
    // toward the wall's open side, a little rising (the trip round the world); or from one place to the other as
    // they lie on the wall (a contrast)
    let dx = side, dy = -0.12;
    if (g.from && g.to && v) {
      const at = (p) => ({ x: (SW / 2 + wrap(p.lon - v.clon) * v.s * v.kx) * 6, y: (SH / 2 + (v.clat - p.lat) * v.s) * 6 });
      const a = at(g.from), b = at(g.to);
      if (Math.hypot(b.x - a.x, b.y - a.y) > 4) [dx, dy] = [b.x - a.x, b.y - a.y];
    }
    return pm.gesture('sweep', rt, { dx, dy, gap: 1.6 });
  }
  if (g.kind === 'count') return pm.gesture('count', rt, { n: g.n, gap: 1.6 });
  return false;
}

function drawCloseup(ctx, t, rt, data, seg, tgt, layers, W8) {
  const pm = ST.closeup;
  const perf = ST.standing.actor.perf;
  // the wall behind him, out of focus: a small picture of the world (the big story's place for the opening)
  const field = fieldFor(data, 'today');
  const w0 = data.warnings?.[0];
  const right = tgt.side === 'right';
  const view = seg.kind === 'headline' && w0 ? { lat: w0.lat + 6, lon: w0.lon + (right ? 40 : -40), zoom: 2.2 } : { lat: 22, lon: right ? -20 : 40, zoom: 1.6 };
  const v = wallPicture(SB, SW, SH, view, field, layers, { tau: ST.tau, isobars: false, opacity: 0.4, stormMin: STORM_MIN.soft }, t);
  let t0 = now();
  softWall(FB, SB, SW, SH, { k: 6, dim: 0 });
  ST.fbFor = 'mcu';
  prof('soft', t0);
  // the wall's far end curving away into the dark set: its edge, an LED strip out of focus beyond it
  const ex = right ? 0 : W - 30;
  for (let y = 0; y < H; y++) {
    for (let i = 0; i < 30; i++) {
      const x = right ? 29 - i : ex + i;
      const o = y * W + x;
      const bay = BAY[((y & 3) << 2) | (x & 3)];
      // the glass darkens as it turns away, then the bezel, then the set
      if (i < 8) FB[o] = (i / 8) * 0.9 > bay ? darker(darker(FB[o])) : darker(FB[o]);
      else if (i < 10) FB[o] = PK.black;
      else FB[o] = i >= 19 && i <= 21 ? (i === 20 ? PK.blue : PK.navy) : i === 18 || i === 22 ? (0.5 > bay ? PK.navy : PK.ink) : PK.ink;
    }
  }
  // his gestures on their words as the voice reaches them (seg.gestures), and the small beats between
  if (W8?.gesture && W8.gestureAt !== ST.lastGestureAt) {
    ST.lastGestureAt = W8.gestureAt;
    if (seg.gestures?.includes(W8.gesture)) playCue(pm, W8.gesture, rt, v);
  }
  for (const b of ST.beats) {
    if (!b.done && t >= b.at) {
      b.done = true;
      if (rt - pm.lastGesture > 2.6) {
        perf.gestures = [...(perf.gestures || []).filter((g) => rt - g.t0 < 3).slice(-2), { name: b.name, variant: b.variant, t0: rt }];
        pm.lastGesture = rt;
      }
    }
  }
  pm.update(rt);
  // he goes into the frame's own pixels (nothing is drawn over him in a close-up): one picture to the canvas
  t0 = now();
  const box = pm.render(rt, (px) => lightFigure(px, { rim: right ? -1 : 1, spill: 3, both: 0, from: pm.x - 140, to: pm.x + 140 }));
  if (box) {
    const px = ST.standing.frame.px;
    for (let y = box[1]; y <= box[3]; y++) {
      for (let x = box[0], o = y * W + box[0]; x <= box[2]; x++, o++) if (px[o]) FB[o] = px[o];
    }
  }
  prof('rig', t0);
  t0 = now();
  present(ctx);
  prof('present', t0);
}

// ------------------------------------------------------------------------------------------- boards
function drawBoard(ctx, t, data, seg, since, layers) {
  const field = fieldFor(data, 'today');
  wallPicture(SB, SW, SH, { lat: 12, lon: 12, zoom: 1.05 }, field, layers, { tau: ST.tau, isobars: false, opacity: 0.6 }, t);
  // the board's field: the wall's picture out of focus, pushed back two steps behind the plates
  let t0 = now();
  softWall(FB, SB, SW, SH, { k: 6, dim: 2 });
  ST.fbFor = 'board';
  prof('soft', t0);
  t0 = now();
  present(ctx);
  prof('present', t0);
  const board = seg.board;
  if (!board) return;
  const said = board.kind === 'hotcold' ? [...(board.hot || []).slice(0, 3), ...(board.cold || []).slice(0, 3)].map((p) => p.id) : (board.cities || []).map((c) => c.id);
  let done = null;
  if (said.length && said.every((id) => ST.spoken.has(id))) done = Math.max(...said.map((id) => ST.spoken.get(id))) + 1.6;
  const W8 = { since, spoken: ST.spoken, hot: ST.seg?.board === board ? currentHot() : null, hotAt: ST.lastHotAt, done, anySaid: ST.spoken.size > 0 };
  t0 = now();
  if (board.kind === 'hotcold') drawHotCold(ctx, t, board, W8);
  else if (board.kind === 'outlook') drawOutlook(ctx, t, board, W8);
  prof('board', t0);
}
function currentHot() {
  let last = null, at = -Infinity;
  for (const [id, x] of ST.spoken) if (x > at) [last, at] = [id, x];
  return last;
}

export const __test = { targetOf, zoneView, ST, shotOf, skyMoment, voiceGate, fitView, FREE, MARK, beatsFor, closeupTarget };
