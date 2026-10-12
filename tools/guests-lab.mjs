#!/usr/bin/env node
// Bookings for the guests lab (public/lab/guests.html): re-staged speakers booked by the server's own code
// (server/guests/restage.js bookGuest(speakerProfile(...))), fictional names in public roles, picked so the set
// covers the LookSpec's range (presentations, ages, skins, hair styles, beards, glasses, suits) and includes a
// grave story's official. Writes public/lab/guests.json (committed: the lab needs no server).
//
//   node tools/guests-lab.mjs [--n 16] [--out public/lab/guests.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { speakerProfile, bookGuest } from '../server/guests/restage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const N = Number(opt('n', 16));
const OUT = path.resolve(ROOT, opt('out', 'public/lab/guests.json'));

// fictional people in public roles, said the way a source says them (the pronoun after the name gives the presentation)
const FIRST = { woman: ['Ana', 'Mara', 'Lena', 'Ines', 'Sofia', 'Amina', 'Keiko', 'Grace', 'Olga', 'Priya', 'Nadia', 'Helen', 'Rosa', 'Yara'], man: ['Tomas', 'Karim', 'Pieter', 'David', 'Kwame', 'Hiro', 'Marco', 'Arjun', 'Lars', 'Samuel', 'Felipe', 'Omar', 'Viktor', 'Joel'] };
const LAST = ['Silva', 'Brandt', 'Okafor', 'Haddad', 'Lindqvist', 'Moreau', 'Tanaka', 'Mensah', 'Kowalski', 'Ruiz', 'Novak', 'Adeyemi', 'Castell', 'Varga', 'Iyer', 'Dunmore'];
const ROLES = [
  ['the health minister', 'Pixelburg Post'],
  ['the mayor of Lisbon', 'Harbour Herald'],
  ['the chief executive of Nimbus Rail', 'Circuit Weekly'],
  ['a spokesperson for the space agency', 'Starfield Journal'],
  ['the foreign secretary', 'Pixelburg Post'],
  ['the central bank governor', 'Ledger Daily'],
  ['the lead researcher', 'Starfield Journal'],
  ['the transport commissioner', 'Harbour Herald'],
  ['the prime minister', 'Pixelburg Post'],
  ['the regional governor', 'Coastline News'],
];
const GRAVE = ['the regional governor', 'Coastline News'];

function speakers() {
  const out = [];
  for (const p of ['woman', 'man']) {
    for (const first of FIRST[p]) {
      for (const last of LAST) {
        const name = `${first} ${last}`;
        for (const [role, outlet] of ROLES) {
          const pron = p === 'woman' ? 'she' : 'he';
          const src = `${name}, ${role}, said the plan would go ahead. "We will publish the details next week," ${pron} said.`;
          const sp = speakerProfile(name, src);
          if (sp?.name && sp.role) out.push({ sp, outlet, role });
        }
      }
    }
  }
  // a role alone (no name): the generic look, labelled by role, presentation neutral
  out.push({ sp: speakerProfile('a spokesperson', ''), outlet: 'Circuit Weekly', role: 'a spokesperson' });
  return out;
}

// greedy pick: each next booking adds the most values not yet seen (skin, style, age, presentation, beard, glasses, suit)
const KEYS = [(l, b) => `skin:${l.skin}`, (l) => `hair:${l.hair.style}`, (l) => `colour:${l.hair.colour}`, (l) => `age:${l.age}`, (l) => `p:${l.presentation}`, (l) => `fh:${l.facialHair.style}`, (l) => `gl:${l.glasses}`, (l) => `suit:${l.wear.main}`, (l, b) => `role:${b.role}`, (l, b) => `first:${String(b.name).split(' ')[0]}`, (l, b) => `last:${String(b.name).split(' ')[1]}`];
const all = speakers().map(({ sp, outlet }) => bookGuest(sp, { outlet }));
const chosen = [];
const seen = new Set();
const unnamed = all.find((b) => !b.name);
if (unnamed) {
  chosen.push(unnamed);
  for (const k of KEYS) seen.add(k(unnamed.look, unnamed));
}
// (men and women in turn: the styles of each are their own)
const turn = (n) => (n % 2 ? 'man' : 'woman');
while (chosen.length < N) {
  let best = null, score = -1;
  for (const b of all) {
    if (chosen.includes(b)) continue;
    const s = KEYS.reduce((n, k) => n + (seen.has(k(b.look, b)) ? 0 : k === KEYS[1] || k === KEYS[0] ? 2 : 1), 0) + (b.look.presentation === turn(chosen.length) ? 4 : 0);
    if (s > score) [best, score] = [b, s];
  }
  if (!best) break;
  chosen.push(best);
  for (const k of KEYS) seen.add(k(best.look, best));
}
// a grave story's official: the same booking, staged soberly by the lab (grave: true)
const grave = all.find((b) => b.role === GRAVE[0].replace(/^the /, '') && !chosen.includes(b)) || chosen[1];
const list = chosen.map((b) => ({ booking: b, grave: false }));
list.push({ booking: grave, grave: true });
fs.writeFileSync(OUT, `${JSON.stringify({ made: 'tools/guests-lab.mjs', guests: list }, null, 1)}\n`);
console.log(`${list.length} bookings -> ${path.relative(ROOT, OUT)}`);
for (const { booking: b, grave: g } of list) console.log(`  ${b.id} ${(b.strap.name + ' · ' + b.strap.role).padEnd(52)} ${b.look.presentation}/${b.look.age} ${b.look.skin} ${b.look.hair.style}/${b.look.hair.colour} ${b.look.facialHair.style} ${b.look.glasses} ${b.look.wear.outfit}/${b.look.wear.main}${g ? ' GRAVE' : ''}`);
