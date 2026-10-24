#!/usr/bin/env node
// The channel's day without a live stream (the owner, 19 Oct: "si no vamos a hacer directos haz que se vayan haciendo
// programas que se van a publicar ... 5 vídeos al día de distintos programas y varios shorts o reels"): only what will
// be published is made. Each run makes ONE programme, the next in turn of --programmes (the type made least recently),
// fresh from the live feeds through the channel's producer with the AI writer and its voices (server/publish/newsday.js,
// as the beta makes its news), records it, and queues its whole programme (YouTube) and its best clips (YouTube Shorts,
// TikTok); then the publisher's round. Run it on a timer, five times a day.
//
//   node tools/publish/daily.mjs [--programmes world-now,tech-bytes,cosmos,money-minute,full-time] [--clips 3]
//        [--work data/publish/daily] [--no-publish] [--fotos no]
//
// A programme with too little fresh news, or one the AI did not write (the offline writer copies: never published), is
// passed over for the next in turn (three tries a run). What goes out and when is the queue's settings and the five
// switches (setup.md §7): in a dry run it makes the pieces and sends nothing. At low priority (nice 10).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root, argsOf, run } from './lib.mjs';
import { aiWriters, makeNewsDay, newsProgrammes, seedPictureAnswers } from '../../server/publish/newsday.js';

const { opt, flag } = argsOf();
const WORK = path.resolve(opt('work', path.join(root, 'data', 'publish', 'daily')));
const PROGRAMMES = String(opt('programmes', 'world-now,tech-bytes,cosmos,money-minute,full-time')).split(',').map((x) => x.trim()).filter(Boolean);
const CLIPS = Number(opt('clips', 3));
const say = (m) => console.log(`${new Date().toISOString().slice(0, 19)} [daily] ${m}`);
const quiet = { info() {}, warn() {}, error() {}, log() {} };
const nice = (args) => run('nice', ['-n', '10', 'node', ...args]);

try {
  os.setPriority(10);
} catch {
  /* not allowed here */
}
fs.mkdirSync(WORK, { recursive: true });
const lock = path.join(WORK, 'run.lock');
try {
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
} catch {
  let alive = false;
  try {
    process.kill(Number(fs.readFileSync(lock, 'utf8')), 0);
    alive = true;
  } catch {
    /* gone */
  }
  if (alive) {
    say('a run is already going');
    process.exit(0);
  }
  fs.writeFileSync(lock, String(process.pid));
}
process.on('exit', () => fs.rmSync(lock, { force: true }));

const { config } = await import('../../server/config.js');
const { createProviders, ProviderChain } = await import('../../server/providers/index.js');
const { loadChannel } = await import('../../server/channel.js');
const { UsageTracker } = await import('../../server/usage.js');
const channel = loadChannel(undefined, { drafts: true });
const providers = createProviders(config);
if (!aiWriters(providers).length) {
  say('no AI writer configured (ANTHROPIC_API_KEY, ANTHROPIC_MODEL, PROVIDERS in /etc/globit24.env): nothing is made');
  process.exit(1);
}
const { ids } = newsProgrammes(channel, PROGRAMMES);
const typesFile = path.join(WORK, 'types.json');
const lastMade = fs.existsSync(typesFile) ? JSON.parse(fs.readFileSync(typesFile, 'utf8')) : {};
const order = [...ids].sort((a, b) => (lastMade[a] || 0) - (lastMade[b] || 0));

// the day's folder: the stories' sources (for the gate, now and at the moment of publishing) and their pictures
const day = new Date().toISOString().slice(0, 10);
const base = path.join(WORK, day);
const sourcesDir = path.join(base, 'sources');
const picturesDir = path.join(base, 'pictures');

const { NewsDesk } = await import('../../server/news.js');
const desk = new NewsDesk({ log: quiet });
await desk.refresh();
say(`${desk.stories?.size ?? 0} stories in the feeds`);
const { createVoiceService } = await import('../../server/voice/index.js');
const voice = createVoiceService({ ...config, voice: { ...config.voice, firstBudgetSeconds: 3600, budgetSeconds: 3600 } }, { root, log: quiet });
// the AI's tokens count against the day's limit (AI_DAILY_TOKENS), in the station's own usage file
const chain = new ProviderChain(providers, new UsageTracker(config.dataDir || path.join(root, 'data')), { log: quiet, dailyTokens: config.aiDailyTokens });

/** The rights desk, as the beta and the air use it (server/picturedesk.js): null with --fotos no or the desk off. */
async function pictureKit() {
  if (opt('fotos') === 'no' || !config.pictures?.desk) return null;
  const { PictureDesk } = await import('../../server/picturedesk.js');
  const { WikimediaClient } = await import('../../server/wikimedia.js');
  const { ImageSearch } = await import('../../server/imagesearch.js');
  const { FaceStore } = await import('../../server/faces.js');
  const { ImageCache } = await import('../../server/images.js');
  const dir = path.join(WORK, 'pictures');
  seedPictureAnswers(config.pictures.dir, dir);
  const wikimedia = new WikimediaClient({ contact: config.pictures.contact, log: quiet });
  const pdesk = new PictureDesk({ dir, wikimedia, search: new ImageSearch({ ...config.imageSearch, wikimedia }), faces: new FaceStore({ dir, log: quiet }), mode: config.pictures.rights, enabled: true, log: quiet });
  if (pdesk.mode === 'preview') say('PICTURE_RIGHTS=preview: nothing of a preview is ever published');
  return { desk: pdesk, images: new ImageCache({ contact: config.pictures.contact, log: quiet }), budgetMs: 120_000 };
}
const kit = await pictureKit();

let made = null;
try {
  for (const programId of order.slice(0, 3)) {
    say(`${programId}: writing, pictures, voices`);
    const r = await makeNewsDay({ desk, chain, channel, programmes: [programId], editions: 1, sourcesDir, outDir: path.join(base, 'episodes'), config, voice, pictures: kit ? { ...kit, dir: picturesDir } : null, log: quiet });
    const e = r.episodes[0];
    lastMade[programId] = Date.now();
    fs.writeFileSync(typesFile, JSON.stringify(lastMade, null, 1));
    if (!e || e.error) say(`${programId}: no edition (${e?.error || 'nothing made'}); the next in turn`);
    else if (e.offline) say(`${programId}: the AI did not answer, the offline writer wrote it (never published); the next in turn`);
    else {
      say(`${programId}: ${e.stories} stories by ${e.provider}, ${e.pictured || 0} with a cleared picture, in ${Math.round(e.ms / 1000)} s`);
      made = e;
      break;
    }
  }
} finally {
  voice?.close?.();
}

if (made) {
  const out = path.join(base, path.basename(made.file, '.json'));
  const media = ['--sources', sourcesDir, ...(kit ? ['--pictures', picturesDir] : [])];
  say(`${made.programId}: the whole programme`);
  try {
    await nice(['tools/publish/upload.mjs', '--episode', made.file, '--out', path.join(out, 'full'), ...media]);
  } catch (err) {
    say(`${made.programId}: the whole programme failed: ${err.message.slice(-300)}`);
    process.exitCode = 1;
  }
  say(`${made.programId}: its best ${CLIPS} clips`);
  try {
    await nice(['tools/publish/factory.mjs', '--episode', made.file, '--out', path.join(out, 'clips'), '--formats', 'vertical', '--max', String(CLIPS), ...media]);
  } catch (err) {
    say(`${made.programId}: the clips failed: ${err.message.slice(-300)}`);
    process.exitCode = 1;
  }
} else say('nothing made this run');

if (!flag('no-publish')) {
  say("the publisher's round");
  try {
    await nice(['tools/publish/run.mjs']);
  } catch (err) {
    say(`the publisher's round failed: ${err.message.slice(-300)}`);
    process.exitCode = 1;
  }
}
