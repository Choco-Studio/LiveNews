// From a moment to the files of a clip (docs/publishing/clips.md §4): the cut's exact window on the master
// recording, the ffmpeg graph that cuts it, lays the hook title over it, adds the end card and scales the whole by
// nearest neighbour to the network's size, the caption file, the contact sheet. Pure functions: tools/publish/factory.mjs
// runs them.
//
//   clipWindow(moment, timeline, { fps, wipeIn }) -> { start, end, duration, snappedStart, snappedEnd, hold }
//   composeArgs({ master, hook, faces, endcard, window, format, out, hookSeconds, gain }) -> ffmpeg argv
//   loudnessArgs({ master, endcard, window }) / measureArgs(file) -> ffmpeg argv that measure a clip's sound
//   parseLoudness(stderr) -> { lufs, truePeak };  loudnessGain(measure) -> the dB that bring it to LOUDNESS.target
//   srtFor(timeline, window) / vttFor(timeline, window) -> caption files' text (the voice's own word times)
//   contactArgs({ clip, format, times, out }) -> ffmpeg argv for the clip's contact sheet
import { cutsAround } from './timeline.js';

export const SCALE = 5; // 384x216 -> 1920x1080, 216x384 -> 1080x1920
export const FPS = 30;
const LEAD = 0.3; // s of the master before the first word (a breath, never a cut into a syllable)
const TAIL = 0.55; // s after the last word
const frame = (t, fps = FPS) => Math.round(t * fps) / fps;

const HOLD = 0.4; // s a caption stays after its sentence (clip/captions.js hold 0.35, and a frame)

/**
 * WORLD WEATHER's horizontal picture wipes into every board over this long, from the segment's first word: the old
 * shot's last frame slides off behind an accent bar (public/js/scenes/weather/index.js WIPE_DUR; a test keeps the two
 * equal). A clip that opens there holds the board's first whole frame over the wipe instead (clipWindow's `hold`).
 */
export const WEATHER_WIPE = 0.42;

/**
 * The cut. Its start is LEAD before the first word, but never while the sentence before is still on screen (its voice
 * or its caption, HOLD after it); when the picture changes in the 1.5 s before the first word, the clip opens on the
 * first whole frame of the change (a cut's event, or the segment's hand-over to the voice, where its strap, card or
 * board change: both are stamped one frame before the picture shows them), and never after the first word. Its end is
 * TAIL after the last word, or one frame before the next cut when that comes within 1.2 s, and never inside the next
 * sentence (a frame before its first word). Both on whole frames.
 * `wipeIn`: the picture wipes in from the hand-over for that long (WEATHER_WIPE); a clip opening on the hand-over
 * then holds the first whole frame after the wipe over it (`hold` seconds from its start: the old shot is never seen,
 * and the first word is kept).
 */
export function clipWindow(moment, timeline, { fps = FPS, lead = LEAD, tail = TAIL, wipeIn = 0 } = {}) {
  const firstFrameAfter = (t) => Math.ceil(t * fps - 1e-6) / fps + 1 / fps;
  let start = moment.start - lead;
  // the sentence before: its end (the last word heard before the moment's first)
  let prevEnd = null;
  for (const s of timeline?.segments || []) {
    for (const x of s.sentences || []) if (x.end != null && x.end <= moment.start - 0.02 && (prevEnd === null || x.end > prevEnd)) prevEnd = x.end;
  }
  if (prevEnd !== null) start = Math.max(start, prevEnd + HOLD);
  let snappedStart = false;
  let wiped = null; // the first whole frame after a wipe the clip opens on
  const before = cutsAround(timeline, moment.start + 0.05).before;
  const seg = (timeline?.segments || []).find((s) => s.index === moment.from);
  // (a run that starts after a running-order label never opens on a cut before it: the label would be heard)
  if (before !== null && before >= moment.start - (moment.leadIn ? 0.05 : 1.5) && before <= moment.start + 0.05) {
    start = firstFrameAfter(before);
    snappedStart = true;
  } else if (!moment.trimmed && Number.isFinite(seg?.spokeAt) && seg.spokeAt >= moment.start - 1.5 && seg.spokeAt <= moment.start) {
    start = Math.max(start, firstFrameAfter(seg.spokeAt));
    snappedStart = true;
    if (wipeIn > 0) wiped = firstFrameAfter(seg.spokeAt + wipeIn);
  }
  // never in the label's last word, never after the first word
  if (moment.leadIn) start = Math.max(start, moment.start - 0.12);
  start = Math.min(start, moment.start - 0.04);
  let end = moment.end + tail;
  let snappedEnd = false;
  const after = cutsAround(timeline, moment.end).after;
  if (after !== null && after > moment.end + 0.1 && after <= moment.end + 1.2) {
    end = after - 1 / fps;
    snappedEnd = true;
  }
  // never into the sentence after: its first word is not heard, and a cut inside it is a half sentence (the owner's
  // server, 19 Oct: "the cut at 66.33 s falls inside 'Vic, thank you.' (66.15-67.23 s)", most clips held for it)
  let nextStart = null;
  for (const s of timeline?.segments || []) {
    for (const x of s.sentences || []) if (x.start != null && x.start >= moment.end + 0.02 && (nextStart === null || x.start < nextStart)) nextStart = x.start;
  }
  if (nextStart !== null && end > nextStart - 1 / fps) end = Math.max(moment.end + 1 / fps, Math.floor((nextStart - 1 / fps) * fps) / fps);
  start = Math.max(0, frame(start, fps));
  end = end === Math.floor(end * fps) / fps ? end : frame(end, fps);
  const hold = wiped !== null && wiped > start && wiped < end ? frame(wiped - start, fps) : 0;
  return { start, end, duration: +(end - start).toFixed(3), snappedStart, snappedEnd, hold };
}

/**
 * The feeds' loudness (docs/publishing/shorts-v2.md A1). YouTube plays a video at about -14 LUFS: it turns a louder one
 * down and never a quieter one up; TikTok and Instagram publish no target, and the videos around ours sit about there.
 * The house mixes its voices at -16 LUFS (public/js/audio/loudness.js) and the clips measured -15.7 to -17.1 (24 Oct):
 * each played softer than the video before it. A clip is brought to `target` by one linear gain on its whole sound (no
 * compressor and no limiter: the mix keeps its own dynamics), never past `ceiling` true peak: half a decibel under the
 * feeds' -1 dBTP, for the AAC encoder's overshoot. `max`: the most a gain may move a clip, either way.
 */
export const LOUDNESS = Object.freeze({ target: -14, ceiling: -1.5, max: 12 });

/** The clip's sound: the window's (faded in over 0.12 s and out over its last 0.35 s), then the end card's (input `end`). */
function soundParts(window, end) {
  const D = window.duration;
  return {
    cut: `[0:a]asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:st=0:d=0.12,afade=t=out:st=${Math.max(0, D - 0.35).toFixed(3)}:d=0.35[a]`,
    card: end === null ? null : `[${end}:a]aresample=48000[ea]`,
  };
}
const volume = (gain) => (Number.isFinite(gain) && Math.abs(gain) >= 0.05 ? `volume=${gain.toFixed(1)}dB` : 'anull');

/**
 * The face hook's strip (docs/publishing/shorts-v2.md B1): a picture twice the band's height, its top half clear and its
 * bottom half the players over the desk, laid at `y` (the band's top) through a window the band's height that slides
 * down it: the players rise in over `rise` s from `from`, stay, and sink out over `rise` s until `until`.
 */
export const FACES = Object.freeze({ y: 240, band: 60, from: 0.15, rise: 0.3, until: 2.6 });
function facesFilter(input, faces) {
  const f = { ...FACES, ...faces };
  const up = `clip((t-${f.from.toFixed(2)})/${f.rise.toFixed(2)},0,1)`;
  const down = `clip((${f.until.toFixed(2)}-t)/${f.rise.toFixed(2)},0,1)`;
  return { strip: `[${input}:v]format=rgba,crop=w=iw:h=${f.band}:x=0:y='${f.band}*min(${up},${down})'[fc]`, enable: `lt(t,${f.until.toFixed(2)})`, y: f.y };
}

/**
 * A vertical clip's intro (docs/publishing/shorts-v2.md §6; public/js/clip/intro.js): a recording at the clip's own
 * pixels whose picture lasts `seconds` and whose sound runs on past it (the theme's tail). The clip comes in over the
 * intro's last `overlap` seconds (the owner, 26 Oct: "prefiero un difuminado en el que desaparecen los píxeles en
 * diagonal", "de arriba derecha a abajo izquierda"): the intro's pixels go one by one, a front sweeping from the top
 * right corner to the bottom left, each pixel's moment set by its place along the diagonal and by the screen's 4 x 4 Bayer
 * matrix (so the front is a band of pixels dissolving, never a line); with no overlap, a cut. The intro's sound up to
 * where the clip comes in goes first; its tail is laid under the clip's first seconds, dipped under them and fading, as
 * an open's rings under a programme's first words (input `input`).
 */
/**
 * Seconds of the intro's theme laid under the clip's first words (its tail: the hit ringing out), and how far it dips
 * there (the channel's music dips 6 dB under a voice: public/js/audio/synth.js), fading out over them.
 */
export const INTRO_TAIL = 2.2;
const INTRO_DUCK = -6;
function introParts(input, { seconds, overlap = 0 }) {
  const S = seconds.toFixed(3);
  const A = Math.max(0, seconds - overlap).toFixed(3); // where the clip comes in
  // each pixel's moment: its place along the diagonal (0 top right, 1 bottom left), held back by up to `band` by its
  // Bayer threshold (written out in full: the expression's own registers, st()/ld(), are shared by the filter's slice
  // threads, and the colour planes trampled each other)
  const band = 0.35;
  const bayer = '(8*abs(mod(X,2)-mod(Y,2))+4*mod(Y,2)+2*abs(mod(floor(X/2),2)-mod(floor(Y/2),2))+mod(floor(Y/2),2))';
  const dissolve = `if(gt((1-P)*${(1 + band).toFixed(2)},(W-X+Y)/(W+H)+${band}*(${bayer}+0.5)/16),B,A)`;
  return {
    video: `[${input}:v]trim=duration=${S},setpts=PTS-STARTPTS,fps=${FPS},setsar=1,format=gbrp[iv]`,
    // [o] (the clip) joins the intro: a cut, or the intro's pixels dissolving away along the diagonal
    join: overlap > 0 ? `[o]format=gbrp[og];[iv][og]xfade=transition=custom:duration=${overlap.toFixed(3)}:offset=${A}:expr='${dissolve}'[vi]` : `[iv][o]concat=n=2:v=1:a=0[vi]`,
    sound: `[${input}:a]aresample=48000,asplit=2[ia0][ia1];[ia0]atrim=end=${A},asetpts=PTS-STARTPTS[ih];[ia1]atrim=start=${A},asetpts=PTS-STARTPTS,volume=${INTRO_DUCK}dB,afade=t=out:st=0:d=${INTRO_TAIL}[it];[a][it]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[am];[ih][am]concat=n=2:v=0:a=1[ai]`,
  };
}

/**
 * The ffmpeg graph of one clip: [intro] + [master window] + hook overlay (vertical: the whole clip; horizontal: its
 * first `hookSeconds`) + the face hook's strip (`faces`: { file, until }, its first seconds) + the end card (its own
 * picture and sound) -> nearest-neighbour 5x -> H.264 (High, yuv420p, CRF 18, a keyframe a second) + AAC 160k,
 * faststart. The sound fades in over 0.12 s and out over the last 0.35 s of the cut, and `gain` dB lift the whole
 * (loudnessGain: the clip at the feeds' loudness). `intro`: { file, seconds, overlap } (introParts): the clip
 * comes in over its last `overlap` seconds; the overlays keep the clip's own clock.
 * A window with a `hold` shows its frame at `hold` from the start until then (the sound runs on underneath).
 */
export function composeArgs({ master, hook, faces = null, endcard, intro = null, window, format, out, hookSeconds = 4, crf = 18, gain = 0 }) {
  const D = window.duration;
  const enable = format === 'vertical' ? '' : `:enable='lt(t,${hookSeconds})'`;
  const hold = window.hold > 0 ? `,trim=start=${window.hold.toFixed(3)},setpts=PTS-STARTPTS,tpad=start_duration=${window.hold.toFixed(3)}:start_mode=clone` : '';
  // the inputs: the master, then the hook, the face hook's strip, the end card and the intro, each when there is one
  let n = 1;
  const hookIn = hook ? n++ : null;
  const facesIn = faces?.file ? n++ : null;
  const end = endcard ? n++ : null;
  const introIn = intro?.file ? n++ : null;
  const sound = soundParts(window, end);
  const fc = facesIn !== null ? facesFilter(facesIn, faces) : null;
  const ip = introIn !== null ? introParts(introIn, intro) : null;
  // the pieces in order, each a picture and its sound: the intro and the clip (joined), the end card
  const parts = [ip ? ['[vi]', '[ai]'] : ['[o]', '[a]'], ...(endcard ? [['[ev]', '[ea]']] : [])];
  const graph = [
    `[0:v]setpts=PTS-STARTPTS,fps=${FPS}${hold}[c]`,
    hook ? `[c][${hookIn}:v]overlay=0:0${enable}:eof_action=repeat[h]` : '[c]null[h]',
    fc ? `${fc.strip};[h][fc]overlay=0:${fc.y}:enable='${fc.enable}'[o]` : '[h]null[o]',
    sound.cut,
    ...(ip ? [ip.video, ip.join, ip.sound] : []),
    ...(endcard ? [`[${end}:v]fps=${FPS},setsar=1${ip ? ',format=gbrp' : ''}[ev]`, sound.card] : []),
    parts.length > 1 ? `${parts.map(([v, a]) => v + a).join('')}concat=n=${parts.length}:v=1:a=1[v][ac]` : `${parts[0][0]}null[v];${parts[0][1]}anull[ac]`,
    `[ac]${volume(gain)}[aa]`,
    `[v]scale=iw*${SCALE}:ih*${SCALE}:flags=neighbor,setsar=1,format=yuv420p[vv]`,
  ].join(';');
  const args = ['-v', 'error', '-y', '-ss', window.start.toFixed(3), '-t', D.toFixed(3), '-i', master];
  if (hook) args.push('-loop', '1', '-t', D.toFixed(3), '-i', hook);
  if (facesIn !== null) args.push('-loop', '1', '-t', D.toFixed(3), '-i', faces.file);
  if (endcard) args.push('-i', endcard);
  if (introIn !== null) args.push('-i', intro.file);
  args.push('-filter_complex', graph, '-map', '[vv]', '-map', '[aa]', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', String(crf), '-g', String(FPS), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', out);
  return args;
}

// (EBU R128 as ffmpeg's ebur128 filter reports it: the summary at the end of its log, on stderr)
const EBUR128 = 'ebur128=peak=true:framelog=quiet';

/** ffmpeg argv that measure a clip's sound before it is made: the same window, fades, intro and end card as composeArgs mixes. */
export function loudnessArgs({ master, endcard = null, intro = null, window }) {
  const sound = soundParts(window, endcard ? 1 : null);
  const ip = intro?.file ? introParts(endcard ? 2 : 1, intro) : null;
  const parts = [ip ? '[ai]' : '[a]', ...(endcard ? ['[ea]'] : [])];
  const graph = [
    sound.cut,
    ...(ip ? [ip.sound] : []),
    ...(endcard ? [sound.card] : []),
    parts.length > 1 ? `${parts.join('')}concat=n=${parts.length}:v=0:a=1[ac]` : `${parts[0]}anull[ac]`,
    `[ac]${EBUR128}[m]`,
  ].join(';');
  const args = ['-hide_banner', '-nostats', '-ss', window.start.toFixed(3), '-t', window.duration.toFixed(3), '-i', master];
  if (endcard) args.push('-i', endcard);
  if (ip) args.push('-i', intro.file);
  args.push('-filter_complex', graph, '-map', '[m]', '-f', 'null', '-');
  return args;
}

/** ffmpeg argv that measure a made file's sound (what the feeds will play). */
export const measureArgs = (file) => ['-hide_banner', '-nostats', '-i', file, '-map', '0:a', '-af', EBUR128, '-f', 'null', '-'];

/** The integrated loudness (LUFS) and true peak (dBTP) in an ebur128 log; null for one it does not give (-inf: silence). */
export function parseLoudness(log) {
  const at = String(log || '').lastIndexOf('Summary:');
  if (at < 0) return { lufs: null, truePeak: null };
  const sum = String(log).slice(at);
  const num = (re) => {
    const m = re.exec(sum);
    return m && Number.isFinite(Number(m[1])) ? Number(m[1]) : null;
  };
  return { lufs: num(/\bI:\s+(-?[\d.]+|-inf) LUFS/), truePeak: num(/\bPeak:\s+(-?[\d.]+|-inf) dBFS/) };
}

/**
 * The gain (dB, a tenth at most under the exact figure) that brings a measured clip to LOUDNESS.target without its true
 * peak passing LOUDNESS.ceiling: 0 for silence or a sound too faint to measure (nothing worth lifting).
 */
export function loudnessGain({ lufs, truePeak } = {}, { target = LOUDNESS.target, ceiling = LOUDNESS.ceiling, max = LOUDNESS.max } = {}) {
  if (!Number.isFinite(lufs) || lufs < -60) return 0;
  let g = target - lufs;
  if (Number.isFinite(truePeak)) g = Math.min(g, ceiling - truePeak);
  g = Math.max(-max, Math.min(max, g));
  return Math.floor(g * 10 + 1e-9) / 10 || 0;
}

const srtTime = (t, sep = ',') => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
};

/** Caption cues for a window: pages of at most two lines of 42 characters, each from its first word to its last. */
export function cuesFor(timeline, window, { maxLine = 42, lines = 2 } = {}) {
  const cues = [];
  for (const seg of timeline?.segments || []) {
    for (const sent of seg.sentences || []) {
      const ws = (seg.words || []).filter((w) => w.from >= sent.from && w.from < sent.to && w.at >= window.start - 0.05 && w.end <= window.end + 0.3);
      if (!ws.length) continue;
      let page = [];
      let line = '';
      let nLines = 1;
      const flush = () => {
        if (!page.length) return;
        cues.push({ start: Math.max(0, page[0].at - window.start), end: Math.min(window.duration, page[page.length - 1].end - window.start + 0.15), text: page.map((w) => w.w).join(' ') });
        page = [];
        line = '';
        nLines = 1;
      };
      for (const w of ws) {
        const next = line ? `${line} ${w.w}` : w.w;
        if (next.length > maxLine) {
          if (nLines >= lines) flush();
          else nLines++;
          line = w.w;
        } else line = next;
        page.push(w);
      }
      flush();
    }
  }
  // no overlaps
  for (let i = 0; i < cues.length - 1; i++) cues[i].end = Math.min(cues[i].end, cues[i + 1].start - 0.01);
  return cues.filter((c) => c.end > c.start);
}

/** The clip's caption file (`offset`: seconds of intro before the clip's own first frame). */
export function srtFor(timeline, window, { offset = 0 } = {}) {
  return cuesFor(timeline, window).map((c, i) => `${i + 1}\n${srtTime(c.start + offset)} --> ${srtTime(c.end + offset)}\n${c.text}\n`).join('\n');
}

export function vttFor(timeline, window, { offset = 0 } = {}) {
  return `WEBVTT\n\n${cuesFor(timeline, window).map((c) => `${srtTime(c.start + offset, '.')} --> ${srtTime(c.end + offset, '.')}\n${c.text}\n`).join('\n')}`;
}

/** The times of a contact sheet: the first frames (the hook), evenly through the cut, and the end card. */
export function contactTimes(duration, endSeconds, n = 12) {
  const content = duration - endSeconds;
  const t = [0, 0.5, 1.0, 2.0];
  const rest = n - t.length - 2;
  for (let i = 1; i <= rest; i++) t.push(2 + ((content - 2.3) * i) / rest);
  t.push(content + 0.4, duration - 0.1);
  return t.map((x) => +Math.max(0, Math.min(duration - 0.05, x)).toFixed(2));
}

/**
 * The contact sheet: each time's frame at the channel's own pixels (the 5x clip brought back to 1x by nearest
 * neighbour, then 2x to look at), its time written under it, tiled (vertical 6 x 2, horizontal 4 x 3).
 */
export function contactArgs({ clip, format, times, out, font = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf' }) {
  const cols = format === 'vertical' ? 6 : 4;
  const rows = Math.ceil(times.length / cols);
  const split = `[0:v]split=${times.length}${times.map((_, i) => `[i${i}]`).join('')}`;
  const sel = times.map((t, i) => `${i === 0 ? `${split};` : ''}[i${i}]trim=start=${t}:duration=0.04,setpts=PTS-STARTPTS,scale=iw/${SCALE}:ih/${SCALE}:flags=neighbor,scale=iw*2:ih*2:flags=neighbor,pad=iw:ih+22:0:0:color=0x181425,drawtext=fontfile=${font}:text='${t.toFixed(2)} s':x=6:y=h-18:fontsize=14:fontcolor=0xc0cbdc[f${i}]`);
  const stack = `${times.map((_, i) => `[f${i}]`).join('')}xstack=inputs=${times.length}:layout=${times.map((_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = c ? Array.from({ length: c }, (_, k) => `w${k}`).join('+') : '0';
    const y = r ? Array.from({ length: r }, (_, k) => `h${k * cols}`).join('+') : '0';
    return `${x}_${y}`;
  }).join('|')}:fill=0x0b0d14[s]`;
  void rows;
  return ['-v', 'error', '-y', '-i', clip, '-filter_complex', `${sel.join(';')};${stack}`, '-map', '[s]', '-frames:v', '1', out];
}
