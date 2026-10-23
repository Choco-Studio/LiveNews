// The packaging desk of the clip factory and the programme uploads (docs/publishing/thumbnails-titles.md): the words
// (server/publish/packaging.js: the AI writer through the provider chain, the deterministic writer behind it) and the
// pictures (public/js/clip/cover.js, drawn by the channel's own code in the headless page public/lab/thumb.html, at
// the channel's size, scaled 5x by nearest neighbour: 1080x1920 covers, 1920x1080 thumbnails).
//
//   packagingChain({ env, log })                       the chain of AI writers (never the offline mock), or null
//   pickFrames(report, window, fmt, kind)              the clip's frames a cover may show: { presenter, board } times
//   grabFrame(master, t, out)                          one frame of a master at 1x (PNG)
//   renderCovers({ page, fmt, pkg, facts, frames, picture, programme, theme, kicker, presenter, emotion, out, name })
//                                                      -> [png paths]
//   coverCast(episode, moment)                         who presents the clip and how: { presenter, emotion }
//   pictureOf(episode, storyIds, pictureDir, audit)    the story's cleared picture for a cover, or null
import fs from 'node:fs';
import path from 'node:path';
import { run } from './lib.mjs';
// (clip/cover.js VARIANTS: the page draws them; this desk only names them)
const VARIANTS = ['photo', 'presenter', 'words'];

/** The AI writers of the configured chain (the owner's key and PROVIDERS), or null when there is none. */
export async function packagingChain({ log = console } = {}) {
  try {
    const { config } = await import('../../server/config.js');
    const { createProviders, ProviderChain } = await import('../../server/providers/index.js');
    const { aiWriters } = await import('../../server/publish/newsday.js');
    const writers = aiWriters(createProviders(config));
    return writers.length ? new ProviderChain(writers, { record() {} }, { log }) : null;
  } catch (err) {
    log.warn?.(`[package] no AI writer (${err.message})`);
    return null;
  }
}

const PRESENTER_SHOTS = new Set(['close', 'wide', 'two', 'location', 'single']);
// (a cover's picture is one readable subject: a face, a map, the story's picture. Never a board, whose lines of type
// are unreadable at phone size and fight the cover's own words; never the open's montage or a tease, whose frames
// carry the headlines as aired)
const BOARD_SHOTS = new Set(['map', 'full']);

/**
 * The clip's own frames a cover may show, in seconds of the master: the presenter (a studio shot, just before a
 * sentence starts, so the mouth is at rest and nothing is mid-gesture), and a board, a map or the picture (a second
 * into the first such shot: a quiz's question board, never its answer). null where the clip has none.
 */
export function pickFrames(report, window) {
  const shots = (report?.events || []).filter((e) => e.type === 'shot' && Number.isFinite(e.v)).sort((a, b) => a.v - b.v);
  const sentences = (report?.events || []).filter((e) => (e.type === 'sentence' || e.type === 'speak') && Number.isFinite(e.v)).map((e) => e.v).sort((a, b) => a - b);
  const a = window.start;
  const b = window.end ?? window.start + (window.duration || 0);
  const spans = shots.map((s, i) => ({ shot: s.shot, from: s.v, to: shots[i + 1]?.v ?? Infinity })).filter((s) => s.to > a + 0.3 && s.from < b - 0.3);
  const inside = (s) => ({ from: Math.max(s.from, a), to: Math.min(s.to, b) });
  // (the first two studio shots: a quiz's two players, a presenter and a guest, so A and B can show two people)
  const people = [];
  for (const s of spans.filter((x) => PRESENTER_SHOTS.has(x.shot))) {
    const r = inside(s);
    if (r.to - r.from < 0.6) continue;
    const rest = sentences.find((v) => v - 0.12 >= r.from + 0.25 && v - 0.12 <= r.to - 0.1);
    people.push(+(rest !== undefined ? rest - 0.12 : r.from + Math.min(0.5, (r.to - r.from) / 2)).toFixed(3));
    if (people.length === 2) break;
  }
  // (a clip with no one on screen, a weather board: the programme's presenter from the studio shot nearest the clip,
  // the same person who presents it, so the cover still has a face)
  if (!people.length) {
    const near = shots
      .map((s, i) => ({ shot: s.shot, from: s.v, to: shots[i + 1]?.v ?? s.v + 2 }))
      .filter((s) => PRESENTER_SHOTS.has(s.shot) && s.to - s.from >= 1.2)
      .sort((x, y) => Math.min(Math.abs(x.from - b), Math.abs(x.to - a)) - Math.min(Math.abs(y.from - b), Math.abs(y.to - a)))[0];
    if (near) people.push(+(near.from + Math.min(0.8, (near.to - near.from) / 2)).toFixed(3));
  }
  const [presenter = null, presenter2 = null] = people;
  let board = null;
  for (const s of spans.filter((x) => BOARD_SHOTS.has(x.shot))) {
    const r = inside(s);
    if (r.to - r.from < 0.8) continue;
    board = +Math.min(r.from + 1.0, r.to - 0.2).toFixed(3);
    break;
  }
  return { presenter, presenter2, board };
}

let CHANNEL = null;
const EMOTION_OF = { happy: 'happy', surprised: 'surprised', serious: 'serious', sad: 'serious', thinking: 'thinking' };
/**
 * Who stands on a clip's covers (clip/sprite.js: the cast's own drawing, cut out): the anchor of the clip's first
 * segment, else the programme's first presenter (config/channel.json); and how they look: the segment's own emotion
 * as the writer marked it (a lighter story happy, a serious one serious), never a smile on grave news.
 */
export function coverCast(episode = {}, moment = null) {
  const seg = moment && Number.isInteger(moment.from) ? episode.segments?.[moment.from] : episode.segments?.find((x) => x.anchor);
  let presenter = (seg?.anchor && episode.cast?.[seg.anchor]) || episode.cast?.A || null;
  if (!presenter) {
    try {
      CHANNEL ||= JSON.parse(fs.readFileSync(new URL('../../config/channel.json', import.meta.url), 'utf8'));
      const id = episode.program?.id;
      const prog = CHANNEL.programs?.[id] || CHANNEL.drafts?.[id];
      presenter = prog?.presenters?.[0] || prog?.cast?.[0] || null;
    } catch { /* no channel file: the clip's own frame */ }
  }
  const grave = moment ? !!moment.grave : false;
  // the other presenter of a duo stands on C, so the three covers are three different pictures
  const partner = Object.values(episode.cast || {}).find((id) => typeof id === 'string' && id !== presenter) || null;
  return { presenter, partner, emotion: grave ? 'serious' : EMOTION_OF[seg?.emotion] || 'neutral' };
}

/** One frame of a master (1x, lossless) as a PNG. */
export async function grabFrame(master, t, out) {
  await run('ffmpeg', ['-v', 'error', '-y', '-ss', Math.max(0, t).toFixed(3), '-i', master, '-frames:v', '1', out], { quiet: true });
  return out;
}

const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;

/**
 * The story's picture for a cover: shown in the clip, cleared for publication (its rights record), served by the
 * playback server from `pictureDir` (/api/img/<story id>). null when there is none.
 */
export function pictureOf(episode, storyIds = [], pictureDir = null) {
  // one story's picture for one story's clip: a clip of several stories (the headlines, four stories in 45 seconds) has
  // no one picture that its words are about, so its covers show its own frames
  if (!pictureDir || storyIds.length !== 1) return null;
  for (const id of storyIds) {
    const r = (episode.rundown || []).find((x) => x.storyId === id && x.hasImage);
    if (!r || r.imageRights?.cleared !== true) continue;
    if (!['.jpg', '.png', '.webp'].some((e) => fs.existsSync(path.join(pictureDir, `${id}${e}`)))) continue;
    return { url: `/api/img/${id}`, credit: r.imageCredit || r.imageRights?.credit || '', focus: Number.isFinite(r.imageFocus) ? r.imageFocus : null, fit: r.imageFit || null, storyId: id };
  }
  return null;
}

/**
 * The three covers (vertical) or thumbnails (horizontal) of a clip or a programme, one per variant, each with its
 * thumbnail text (pkg.thumbs[i]): PNGs at 5x in `out`. `frames`: { presenter, board } each { file, rect } (rect: the
 * part of the frame no caption covers: the vertical picture's stage). A variant with nothing of its own to show (no
 * picture for A, no presenter for B) shows what the clip has (A the board, B the picture), so three always come out.
 */
export async function renderCovers({ page, fmt, pkg, frames = {}, picture = null, pictureOnlyA = false, programme, theme, kicker = '', grave = false, presenter = null, partner = null, emotion = 'neutral', out, name }) {
  fs.mkdirSync(out, { recursive: true });
  const files = [];
  for (const [i, variant] of VARIANTS.entries()) {
    const words = pkg.thumbs[i] || pkg.thumbs[0] || '';
    // A shows the story's picture, else the clip's board, else its presenter; B the presenter as the clip shows them,
    // else the programme's own card (never the same picture as A); C the picture, else the presenter, else the board
    // (A without a picture or a map: the second person on screen, else the first, and then B is the programme's card)
    const aFrame = frames.board || frames.presenter2 || frames.presenter || null;
    const frame = variant === 'photo' ? aFrame : variant === 'presenter' ? (frames.presenter && (picture || aFrame !== frames.presenter) ? frames.presenter : null) : frames.presenter || frames.board;
    // (a whole programme's picture is its lead story's: only A's words are about the lead, so only A shows it)
    const photo = variant === 'presenter' || (pictureOnlyA && variant !== 'photo') ? null : picture?.url || null;
    // (the presenter's cut-out stands on B, and on C when there is no picture: the cast's drawing, not a frame)
    const spec = { format: fmt, variant, programme, theme, words, kicker, grave, presenter: variant === 'words' ? partner || presenter : presenter, emotion: grave ? 'serious' : emotion, photo, photoFocus: picture?.focus ?? undefined, photoFit: picture?.fit || undefined, credit: picture?.credit || '', frame: frame ? dataUrl(frame.file) : null, frameRect: frame?.rect || null };
    const url = await page.evaluate((s) => window.__thumbLab.cover(s), spec);
    const small = path.join(out, `${name}.${variant}.1x.png`);
    fs.writeFileSync(small, Buffer.from(url.split(',')[1], 'base64'));
    const big = path.join(out, `${name}.${fmt === 'vertical' ? 'cover' : 'thumb'}-${'abc'[i]}.png`);
    await run('ffmpeg', ['-v', 'error', '-y', '-i', small, '-vf', 'scale=iw*5:ih*5:flags=neighbor', big], { quiet: true });
    fs.rmSync(small, { force: true });
    files.push(big);
  }
  return files;
}
