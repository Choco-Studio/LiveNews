// The beta's news day with the AI writer (server/publish/newsday.js; tools/publish/beta.mjs hacer): the day's news
// programmes made through the channel's producer by the AI writer (here the fake model of test/fixtures/fake-model.js:
// no key, no network), each told story recorded with its article in the beta's own sources folder, then through the
// factory's gate (the verbatim lint against those sources, the sources gate, the offline-writer rule, the 10-second
// floor) into the queue and the day's pick; the posts made from the same folder carry an aired line, not a bare
// citation; a rendered master is used instead of a recording. Without an AI writer, the news is not made, and said so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ProviderChain } from '../server/providers/index.js';
import { createMockProvider } from '../server/providers/mock.js';
import { makeNewsDay, aiWriters, newsProgrammes, BETA_NEWS } from '../server/publish/newsday.js';
import { renderedMaster, useRenderedMaster, masterRoots } from '../server/publish/masters.js';
import { detectMoments, publishable, markCopied } from '../server/publish/moments.js';
import { estimateTimeline } from '../server/publish/timeline.js';
import { PublishQueue, localParts } from '../server/publish/queue.js';
import { dailyPick } from '../server/publish/manual.js';
import { recheckQueue } from '../server/publish/recheck.js';
import { gateView } from '../server/publish/publisher.js';
import * as compliance from '../server/publish/compliance.js';
import { createFakeModel, STORIES, GOOD, seg, script } from './fixtures/fake-model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

// a light Phase 1 programme (plan.md §2: COSMOS DESK's light stories), as a test channel
const channel = {
  name: 'TEST TV',
  presenters: { ann: { name: 'Ann Anchor', personality: 'calm' }, bob: { name: 'Bob Banter', personality: 'dry' } },
  programs: {
    cosmos: { title: 'COSMOS DESK', tagline: 'SPACE', theme: 'space', presenters: ['ann', 'bob'], categories: ['world'], stories: 3, maxChats: 0, style: 'A bulletin.', storyLength: '2 to 4 sentences' },
    quiz: { kind: 'quiz', title: 'QUIZ', presenters: ['ann'] },
  },
  rotation: ['cosmos'],
  breaks: { adsPerBreak: 2, minProgrammeBetween: 420 },
};

// the AI writer's script: every story composed in the channel's own words (the writer's validator keeps only what its
// source grounds: Seville's last two sentences are dropped there, and the story is told in one)
const AI = {
  osl: { headline: 'Oslo library opens its doors on Sundays', text: GOOD.osl },
  sev: { headline: 'Seville solar plant now feeds the grid', text: 'Electricity from a new solar plant outside Seville reached the grid on Monday. The site sits on old farmland and supplies roughly 40,000 households, the company running it says. Regional leaders predict a yearly drop of 60,000 tonnes in emissions.' },
  gda: { headline: 'Gdansk rail strike set for Friday', text: GOOD.gda },
};
const aiScript = () => script(Object.entries(AI).map(([id, s]) => seg(id, s.text, { headline: s.headline })), 'Cosmos desk');

function deskOf() {
  const stories = STORIES.map((s) => ({ ...s, published: Date.now() - 60_000 }));
  const desk = { stories: new Map(stories.map((s) => [s.id, s])), candidates: (n) => stories.slice(0, n), markCovered() {}, markOffered() {}, resolveImage: async () => null, get: (id) => desk.stories.get(id) };
  return desk;
}

async function day({ write = aiScript(), fail = {} } = {}) {
  const dir = tmp('newsday-');
  const chain = new ProviderChain([createFakeModel({ write, fail }), createMockProvider()], { record() {} }, { log: { warn() {} } });
  const r = await makeNewsDay({ desk: deskOf(), chain, channel, programmes: ['cosmos', 'quiz', 'nope'], sourcesDir: path.join(dir, 'sources'), outDir: path.join(dir, 'news'), config: { candidatePool: 12, minNewStories: 3, reviewPass: true } });
  return { dir, ...r };
}

test('only an AI writer counts: never the offline mock, and the Codex CLI only when it is installed', () => {
  const fake = createFakeModel();
  const codex = { name: 'codex', available: () => true };
  assert.deepEqual(aiWriters([createMockProvider(), fake]).map((p) => p.name), ['fakeai']);
  assert.deepEqual(aiWriters([codex, createMockProvider()], { env: { PATH: '' } }), []);
  assert.deepEqual(newsProgrammes(channel, ['cosmos', 'quiz', 'nope']), { ids: ['cosmos'], skipped: ['quiz', 'nope'] });
  assert.deepEqual([...BETA_NEWS], ['cosmos', 'tech-bytes', 'full-time']);
});

test('the AI writer\'s news day: the episode, its stories and articles in the beta\'s own sources folder', async () => {
  const { dir, episodes, sourcesDir } = await day();
  assert.equal(episodes.length, 1, 'the quiz and an unknown id are not news programmes');
  const [e] = episodes;
  assert.equal(e.programId, 'cosmos');
  assert.equal(e.provider, 'fakeai');
  assert.equal(e.offline, false);
  assert.equal(e.stories, 3);
  const ep = JSON.parse(fs.readFileSync(e.file, 'utf8'));
  assert.ok(Number.isFinite(Date.parse(ep.airedAt)));
  // the stories it told, with the articles it was checked against (the factory's --sources, the posts' --data)
  const getStory = compliance.archiveGetStory({ dataDir: sourcesDir });
  for (const id of ['osl', 'sev', 'gda']) {
    const s = getStory(id);
    assert.ok(s?.title && s.summary, id);
    assert.ok(String(s.body || '').length > 100, `${id}: its article is kept`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'data', 'archive', 'never')), 'the station\'s archive is not written');
  assert.ok(fs.readdirSync(path.join(dir, 'sources', 'archive')).length === 1);
});

test('through the factory\'s gate into the queue: the AI-written clip passes and is offered; the offline writer\'s is held', async () => {
  const { episodes, sourcesDir } = await day();
  const ep = JSON.parse(fs.readFileSync(episodes[0].file, 'utf8'));
  const sources = compliance.archiveGetStory({ dataDir: sourcesDir });
  // the factory's choice (factory.mjs): the lint against the sources, the sources gate, publishable in Phase 1
  const lint = compliance.lintEpisode(ep, { getStory: sources });
  assert.equal(lint.violations.length, 0, JSON.stringify(lint.violations));
  assert.deepEqual(compliance.storiesWithoutSources({ episode: ep, kind: 'episode' }, sources), []);
  // (the voices' lengths, as the voice service gives them on the server: about 2.6 words a second)
  for (const g of ep.segments) if (String(g.text || '').trim()) g.audio = { url: '/voice/x.ogg', duration: String(g.text).split(/\s+/).length / 2.6 };
  const all = detectMoments(ep, { timeline: estimateTimeline(ep) });
  markCopied(all, new Set(), { unverified: new Set() });
  const pub = publishable(all, { phase: 1 });
  assert.ok(pub.length > 0, JSON.stringify(all.map((m) => [m.kind, m.duration, m.light, m.scores.sense])));
  for (const m of pub) assert.ok(m.duration >= 10, `${m.id}: ${m.duration} s`);
  // the gate on a vertical clip of it, as the factory and the page ask it
  const m = pub[0];
  const env = { EDITORIAL_CONTACT: 'editor@example.org' };
  const view = { kind: 'short', episode: ep, range: { start: m.start, end: m.end }, storyIds: m.storyIds, platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: true, selfDeclaredMadeForKids: false } }, text: 'AI-produced news.' };
  const g = compliance.preflight(view, { getStory: compliance.clipGetStory(m.storyIds, sources), register: null, env });
  assert.ok(g.ok, JSON.stringify(g.violations));
  const q = new PublishQueue({ dir: tmp('newsday-q-') });
  const it = q.enqueue({ kind: 'clip', platform: 'youtube', format: 'vertical', title: 'Oslo', text: 'x', media: { duration: m.duration + 2.6 }, source: { episodeId: ep.id, programId: 'cosmos', momentId: m.id, storyIds: m.storyIds }, compliance: { ok: g.ok, violations: g.violations }, score: m.scores.total });
  assert.equal(it.status, 'pending');
  assert.ok(dailyPick(q, { phase: 1 }).ids.includes(it.id));
  // the re-check (and the page, and the publisher) measure it against its own sources folder, not the station's archive
  const epFile = path.join(path.dirname(episodes[0].file), 'voiced.json');
  fs.writeFileSync(epFile, JSON.stringify(ep));
  const withSources = q.save({ ...q.get(it.id), gate: { episodeFile: epFile, range: { start: m.start, end: m.end }, sourcesDir } });
  const without = q.enqueue({ ...withSources, id: undefined, key: undefined, platform: 'tiktok', status: undefined, gate: { episodeFile: epFile, range: { start: m.start, end: m.end } } });
  const gate = (v, o) => compliance.preflight(v, { ...o, env });
  const re = recheckQueue({ queue: q, view: (x) => gateView(x), dataDir: tmp('station-'), gate, register: null });
  assert.equal(q.get(withSources.id).status, 'pending', JSON.stringify(q.get(withSources.id).compliance));
  assert.equal(q.get(without.id).status, 'held');
  assert.ok(q.get(without.id).compliance.violations.every((v) => v.rule === 'sources-missing'));
  assert.equal(re.held.length, 1);
  // the same day when the AI does not answer: the offline writer's edition, held by the gate (`offline-writer`)
  const down = await day({ fail: { write: new Error('HTTP 429: quota') } });
  const off = down.episodes[0];
  assert.equal(off.offline, true);
  const oep = JSON.parse(fs.readFileSync(off.file, 'utf8'));
  const og = compliance.preflight({ ...view, episode: oep, storyIds: oep.storyIds.slice(0, 1) }, { getStory: compliance.archiveGetStory({ dataDir: down.sourcesDir }), register: null, env });
  assert.ok(og.violations.some((v) => v.rule === 'offline-writer'), JSON.stringify(og.violations));
});

test('the day\'s posts from the AI writer\'s stories carry an aired line in the channel\'s own words, not a bare citation', async () => {
  const { sourcesDir, episodes } = await day();
  const ep = JSON.parse(fs.readFileSync(episodes[0].file, 'utf8'));
  const out = tmp('newsday-posts-');
  const today = localParts(Date.now(), 'Europe/London').day;
  execFileSync(process.execPath, ['tools/publish/posts.mjs', '--day', today, '--data', sourcesDir, '--out', out, '--phase', '3'], { cwd: ROOT, env: { ...process.env, NODE_NO_WARNINGS: '1', EDITORIAL_CONTACT: 'editor@example.org' }, stdio: 'pipe' });
  const { posts } = JSON.parse(fs.readFileSync(path.join(out, `posts-${today}.json`), 'utf8'));
  const x = posts.filter((p) => p.platform === 'x');
  assert.equal(x.length, 3, JSON.stringify(posts.map((p) => p.text)));
  const aired = ep.segments.filter((g) => g.type === 'story').flatMap((g) => g.text.split(/(?<=\.)\s+/)).filter((l) => l.length > 30);
  for (const p of x) {
    assert.match(p.text, /^AI-generated: /);
    assert.ok(aired.some((line) => p.text.includes(line.replace(/\.$/, ''))), `an aired line: ${p.text}`);
    assert.ok(p.compliance.ok, JSON.stringify(p.compliance.violations));
    assert.ok(p.story.articles >= 1, 'checked against the article');
  }
  // (the outlet's headline only as a citation beside the link: the episode airs the outlet's title as its headline)
  for (const p of x) assert.match(p.text, /: “[^”]+” https:\/\/example\.test\//);
});

test('a rendered master (the playout\'s) is cut instead of recorded: both files, a sane report, linked where the factory looks', () => {
  const root = tmp('masters-');
  const ep = { id: 'emvabc123', program: { id: 'cosmos' } };
  assert.equal(renderedMaster(ep, 'vertical', [root]), null);
  fs.mkdirSync(path.join(root, ep.id));
  fs.writeFileSync(path.join(root, ep.id, 'vertical.mkv'), 'mkv');
  fs.writeFileSync(path.join(root, ep.id, 'vertical.report.json'), JSON.stringify({ fps: 25, seconds: 60 }));
  assert.equal(renderedMaster(ep, 'vertical', [root]), null, 'not the recorder\'s 30 fps: recorded again');
  fs.writeFileSync(path.join(root, ep.id, 'vertical.report.json'), JSON.stringify({ fps: 30, seconds: 60, speech: [] }));
  assert.equal(renderedMaster(ep, 'horizontal', [root]), null);
  assert.equal(renderedMaster({ id: '../x' }, 'vertical', [root]), null);
  const masters = tmp('factory-masters-');
  const used = useRenderedMaster(ep, 'vertical', masterRoots({ RENDERED_MASTERS: `/nowhere:${root}` }), masters);
  assert.ok(used);
  assert.equal(fs.readFileSync(path.join(masters, 'cosmos-vertical.mkv'), 'utf8'), 'mkv');
  assert.equal(JSON.parse(fs.readFileSync(path.join(masters, 'cosmos-vertical.report.json'), 'utf8')).fps, 30);
});

test('beta.mjs hacer without an AI writer: the news is not made, and it says so in Spanish', () => {
  const q = tmp('beta-nokey-');
  const out = execFileSync(process.execPath, ['tools/publish/beta.mjs', 'hacer', '--queue', q, '--noticias', 'cosmos,tech-bytes', '--concurso', 'no'], { cwd: ROOT, env: { ...process.env, PROVIDERS: 'mock', OPENAI_API_KEY: '', DEEPSEEK_API_KEY: '', NODE_NO_WARNINGS: '1' }, encoding: 'utf8' });
  assert.match(out, /Las noticias necesitan la clave de IA/);
  assert.match(out, /PROVIDERS=openai,mock/);
  assert.match(out, /Para hoy: 0 publicaciones/);
  assert.match(out, /Tiempo: /);
  assert.ok(!fs.existsSync(path.join(q, 'factory', localParts(Date.now(), 'Europe/London').day, 'news')), 'nothing made');
});
