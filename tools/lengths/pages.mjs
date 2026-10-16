#!/usr/bin/env node
// The article pages of every story in the channel's archive (data/archive/*.jsonl), fetched once into
// data/lengths/pages/<sha>.html, so tools/lengths/replay.mjs can write the programmes again from the same real
// stories with their dossiers (server/article.js reads the page as the live desk does), offline and repeatably.
// data/ is never committed: the outlets' text stays on this machine.
//
//   NODE_USE_ENV_PROXY=1 node tools/lengths/pages.mjs [--archive data/archive] [--concurrency 6]
//
// A page the outlet refuses (Sky News answers 403) is remembered in data/lengths/pages/failed.json and not asked again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageKey, readArchive } from './archive.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const archiveDir = path.resolve(root, opt('archive', 'data/archive'));
const dir = path.join(root, 'data', 'lengths', 'pages');
fs.mkdirSync(dir, { recursive: true });
const failedFile = path.join(dir, 'failed.json');
const failed = fs.existsSync(failedFile) ? JSON.parse(fs.readFileSync(failedFile, 'utf8')) : {};

const { NewsDesk } = await import(`${root}/server/news.js`);
const desk = new NewsDesk({ log: { info() {}, warn() {}, error() {} } });
const { stories } = readArchive(archiveDir);
const todo = [...stories.values()].filter((s) => /^https?:\/\//i.test(s.link || '') && !/\.invalid\//.test(s.link) && !fs.existsSync(path.join(dir, `${pageKey(s.link)}.html`)) && !failed[s.link]);
console.log(`${stories.size} stories in the archive, ${todo.length} pages to fetch`);
let next = 0;
let ok = 0;
let bad = 0;
const worker = async () => {
  while (next < todo.length) {
    const s = todo[next++];
    try {
      // as the live desk reads an article (server/news.js readArticle), with a little more time for the proxy
      const html = await desk.fetchText(s.link, { timeoutMs: 15000, maxBytes: 600_000 });
      fs.writeFileSync(path.join(dir, `${pageKey(s.link)}.html`), html);
      ok++;
    } catch (err) {
      failed[s.link] = String(err.message || err).slice(0, 120);
      bad++;
    }
    if ((ok + bad) % 50 === 0) console.log(`  ${ok + bad}/${todo.length} (${bad} failed)`);
  }
};
await Promise.all(Array.from({ length: Number(opt('concurrency', 6)) }, worker));
fs.writeFileSync(failedFile, JSON.stringify(failed, null, 1));
const byHost = {};
for (const [link, why] of Object.entries(failed)) {
  const h = link.split('/')[2];
  byHost[h] = byHost[h] || {};
  byHost[h][why] = (byHost[h][why] || 0) + 1;
}
console.log(`fetched ${ok}, failed ${bad} now (${Object.keys(failed).length} in all):`, JSON.stringify(byHost));
