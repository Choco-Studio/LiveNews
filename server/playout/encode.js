// One set of encoder settings for everything the playout airs (docs/publishing/playout.md §3): the programmes the
// renderer encodes, the filler the playout encodes on the spot, all H.264 with the same profile, level, size, frame
// rate, GOP and no B-frames, each file starting on an IDR frame, so their streams join byte to byte (the playout copies
// the video into one long-lived ffmpeg, never re-encodes it). The sound travels as PCM (FLAC in the files) and is
// encoded once, continuously, by the playout: no AAC priming at the joins, no drift.
//
//   airVideoArgs({ size, bitrate, fps })  ffmpeg output options for the air video (after the filter)
//   scaleFilter({ size })                 the pixel art scaled by nearest neighbour to the air size
//   parseSize('1280x720') -> { w, h }

export const AIR_DEFAULTS = Object.freeze({ size: '1280x720', bitrate: '3000k', fps: 30, audioRate: 48000, audioBitrate: '160k', preset: 'veryfast' });
export const PRESETS = Object.freeze(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium']);

export function parseSize(size = AIR_DEFAULTS.size) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(size).trim());
  if (!m) throw new Error(`a size is WIDTHxHEIGHT, not "${size}"`);
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w % 2 || h % 2) throw new Error(`the air size must be even (${size})`);
  return { w, h };
}

/** The level that fits the size and rate (x264 would pick it too; written out so every file says the same). */
export function levelFor({ w, h }, fps) {
  const mbps = Math.ceil(w / 16) * Math.ceil(h / 16) * fps;
  if (mbps <= 108000) return '3.1';
  if (mbps <= 245760) return '4.1';
  return '5.1';
}

export const scaleFilter = ({ size = AIR_DEFAULTS.size } = {}) => {
  const { w, h } = parseSize(size);
  return `scale=${w}:${h}:flags=neighbor,format=yuv420p`;
};

export function airVideoArgs({ size = AIR_DEFAULTS.size, bitrate = AIR_DEFAULTS.bitrate, fps = AIR_DEFAULTS.fps, preset = AIR_DEFAULTS.preset } = {}) {
  const { w, h } = parseSize(size);
  const kbps = parseInt(bitrate, 10);
  if (!(kbps > 0)) throw new Error(`a bitrate like 3000k, not "${bitrate}"`);
  if (!PRESETS.includes(preset)) throw new Error(`an x264 preset (${PRESETS.join(', ')}), not "${preset}"`);
  const gop = fps * 2; // a keyframe every 2 s (YouTube's ask; the filler's granule)
  return [
    '-c:v', 'libx264', '-preset', preset, '-tune', 'animation',
    '-profile:v', 'high', '-level:v', levelFor({ w, h }, fps), '-pix_fmt', 'yuv420p',
    '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`,
    '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-bf', '0',
    // closed GOPs, an access unit delimiter before every frame, SPS and PPS before every IDR: the streams join cleanly
    '-x264-params', 'open-gop=0:aud=1:repeat-headers=1:ref=2',
    '-r', String(fps),
  ];
}
