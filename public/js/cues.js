// Stage directions. The script writer embeds cues in the spoken text, e.g.
//   "Good evening [wave] and welcome. [point_screen] Look at these pictures. [B:nod]"
// "[action]" is performed by the presenter speaking, "[B:action]" by another
// slot (a co-presenter reacting), and an emotion name changes the expression.
// Shared by the server (validation) and the browser (playback): no DOM here.

export const ACTIONS = {
  wave: { dur: 1.6, kind: 'arm', light: true, desc: 'wave hello or goodbye' },
  raise_hand: { dur: 1.2, kind: 'arm', desc: 'raise an open hand to make a point' },
  point_screen: { dur: 1.6, kind: 'arm', desc: 'point at the picture on the screen' },
  point_camera: { dur: 1.2, kind: 'arm', desc: 'point at the viewer' },
  point_partner: { dur: 1.2, kind: 'arm', desc: 'gesture towards the co-presenter' },
  thumbs_up: { dur: 1.2, kind: 'arm', light: true, desc: 'thumbs up, approval' },
  shrug: { dur: 1.2, kind: 'both', desc: 'shrug, uncertainty' },
  count: { dur: 2.0, kind: 'arm', desc: 'count on fingers while listing things' },
  steeple: { dur: 2.0, kind: 'both', desc: 'fingertips together, thoughtful or serious' },
  chin: { dur: 2.0, kind: 'arm', desc: 'hand on chin, thinking' },
  wow: { dur: 1.2, kind: 'both', light: true, desc: 'both hands up in amazement' },
  fist_pump: { dur: 1.0, kind: 'arm', light: true, desc: 'celebrate good news' },
  facepalm: { dur: 1.4, kind: 'arm', light: true, desc: 'facepalm, light comedy only' },
  laugh: { dur: 1.4, kind: 'head', light: true, desc: 'laugh' },
  nod: { dur: 1.0, kind: 'head', desc: 'nod in agreement' },
  shake_head: { dur: 1.0, kind: 'head', desc: 'shake head, disbelief or no' },
  lean_in: { dur: 1.8, kind: 'head', desc: 'lean towards the camera for emphasis' },
  look_partner: { dur: 1.5, kind: 'head', desc: 'turn to look at the co-presenter' },
  papers: { dur: 1.2, kind: 'both', desc: 'tidy the papers on the desk, moving on' },
  glasses: { dur: 1.2, kind: 'arm', desc: 'adjust glasses' },
};

export const EMOTIONS = ['neutral', 'happy', 'serious', 'surprised', 'sad', 'thinking'];

const CUE_RE = /\[\s*(?:([AB])\s*:\s*)?([a-z_]+)\s*\]/gi;

/**
 * Strip cues from `text`. Returns the clean text and the cues with the
 * character offset (in the clean text) where each one happens.
 */
export function parseCues(text, { grave = false, maxCues = 4 } = {}) {
  const cues = [];
  let clean = '';
  let last = 0;
  for (const m of String(text).matchAll(CUE_RE)) {
    clean += text.slice(last, m.index);
    last = m.index + m[0].length;
    const name = m[2].toLowerCase();
    const slot = m[1] ? m[1].toUpperCase() : null;
    const isAction = name in ACTIONS;
    const isEmotion = EMOTIONS.includes(name);
    if (!isAction && !isEmotion) continue;
    if (isAction && grave && ACTIONS[name].light) continue; // no jokes on grave stories
    if (cues.length >= maxCues) continue;
    cues.push({ char: clean.length, slot, ...(isAction ? { action: name } : { emotion: name }) });
  }
  clean += String(text).slice(last);
  // Tidy spacing left behind by removed cues and re-anchor offsets.
  const out = [];
  let tidy = '';
  let ci = 0;
  for (let i = 0; i <= clean.length; i++) {
    while (ci < cues.length && cues[ci].char === i) out.push({ ...cues[ci++], char: tidy.trimStart().length });
    if (i === clean.length) break;
    const c = clean[i];
    if (/\s/.test(c) && (/\s$/.test(tidy) || tidy === '' || /^[\s.,!?;:]/.test(clean.slice(i + 1, i + 2)))) continue;
    tidy += c;
  }
  const final = tidy.trim();
  return { text: final, cues: out.map((c) => ({ ...c, char: Math.min(c.char, final.length) })) };
}

const WORD = /[\p{L}\p{M}\p{N}_]/u;
const JOINER = /['’\-]/; // don't, well-known: one word

/** True when offset `at` falls between two characters of the same word. */
function insideWord(s, at) {
  const a = s[at - 1];
  const b = s[at];
  if (WORD.test(a) && WORD.test(b)) return true;
  if (JOINER.test(b) && WORD.test(a) && WORD.test(s[at + 1] || '')) return true;
  if (JOINER.test(a) && WORD.test(b) && WORD.test(s[at - 2] || '')) return true;
  return false;
}

/**
 * Inverse of parseCues: put cues back into the text as bracket tags. Cues at the
 * same offset keep their order (they fire in that order), and an offset inside a
 * word moves to the end of that word, so a round trip never splits a word.
 */
export function embedCues(text, cues = []) {
  const src = String(text);
  const groups = new Map(); // offset -> tags in their original order
  for (const c of cues) {
    if (!c || !(c.action || c.emotion)) continue;
    let at = Math.max(0, Math.min(src.length, Math.round(Number(c.char)) || 0));
    while (at > 0 && at < src.length && insideWord(src, at)) at++;
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push(`[${c.slot ? `${c.slot}:` : ''}${c.action || c.emotion}]`);
  }
  let out = src;
  for (const at of [...groups.keys()].sort((a, b) => b - a)) {
    out = `${out.slice(0, at)} ${groups.get(at).join(' ')} ${out.slice(at)}`;
  }
  return out.replace(/\s+/g, ' ').replace(/\] ([,.;:!?])/g, ']$1').trim();
}

/** Names and descriptions for the writer prompt. */
export function describeActions() {
  return Object.entries(ACTIONS)
    .map(([name, a]) => `${name} (${a.desc})`)
    .join(', ');
}
