// The beta's news programmes, written by the AI writer (docs/publishing/beta.md, pipeline.md §8).
//
// The beta's remake of the archive (tools/publish/material.mjs) writes with the offline writer, whose items the gate never
// publishes (`offline-writer`, verbatim.md §7). When the provider chain has an AI writer (the owner's key: PROVIDERS,
// ANTHROPIC_API_KEY and ANTHROPIC_MODEL in /etc/globit24.env), the day's news programmes are made fresh instead, from the live feeds, through
// the channel's own producer: the write, the own-words check and its rewrites, the standards editor, the fit, the
// voices (as tools/writer/try.mjs makes them, plus the voices). Each story it tells is recorded, with the article the
// desk read, in a data folder of the beta's own (`<sources>/archive`, `<sources>/compliance/articles`): the factory
// measures the clips against it (`--sources`), the posts take their stories and their aired lines from it, and the
// station's own archive (what it aired) is never written.
//
// Lean for a two-core server: only the programmes asked (BETA_NEWS, Phase 1's light news by default), one edition each
// unless asked; no footage.
//
// Pictures, as on air (docs/pictures/RIGHTS.md): with `pictures` ({ desk, images, dir, budgetMs }), the rights desk
// (server/picturedesk.js) decides each candidate's cleared picture within the budget, from what it already keeps (the
// beta's own store, seeded from the station's data/pictures/answers.json: seedPictureAnswers) and Wikimedia, paced; the
// producer puts each picture's rights record and credit on the episode, as on air (the factory, the gate and the
// vertical credit read them there); the picture files go to `dir` (<storyId>.<ext>) for the recorder
// (factory.mjs --pictures). Never an outlet's own photo: only PICTURE_RIGHTS=preview shows one, and the factory never
// queues anything of a preview. Without `pictures`, the stories show their maps and boards.
//
//   aiWriters(providers)                          the providers that write in the channel's own words (not the offline mock)
//   newsProgrammes(channel, wanted)               the asked programmes the AI writes -> { ids, skipped }
//   makeNewsDay({ desk, chain, channel, programmes, editions, sourcesDir, outDir, config, voice, pictures, log, now })
//       -> { episodes: [{ programId, n, file, provider, offline, ms, error, stories, pictured }], sourcesDir }
//   seedPictureAnswers(fromDir, toDir)            the station's kept picture decisions merged into the beta's store
//   writePictures(episode, { desk, images, dir }) the cleared pictures an episode shows, as files -> how many
//   pictureDay({ desk, producer, channel, programmes, pictureDesk, budgetMs })   the day's candidates decided, nothing
//       written (beta.mjs fotos): -> [{ programId, candidates, pictured, stories: [{ id, title, credit }] }]
import fs from 'node:fs';
import path from 'node:path';
import { Producer } from '../producer.js';
import { Archive } from '../archive.js';
import { ArticleCache } from '../articlecache.js';
import { currentRights } from '../rights.js';

/** How long the day waits for picture decisions, a programme's candidates and again its stories (paced Wikimedia). */
export const PICTURE_BUDGET_MS = 120_000;
// The published programmes read their sources more fully than the live station (owner, 25 Oct: "mejores
// investigaciones para explicar bien las noticias"): every candidate's page given time to be read (the station's
// 6 s served 3 of WORLD NOW's 11 stories), and more of each page kept and shown to the writer and its editor.
export const RESEARCH = { articleBudgetMs: 90_000, articleTextMax: 4000 };
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/**
 * The station's kept picture decisions (its data/pictures/answers.json, decided ahead of air) merged into the beta's own
 * store: the later lifetime of each answer wins. The station's file is only read: two processes never write one file.
 * -> how many answers the beta's store holds
 */
export function seedPictureAnswers(fromDir, toDir, { now = Date.now() } = {}) {
  const read = (dir) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, 'answers.json'), 'utf8'))?.answers || {};
    } catch {
      return {};
    }
  };
  const mine = read(toDir);
  for (const [k, e] of Object.entries(fromDir ? read(fromDir) : {})) if (Array.isArray(e) && e[0] > now && !(mine[k]?.[0] > e[0])) mine[k] = e;
  for (const [k, e] of Object.entries(mine)) if (!Array.isArray(e) || e[0] <= now) delete mine[k];
  fs.mkdirSync(toDir, { recursive: true });
  const file = path.join(toDir, 'answers.json');
  fs.writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify({ v: 1, answers: mine }));
  fs.renameSync(`${file}.${process.pid}.tmp`, file);
  return Object.keys(mine).length;
}

/**
 * The cleared pictures an episode shows (its segments and its rundown with `hasImage`), as the files the recorder serves
 * (`<dir>/<storyId>.<ext>`), from the image cache the producer verified them through. -> how many stories
 */
export async function writePictures(episode, { desk, images, dir }) {
  const ids = new Set([...(episode?.segments || []), ...(episode?.rundown || [])].filter((x) => x?.hasImage && x.storyId).map((x) => x.storyId));
  let n = 0;
  for (const id of ids) {
    const s = desk.get?.(id);
    if (!s?.image || !currentRights(s)?.cleared) continue; // (only a cleared picture: never an outlet's own photo)
    const entry = await images.get(id, s.images || [s.image]);
    const ext = EXT[String(entry?.type || '').toLowerCase()];
    if (!entry?.body || !ext) continue;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}${ext}`), entry.body);
    n++;
  }
  return n;
}

/** The day's candidates of each programme, decided and applied (nothing written, nothing produced): beta.mjs fotos. */
export async function pictureDay({ producer, channel, programmes = BETA_NEWS, pictureDesk, budgetMs = PICTURE_BUDGET_MS }) {
  const { ids } = newsProgrammes(channel, programmes);
  const out = [];
  for (const id of ids) {
    const program = { id, ...channel.programs[id] };
    let cands = [];
    try {
      cands = producer.select(program, { upcoming: [] }).slice(0, Math.ceil((program.stories || 8) * 1.5));
    } catch {
      /* a programme that cannot select now (FULL TIME on a day without results) */
    }
    if (cands.length) await pictureDesk.decide(cands, { budgetMs });
    const stories = cands.map((s) => {
      pictureDesk.apply(s);
      const r = currentRights(s);
      return { id: s.id, title: s.title, credit: r?.cleared ? r.credit : null };
    });
    out.push({ programId: id, candidates: cands.length, pictured: stories.filter((x) => x.credit).length, stories });
  }
  return out;
}

/** Phase 1's light news programmes (plan.md §2): FULL TIME only when the day has results (else no edition is made). */
export const BETA_NEWS = Object.freeze(['cosmos', 'tech-bytes', 'full-time']);

/** Is a command on the PATH (the Codex CLI provider says it is available and only finds out when it spawns)? */
export function onPath(cmd, env = process.env) {
  return String(env.PATH || '').split(path.delimiter).filter(Boolean).some((dir) => {
    try {
      return fs.statSync(path.join(dir, cmd)).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * The providers that write in the channel's own words: every available one but the offline mock (`reviews: false`),
 * and the Codex CLI only when it is installed (it reports itself available and fails when it spawns).
 */
export const aiWriters = (providers = [], { env = process.env } = {}) => providers.filter((p) => p && p.reviews !== false && p.available() && (p.name !== 'codex' || onPath('codex', env)));

/** The asked programmes the AI writes (news and sport; the quiz, the weather and the weekly are written by rule). */
export function newsProgrammes(channel, wanted = BETA_NEWS) {
  const ids = [];
  const skipped = [];
  for (const id of wanted) {
    const p = channel?.programs?.[id];
    if (p && (!p.kind || p.kind === 'sport')) ids.push(id);
    else skipped.push(id);
  }
  return { ids, skipped };
}

/**
 * The day's news programmes through the producer with the given chain (its AI writer first, the offline writer behind
 * it). An episode the AI did not write (the chain fell back to the offline writer: no answer, the quota, the network)
 * is reported `offline`: the gate holds all of it. With `pictures`, each story its cleared picture (above); without, its
 * map or board. Writes each episode to `outDir`, each told story with its article to `sourcesDir`, the pictures to
 * `pictures.dir`.
 */
export async function makeNewsDay({ desk, chain, channel, programmes = BETA_NEWS, editions = 1, sourcesDir, outDir, config = {}, voice = null, pictures = null, log = { info() {}, warn() {}, error() {} }, now = () => Date.now() } = {}) {
  if (!desk || !chain || !channel || !sourcesDir || !outDir) throw new Error('makeNewsDay needs the desk, the chain, the channel and its folders');
  fs.mkdirSync(outDir, { recursive: true });
  if (!pictures?.desk) {
    // no picture desk: maps and boards (an outlet's own photo never airs in a clip)
    desk.findPictures = async () => ({});
    for (const s of desk.stories?.values?.() || []) {
      s.image = null;
      delete s.images;
    }
  }
  const articles = new ArticleCache({ dir: path.join(sourcesDir, 'compliance', 'articles'), log });
  const archive = new Archive({ dir: path.join(sourcesDir, 'archive'), articles, now, log });
  // (the producer's own state, the quiz desk's history among it, in the beta's folder: the station's data is not touched)
  // the rights desk decides within the budget at production (no ahead queue in a one-off run), the image cache verifies
  // each picture before it is used
  const budget = pictures?.budgetMs ?? PICTURE_BUDGET_MS;
  const producer = new Producer({
    config: { ...config, ...RESEARCH, dataDir: path.join(sourcesDir, 'state'), pictureBudgetMs: pictures?.desk ? budget : 0, pictureVerifyMs: pictures?.desk ? Math.min(budget, 60_000) : 0, pictures: { ...(config.pictures || {}), rights: pictures?.desk?.mode || config.pictures?.rights || 'cleared' } },
    newsDesk: desk,
    chain,
    voice,
    archive,
    log,
    ...(pictures?.desk ? { pictureDesk: pictures.desk, images: pictures.images || null } : {}),
  });
  const { ids } = newsProgrammes(channel, programmes);
  const episodes = [];
  for (const programId of ids) {
    for (let n = 1; n <= Math.max(1, editions); n++) {
      chain.cooldownUntil?.clear?.();
      const t0 = Date.now();
      let ep = null;
      let error = null;
      try {
        ep = await producer.produce(channel, programId, { upcoming: [] });
      } catch (err) {
        error = String(err?.message || err);
      }
      const ms = Date.now() - t0;
      if (!ep) {
        episodes.push({ programId, n, file: null, provider: null, offline: false, ms, error: error || 'no edition (too few fresh stories, or none told in our own words)', stories: 0 });
        continue;
      }
      ep.airedAt = new Date(now()).toISOString();
      const file = path.join(outDir, `${ep.airedAt.slice(0, 16).replace(/:/g, '')}-${programId}${editions > 1 ? `-${n}` : ''}.json`);
      fs.writeFileSync(file, JSON.stringify(ep, null, 1));
      const offline = String(ep.provider || '').toLowerCase() === 'mock';
      const pictured = pictures?.desk && pictures.images && pictures.dir ? await writePictures(ep, { desk, images: pictures.images, dir: pictures.dir }) : 0;
      episodes.push({ programId, n, file, provider: ep.provider || null, offline, ms, error: null, stories: (ep.storyIds || []).length, pictured });
    }
  }
  pictures?.desk?.kept?.save?.({ force: true });
  return { episodes, sourcesDir };
}
