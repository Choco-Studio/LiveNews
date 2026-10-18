// Hand publishing, the beta (PUBLISH_MODE=manual: server/publish/mode.js, manual.js; docs/publishing/beta.md): no
// adapter reaches a network, the publisher's round only re-checks, the approval page hands the owner the signed file,
// its cover and the texts the gate passed, the network's own switches to tick, and "Ya lo he publicado" records the
// network and the address in the queue, the ledger and the compliance register, so nothing is offered twice.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { PublishQueue } from '../server/publish/queue.js';
import { createApprovalServer } from '../server/publish/approval.js';
import { publishMode, isManual } from '../server/publish/mode.js';
import { makeAdapter } from '../server/publish/adapters/index.js';
import { Publisher, liveBlockers } from '../server/publish/publisher.js';
import { manualTexts, checklistFor, dailyPick, urlFits, creditsOf, prepareManual, recordManual, dayCap } from '../server/publish/manual.js';
import { usingStub } from '../server/publish/compliance.js';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const DESC = [
  'AI-produced news: written by the channel’s software from the named sources and presented by animated characters with synthetic voices.',
  'PAY ATTENTION: the week’s news as a game.',
  '',
  'Can you beat UNIT-8 and Penny? A question from PAY ATTENTION.',
  'Source: Guardian Business — https://www.theguardian.com/a',
  '',
  'Credits:',
  '· Voices: synthetic, made with an open-source text-to-speech engine (Apache 2.0)',
  '· Presenters, sets, graphics and music: original, by GLOBIT 24',
  '',
  'GLOBIT 24 is AI-produced news.',
  'Editorial responsibility and complaints: see the channel’s About page.',
].join('\n');
const CAPTION = '🧠 Can you beat UNIT-8 and Penny? A question from PAY ATTENTION.\n\nSource: Guardian Business — https://www.theguardian.com/a\n\nPresenters are AI-generated characters with synthetic voices; every fact is from the named source.';
const clip = (platform, extra = {}) => ({ kind: 'clip', platform, format: 'vertical', title: 'How many? The ___ | PAY ATTENTION | GLOBIT 24', text: platform === 'youtube' ? DESC : CAPTION, description: DESC, hashtags: ['newsquiz', 'quiz', 'news', 'pixelart'], links: [{ label: 'Guardian Business', url: 'https://www.theguardian.com/a' }], source: { momentId: 'pa:q1', storyIds: ['s1'], programId: 'pay-attention' }, compliance: { ok: true }, score: 9, priority: 2, ...extra });

test('the mode: PUBLISH_MODE=manual is hand publishing, anything else the API pipeline', () => {
  assert.equal(publishMode({ PUBLISH_MODE: 'manual' }), 'manual');
  assert.equal(publishMode({ PUBLISH_MODE: ' Manual ' }), 'manual');
  assert.equal(publishMode({}), 'api');
  assert.equal(isManual({ PUBLISH_MODE: 'api' }), false);
});

test('no adapter reaches a network in hand publishing, whatever the switches and credentials', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response('{}', { status: 200 });
  };
  const env = { PUBLISH_MODE: 'manual', YOUTUBE_CLIENT_ID: 'a'.repeat(20), YOUTUBE_CLIENT_SECRET: 'b'.repeat(20), YOUTUBE_REFRESH_TOKEN: 'c'.repeat(20), BLUESKY_HANDLE: 'x.bsky.social', BLUESKY_APP_PASSWORD: 'd'.repeat(19) };
  const dir = tmp('man-ad-');
  fs.writeFileSync(path.join(dir, 'v.mp4'), 'x');
  for (const [id, item] of [['youtube', { kind: 'clip', format: 'vertical', title: 't', text: 'x', media: { video: path.join(dir, 'v.mp4') } }], ['bluesky', { kind: 'text', text: 'AI-generated: x', links: [] }]]) {
    const a = makeAdapter(id, { env, fetchImpl, dryRun: false });
    assert.ok(a.configured(), id);
    const r = await a.publish(item);
    assert.equal(r.ok, true);
    assert.equal(r.dryRun, true, `${id}: only described`);
    assert.equal(r.manual, true);
    await assert.rejects(() => a.request('GET', 'https://example.org/'), /manual/);
  }
  const yt = makeAdapter('youtube', { env, fetchImpl, dryRun: false });
  await assert.rejects(() => yt.liveUpdate('vid', { title: 't', description: 'd' }), /manual/, 'the live title is never updated');
  assert.equal(calls, 0, 'no request left the machine');
});

test('the publisher in hand publishing: the round re-checks only; nothing scheduled, published or dry-run', async () => {
  const dir = tmp('man-pub-');
  const q = new PublishQueue({ dir, now: () => Date.parse('2026-10-18T10:00:00Z') });
  const it = q.enqueue({ kind: 'text', platform: 'youtube', title: 'x', text: 'AI-generated: x', source: { storyIds: ['s1'] }, compliance: { ok: true } });
  q.approve(it.id, 'owner');
  let gated = 0;
  const p = new Publisher({ queue: q, env: { PUBLISH_MODE: 'manual', PUBLISH_LIVE: '1' }, gate: () => (gated++, { ok: true, violations: [] }), now: () => Date.parse('2026-10-18T10:00:00Z'), fetchImpl: async () => assert.fail('a request') });
  assert.ok(liveBlockers(q, q.get(it.id), { env: { PUBLISH_MODE: 'manual', PUBLISH_LIVE: '1' } }).some((w) => /manual/.test(w)));
  assert.deepEqual(await p.run(), []);
  assert.equal(gated, 1, 'the re-check ran');
  assert.equal(q.get(it.id).status, 'approved', 'not scheduled, not dry-published');
  assert.equal((await p.publishOne(q.get(it.id))).status, 'approved');
  assert.equal(q.ledger(true).length + q.ledger(false).length, 0);
  assert.ok(!fs.existsSync(path.join(dir, 'outbox.jsonl')));
});

test('the texts to paste: YouTube title, description and hashtags; a caption with the disclosure first and the credits', () => {
  const yt = manualTexts(clip('youtube'), { env: { EDITORIAL_CONTACT: 'editor@globit24.example', EDITORIAL_RESPONSIBLE: 'Ana Ruiz' } });
  assert.deepEqual(yt.fields.map((f) => f.id), ['title', 'description', 'hashtags']);
  const d = yt.fields[1].value;
  assert.match(d, /^AI-produced news/);
  assert.match(d, /Credits:\n· Voices/);
  assert.match(d, /Editorial responsibility and complaints: Ana Ruiz, editor@globit24\.example$/, 'who answers, as set now');
  assert.equal(yt.fields[2].value, '#newsquiz #quiz #news #pixelart');
  assert.equal(yt.gateText, d, 'the gate measures what is pasted');
  for (const net of ['tiktok', 'instagram']) {
    const t = manualTexts(clip(net), { env: {} });
    assert.deepEqual(t.fields.map((f) => f.id), ['description', 'hashtags']);
    const c = t.fields[0].value;
    assert.match(c.split('\n')[0], /^Presenters are AI-generated characters/, `${net}: the disclosure first`);
    assert.equal(c.match(/Presenters are AI-generated/g).length, 1, 'once');
    assert.match(c, /Source: Guardian Business — https:\/\/www\.theguardian\.com\/a/);
    assert.match(c, /Credits: Voices: synthetic.* · Presenters, sets, graphics and music: original/);
    assert.ok([...c].length <= 2200);
  }
  assert.deepEqual(creditsOf(DESC), ['Voices: synthetic, made with an open-source text-to-speech engine (Apache 2.0)', 'Presenters, sets, graphics and music: original, by GLOBIT 24']);
  // a text post: the words as the network shows them; Telegram's by hand gets the article's address under it
  const post = { kind: 'text', platform: 'telegram', title: 'Barn owls move into Manhattan', text: 'AI-generated: A family of barn owls nests in Manhattan.', links: [{ label: 'NPR', url: 'https://www.npr.org/owls' }] };
  const tg = manualTexts(post);
  assert.match(tg.fields[0].value, /^AI-generated: Barn owls move into Manhattan/);
  assert.match(tg.fields[0].value, /https:\/\/www\.npr\.org\/owls$/);
  assert.deepEqual(tg.fields.map((f) => f.id), ['text', 'link']);
  const x = manualTexts({ ...post, platform: 'x', text: 'AI-generated: Owls. via NPR: https://www.npr.org/owls' });
  assert.equal(x.fields[0].value, 'AI-generated: Owls. via NPR: https://www.npr.org/owls');
});

test('the switches to set by hand, per network', () => {
  const ids = (it) => checklistFor(it).map((c) => c.id);
  assert.deepEqual(ids(clip('youtube')), ['file', 'texts', 'synthetic', 'kids']);
  assert.deepEqual(ids(clip('tiktok')), ['file', 'texts', 'aigc', 'privacy', 'branded']);
  assert.deepEqual(ids(clip('instagram')), ['file', 'texts', 'aiinfo']);
  assert.deepEqual(ids({ kind: 'episode', platform: 'youtube', media: { thumb: 'a.jpg' } }), ['file', 'texts', 'synthetic', 'kids', 'thumb']);
  assert.deepEqual(ids({ kind: 'text', platform: 'bluesky' }), ['texts', 'link']);
  const all = JSON.stringify(['youtube', 'tiktok', 'instagram'].map((n) => checklistFor(clip(n))));
  for (const w of ['altered or synthetic content', 'made for kids', 'AI-generated content', 'AI info']) assert.ok(all.includes(w), w);
});

test('a post\'s address must be on its network\'s own host', () => {
  assert.ok(urlFits('youtube', 'https://www.youtube.com/shorts/abc'));
  assert.ok(urlFits('youtube', 'https://youtu.be/abc'));
  assert.ok(urlFits('tiktok', 'https://www.tiktok.com/@globit24/video/1'));
  assert.ok(urlFits('instagram', 'https://www.instagram.com/reel/abc/'));
  assert.ok(!urlFits('youtube', 'http://www.youtube.com/shorts/abc'), 'https only');
  assert.ok(!urlFits('youtube', 'https://youtube.com.evil.example/x'));
  assert.ok(!urlFits('tiktok', 'https://www.instagram.com/reel/abc/'));
  assert.ok(!urlFits('x', 'javascript:alert(1)'));
});

test('the day\'s pick: Phase 1\'s lower ends (3 Shorts, 3 TikToks, 2 Reels), best first, never held, grave, too short or published', () => {
  const dir = tmp('man-pick-');
  const now = Date.parse('2026-10-18T10:00:00Z');
  const q = new PublishQueue({ dir, now: () => now });
  assert.equal(dayCap('youtube', 'video', 1), 3);
  assert.equal(dayCap('instagram', 'video', 1), 2);
  for (let i = 0; i < 5; i++) for (const net of ['youtube', 'tiktok', 'instagram']) q.enqueue(clip(net, { source: { momentId: `m${i}`, storyIds: [`s${i}`] }, score: i }));
  q.enqueue(clip('youtube', { source: { momentId: 'held' }, score: 99, compliance: { ok: false, violations: [{ rule: 'verbatim' }] } }));
  q.enqueue(clip('youtube', { source: { momentId: 'grave' }, score: 98, grave: true }));
  q.enqueue(clip('youtube', { source: { momentId: 'short' }, score: 97, media: { duration: 6.53 } }));
  let p = dailyPick(q, { now, phase: 1 });
  const on = (net) => p.ids.map((id) => q.get(id)).filter((it) => it.platform === net);
  assert.equal(on('youtube').length, 3);
  assert.equal(on('tiktok').length, 3);
  assert.equal(on('instagram').length, 2);
  assert.deepEqual(on('youtube').map((it) => it.score), [4, 3, 2], 'best first; never the held, the grave or the 6.5 s one');
  assert.deepEqual(p.caps.youtube.video, { cap: 3, done: 0 });
  // one published today on YouTube: two left for today
  const first = on('youtube')[0];
  q.record(first, { url: 'https://youtu.be/a' }, { dry: false });
  first.status = 'published';
  q.save(first);
  p = dailyPick(q, { now, phase: 1 });
  assert.equal(on('youtube').length, 2);
  assert.deepEqual(p.caps.youtube.video, { cap: 3, done: 1 });
  assert.ok(!p.ids.includes(first.id));
});

// ------------------------------------------------------------------------------------------------- the page

let dir;
let dataDir;
let media;
let q;
let srv;
let port;
let token;
const marked = [];
const gates = [];
function req(method, p, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    if (body !== null) r.write(JSON.stringify(body));
    r.end();
  });
}
const post = async (p, body) => {
  const r = await req('POST', p, { headers: { 'content-type': 'application/json', 'x-approval-token': token }, body });
  return { status: r.status, json: JSON.parse(r.body.toString('utf8') || '{}') };
};
const state = async () => JSON.parse((await req('GET', '/api/state')).body.toString('utf8'));

before(async () => {
  dir = tmp('man-q-');
  dataDir = tmp('man-data-');
  media = path.join(dir, 'factory');
  fs.mkdirSync(media, { recursive: true });
  fs.writeFileSync(path.join(media, 'q1.mp4'), Buffer.alloc(2000, 3));
  fs.writeFileSync(path.join(media, 'q1.thumb.jpg'), 'jpeg');
  q = new PublishQueue({ dir });
  for (const net of ['youtube', 'tiktok', 'instagram']) q.enqueue(clip(net, { media: { video: path.join(media, 'q1.mp4'), thumb: path.join(media, 'q1.thumb.jpg'), duration: 40, sha256: 'abc' } }));
  q.enqueue(clip('youtube', { source: { momentId: 'pa:q2', storyIds: ['s2'] }, title: 'Second', media: { video: path.join(media, 'q1.mp4'), sha256: 'def' } }));
  srv = createApprovalServer({
    queue: q,
    dataDir,
    env: { PUBLISH_MODE: 'manual', EDITORIAL_CONTACT: 'editor@globit24.example' },
    manualOpts: {
      // a signed copy (the real one: compliance.markFile, C2PA); the gate sees the files it would read back
      mark: async (src, manifest, { output }) => {
        marked.push({ src, output, manifest });
        fs.copyFileSync(src, output);
        return { ok: true, path: output, devCert: true };
      },
      gate: (view, opts) => {
        gates.push({ view, opts });
        const bad = view.storyIds.includes('s2') ? [{ rule: 'blocked', message: 'story s2: withdrawn' }] : [];
        return { ok: !bad.length && view.files.every((f) => fs.existsSync(f)), violations: bad, warnings: [], recreations: [] };
      },
      getStory: () => null,
      register: null,
    },
  });
  port = await srv.listen(0);
  token = srv.token;
});
after(() => srv.close());

test('the page in hand publishing: the day\'s pick, nothing to schedule, Spanish', async () => {
  const s = await state();
  assert.equal(s.manual, true);
  assert.equal(s.publishLive, false);
  assert.equal(s.pick.ids.length, 4, 'two YouTube Shorts, a TikTok, a Reel');
  const html = (await req('GET', '/')).body.toString('utf8');
  for (const w of ['Para hoy', 'Ya lo he publicado', 'Descargar', 'Copiar', 'Preparar para publicar']) assert.ok(html.includes(w), w);
  assert.equal((await post('/api/schedule', {})).status, 409, 'nothing is scheduled by hand publishing');
});

test('prepare: only what is approved; the gate again on the signed files and the words to paste', async () => {
  const yt = q.list({ platform: 'youtube' }).find((it) => it.title !== 'Second');
  assert.equal((await post('/api/prepare', { id: yt.id })).status, 409, 'approve it first');
  assert.equal((await req('GET', `/download/${yt.id}/video`)).status, 409, 'no download before');
  assert.equal((await post('/api/approve', { id: yt.id, all: true })).status, 200);
  assert.equal(q.list({ status: 'approved' }).length, 3, 'on its three networks');
  const r = await post('/api/prepare', { id: yt.id });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const m = r.json.item.manual;
  assert.equal(m.fresh, true);
  assert.deepEqual(m.files, { video: true, cover: true });
  assert.equal(m.devCert, true);
  assert.deepEqual(m.fields.map((f) => f.id), ['title', 'description', 'hashtags']);
  assert.match(m.fields[1].value, /Editorial responsibility and complaints: editor@globit24\.example/);
  assert.deepEqual(m.checklist.map((c) => c.id), ['file', 'texts', 'synthetic', 'kids']);
  // the gate measured the signed copies and the description pasted, with YouTube's flags
  const g = gates.at(-1).view;
  assert.ok(g.files.length === 2 && g.files.every((f) => /\.youtube-[0-9a-f]+\.c2pa\.(mp4|jpg)$/.test(f)), JSON.stringify(g.files));
  assert.equal(g.text, m.fields[1].value);
  assert.equal(g.flags.youtube.containsSyntheticMedia, true);
  assert.equal(g.flags.youtube.selfDeclaredMadeForKids, false);
  assert.ok(!JSON.stringify(r.json).includes(dir), 'no path on the page');
  // the download: the signed copy, as an attachment
  const d = await req('GET', `/download/${yt.id}/video`);
  assert.equal(d.status, 200);
  assert.match(d.headers['content-disposition'], /^attachment; filename="GLOBIT24-youtube-pay-attention-[a-z0-9]+\.mp4"$/);
  assert.equal(d.body.length, 2000);
  const c = await req('GET', `/download/${yt.id}/cover`);
  assert.equal(c.status, 200);
  assert.match(c.headers['content-type'], /image\/jpeg/);
});

test('"Ya lo he publicado": every switch ticked, an address on the network\'s host; then never offered again', async () => {
  const yt = q.list({ platform: 'youtube', status: 'approved' })[0];
  const all = checklistFor(yt).map((c) => c.id);
  let r = await post('/api/published', { id: yt.id, checks: all.slice(0, 2) });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /Falta marcar/);
  r = await post('/api/published', { id: yt.id, checks: all, url: 'https://www.tiktok.com/@x/video/1' });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /no es de YouTube/);
  r = await post('/api/published', { id: yt.id, checks: all, url: 'https://www.youtube.com/shorts/abc123' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const it = q.get(yt.id);
  assert.equal(it.status, 'published');
  assert.deepEqual({ manual: it.result.manual, url: it.result.url }, { manual: true, url: 'https://www.youtube.com/shorts/abc123' });
  assert.ok(it.history.some((h) => h.action === 'published by hand' && h.by === 'owner'));
  const led = q.ledger(false);
  assert.equal(led.length, 1);
  assert.equal(led[0].url, 'https://www.youtube.com/shorts/abc123');
  assert.equal(led[0].dryRun, false);
  // the compliance register: where it was published (the takedown workflow finds it)
  if (!usingStub) {
    const reg = fs.readFileSync(path.join(dataDir, 'compliance', 'register.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const pub = reg.find((e) => e.type === 'publication' && e.itemId === yt.id);
    assert.ok(pub, 'recorded');
    assert.equal(pub.platform, 'youtube');
    assert.equal(pub.url, 'https://www.youtube.com/shorts/abc123');
    assert.deepEqual(pub.storyIds, ['s1']);
    assert.equal(pub.flags.manual, true);
  }
  // never twice: not in the pick, not again, not queued again, not downloadable
  const s = await state();
  assert.ok(!s.pick.ids.includes(yt.id));
  assert.equal(s.pick.caps.youtube.video.done, 1);
  assert.equal((await post('/api/published', { id: yt.id, checks: all })).status, 409);
  assert.equal((await req('GET', `/download/${yt.id}/video`)).status, 409);
  assert.equal(q.enqueue(clip('youtube', { media: { video: path.join(media, 'q1.mp4'), sha256: 'abc' } })).status, 'duplicate');
});

test('what no longer passes when prepared is held, with its reason, and nothing is handed out', async () => {
  const second = q.list({ platform: 'youtube' }).find((it) => it.title === 'Second');
  await post('/api/approve', { id: second.id });
  const r = await post('/api/prepare', { id: second.id });
  assert.equal(r.status, 409);
  const it = q.get(second.id);
  assert.equal(it.status, 'held');
  assert.equal(it.compliance.recheck, true);
  assert.equal(it.compliance.violations[0].rule, 'blocked');
  assert.equal(it.manual, null);
  assert.ok(!fs.existsSync(path.join(media, `q1.${second.id}.c2pa.mp4`)), 'its signed copy is not left for it');
  assert.equal((await req('GET', `/download/${second.id}/video`)).status, 409);
  const s = await state();
  assert.match(s.items.find((x) => x.id === second.id).compliance.violations[0].es, /registro/);
});

test('an edit after preparing: the words are checked again before they are handed out', async () => {
  const tt = q.list({ platform: 'tiktok', status: 'approved' })[0];
  assert.equal((await post('/api/prepare', { id: tt.id })).status, 200);
  assert.equal((await post('/api/edit', { id: tt.id, title: 'A new title' })).status, 200);
  assert.equal(q.get(tt.id).manual, null);
  assert.equal((await req('GET', `/download/${tt.id}/video`)).status, 409);
  const again = await post('/api/prepare', { id: tt.id });
  assert.equal(again.status, 200);
  assert.deepEqual(again.json.item.manual.checklist.map((c) => c.id), ['file', 'texts', 'aigc', 'privacy', 'branded']);
  assert.match(again.json.item.manual.fields[0].value, /^Presenters are AI-generated characters/);
});

test('the real gate: a text post passes with who answers for the channel set, and is held without', async () => {
  const d = tmp('man-real-');
  const qq = new PublishQueue({ dir: d });
  qq.saveSettings({ modes: { x: 'manual' } });
  const src = ['Barn owls move into Manhattan', 'A family of barn owls has been seen nesting in an old building in New York City.'];
  const one = qq.enqueue({ kind: 'text', platform: 'x', title: 'Owls · Manhattan', text: 'AI-generated: Owls · Manhattan. via NPR: https://www.npr.org/owls', links: [{ label: 'NPR', url: 'https://www.npr.org/owls' }], sourceTexts: src, source: { storyIds: ['s9'] }, compliance: { ok: true } });
  qq.approve(one.id, 'owner');
  const ok = await prepareManual(qq, one.id, { dataDir: tmp('man-rd-'), env: { EDITORIAL_CONTACT: 'editor@globit24.example' }, register: null, getStory: () => null });
  assert.equal(ok.ok, true, JSON.stringify(ok.violations));
  assert.equal(ok.item.manual.fields[0].value, 'AI-generated: Owls · Manhattan. via NPR: https://www.npr.org/owls');
  const rec = recordManual(qq, one.id, { url: 'https://x.com/globit24/status/1', checks: ['texts', 'link'], dataDir: tmp('man-rd2-') });
  assert.equal(rec.ok, true, rec.message);
  if (!usingStub) {
    const two = qq.enqueue({ kind: 'text', platform: 'x', title: 'Owls', text: 'AI-generated: Owls. via NPR: https://www.npr.org/owls', links: [], sourceTexts: src, source: { storyIds: ['s10'] }, compliance: { ok: true } });
    qq.approve(two.id, 'owner');
    const held = await prepareManual(qq, two.id, { dataDir: tmp('man-rd3-'), env: {}, register: null, getStory: () => null });
    assert.equal(held.ok, false);
    assert.ok(held.violations.some((v) => v.rule === 'editorial-contact-missing'), JSON.stringify(held.violations));
    assert.equal(qq.get(two.id).status, 'held');
  }
});
