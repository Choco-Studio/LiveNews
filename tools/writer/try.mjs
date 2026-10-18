#!/usr/bin/env node
// The writer trial (docs/publishing/server-setup.md §6, docs/publishing/setup.md §10): on the owner's server, with the AI
// key in the environment, it makes N real episodes of each AI-written programme from the live feeds, through the
// channel's own production pipeline (write, the own-words check and its rewrites, the standards editor, the fit), and
// reports for each episode and overall:
//   - every story's copied share and longest copied run as it will air (the publish gate's own measure: 12 words, 20 %);
//   - the own-words loop's rewrites, cuts and drops, and the rewrites it refused;
//   - the editor's faults found (sentences and fields it changed, stories it took out);
//   - tokens in and out and the time of every AI call, by stage (write, rewrite, review), and each stage's time;
//   - the month of 24/7 air on the channel's clock, in episodes and tokens, and its cost as a formula of the provider's
//     prices per million tokens (we do not know the price).
// Files only: the episodes and the report go to --out (under data/, which git ignores). Nothing is published, streamed,
// archived or put on the station's queue; no voice, footage or picture download.
//
//   node --env-file=/etc/globit24.env tools/writer/try.mjs [--episodes 2] [--programmes world-now,news-60]
//        [--providers anthropic,mock] [--out data/writer-trial/<time>] [--json]
//
// The key is read from the environment (ANTHROPIC_API_KEY with ANTHROPIC_MODEL; or OPENAI_API_KEY, DEEPSEEK_API_KEY); the
// tool never prints it. With no AI
// configured every episode is the offline writer's and the report says so. FEEDS_FILE=config/feeds.fixture.json runs on
// the offline fixture feeds (a dry run of the tool itself).
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const flag = (k) => argv.includes(`--${k}`);
if (flag('help')) {
  console.log('node --env-file=/etc/globit24.env tools/writer/try.mjs [--episodes 2] [--programmes world-now,news-60] [--providers anthropic,mock] [--out <dir>] [--json]');
  process.exit(0);
}

const { config, ROOT } = await import('../../server/config.js');
if (arg('providers')) config.providers = arg('providers').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const { NewsDesk } = await import('../../server/news.js');
const { Producer } = await import('../../server/producer.js');
const { ProviderChain, createProviders } = await import('../../server/providers/index.js');
const { loadChannel, withDraftsOnAir } = await import('../../server/channel.js');
const { recordCalls, episodeRow, episodeLines, summarize, formatReport } = await import('./lib.mjs');

const quiet = { info() {}, warn() {}, error() {}, log() {} };
const episodesEach = Math.max(1, Math.min(20, Number(arg('episodes', 2)) || 2));
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.resolve(ROOT, arg('out', path.join('data', 'writer-trial', stamp)));
fs.mkdirSync(path.join(out, 'episodes'), { recursive: true });

// the programmes the AI writes: the channel's news programmes (no own writer: WORLD WEATHER, SEVEN DAYS and PAY ATTENTION
// are written by rule from the forecast, the archive and the quiz desk); FULL TIME, a draft, when asked by name
const base = loadChannel();
const asked = arg('programmes') ? arg('programmes').split(',').map((s) => s.trim()).filter(Boolean) : null;
const channel = asked ? withDraftsOnAir(base, asked.filter((id) => base.drafts?.[id])) : base;
const aiWritten = (id) => channel.programs[id] && (!channel.programs[id].kind || channel.programs[id].kind === 'sport');
const onAir = [...new Set([...(channel.clock?.pins || []).map((p) => p.program), ...channel.rotation])];
const ids = (asked || onAir).filter(aiWritten);
const skipped = (asked || onAir).filter((id) => !aiWritten(id));

// every AI call, recorded with its stage and programme (tokens and time)
const calls = [];
const providers = recordCalls(createProviders(config), calls);
const real = providers.filter((p) => p.reviews !== false && p.available());
const chain = new ProviderChain(providers, { record() {} }, { log: quiet });
const logs = [];
const log = { info: (m) => logs.push(m), warn: (m) => logs.push(`WARN ${m}`), error: (m) => logs.push(`ERROR ${m}`) };

const desk = new NewsDesk({ log: quiet });
const t0 = Date.now();
await desk.refresh();
const feeds = path.relative(ROOT, config.feedsFile);
const head = [
  `feeds: ${feeds} (${desk.stories?.size ?? '?'} stories, ${((Date.now() - t0) / 1000).toFixed(1)} s)`,
  `AI: ${real.length ? real.map((p) => `${p.name}${config[p.name]?.model ? ` (${config[p.name].model})` : ''}`).join(', ') : 'NONE configured: every episode will be the offline writer\'s (never published)'}`,
  `programmes: ${ids.join(', ')}${skipped.length ? ` (not written by the AI: ${skipped.join(', ')})` : ''}; ${episodesEach} episode(s) each`,
  `out: ${path.relative(ROOT, out).startsWith('..') ? out : path.relative(ROOT, out)}`,
];
for (const l of head) console.log(l);
console.log('');

// no archive, no voices, no footage, no picture desk: the trial measures the writer, and writes only into `out`
const producer = new Producer({ config: { ...config, pictureBudgetMs: Math.min(config.pictureBudgetMs ?? 6000, 6000) }, newsDesk: desk, chain, log });
const rows = [];
for (const id of ids) {
  for (let n = 1; n <= episodesEach; n++) {
    // each episode tries the AI afresh (on air a failing provider pauses; here every attempt is a measurement)
    chain.cooldownUntil.clear();
    const first = calls.length;
    const firstLog = logs.length;
    const started = Date.now();
    let ep = null;
    let error = null;
    try {
      ep = await producer.produce(channel, id);
    } catch (err) {
      error = err.message;
    }
    const mine = calls.slice(first);
    if (!ep && !error) error = logs.slice(firstLog).find((l) => /slot skipped/.test(l))?.replace(/^WARN \[producer\] [^:]+: /, '') || 'not enough fresh stories';
    const row = episodeRow(ep, { programme: id, getStory: (sid) => desk.get(sid), calls: mine, ms: Date.now() - started, error });
    row.log = logs.slice(firstLog).filter((l) => /\[own words\]|\[producer\] .*(skipped|review)|ERROR/.test(l));
    rows.push(row);
    if (ep) fs.writeFileSync(path.join(out, 'episodes', `${id}-${n}.json`), JSON.stringify(ep, null, 1));
    console.log(episodeLines(row).join('\n'));
  }
}

const summary = summarize(rows, calls, { channel });
const lines = formatReport(summary, rows);
const at = lines.indexOf('SUMMARY');
console.log(`\n${lines.slice(at).join('\n')}`);
fs.writeFileSync(path.join(out, 'report.txt'), `${head.join('\n')}\n\n${lines.join('\n')}\n`);
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ at: new Date().toISOString(), feeds, ai: real.map((p) => p.name), summary, rows, calls }, null, 1));
fs.writeFileSync(path.join(out, 'log.txt'), `${logs.join('\n')}\n`);
if (flag('json')) console.log(JSON.stringify(summary));
const shown = (f) => (path.relative(ROOT, f).startsWith('..') ? f : path.relative(ROOT, f));
console.log(`\nreport: ${shown(path.join(out, 'report.txt'))} (and report.json, log.txt, episodes/)`);
