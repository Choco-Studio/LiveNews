// The published clips' numbers (server/publish/metrics.js, tools/publish/metrics.mjs; docs/publishing/shorts-v2.md B2):
// the ledger's real clips joined to their items, each network read for its counts (a hand-published YouTube clip found
// by its title), a refused scope a note in the owner's words, and the sums by kind and by experiment arm with the rule
// of §4 (20 clips an arm; the change dropped when average viewed or sends fall).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../server/publish/metrics.js';

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('the ids of a post from its address', () => {
  assert.equal(M.youtubeIdOf('https://www.youtube.com/shorts/AbCdEfGhIjK'), 'AbCdEfGhIjK');
  assert.equal(M.youtubeIdOf('https://youtu.be/AbCdEfGhIjK?si=x'), 'AbCdEfGhIjK');
  assert.equal(M.youtubeIdOf('https://www.youtube.com/watch?v=AbCdEfGhIjK&t=3'), 'AbCdEfGhIjK');
  assert.equal(M.youtubeIdOf('https://example.com/x'), null);
  assert.equal(M.tiktokIdOf('https://www.tiktok.com/@globit24/video/7429384756123456789'), '7429384756123456789');
  assert.equal(M.instagramCodeOf('https://www.instagram.com/reel/DAbc_12-x/'), 'DAbc_12-x');
  assert.equal(M.instagramCodeOf('https://www.instagram.com/globit24/p/Cxyz/'), 'Cxyz');
});

test('the ledger\'s real clips joined to their items: kind, programme, titles, experiment; dry runs and texts left out', () => {
  const ledger = [
    { id: 'q1', platform: 'youtube', kind: 'clip', momentId: 'ep1:quiz-question:37-41', remoteId: null, url: null, at: 1, dryRun: false },
    { id: 'q2', platform: 'youtube', kind: 'clip', momentId: 'ep1:story:3-3', remoteId: 'AbCdEfGhIjK', at: 2, dryRun: false },
    { id: 'q3', platform: 'youtube', kind: 'clip', momentId: 'ep1:story:4-4', at: 3, dryRun: true },
    { id: 't1', platform: 'x', kind: 'text', at: 4, dryRun: false },
  ];
  const items = new Map([['q1', { id: 'q1', title: 'NASA’s Webb: can you beat Paco and Penny?', package: { titles: ['NASA’s Webb: can you beat Paco and Penny?', 'NASA’s Webb: how many light-years? Guess before the answer'] }, source: { programId: 'pay-attention' }, media: { duration: 24.3 }, experiment: { id: 'face-hook-1', arm: 'face' } }]]);
  const rows = M.publishedRows({ ledger, items });
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].kind, rows[0].programId, rows[0].duration, rows[0].experiment, rows[0].arm], ['quiz-question', 'pay-attention', 24.3, 'face-hook-1', 'face']);
  assert.equal(rows[0].titles.length, 2);
  assert.equal(rows[1].kind, 'story');
  // a clip published by hand without its address: found by any of its titles among the uploads
  M.matchByTitle(rows, [{ id: 'ZZZZZZZZZZZ', title: 'nasa’s webb: how many light-years?  Guess before the answer' }]);
  assert.equal(rows[0].videoId, 'ZZZZZZZZZZZ');
  assert.equal(rows[0].matched, 'title');
});

test('YouTube: counts by the Data API, average viewed by Analytics; a refused scope says which', async () => {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push(url);
    if (url.includes('/videos?')) return json(200, { items: [{ id: 'AbCdEfGhIjK', statistics: { viewCount: '1200', likeCount: '60', commentCount: '4' }, snippet: { title: 'T', publishedAt: '2026-10-20T10:00:00Z' } }] });
    if (url.includes('youtubeanalytics')) return json(403, { error: { message: 'Request had insufficient authentication scopes.' } });
    if (url.includes('oauth2')) return json(200, { access_token: 'tok', scope: 'https://www.googleapis.com/auth/youtube' });
    return json(404, {});
  };
  const tok = await M.googleToken({ YOUTUBE_CLIENT_ID: 'a', YOUTUBE_CLIENT_SECRET: 'b', YOUTUBE_REFRESH_TOKEN: 'c' }, fetch);
  assert.ok(tok.ok && tok.token === 'tok');
  const v = await M.youtubeVideos(['AbCdEfGhIjK', 'AbCdEfGhIjK'], { token: tok.token, fetch });
  assert.deepEqual(v.data.AbCdEfGhIjK, { views: 1200, likes: 60, comments: 4, title: 'T', publishedAt: '2026-10-20T10:00:00Z' });
  const a = await M.youtubeAnalytics(['AbCdEfGhIjK'], { token: tok.token, fetch, start: '2026-10-18', end: '2026-10-25' });
  assert.equal(a.ok, false);
  assert.match(a.need, /yt-analytics\.readonly/);
  assert.equal((await M.googleToken({}, fetch)).ok, false, 'no credentials: a note, never a call');
  // with the scope: the report's columns by video
  const ok = async () => json(200, { columnHeaders: [{ name: 'video' }, ...M.YTA_METRICS.map((name) => ({ name }))], rows: [['AbCdEfGhIjK', 1200, 300, 15.2, 71.5, 60, 4, 9, 2]] });
  const b = await M.youtubeAnalytics(['AbCdEfGhIjK'], { token: 'tok', fetch: ok, start: '2026-10-18', end: '2026-10-25' });
  assert.equal(b.data.AbCdEfGhIjK.averageViewPercentage, 71.5);
  assert.equal(b.data.AbCdEfGhIjK.shares, 9);
});

test('Instagram insights and TikTok counts; their refusals name the permission to grant', async () => {
  const ig = await M.instagramInsights('178', { token: 't', base: 'https://graph.instagram.com/v23.0', fetch: async () => json(200, { data: [{ name: 'views', values: [{ value: 900 }] }, { name: 'shares', values: [{ value: 12 }] }, { name: 'ig_reels_avg_watch_time', values: [{ value: 8400 }] }] }) });
  assert.deepEqual(ig.data, { views: 900, shares: 12, ig_reels_avg_watch_time: 8400 });
  const igNo = await M.instagramInsights('178', { token: 't', base: 'https://graph.instagram.com/v23.0', fetch: async () => json(400, { error: { type: 'OAuthException', message: 'missing permission' } }) });
  assert.match(igNo.need, /instagram_business_manage_insights/);
  const tt = await M.tiktokVideos(['7429384756123456789'], { token: 't', fetch: async () => json(200, { data: { videos: [{ id: '7429384756123456789', view_count: 5000, like_count: 300, comment_count: 9, share_count: 41 }] }, error: { code: 'ok' } }) });
  assert.deepEqual(tt.data['7429384756123456789'], { views: 5000, likes: 300, comments: 9, shares: 41 });
  const ttNo = await M.tiktokVideos(['1'], { token: 't', fetch: async () => json(200, { data: {}, error: { code: 'scope_not_authorized', message: 'scope' } }) });
  assert.match(ttNo.need, /video\.list/);
});

test('the sums: by kind and by arm, the verdict collecting until 20 clips an arm, dropped when a guard metric falls', () => {
  const mk = (arm, i, pct, shares) => ({ platform: 'youtube', kind: 'quiz-question', experiment: 'face-hook-1', arm, numbers: { views: 1000 + i, likes: 50, shares, averageViewPercentage: pct } });
  const few = [mk('control', 1, 70, 5), mk('face', 2, 72, 6)];
  const s1 = M.summarize(few);
  assert.equal(s1.byKind['youtube · quiz-question'].n, 2);
  const v1 = s1.verdicts['youtube · face-hook-1'];
  assert.equal(v1.state, 'collecting');
  assert.deepEqual(v1.need, { control: 19, face: 19 });
  const many = [...Array.from({ length: 20 }, (_, i) => mk('control', i, 70, 5)), ...Array.from({ length: 20 }, (_, i) => mk('face', i, 66, 5))];
  const v2 = M.summarize(many).verdicts['youtube · face-hook-1'];
  assert.equal(v2.state, 'drop');
  assert.deepEqual(v2.worse, ['average viewed']);
  const better = [...Array.from({ length: 20 }, (_, i) => mk('control', i, 70, 5)), ...Array.from({ length: 20 }, (_, i) => mk('face', i, 74, 6))];
  const v3 = M.summarize(better).verdicts['youtube · face-hook-1'];
  assert.equal(v3.state, 'check-studio', 'the swipe-away share is read in Studio: the tool never declares the win alone');
  assert.ok(Math.abs(v3.arms.face.sharesPer1k - 5.9) < 0.11, `${v3.arms.face.sharesPer1k} sends a thousand views`);
  // rows without numbers are counted apart
  assert.equal(M.summarize([{ platform: 'tiktok', kind: 'story' }]).unread, 1);
});

test('the owner\'s summary is in Spanish, with what each network still needs', async () => {
  const { spanish } = await import('../tools/publish/metrics.mjs');
  const text = spanish({ notes: [{ network: 'youtube', need: 'the YouTube scope yt-analytics.readonly (a new YOUTUBE_REFRESH_TOKEN with it)', what: 'average viewed, watch time, shares' }, { network: 'tiktok', need: 'each post\'s address ("Ya lo he publicado" with its link): an inbox post\'s id is not its video\'s' }], summary: M.summarize([{ platform: 'youtube', kind: 'quiz-question', experiment: 'face-hook-1', arm: 'face', numbers: { views: 900, likes: 30, shares: 3 } }]) });
  assert.match(text, /Clips publicados en el registro: 1/);
  assert.match(text, /Faltan clips/);
  assert.match(text, /yt-analytics\.readonly/);
  assert.match(text, /enlace de cada publicación/);
  assert.doesNotMatch(text, /the YouTube scope/);
});
