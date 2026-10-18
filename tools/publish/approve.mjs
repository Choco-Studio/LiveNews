#!/usr/bin/env node
// The approval page (server/publish/approval.js; the owner's guide: docs/publishing/setup.md §6, and for the beta,
// published by hand, docs/publishing/beta.md).
//
//   node tools/publish/approve.mjs [--queue data/publish] [--media <dir>]... [--port 8740] [--manual] [--playout data/playout]
//
// Then open http://127.0.0.1:8740/ in a browser on the same computer. It listens on this computer only. Ctrl+C stops it.
// --manual (or PUBLISH_MODE=manual): hand publishing, the beta: everything waiting is re-checked first (recheck.js),
// then the page offers the day's pick, the files to download and the texts to copy; nothing is ever sent.
// --playout: the pre-rendered playout's folder (docs/publishing/playout.md §3): the programmes it held from air.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const all = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] && !args[i + 1].startsWith('--') ? [args[i + 1]] : []));
if (args.includes('--manual')) process.env.PUBLISH_MODE = 'manual';

const { PublishQueue } = await import('../../server/publish/queue.js');
const { createApprovalServer, RULE_ES } = await import('../../server/publish/approval.js');
const { isManual } = await import('../../server/publish/mode.js');
const { Publisher } = await import('../../server/publish/publisher.js');
const { dailyPick } = await import('../../server/publish/manual.js');

const queue = new PublishQueue({ dir: path.resolve(opt('queue', path.join(root, 'data', 'publish'))) });
const media = all('media').map((d) => path.resolve(d));
const dataDir = path.join(root, 'data');
if (isManual()) {
  // the gate again on everything waiting before the owner sees it (what no longer passes is held, with its reason)
  const re = new Publisher({ queue, dataDir }).recheck();
  console.log(`Revisado otra vez: ${re.checked} esperando · ${re.held.length} retenidos ahora${re.released.length ? ` · ${re.released.length} vuelven a «Por aprobar»` : ''}`);
  for (const it of re.held) console.log(`  retenido  ${it.platform}  ${it.title}\n            ${[...new Set((it.compliance?.violations || []).map((v) => RULE_ES[v.rule] || v.rule))].join(' / ')}`);
  const pick = dailyPick(queue);
  console.log(`Para hoy: ${pick.ids.length} publicaciones (modo manual: publicas tú, el sistema no sube nada).`);
}
// (pre-rendered playout: the programmes it held from air, docs/publishing/playout.md §3; --playout <dir>)
const playoutDir = path.resolve(opt('playout', path.join(root, 'data', 'playout')));
const server = createApprovalServer({ queue, mediaRoots: media, dataDir, log: (m) => console.log(m), playoutDir: fs.existsSync(playoutDir) ? playoutDir : null });
const port = await server.listen(Number(opt('port', 8740)));
console.log(`Página de aprobación: http://127.0.0.1:${port}/  (cola: ${queue.dir})`);
console.log('Solo se abre en este ordenador. Ctrl+C para cerrarla.');
const stop = () => server.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
