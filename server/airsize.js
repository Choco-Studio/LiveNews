// The size of the picture on air: always a whole multiple of the channel's 384x216 canvas (public/js/set.js W, H), so
// every pixel of the art becomes the same k x k block of screen pixels (nearest neighbour). 1280x720 is x3.33: a third
// of the art's pixels would come out a screen pixel wider or taller than the rest (uneven lines, a shimmer when the
// picture pans). The live stream (tools/stream.mjs) and the pre-rendered playout (server/playout/encode.js) both size
// their picture here.
//
//   integerSize('1920x1080') -> { w: 1920, h: 1080, k: 5, size: '1920x1080', asked: '1920x1080', rounded: false }
//   integerSize('1280x720')  -> { w: 1152, h: 648, k: 3, ..., rounded: true }   (and a warning: nearest whole multiple)
//   scaleFilter('1920x1080') -> the ffmpeg filter: nearest neighbour, BT.709, 4:2:0
//   colourArgs()             -> the ffmpeg output options that say so (players read untagged HD as BT.709)
//
// The colours: ffmpeg's RGB to YUV conversion uses BT.601 unless told otherwise, and writes nothing in the stream, while
// players and YouTube read an untagged HD picture as BT.709: the channel's green 0x00e436 came out 0x00c12f, its red
// 0xff004d as 0xff1b4c. The filter converts with BT.709 and the stream is tagged BT.709, limited range.

export const CANVAS = Object.freeze({ w: 384, h: 216 });
/** The sizes worth naming: x3 (YouTube files it as 480p), x5 (1080p, the default). */
export const SIZES = Object.freeze({ '648p': '1152x648', '1080p': '1920x1080' });
export const DEFAULT_SIZE = SIZES['1080p'];

function parse(size) {
  const s = String(size ?? '').trim().toLowerCase();
  if (SIZES[s]) return parse(SIZES[s]);
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(s);
  if (!m) throw new Error(`a size is WIDTHxHEIGHT (or ${Object.keys(SIZES).join(', ')}), not "${size}"`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

/**
 * The air size for `size`: itself when it is a whole multiple k of the canvas, else the nearest whole multiple (by
 * area) with a warning through `warn` (never a fractional scale). `strict` refuses instead of rounding.
 */
export function integerSize(size = DEFAULT_SIZE, { canvas = CANVAS, warn = (m) => console.warn(m), strict = false } = {}) {
  const asked = parse(size);
  const askedSize = `${asked.w}x${asked.h}`;
  const kx = asked.w / canvas.w;
  const ky = asked.h / canvas.h;
  if (Number.isInteger(kx) && kx === ky && kx >= 1) return { w: asked.w, h: asked.h, k: kx, size: askedSize, asked: askedSize, rounded: false };
  const k = Math.max(1, Math.round(Math.sqrt(kx * ky)));
  const w = canvas.w * k;
  const h = canvas.h * k;
  const why = `${askedSize} is not a whole multiple of the ${canvas.w}x${canvas.h} canvas (x${kx.toFixed(2)}${kx !== ky ? ` by x${ky.toFixed(2)}` : ''}): its pixels would come out uneven`;
  if (strict) throw new Error(`${why}; use ${w}x${h} (x${k})`);
  warn(`${why}; using ${w}x${h} (x${k}) instead`);
  return { w, h, k, size: `${w}x${h}`, asked: askedSize, rounded: true };
}

/** The ffmpeg filter from the canvas (RGB, or YUV in `inMatrix`) to the air size: nearest neighbour, BT.709 4:2:0. */
export function scaleFilter(size = DEFAULT_SIZE, { inMatrix = null } = {}) {
  const { w, h } = typeof size === 'object' ? size : integerSize(size, { warn: () => {} });
  return `scale=w=${w}:h=${h}:flags=neighbor${inMatrix ? `:in_color_matrix=${inMatrix}` : ''}:out_color_matrix=bt709:out_range=tv,format=yuv420p`;
}

/** The output options that tag the stream as BT.709, limited range (what the filter wrote). */
export const colourArgs = () => ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
