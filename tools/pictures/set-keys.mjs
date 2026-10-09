#!/usr/bin/env node
// Asks for the free-picture sources' keys (docs/roadmap/FOTOS_LIBRES.md §8) and writes them into .env, replacing
// a line that is already there. Nothing is printed back but the variable's name; an empty answer skips it.
//
//   node tools/pictures/set-keys.mjs
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ENV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
const KEYS = [
  ['PIXABAY_API_KEY', 'Pixabay: the "key" row of pixabay.com/api/docs/'],
  ['COPERNICUS_CLIENT_ID', 'Copernicus: OAuth client ID (User settings → OAuth clients)'],
  ['COPERNICUS_CLIENT_SECRET', 'Copernicus: OAuth client secret'],
  ['OPENVERSE_CLIENT_ID', 'Openverse: client_id from the register command'],
  ['OPENVERSE_CLIENT_SECRET', 'Openverse: client_secret from the register command'],
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

let text = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
const eol = text.includes('\r\n') ? '\r\n' : '\n';
console.log('Paste each key and press Enter (Enter alone skips it).\n');
for (const [name, hint] of KEYS) {
  const value = await ask(`${hint}\n${name} = `);
  if (!value) {
    console.log(`  (skipped)\n`);
    continue;
  }
  if (/\s/.test(value)) {
    console.log(`  not saved: a key has no spaces\n`);
    continue;
  }
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, line);
  else text = `${text}${text && !text.endsWith('\n') ? eol : ''}${line}${eol}`;
  fs.writeFileSync(ENV, text);
  console.log(`  saved ${name}\n`);
}
rl.close();
console.log('Done. .env updated.');
