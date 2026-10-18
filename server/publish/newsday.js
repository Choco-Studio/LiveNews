// The beta's news programmes, written by the AI writer (docs/publishing/beta.md, pipeline.md §8).
//
// The beta's remake of the archive (tools/publish/material.mjs) writes with the offline writer, whose items the gate never
// publishes (`offline-writer`, verbatim.md §7). When the provider chain has an AI writer (the owner's key: PROVIDERS and
// OPENAI_API_KEY in /etc/globit24.env), the day's news programmes are made fresh instead, from the live feeds, through
// the channel's own producer: the write, the own-words check and its rewrites, the standards editor, the fit, the
// voices (as tools/writer/try.mjs makes them, plus the voices). Each story it tells is recorded, with the article the
// desk read, in a data folder of the beta's own (`<sources>/archive`, `<sources>/compliance/articles`): the factory
// measures the clips against it (`--sources`), the posts take their stories and their aired lines from it, and the
// station's own archive (what it aired) is never written.
//
// Lean for a two-core server: only the programmes asked (BETA_NEWS, Phase 1's light news by default), one edition each
// unless asked; no pictures (the stories show their maps and boards, as in the remake), no footage.
//
//   aiWriters(providers)                          the providers that write in the channel's own words (not the offline mock)
//   newsProgrammes(channel, wanted)               the asked programmes the AI writes -> { ids, skipped }
//   makeNewsDay({ desk, chain, channel, programmes, editions, sourcesDir, outDir, config, voice, log, now })
//       -> { episodes: [{ programId, n, file, provider, offline, ms, error, stories }], sourcesDir }
import fs from 'node:fs';
import path from 'node:path';
import { Producer } from '../producer.js';
import { Archive } from '../archive.js';
import { ArticleCache } from '../articlecache.js';

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
 * is reported `offline`: the gate holds all of it. Pictures are off (the desk's pictures are not offered): the stories
 * show their maps and boards. Writes each episode to `outDir` and each told story, with its article, to `sourcesDir`.
 */
export async function makeNewsDay({ desk, chain, channel, programmes = BETA_NEWS, editions = 1, sourcesDir, outDir, config = {}, voice = null, log = { info() {}, warn() {}, error() {} }, now = () => Date.now() } = {}) {
  if (!desk || !chain || !channel || !sourcesDir || !outDir) throw new Error('makeNewsDay needs the desk, the chain, the channel and its folders');
  fs.mkdirSync(outDir, { recursive: true });
  // no pictures in the beta's clips yet (a picture needs its cleared record and the recorder its file): maps and boards
  desk.findPictures = async () => ({});
  for (const s of desk.stories?.values?.() || []) {
    s.image = null;
    delete s.images;
  }
  const articles = new ArticleCache({ dir: path.join(sourcesDir, 'compliance', 'articles'), log });
  const archive = new Archive({ dir: path.join(sourcesDir, 'archive'), articles, now, log });
  // (the producer's own state, the quiz desk's history among it, in the beta's folder: the station's data is not touched)
  const producer = new Producer({ config: { ...config, dataDir: path.join(sourcesDir, 'state'), pictureBudgetMs: 0 }, newsDesk: desk, chain, voice, archive, log });
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
      episodes.push({ programId, n, file, provider: ep.provider || null, offline, ms, error: null, stories: (ep.storyIds || []).length });
    }
  }
  return { episodes, sourcesDir };
}
