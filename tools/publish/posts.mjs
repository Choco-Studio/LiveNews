#!/usr/bin/env node
// A day of text posts (server/publish/posts.js; the plan: docs/publishing/plan.md §4): the day's most-told stories
// from the archive, one post per network each (X, Threads, Bluesky, Facebook, Telegram), every one opening
// "AI-generated:", in the channel's own words, the outlet's headline cited beside its link (the verbatim rule: an
// aired sentence only when the article cache proves it the channel's own, data/compliance/articles, which the archive
// fills as the channel airs: server/articlecache.js). Written to a file to read; with --enqueue, into
// the publishing queue as well (dry run), where the scheduler gives each its time within the network's hours and
// spacing.
//
//   node tools/publish/posts.mjs --day 2026-10-16 [--tz Europe/London] [--limit 8] [--out <dir>]
//        [--enqueue] [--queue data/publish] [--phase 3] [--clips <factory summary.json>...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayStories, postsFor } from '../../server/publish/posts.js';
import { PLATFORMS, DAILY, xLength, graphemes } from '../../server/publish/platforms.js';
import { PublishQueue, localParts } from '../../server/publish/queue.js';
import { preflight, usingStub, archiveGetStory, register } from '../../server/publish/compliance.js';
import { telegramHtml } from '../../server/publish/adapters/telegram.js';
import { makeAdapter } from '../../server/publish/adapters/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const day = opt('day');
if (!day) {
  console.error('usage: node tools/publish/posts.mjs --day YYYY-MM-DD [--out dir] [--enqueue]');
  process.exit(1);
}
const tz = opt('tz', 'Europe/London');
const phase = Number(opt('phase', 3));
const NETS = ['x', 'threads', 'bluesky', 'facebook', 'telegram'];
// how many stories a day: the most any network takes in this phase (each network then takes its own top ones)
const capOf = (net) => DAILY[phase]?.[net]?.posts?.[1] || 0;
const limit = Number(opt('limit', Math.max(...NETS.map(capOf), 6)));

const archiveDir = path.join(root, 'data', 'archive');
const entries = [];
for (const f of fs.readdirSync(archiveDir).filter((x) => x.endsWith('.jsonl'))) {
  for (const l of fs.readFileSync(path.join(archiveDir, f), 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try {
      entries.push(JSON.parse(l));
    } catch {
      /* a line being written */
    }
  }
}
const stories = dayStories(entries, { day, timeZone: tz, limit });
// the article cache (server/articlecache.js: the article the news desk read for each aired story, else its feed's full
// text; the compliance audit writes the same files): the only proof an aired sentence is not the outlet's own
const getStory = archiveGetStory({ dataDir: path.join(root, 'data') });
for (const s of stories) s.articles = [...new Set((s.ids || [s.id]).map((id) => getStory(id)?.body).filter(Boolean))];
// our clip on a story, when the factory made one (its URL exists only once published: a dry run has none)
const clipsByStory = new Map();
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--clips') continue;
  try {
    const sum = JSON.parse(fs.readFileSync(args[i + 1], 'utf8'));
    for (const m of sum.moments || []) for (const id of m.storyIds || []) clipsByStory.set(id, { momentId: m.id, url: null });
  } catch {
    /* no summary */
  }
}

const out = path.resolve(opt('out', path.join(root, 'data', 'publish', 'posts')));
fs.mkdirSync(out, { recursive: true });
const all = [];
for (const [rank, s] of stories.entries()) {
  const clip = (s.ids || [s.id]).map((id) => clipsByStory.get(id)).find(Boolean) || null;
  const posts = postsFor(s, { clip: clip?.url ? clip : null });
  for (const net of NETS) {
    // each network takes its own top stories, up to its cap for the phase
    if (rank >= capOf(net)) continue;
    const p = posts[net];
    // the gate measures what the network will show (Telegram composes its message from the title and the links)
    const shown = makeAdapter(net, { env: {}, dryRun: true }).postText({ ...p, platform: net });
    const gate = preflight({ kind: 'text', text: shown, platforms: [net], sourceTexts: p.sourceTexts, storyIds: s.ids || [s.id] }, { register: register(path.join(root, 'data')) });
    all.push({ rank: rank + 1, platform: net, story: { id: s.id, ids: s.ids, title: s.title, source: s.source, link: s.link, grave: !!s.grave, airings: s.airings, programmes: s.programmes, articles: s.articles.length }, title: p.title, sourceTexts: p.sourceTexts, text: p.text, links: p.links, grave: !!s.grave, length: net === 'x' ? xLength(p.text) : net === 'bluesky' ? graphemes(p.text) : [...p.text].length, limit: PLATFORMS[net].text.post || PLATFORMS[net].text.message, compliance: { ok: gate.ok, violations: gate.violations || [], stub: usingStub } });
  }
}

// the times: the queue's own scheduler, in a scratch queue of its own when not enqueuing for real
let queue;
if (flag('enqueue')) queue = new PublishQueue({ dir: path.resolve(opt('queue', path.join(root, 'data', 'publish'))) });
else {
  const tmp = path.join(out, `.plan-${process.pid}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  queue = new PublishQueue({ dir: tmp, now: () => Date.parse(`${day}T06:00:00Z`) });
  queue.saveSettings({ phase, timezone: tz, modes: Object.fromEntries(NETS.map((n) => [n, 'manual'])) });
}
const items = [];
for (const p of all) {
  const it = queue.enqueue({
    kind: 'text',
    platform: p.platform,
    postKind: 'story',
    title: p.title,
    text: p.text,
    sourceTexts: p.sourceTexts,
    links: p.links,
    grave: p.grave,
    source: { storyIds: p.story.ids || [p.story.id], airedAt: null },
    compliance: p.compliance,
    score: 10 - p.rank,
    priority: 1,
    dryRun: true,
  });
  if (it) items.push(it);
}
if (!flag('enqueue')) {
  for (const it of items) if (it.status === 'pending') queue.approve(it.id, 'plan');
  queue.schedule(Date.parse(`${day}T05:00:00Z`));
}
const at = new Map(queue.list().map((x) => [x.id, x.schedule?.at || null]));
for (const [i, p] of all.entries()) p.at = items[i] ? at.get(items[i].id) || null : null;
if (!flag('enqueue')) fs.rmSync(queue.dir, { recursive: true, force: true });

// the file: by network, in time order
const lines = [`GLOBIT 24 · text posts for ${day} (${tz}) · phase ${phase} · DRY RUN: nothing was posted`, `${stories.length} stories, ${all.length} posts. Compliance: ${usingStub ? 'the stub (the real module is not installed yet)' : 'the real module'}.`, ''];
for (const net of NETS) {
  const ps = all.filter((p) => p.platform === net).sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
  if (!ps.length) continue;
  lines.push(`== ${PLATFORMS[net].name} (${ps.length} posts; limit ${PLATFORMS[net].text.post || PLATFORMS[net].text.message}${net === 'x' ? ', a link counts 23' : net === 'bluesky' ? ' graphemes, the article as a link card' : ''})`);
  for (const p of ps) {
    const lp = p.at ? localParts(p.at, tz) : null;
    lines.push(`-- ${lp ? `${String(lp.h).padStart(2, '0')}:${String(lp.m).padStart(2, '0')}` : 'unscheduled'} · #${p.rank} · ${p.length}/${p.limit}${p.grave ? ' · GRAVE: waits for the owner' : ''}${p.compliance.ok ? '' : ` · HELD: ${p.compliance.violations.map((v) => v.rule).join(', ')}`}`);
    // Telegram: the message as sent (HTML: the headline bold, the text, the links)
    lines.push(net === 'telegram' ? telegramHtml({ title: p.title, text: p.text, links: p.links }) : p.text);
    if (net === 'bluesky') lines.push(`   [link card: ${p.links[0]?.url}]`);
    lines.push('');
  }
}
fs.writeFileSync(path.join(out, `posts-${day}.txt`), lines.join('\n'));
fs.writeFileSync(path.join(out, `posts-${day}.json`), JSON.stringify({ day, tz, phase, stories, posts: all }, null, 1));
console.log(`${all.length} posts for ${stories.length} stories -> ${path.join(out, `posts-${day}.txt`)}${flag('enqueue') ? ` (queued: ${items.filter((x) => x.status !== 'duplicate').length})` : ''}`);
