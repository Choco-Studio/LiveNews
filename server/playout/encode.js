// One set of encoder settings for everything the playout airs (docs/publishing/playout.md §3): the programmes the
// renderer encodes, the filler the playout encodes on the spot, all H.264 with the same profile, level, size, frame
// rate, GOP and no B-frames, each file starting on an IDR frame, so their streams join byte to byte (the playout copies
// the video into one long-lived ffmpeg, never re-encodes it). The sound travels as PCM (FLAC in the files) and is
// encoded once, continuously, by the playout: no AAC priming at the joins, no drift.
//
//   airVideoArgs({ size, bitrate, crf, fps })  ffmpeg output options for the air video (after the filter)
//   scaleFilter({ size })                      the pixel art scaled by nearest neighbour to the air size, BT.709
//   airSize('1280x720')                        the size actually aired: a whole multiple of the 384x216 canvas
//                                              (1152x648 here, with a warning: server/airsize.js)
//   parseSize('1920x1080') -> { w, h }
//   renderGraph({ size, twin, vertical })      the renderer's filter graph: the air picture, the twin master, and the
//                                              vertical live's picture (§13: the 216x384 frame at 5x with the spot's
//                                              window filled with the spot at 2x) and its master
//
// The rate: constant quality (crf) under a cap (bitrate, a 2 s buffer). At 1080p a news programme needs 1 to 2
// Mbit/s for a picture close to lossless, the adverts about 2.5; the cap holds the weather maps (7 Mbit/s uncapped)
// and keeps a month under the traffic allowance whatever airs (playout.md §12.2). crf null (PLAYOUT_CRF=off) gives
// the old constant bitrate at `bitrate`.
import { integerSize, scaleFilter as airScale, colourArgs, DEFAULT_SIZE, CANVAS, VCANVAS } from '../airsize.js';

export const AIR_DEFAULTS = Object.freeze({ size: DEFAULT_SIZE, bitrate: '5500k', crf: 20, fps: 30, audioRate: 48000, audioBitrate: '160k', preset: 'veryfast' });
export const PRESETS = Object.freeze(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium']);

export function parseSize(size = AIR_DEFAULTS.size) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(size).trim());
  if (!m) throw new Error(`a size is WIDTHxHEIGHT, not "${size}"`);
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w % 2 || h % 2) throw new Error(`the air size must be even (${size})`);
  return { w, h };
}

/** The size aired for `size`: itself if a whole multiple of the canvas, else the nearest one (`warn` says so). */
export function airSize(size = AIR_DEFAULTS.size, warn = (m) => console.warn(m)) {
  return integerSize(size, { warn }).size;
}

/** The level that fits the size and rate (x264 would pick it too; written out so every file says the same). */
export function levelFor({ w, h }, fps) {
  const mbps = Math.ceil(w / 16) * Math.ceil(h / 16) * fps;
  if (mbps <= 108000) return '3.1';
  if (mbps <= 245760) return '4.1';
  return '5.1';
}

/** Whole multiples only: a size that is not one is refused here (the tools round it first, with airSize). */
const exact = (size) => integerSize(size, { strict: true });

export const scaleFilter = ({ size = AIR_DEFAULTS.size } = {}) => airScale(exact(size));

/** A crf setting from the environment or a switch: a number, or off/cbr/none for the constant bitrate. */
export function parseCrf(v, def = AIR_DEFAULTS.crf) {
  if (v === undefined || v === null || v === '') return def;
  if (/^(off|cbr|none|no)$/i.test(String(v).trim())) return null;
  const n = Number(v);
  if (!(n >= 0 && n <= 51)) throw new Error(`a crf from 0 to 51 (or off), not "${v}"`);
  return n;
}

export function airVideoArgs({ size = AIR_DEFAULTS.size, bitrate = AIR_DEFAULTS.bitrate, crf = AIR_DEFAULTS.crf, fps = AIR_DEFAULTS.fps, preset = AIR_DEFAULTS.preset } = {}) {
  const { w, h } = exact(size);
  const kbps = parseInt(bitrate, 10);
  if (!(kbps > 0)) throw new Error(`a bitrate like 5500k, not "${bitrate}"`);
  if (!PRESETS.includes(preset)) throw new Error(`an x264 preset (${PRESETS.join(', ')}), not "${preset}"`);
  if (crf !== null && !(crf >= 0 && crf <= 51)) throw new Error(`a crf from 0 to 51, not "${crf}"`);
  const gop = fps * 2; // a keyframe every 2 s (YouTube's ask; the filler's granule)
  return [
    '-c:v', 'libx264', '-preset', preset, '-tune', 'animation',
    '-profile:v', 'high', '-level:v', levelFor({ w, h }, fps), '-pix_fmt', 'yuv420p',
    ...(crf === null ? ['-b:v', `${kbps}k`] : ['-crf', String(crf)]), '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`,
    '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-bf', '0',
    // closed GOPs, an access unit delimiter before every frame, SPS and PPS before every IDR: the streams join cleanly
    '-x264-params', 'open-gop=0:aud=1:repeat-headers=1:ref=2',
    ...colourArgs(),
    '-r', String(fps),
  ];
}

/**
 * Where each picture sits in the renderer's grab (tools/playout/render.mjs grabInit: one image a frame, side by side
 * from the left, top-aligned): the air picture, the twin master (`twin`), then for the vertical live (`vertical`) the
 * clean frame (the spots' source) and the vertical picture. -> { w, h, air, twin, clean, vertical } (x offsets, or null)
 */
export function grabLayout({ twin = false, vertical = false } = {}) {
  let x = 0;
  const at = (w) => {
    const here = x;
    x += w;
    return here;
  };
  const air = at(CANVAS.w);
  const tw = twin ? at(CANVAS.w) : null;
  const clean = vertical ? at(CANVAS.w) : null;
  const v = vertical ? at(VCANVAS.w) : null;
  return { w: x, h: vertical ? VCANVAS.h : CANVAS.h, air, twin: tw, clean, vertical: v };
}

/**
 * The spot's place in the vertical picture at k times its canvas (public/js/clip/vchannel.js AD_WINDOW and adPlacement,
 * the same numbers: a test holds them together): the largest whole scale that fits the 154x87 window, centred in it, on
 * even pixels (a 2x pixel is then exactly one 4:2:0 chroma sample: no colour bleeds between the spot's pixels).
 */
export const AD_WINDOW = Object.freeze({ x: 31, y: 148, w: 154, h: 87 });
export function adPlacement(k = 5) {
  const W = AD_WINDOW.w * k;
  const H = AD_WINDOW.h * k;
  const a = Math.max(1, Math.min(Math.floor(W / CANVAS.w), Math.floor(H / CANVAS.h)));
  const even = (v, lo, hi) => (v % 2 === 0 ? v : v + 1 <= hi ? v + 1 : Math.max(lo, v - 1));
  const w = CANVAS.w * a;
  const h = CANVAS.h * a;
  const x0 = AD_WINDOW.x * k;
  const y0 = AD_WINDOW.y * k;
  return { a, x: even(x0 + Math.floor((W - w) / 2), x0, x0 + W - w), y: even(y0 + Math.floor((H - h) / 2), y0, y0 + H - h), w, h };
}

/**
 * The renderer's filter graph from its grab (grabLayout) to its outputs: [air] the air picture at `size` (BT.709 4:2:0);
 * with `twin`, [m] the twin master (lossless RGB, 1x); with `vertical` (the vertical air size, e.g. 1080x1920), [vair]
 * the vertical live's picture and [vm] its master (lossless RGB, 216x384). The vertical picture is its frame scaled
 * whole by nearest neighbour (converted to BT.709 4:2:0 in the same pass), with the spot laid over the window alone: the
 * clean frame scaled whole to the spot's place (adPlacement), shown where the frame leaves its window open (its alpha
 * there, inverted, is the spot's: open during a spot, shut otherwise; clip/vchannel.js). A full-frame overlay at
 * 1080x1920 cost five times the vertical's whole filter graph (measured, playout.md §13.4).
 * -> { graph, outputs: ['[air]', '[m]'?, '[vair]'?, '[vm]'?], layout }
 */
export function renderGraph({ size = AIR_DEFAULTS.size, twin = false, vertical = null } = {}) {
  const L = grabLayout({ twin, vertical: !!vertical });
  const { w, h } = CANVAS;
  const parts = [];
  const outputs = ['[air]'];
  const n = 1 + (twin ? 1 : 0) + (vertical ? 2 : 0);
  const labels = ['[a]', ...(twin ? ['[t]'] : []), ...(vertical ? ['[c]', '[v]'] : [])];
  parts.push(n > 1 ? `[0:v]split=${n}${labels.join('')}` : '[0:v]null[a]');
  parts.push(`[a]crop=${w}:${h}:${L.air}:0,${scaleFilter({ size })}[air]`);
  if (twin) {
    parts.push(`[t]crop=${w}:${h}:${L.twin}:0,format=rgb24[m]`);
    outputs.push('[m]');
  }
  if (vertical) {
    const V = integerSize(vertical, { canvas: VCANVAS, strict: true });
    const ad = adPlacement(V.k);
    const win = AD_WINDOW;
    const yuv = 'out_color_matrix=bt709:out_range=tv';
    parts.push(`[v]crop=${VCANVAS.w}:${VCANVAS.h}:${L.vertical}:0,split=3[v1][v2][v3]`);
    parts.push(`[v1]scale=w=${V.w}:h=${V.h}:flags=neighbor:${yuv},format=yuv420p[vbase]`);
    parts.push(`[c]crop=${w}:${h}:${L.clean}:0,scale=w=${ad.w}:h=${ad.h}:flags=neighbor:${yuv},format=yuva420p[spot]`);
    parts.push(`[v3]crop=${win.w}:${win.h}:${win.x}:${win.y},alphaextract,negate,scale=${ad.w}:${ad.h}:flags=neighbor[open]`);
    parts.push(`[spot][open]alphamerge[shown]`);
    parts.push(`[vbase][shown]overlay=${ad.x}:${ad.y}:format=yuv420[vair]`);
    parts.push(`[v2]format=rgb24[vm]`);
    outputs.push('[vair]', '[vm]');
  }
  return { graph: parts.join(';'), outputs, layout: L };
}
