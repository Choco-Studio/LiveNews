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
//
// The rate: constant quality (crf) under a cap (bitrate, a 2 s buffer). At 1080p a news programme needs 1 to 2
// Mbit/s for a picture close to lossless, the adverts about 2.5; the cap holds the weather maps (7 Mbit/s uncapped)
// and keeps a month under the traffic allowance whatever airs (playout.md §12.2). crf null (PLAYOUT_CRF=off) gives
// the old constant bitrate at `bitrate`.
import { integerSize, scaleFilter as airScale, colourArgs, DEFAULT_SIZE } from '../airsize.js';

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
