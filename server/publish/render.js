// From a moment to the files of a clip (docs/publishing/clips.md §4): the cut's exact window on the master
// recording, the ffmpeg graph that cuts it, lays the hook title over it, adds the end card and scales the whole by
// nearest neighbour to the network's size, the caption file, the contact sheet. Pure functions: tools/publish/factory.mjs
// runs them.
//
//   clipWindow(moment, timeline, { fps, wipeIn }) -> { start, end, duration, snappedStart, snappedEnd, hold }
//   composeArgs({ master, hook, endcard, window, format, out, hookSeconds }) -> ffmpeg argv
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
 * TAIL after the last word, or one frame before the next cut when that comes within 1.2 s. Both on whole frames.
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
  if (before !== null && before >= moment.start - 1.5 && before <= moment.start + 0.05) {
    start = firstFrameAfter(before);
    snappedStart = true;
  } else if (!moment.trimmed && Number.isFinite(seg?.spokeAt) && seg.spokeAt >= moment.start - 1.5 && seg.spokeAt <= moment.start) {
    start = Math.max(start, firstFrameAfter(seg.spokeAt));
    snappedStart = true;
    if (wipeIn > 0) wiped = firstFrameAfter(seg.spokeAt + wipeIn);
  }
  // never after the first word
  start = Math.min(start, moment.start - 0.04);
  let end = moment.end + tail;
  let snappedEnd = false;
  const after = cutsAround(timeline, moment.end).after;
  if (after !== null && after > moment.end + 0.1 && after <= moment.end + 1.2) {
    end = after - 1 / fps;
    snappedEnd = true;
  }
  start = Math.max(0, frame(start, fps));
  end = frame(end, fps);
  const hold = wiped !== null && wiped > start && wiped < end ? frame(wiped - start, fps) : 0;
  return { start, end, duration: +(end - start).toFixed(3), snappedStart, snappedEnd, hold };
}

/**
 * The ffmpeg graph of one clip: [master window] + hook overlay (vertical: the whole clip; horizontal: its first
 * `hookSeconds`) + the end card (its own picture and sound) -> nearest-neighbour 5x -> H.264 (High, yuv420p, CRF 18,
 * a keyframe a second) + AAC 160k, faststart. The sound fades in over 0.12 s and out over the last 0.35 s of the cut.
 * A window with a `hold` shows its frame at `hold` from the start until then (the sound runs on underneath).
 */
export function composeArgs({ master, hook, endcard, window, format, out, hookSeconds = 4, crf = 18 }) {
  const D = window.duration;
  const enable = format === 'vertical' ? '' : `:enable='lt(t,${hookSeconds})'`;
  const hold = window.hold > 0 ? `,trim=start=${window.hold.toFixed(3)},setpts=PTS-STARTPTS,tpad=start_duration=${window.hold.toFixed(3)}:start_mode=clone` : '';
  const graph = [
    `[0:v]setpts=PTS-STARTPTS,fps=${FPS}${hold}[c]`,
    hook ? `[c][1:v]overlay=0:0${enable}:eof_action=repeat[o]` : '[c]null[o]',
    `[0:a]asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:st=0:d=0.12,afade=t=out:st=${Math.max(0, D - 0.35).toFixed(3)}:d=0.35[a]`,
    endcard ? `[${hook ? 2 : 1}:v]fps=${FPS},setsar=1[ev];[${hook ? 2 : 1}:a]aresample=48000[ea];[o][a][ev][ea]concat=n=2:v=1:a=1[v][aa]` : '[o]null[v];[a]anull[aa]',
    `[v]scale=iw*${SCALE}:ih*${SCALE}:flags=neighbor,setsar=1,format=yuv420p[vv]`,
  ].join(';');
  const args = ['-v', 'error', '-y', '-ss', window.start.toFixed(3), '-t', D.toFixed(3), '-i', master];
  if (hook) args.push('-loop', '1', '-t', D.toFixed(3), '-i', hook);
  if (endcard) args.push('-i', endcard);
  args.push('-filter_complex', graph, '-map', '[vv]', '-map', '[aa]', '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', String(crf), '-g', String(FPS), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', out);
  return args;
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

export function srtFor(timeline, window) {
  return cuesFor(timeline, window).map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}

export function vttFor(timeline, window) {
  return `WEBVTT\n\n${cuesFor(timeline, window).map((c) => `${srtTime(c.start, '.')} --> ${srtTime(c.end, '.')}\n${c.text}\n`).join('\n')}`;
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
