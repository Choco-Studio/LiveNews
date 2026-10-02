// Showcase recorder: A/V sync checks on the recorded stems (pure Node).
// - Stingers: the visual wipe starts at scene.stinger.start; the whoosh is
//   scheduled 50 ms later by the channel (sfx() starts at currentTime + 0.05),
//   so its onset in the WebAudio stem should sit ~+50 ms after the picture.
// - Captions: each caption appears when the engine starts a sentence
//   (onSentence); the voice for it must start shortly after (the engine waits
//   60 ms after a cancel, plus the speech start latency) - never before.
// - Voice onsets: the first word of each clip as heard in the voice stem vs.
//   the time the page fired 'start' (catches placement / resampling errors).

import fs from 'node:fs';

/** Float32 WAV (as written by mix.py) or interleaved .f32 -> mono Float32Array (|max| of channels). */
export function loadMono(path, channels = 2) {
  const buf = fs.readFileSync(path);
  let data = buf;
  let ch = channels;
  if (buf.toString('ascii', 0, 4) === 'RIFF') {
    ch = buf.readUInt16LE(22);
    let o = 12;
    while (o < buf.length - 8) {
      const id = buf.toString('ascii', o, o + 4);
      const size = buf.readUInt32LE(o + 4);
      if (id === 'data') {
        data = buf.subarray(o + 8, o + 8 + size);
        break;
      }
      o += 8 + size + (size % 2);
    }
  }
  const bytes = Math.floor(data.byteLength / 4) * 4;
  const f = new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + bytes));
  const n = Math.floor(f.length / ch);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let c = 0; c < ch; c++) m = Math.max(m, Math.abs(f[i * ch + c]));
    out[i] = m;
  }
  return out;
}

/** RMS envelope in dBFS, `win` seconds windows every `hop` seconds. */
export function envelope(x, sr, { win = 0.005, hop = 0.001 } = {}) {
  const w = Math.max(1, Math.round(win * sr));
  const h = Math.max(1, Math.round(hop * sr));
  const n = Math.floor((x.length - w) / h) + 1;
  const env = new Float32Array(Math.max(0, n));
  for (let k = 0; k < n; k++) {
    let s = 0;
    const o = k * h;
    for (let i = 0; i < w; i++) s += x[o + i] * x[o + i];
    env[k] = 10 * Math.log10(s / w + 1e-12);
  }
  return { env, hop: h / sr };
}

/** First onset in [from, to] s: level rises `rise` dB above the median of the 250 ms before `from` and above `floor` dBFS. */
export function onsetAfter(e, from, to, { rise = 12, floor = -50 } = {}) {
  const { env, hop } = e;
  const a = Math.max(0, Math.round((from - 0.25) / hop));
  const b = Math.max(a + 1, Math.round(from / hop));
  const base = [...env.slice(a, b)].sort((x, y) => x - y)[Math.floor((b - a) / 2)] ?? -120;
  const thr = Math.max(floor, base + rise);
  const k1 = Math.min(env.length, Math.round(to / hop));
  for (let k = Math.round(from / hop); k < k1; k++) if (env[k] > thr) return { t: k * hop, base, thr };
  return null;
}

/** Time of the steepest 10 ms level rise in [from, to] (a transient: the stinger's thump). */
export function steepestRise(e, from, to) {
  const { env, hop } = e;
  const d = Math.max(1, Math.round(0.01 / hop));
  let best = -Infinity;
  let at = null;
  for (let k = Math.max(0, Math.round(from / hop)); k + d < Math.min(env.length, Math.round(to / hop)); k++) {
    const rise = env[k + d] - env[k];
    if (rise > best) {
      best = rise;
      at = (k + d / 2) * hop;
    }
  }
  return at;
}

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);

export function syncReport({ events, speech, webaudio, voice, speechBus = null, clips = [], sr }) {
  const out = { stingers: [], captions: [], recordedCaptions: [], voiceOnsets: [] };
  if (webaudio) {
    const e = envelope(webaudio, sr);
    // The stinger is an air swell from the wipe's first frame into a felt thump
    // on the cut (the shot change at mid-wipe): check both against the picture.
    const shots = events.filter((x) => x.ev === 'shot');
    for (const s of events.filter((x) => x.ev === 'stinger' && x.at >= 0.3)) {
      const start = onsetAfter(e, s.at - 0.05, s.at + 0.4, { rise: 20, floor: -85 });
      const cut = shots.find((x) => (x.at ?? x.t) > s.at + 0.05 && (x.at ?? x.t) <= s.at + 0.9);
      const cutAt = cut ? cut.at ?? cut.t : null;
      const thump = cutAt != null ? steepestRise(e, cutAt - 0.15, cutAt + 0.25) : null;
      out.stingers.push({
        at: +s.at.toFixed(3),
        soundStartMs: start ? Math.round((start.t - s.at) * 1000) : null,
        cut: cutAt != null ? +cutAt.toFixed(3) : null,
        thumpVsCutMs: thump != null ? Math.round((thump - cutAt) * 1000) : null,
      });
    }
  }
  const subs = events.filter((x) => x.ev === 'subtitle' && x.text);
  for (const sub of subs) {
    const sp = speech.find((s) => s.called >= sub.t - 0.02 && s.called <= sub.t + 1.0 && s.clip);
    if (!sp) continue;
    const firstWord = sp.start + (sp.firstWord ?? 0);
    out.captions.push({ at: +sub.t.toFixed(3), voiceStart: +sp.start.toFixed(3), firstWord: +firstWord.toFixed(3), leadMs: Math.round((firstWord - sub.t) * 1000), text: sub.text.slice(0, 60) });
  }
  // Recorded voices played by the channel (speech bus stem): the caption must
  // appear as its sentence's first word is heard (onSentence fires then).
  if (speechBus && clips.length) {
    const e = envelope(speechBus, sr);
    for (const sub of subs) {
      if (!clips.some((c) => sub.t >= c.start - 0.2 && sub.t <= c.end)) continue;
      const o = onsetAfter(e, sub.t - 0.12, sub.t + 0.6, { rise: 15, floor: -50 });
      out.recordedCaptions.push({ at: +sub.t.toFixed(3), onsetMs: o ? Math.round((o.t - sub.t) * 1000) : null, text: sub.text.slice(0, 60) });
    }
  }
  if (voice) {
    const e = envelope(voice, sr);
    for (const sp of speech.filter((s) => s.clip && s.start > 0.3 && (s.cut == null || s.cut - s.start > 0.3))) {
      const o = onsetAfter(e, sp.start - 0.04, sp.start + 0.5, { rise: 15, floor: -45 });
      out.voiceOnsets.push({ start: +sp.start.toFixed(3), onsetMs: o ? Math.round((o.t - sp.start) * 1000) : null });
    }
  }
  const st = out.stingers.map((x) => x.thumpVsCutMs).filter((x) => x != null);
  const ss = out.stingers.map((x) => x.soundStartMs).filter((x) => x != null);
  const cap = out.captions.map((x) => x.leadMs);
  const rc = out.recordedCaptions.map((x) => x.onsetMs).filter((x) => x != null);
  const vo = out.voiceOnsets.map((x) => x.onsetMs).filter((x) => x != null);
  out.summary = {
    stingerSoundStartMs: { n: ss.length, median: median(ss), min: ss.length ? Math.min(...ss) : null, max: ss.length ? Math.max(...ss) : null },
    stingerThumpVsCutMs: { n: st.length, median: median(st), min: st.length ? Math.min(...st) : null, max: st.length ? Math.max(...st) : null },
    captionLeadMs: { n: cap.length, median: median(cap), min: cap.length ? Math.min(...cap) : null, max: cap.length ? Math.max(...cap) : null },
    recordedCaptionToVoiceMs: { n: rc.length, of: out.recordedCaptions.length, median: median(rc), min: rc.length ? Math.min(...rc) : null, max: rc.length ? Math.max(...rc) : null },
    voiceOnsetMs: { n: vo.length, median: median(vo), min: vo.length ? Math.min(...vo) : null, max: vo.length ? Math.max(...vo) : null },
  };
  return out;
}

/** RMS level in dBFS every `hop` seconds (for the audio picture). */
export function levels(x, sr, hop = 0.05) {
  const h = Math.max(1, Math.round(hop * sr));
  const out = [];
  for (let o = 0; o + h <= x.length; o += h) {
    let s = 0;
    for (let i = 0; i < h; i++) s += x[o + i] * x[o + i];
    out.push(Math.round(10 * Math.log10(s / h + 1e-12) * 10) / 10);
  }
  return out;
}
