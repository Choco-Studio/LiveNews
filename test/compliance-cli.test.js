// The operator's command line (tools/compliance/cli.mjs): a complaint logged in one command reaches the running
// server's register at once; the launch report and the publish check exit non-zero while they refuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ComplianceRegister } from '../server/compliance/registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(root, 'tools', 'compliance', 'cli.mjs');
const env = (dir) => {
  const e = { ...process.env, DATA_DIR: dir };
  for (const k of ['EDITORIAL_CONTACT', 'EDITORIAL_RESPONSIBLE', 'RIGHTS_GATE', 'C2PA_CERT', 'C2PA_KEY', 'OPEN_METEO_API_KEY', 'OPEN_METEO_COMMERCIAL']) delete e[k];
  return e;
};
const run = (dir, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, env: env(dir), encoding: 'utf8', timeout: 60_000 });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'globit-cli-'));

test('a complaint logged in one command holds the person in the running server at once; triage and close follow', () => {
  const dir = tmp();
  const server = new ComplianceRegister({ dir: path.join(dir, 'compliance') }); // the server's own instance, already loaded
  assert.equal(server.isBlocked({ name: 'Ana Silva' }), null);
  const add = run(dir, 'complaint', 'add', '--category', 'privacy-likeness', '--person', 'Ana Silva', '--from', 'Ana Silva', '--text', 'That is not my voice');
  assert.equal(add.status, 0, add.stderr);
  const c = JSON.parse(add.stdout);
  assert.match(c.id, /^cmp/);
  assert.ok(Date.parse(c.actBy) - Date.parse(c.receivedAt) === 24 * 3600e3, 'a likeness complaint is acted on within 24 hours');
  assert.match(server.isBlocked({ name: 'ana silva' }), /^precaution/, 'held from the moment it is logged');
  assert.deepEqual(JSON.parse(run(dir, 'complaints', '--open').stdout).map((x) => x.id), [c.id]);
  const tri = run(dir, 'complaint', 'triage', c.id, '--decision', 'block-person', '--reason', 'she objects to the recreation');
  assert.equal(tri.status, 0, tri.stderr);
  assert.match(server.isBlocked({ name: 'Ana Silva' }), /^person/, 'the decision replaces the precaution');
  assert.equal(run(dir, 'complaint', 'close', c.id, '--outcome', 'blocked; replied').status, 0);
  assert.deepEqual(JSON.parse(run(dir, 'complaints', '--open').stdout), []);
  // a category that does not exist is refused, not filed as "other"
  const bad = run(dir, 'complaint', 'add', '--category', 'nonsense', '--text', 'x');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /privacy-likeness/);
});

test('launch exits 1 while a blocker stands; check refuses an item without its flags and passes it with them', () => {
  const dir = tmp();
  const launch = run(dir, 'launch');
  assert.equal(launch.status, 1);
  assert.match(launch.stdout, /NOT READY/);
  assert.match(launch.stdout, /BLOCKER {2}EDITORIAL_CONTACT/);
  const episode = { id: 'e1', provider: 'mock', program: { id: 'world-now', title: 'WORLD NOW' }, storyIds: [], segments: [{ type: 'intro', text: 'Good evening.' }] };
  const item = path.join(dir, 'item.json');
  fs.writeFileSync(item, JSON.stringify({ id: 'e1', kind: 'episode', episode, platforms: ['youtube'], flags: {} }));
  const refused = run(dir, 'check', item);
  assert.equal(refused.status, 1);
  assert.match(refused.stdout, /REFUSED/);
  assert.match(refused.stdout, /flag-missing +YouTube: set status\.containsSyntheticMedia/);
  assert.match(refused.stdout, /flag-missing +YouTube: set status\.selfDeclaredMadeForKids = false/);
  fs.writeFileSync(item, JSON.stringify({ id: 'e1', kind: 'episode', episode, platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: false, selfDeclaredMadeForKids: false } } }));
  const r = spawnSync(process.execPath, [CLI, 'check', item], { cwd: root, env: { ...env(dir), EDITORIAL_CONTACT: 'desk@example.org' }, encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /OK: may be published/);
});
