#!/usr/bin/env node
// The approval page (server/publish/approval.js; the owner's guide: docs/publishing/setup.md §6).
//
//   node tools/publish/approve.mjs [--queue data/publish] [--media <dir>]... [--port 8740] [--playout data/playout]
//
// Then open http://127.0.0.1:8740/ in a browser on the same computer. It listens on this computer only. Ctrl+C stops it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublishQueue } from '../../server/publish/queue.js';
import { createApprovalServer } from '../../server/publish/approval.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const all = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] && !args[i + 1].startsWith('--') ? [args[i + 1]] : []));
const queue = new PublishQueue({ dir: path.resolve(opt('queue', path.join(root, 'data', 'publish'))) });
const media = all('media').map((d) => path.resolve(d));
// (pre-rendered playout: the programmes it held from air, docs/publishing/playout.md §3; --playout <dir>)
const playoutDir = path.resolve(opt('playout', path.join(root, 'data', 'playout')));
const server = createApprovalServer({ queue, mediaRoots: media, dataDir: path.join(root, 'data'), log: (m) => console.log(m), playoutDir: fs.existsSync(playoutDir) ? playoutDir : null });
const port = await server.listen(Number(opt('port', 8740)));
console.log(`Página de aprobación: http://127.0.0.1:${port}/  (cola: ${queue.dir})`);
console.log('Solo se abre en este ordenador. Ctrl+C para cerrarla.');
const stop = () => server.close().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
