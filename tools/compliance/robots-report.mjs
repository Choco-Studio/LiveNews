#!/usr/bin/env node
// The outlets' robots.txt, read live (server/robots.js, as the news desk obeys them): for today's feeds, every host
// whose pages the desk would open, which group of each file applies to us, which of today's article links it keeps
// from us, any Crawl-delay, every product token the files name (none may be ours by accident), and what the writer
// loses on the stories it keeps (their feed's text against the article text the desk reads elsewhere).
//
//   NODE_USE_ENV_PROXY=1 node tools/compliance/robots-report.mjs [--feeds config/feeds.json] [--sample 2] [--json out.json]
//
// --sample N reads up to N allowed article pages per host, under the same rules, to measure what an article gives
// the writer; 0 reads none. Nothing is written but --json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const feedsFile = path.resolve(root, opt('feeds', 'config/feeds.json'));
const sample = Number(opt('sample', 2)) || 0;
const jsonOut = opt('json', null);

const { NewsDesk, pageUrl } = await import(`${root}/server/news.js`);
const { Robots, agentIsUs, ROBOTS_TOKEN, USER_AGENT } = await import(`${root}/server/robots.js`);
const quiet = { info() {}, warn() {}, error() {} };
const robots = new Robots({ log: quiet });
const desk = new NewsDesk({ log: quiet, robots });
const feeds = JSON.parse(fs.readFileSync(feedsFile, 'utf8'));
desk.loadFeeds = () => feeds;
await desk.refresh();
const stories = [...desk.stories.values()].filter((s) => /^https?:\/\//i.test(s.link || ''));
console.log(`user-agent: ${USER_AGENT}`);
console.log(`${feeds.length} feeds, ${stories.length} stories with an article link today`);

const byOrigin = new Map();
for (const s of stories) {
  const o = new URL(s.link).origin.toLowerCase();
  if (!byOrigin.has(o)) byOrigin.set(o, []);
  byOrigin.get(o).push(s);
}

const hosts = [];
const tokens = new Map(); // token -> origins naming it
for (const [origin, list] of [...byOrigin.entries()].sort()) {
  // the page the desk opens (without the feed's tracking tags), and the feed's link as it stands
  const checks = await Promise.all(list.map(async (s) => ({ s, c: await robots.check(pageUrl(s.link)), raw: await robots.check(s.link) })));
  const entry = checks[0].c.entry;
  for (const t of entry.named || []) {
    if (!tokens.has(t)) tokens.set(t, new Set());
    tokens.get(t).add(origin);
  }
  const refused = checks.filter((x) => !x.c.allowed);
  const rules = {};
  for (const x of refused) {
    const k = x.c.rule ? `${x.c.rule.allow ? 'Allow' : 'Disallow'}: ${x.c.rule.path}` : x.c.reason;
    rules[k] = (rules[k] || 0) + 1;
  }
  hosts.push({
    origin,
    outlets: [...new Set(list.map((s) => s.source))],
    kind: entry.kind,
    status: entry.status,
    group: entry.agent ?? null,
    rules: entry.rules?.length ?? 0,
    disallows: (entry.rules || []).filter((r) => !r.allow).length,
    delay: entry.delay ?? null,
    stories: list.length,
    refused: refused.length,
    refusedBy: rules,
    refusedLinks: refused.slice(0, 5).map((x) => x.s.link),
    refusedAsTagged: checks.filter((x) => !x.raw.allowed).length,
    taggedBy: [...new Set(checks.filter((x) => !x.raw.allowed && x.raw.rule).map((x) => `Disallow: ${x.raw.rule.path}`))],
    ...(entry.error ? { error: entry.error } : {}),
    _refused: refused.map((x) => x.s),
    _allowed: checks.filter((x) => x.c.allowed).map((x) => x.s),
  });
}

// what an article page gives the writer, where the desk may read one (a few per host, the desk's own reader)
if (sample > 0) {
  for (const h of hosts) {
    const picks = h._allowed.slice(0, sample);
    for (const s of picks) {
      try {
        await desk.readArticle(s);
      } catch { /* counted as nothing read */ }
    }
    const read = picks.filter((s) => s.body);
    h.sampled = picks.length;
    h.articleChars = read.length ? Math.round(read.reduce((n, s) => n + s.body.length, 0) / read.length) : 0;
  }
}

const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const refusedStories = hosts.flatMap((h) => h._refused);
const loss = {
  stories: refusedStories.length,
  of: stories.length,
  summaryChars: avg(refusedStories.map((s) => (s.summary || '').length)),
  withFeedText: refusedStories.filter((s) => s.feedText).length,
  feedTextChars: avg(refusedStories.filter((s) => s.feedText).map((s) => s.feedText.length)),
  articleCharsElsewhere: avg(hosts.filter((h) => h.articleChars).map((h) => h.articleChars)),
};
const ours = [...tokens.keys()].filter(agentIsUs);
const near = [...tokens.keys()].filter((t) => /globit|livenews|choco|mozilla|compatible/i.test(t) && !agentIsUs(t));

console.log('');
console.log('origin                               kind         group   rules  delay  stories  refused  outlets');
for (const h of hosts) {
  console.log(`${h.origin.padEnd(36)} ${`${h.kind} ${h.status ?? ''}`.padEnd(12)} ${String(h.group ?? '-').padEnd(7)} ${String(h.rules).padStart(5)}  ${String(h.delay ?? '-').padStart(5)}  ${String(h.stories).padStart(7)}  ${String(h.refused).padStart(7)}  ${h.outlets.join(', ')}`);
  for (const [k, n] of Object.entries(h.refusedBy)) console.log(`${''.padEnd(38)}refused by ${k} (${n})`);
  if (h.refusedAsTagged > h.refused) console.log(`${''.padEnd(38)}the feed's tagged links: ${h.refusedAsTagged} refused (${h.taggedBy.join(', ')}); the desk opens them without the tag`);
}
console.log('');
console.log(`hosts: ${hosts.length}; files read ${robots.reads}; a group naming ${ROBOTS_TOKEN}: ${hosts.filter((h) => h.group === ROBOTS_TOKEN).length}`);
console.log(`product tokens named across the files: ${tokens.size}; matching us: ${ours.length ? ours.join(', ') : 'none'}; near our user-agent words: ${near.length ? near.join(', ') : 'none'}`);
console.log(`stories kept from the article reader: ${loss.stories} of ${loss.of}`);
if (loss.stories) console.log(`  their feed gives a ${loss.summaryChars}-character summary; ${loss.withFeedText} also a full text (${loss.feedTextChars} characters)`);
if (sample) console.log(`  an article page gives the writer ${loss.articleCharsElsewhere} characters on average where it is read (${hosts.reduce((n, h) => n + (h.sampled || 0), 0)} pages sampled)`);

if (jsonOut) {
  const clean = hosts.map(({ _refused, _allowed, ...h }) => h);
  fs.writeFileSync(path.resolve(jsonOut), JSON.stringify({ at: new Date().toISOString(), userAgent: USER_AGENT, hosts: clean, tokens: Object.fromEntries([...tokens].map(([t, o]) => [t, [...o]])), ours, near, loss }, null, 1));
  console.log(`-> ${jsonOut}`);
}
