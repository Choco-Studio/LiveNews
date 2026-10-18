#!/usr/bin/env node
// AI writer benchmark (LISTA 35, decision 6): runs the channel's real production pipeline (the provider chain in
// PROVIDERS, the review pass, the live feeds) for each programme of the rotation and measures what the AI costs and how
// long it takes: per call, per programme, and projected per hour, day and month of 24/7 air. Voices, pictures and
// footage are left out (they cost no AI); WORLD WEATHER is written from the forecast alone, so it is skipped.
//
//   PROVIDERS=anthropic,mock node tools/ai-bench.mjs [--runs 1] [--programmes world-now,tech-bytes] \
//     [--price-in 0.10] [--price-out 0.50] [--price-cached 0.025] [--json report.json] [--episodes out.json]
//
// Prices are US dollars per million tokens (input, output, cached input). The defaults are README "Costes
// aproximados" (GPT-6 Luna, September 2026); check the provider's current prices and pass them. A call that the
// validator rejects counts as a failure (its tokens are lost); an episode written by the offline mock after the
// AI failed is flagged, never counted as the AI's.
//
// Needs the AI's credential in the environment (ANTHROPIC_API_KEY and ANTHROPIC_MODEL for anthropic; OPENAI_API_KEY for
// openai; `codex login` for codex). With no AI configured every episode is the mock's and the tool says so instead of
// reporting a cost.

import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const { config } = await import('../server/config.js');
const { NewsDesk } = await import('../server/news.js');
const { Producer } = await import('../server/producer.js');
const { ProviderChain, createProviders } = await import('../server/providers/index.js');
const { loadChannel } = await import('../server/channel.js');
const { episodeAir, breakAir } = await import('../server/station.js');

const quiet = { info() {}, warn() {}, error() {}, log() {} };
const runs = Math.max(1, Number(arg('runs', 1)) || 1);
const price = { in: Number(arg('price-in', 0.1)), out: Number(arg('price-out', 0.5)) };
price.cached = Number(arg('price-cached', price.in / 4));
const channel = loadChannel();
const wanted = arg('programmes') ? arg('programmes').split(',').map((s) => s.trim()) : [...new Set(channel.rotation)];
const ids = wanted.filter((id) => channel.programs[id] && channel.programs[id].kind !== 'weather');

// every call the chain makes, in order: { provider, ok, ms, input, output, cached, error, stage, programme }
const calls = [];
let current = { stage: null, programme: null };
const usage = { record: (provider, u) => calls.push({ provider, ...current, ...u }) };
const providers = createProviders(config);
const real = providers.filter((p) => p.name !== 'mock' && p.available());
const chain = new ProviderChain(providers, usage, { log: quiet });
// tag each call with its stage (write / review) and programme
const generate = chain.generate.bind(chain);
chain.generate = (request, validate) => {
  current = { stage: request.stage, programme: request.program?.id };
  return generate(request, validate);
};

const desk = new NewsDesk({ log: quiet });
const t0 = Date.now();
await desk.refresh();
console.log(`feeds: ${config.feedsFile.replace(/^.*\/config\//, 'config/')} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log(`AI: ${real.length ? real.map((p) => `${p.name}${config[p.name]?.model ? ` (${config[p.name].model})` : ''}`).join(', ') : 'NONE configured: every episode will be the offline mock\'s'}`);
console.log(`prices ($/M tokens): in ${price.in}, out ${price.out}, cached ${price.cached}\n`);

const producer = new Producer({ config: { ...config, reviewPass: config.reviewPass }, newsDesk: desk, chain, log: quiet });
const rows = [];
const episodes = [];
for (let r = 0; r < runs; r++) {
  for (const id of ids) {
    // every programme tries the AI (on air a failed provider pauses; here each attempt is a measurement)
    chain.cooldownUntil.clear();
    const first = calls.length;
    const started = Date.now();
    let ep = null;
    let error = null;
    try {
      ep = await producer.produce(channel, id);
    } catch (err) {
      error = err.message;
    }
    const mine = calls.slice(first);
    const ai = mine.filter((c) => c.provider !== 'mock');
    const sum = (k, list = ai) => list.reduce((n, c) => n + (Number(c[k]) || 0), 0);
    const cost = (sum('input') - sum('cached')) * price.in / 1e6 + sum('cached') * price.cached / 1e6 + sum('output') * price.out / 1e6;
    if (ep) episodes.push(ep);
    rows.push({
      programme: id,
      writtenBy: ep?.provider || null,
      reviewed: ep ? ep.pipeline.some((p) => p.stage === 'review' && p.reviewed) : false,
      error: error || (!ep ? 'not enough fresh stories' : null),
      ms: Date.now() - started,
      writeMs: ep?.pipeline.find((p) => p.stage === 'write')?.ms ?? null,
      reviewMs: ep?.pipeline.find((p) => p.stage === 'review')?.ms ?? null,
      aiCalls: ai.length,
      aiFailures: ai.filter((c) => !c.ok).map((c) => `${c.stage}: ${String(c.error).replace(/\s+/g, ' ').slice(0, 120)}`),
      input: sum('input'),
      output: sum('output'),
      cached: sum('cached'),
      cost,
      air: ep ? Math.round(episodeAir(ep)) : 0,
      stories: ep?.storyIds?.length || 0,
    });
    const row = rows.at(-1);
    console.log(
      `${id.padEnd(14)} ${row.error ? `ERROR ${row.error}` : `by ${row.writtenBy}${row.reviewed ? ' + review' : ''}`.padEnd(22)} ` +
        `${(row.ms / 1000).toFixed(1).padStart(6)} s  in ${String(row.input).padStart(6)}  out ${String(row.output).padStart(6)}  ` +
        `$${row.cost.toFixed(5)}  air ${row.air} s${row.aiFailures.length ? `  failures: ${row.aiFailures.join(' | ')}` : ''}`
    );
  }
}

// The day on air: the rotation's programmes in turn, each followed by a break (2 spots); NEWS IN 60 also at :00 and
// :30 (the clock), which is about one extra NEWS IN 60 an hour over the rotation's share. Per programme: its mean air
// and mean AI cost from the runs above.
const by = {};
for (const r of rows.filter((x) => !x.error)) {
  const b = (by[r.programme] ||= { n: 0, air: 0, cost: 0, ms: [], ai: 0 });
  b.n++;
  b.air += r.air;
  b.cost += r.writtenBy !== 'mock' ? r.cost : 0;
  b.ai += r.writtenBy !== 'mock' ? 1 : 0;
  b.ms.push(r.ms);
}
const cycle = channel.rotation.filter((id) => by[id] || channel.programs[id]?.kind === 'weather');
const airOf = (id) => (by[id] ? by[id].air / by[id].n : 300) + breakAir({ ads: 2 });
const cycleAir = cycle.reduce((t, id) => t + airOf(id), 0);
const cycleCost = cycle.reduce((t, id) => t + (by[id] ? by[id].cost / by[id].n : 0), 0);
const perHour = 3600 / cycleAir;
const clockExtra = by['news-60'] ? Math.max(0, 2 - perHour * cycle.filter((id) => id === 'news-60').length) : 0;
const hourCost = cycleCost * perHour + clockExtra * (by['news-60'] ? by['news-60'].cost / by['news-60'].n : 0);
const aiRows = rows.filter((r) => r.writtenBy && r.writtenBy !== 'mock');
const lat = aiRows.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] / 1000 : null);
const summary = {
  ai: real.map((p) => p.name),
  episodes: rows.length,
  byAI: aiRows.length,
  byMock: rows.filter((r) => r.writtenBy === 'mock').length,
  failures: rows.reduce((n, r) => n + r.aiFailures.length, 0),
  latencyS: { p50: pct(0.5), p90: pct(0.9), max: lat.length ? lat.at(-1) / 1000 : null },
  costPerHour: hourCost,
  costPerDay: hourCost * 24,
  costPerMonth: hourCost * 24 * 30,
  episodesPerHour: perHour * cycle.length + clockExtra,
  price,
};
console.log('\nsummary');
if (!aiRows.length) console.log('  no episode was written by an AI: nothing to price (set the AI credential and run again)');
else {
  console.log(`  ${summary.byAI}/${summary.episodes} episodes by the AI, ${summary.byMock} by the offline mock, ${summary.failures} failed AI calls`);
  console.log(`  time per episode (write + review): median ${summary.latencyS.p50} s, 90% ${summary.latencyS.p90} s, worst ${summary.latencyS.max} s`);
  console.log(`  about ${summary.episodesPerHour.toFixed(1)} news episodes an hour on air`);
  console.log(`  cost: $${summary.costPerHour.toFixed(4)}/hour, $${summary.costPerDay.toFixed(3)}/day, $${summary.costPerMonth.toFixed(2)}/month`);
}
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ summary, rows, calls }, null, 1));
if (arg('episodes')) fs.writeFileSync(arg('episodes'), JSON.stringify(episodes, null, 1));
