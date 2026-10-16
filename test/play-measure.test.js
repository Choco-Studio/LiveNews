// PRESS START's measurement tools (tools/play/): the standards as word lists, the release-date reader, the coverage of
// a reading, the games guard on events, the accent's colour distances and the hand check. Real headlines from the
// 12-16 Oct readings (docs/roadmap/critique/press-start-design.md), no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, gamesTopic, reviewVerdict, hasNewsVerb, unquoted } from '../tools/play/standards.mjs';
import { releaseDate } from '../tools/play/dates.mjs';
import { londonDay, londonDayBounds, readingCovers, mergeIntervals, linkKey, clusterEvents, sameGamesEvent } from '../tools/play/measure.mjs';
import { deltaE2000, contrast } from '../tools/play/accent.mjs';
import { score } from '../tools/play/handcheck.mjs';
import { NewsDesk, keywords } from '../server/news.js';

const item = (title, summary = '', extra = {}) => ({ title, summary, link: 'https://example.com/a', kind: 'news', ...extra });
const first = (title, summary, extra) => classify(item(title, summary, extra)).out;

test('the standards keep off guides, deals, reviews, the outlet voice, leaks, rumours, explicit, harm, conflict, gambling and gossip', () => {
  assert.equal(first('All Ghost Driver codes (October 2026) and how to redeem them for free cash'), 'guide');
  assert.equal(first('Tales of Eternia Remastered DLC guide – All the DLC Included'), 'guide');
  assert.equal(first('Alienware’s latest 34-inch QD-OLED gaming monitor is $50 off'), 'off-topic');
  assert.equal(first('Xbox X25 controller pre-orders are back in stock ahead of next week’s launch'), 'commerce');
  assert.equal(first('Battlefield 6 Is Free on Steam, but Not for Long'), 'commerce');
  assert.equal(first('Penguin Colony review – an Antarctic odyssey of Nazis and Lovecraftian horrors'), 'review');
  assert.equal(first('Talking Point: Which Games Have Been The Most Impressive On Xbox Series S In Your Opinion?'), 'outlet voice');
  assert.equal(first('Whoa, This Minecraft Mod Turns The Game Into A Deltarune-Style Turn-Based RPG'), 'outlet voice');
  assert.equal(first('Final Fantasy XIII Is Long Overdue for an HD Remaster'), 'outlet voice');
  assert.equal(first('Put Down Your Pitchforks, GTA 6 Was Always Eligible For The Game Awards This Year'), 'outlet voice');
  assert.equal(first('Footage from a reportedly cancelled Assassin’s Creed game set in China has leaked'), 'leak');
  assert.equal(first('Next Red Dead Launching By 2027 Or 2028 “May Not Be Unreasonable,” Bank Says, But It Definitely Is'), 'rumour');
  assert.equal(first('Destiny 1 project, which aims to port the game to PC, seemingly gets a nod from Bungie boss'), 'rumour');
  assert.equal(first('GTA 6’s launch trailer is out, and it really hopes sex sells'), 'explicit');
  assert.equal(first('Russian man linked to deadly London hospitals hack arrested', '', { kind: 'news' }), 'harm to people');
  assert.equal(first('House House will not release Big Walk on Xbox in support of pro-Palestinian BDS campaign'), 'conflict or politics');
  assert.equal(first('Today’s Coin Master free spins & coins links (October 2026)'), 'guide');
  assert.equal(first('Daily free Monopoly Go dice links (October 2026)'), 'gambling');
  assert.equal(first("Ex-Valve dev not impressed by Epic's updated Steam rival or Tim Sweeney's latest dig at Gabe Newell"), 'feud or gossip');
  assert.equal(first('Voici tout ce dont vous aurez besoin pour votre premier événement Play! Pokémon'), 'off-topic');
});

test('films, cards, PC parts, word puzzles and streamers are off topic; a TECH BYTES feed is read for its games items only', () => {
  assert.equal(gamesTopic(item('The Batman 2 is set to resume filming with Steven Soderbergh stepping in for Matt Reeves')), false);
  assert.equal(gamesTopic(item("MTG's New Foundations Commander Decks Return to Online Retailers After Stock Shortages")), false);
  assert.equal(gamesTopic(item('Linux kernel drops AI-contribution disclosure rule')), false);
  assert.equal(gamesTopic(item('How To Solve Today’s Wordle - October 17 2026 Answer #1946')), false);
  assert.equal(gamesTopic(item('Hololive Vtuber Kiara Takanashi on Hiatus for a Month')), false);
  // a film named only in the opening sentence, under a headline with no word of games
  assert.equal(gamesTopic(item('Street Fighter review roundup: sorry, folks, but it sounds like a mess', 'The new Street Fighter movie has arrived in cinemas.')), false);
  assert.equal(gamesTopic(item('Ubisoft to reduce workforce across Düsseldorf, Berlin, and Mainz')), true);
  assert.equal(gamesTopic(item('AI giant Anthropic woos potential investors', '', { kind: 'channel-tech' })), false);
  assert.equal(gamesTopic(item('GTA 6 - all you need to know about Rockstar’s blockbuster game', '', { kind: 'channel-tech' })), true);
});

test('game titles and fiction never read as the real world (the channel’s grave words misfire on games copy)', () => {
  // "Grand Theft Auto" is no theft, "Act 1" no law, a puzzle game no newspaper puzzle, "The Last of Us" no first person
  assert.equal(first('Massive GTA 6 Banner In Paris Censors All Of The Guns', 'Grand Theft Auto is a franchise that famously includes guns.'), null);
  assert.equal(classify(item('Stranger Than Heaven Act 1: Kokura Story Trailer released')).kinds.includes('legal'), false);
  assert.equal(first('Porta Nubi turns the iPhone Duo into part of the puzzle'), null);
  assert.equal(first('The Last of Us directors used to say "nobody" was making games like them'), null);
  // RIP in capitals only
  assert.equal(classify(item("Smash Bros creator says original games will be harder for AI to rip off, but they're harder to sell")).treatment, 'news');
  // an industry figure's death is a tribute, not off
  const c = classify(item('Duke Nukem 3D level designer Richard "Levelord" Gray dies aged 68'));
  assert.equal(c.out, null);
  assert.equal(c.treatment, 'tribute');
  // a leak as the event, not leaks as a subject a studio talks about
  assert.notEqual(first('GTA 6 was originally Project Americas and covered "big swaths" of country’s north and south, Rockstar reveals, in interview tackling crunch, delays, and leaks'), 'leak');
});

test('how the rest is told: hardship serious, law plain, praise flagged', () => {
  assert.equal(classify(item('Fishlabs announces layoffs due to "changing project requirements"')).treatment, 'serious');
  assert.equal(classify(item('Rep. Ritchie Torres Introduces Legislation to Ensure Gamers Own Their Digital Games')).treatment, 'legal');
  assert.ok(classify(item("Hit Co-Op Game Peak Officially Confirmed for PS5, and It's Coming Very Soon")).kinds.includes('evaluative words'));
  // the event rules (the whole event off) are carried by the report
  assert.deepEqual(classify(item('Footage from a reportedly cancelled Assassin’s Creed game set in China has leaked')).event.sort(), ['leak', 'rumour']);
});

test('a single outlet’s event airs only on a headline that states an act', () => {
  assert.equal(hasNewsVerb('Vixen 357 coming to PS5, Xbox Series, PS4, Xbox One, Switch, and PC on October 23'), true);
  assert.equal(hasNewsVerb('Fishlabs announces layoffs due to "changing project requirements"'), true);
  assert.equal(hasNewsVerb('The happiest man in gaming hates generative AI'), false);
  assert.equal(hasNewsVerb('"Years of building, pitching and raising for games made the same failure painful to watch" – Why GameDataCore wants to find out how players feel'), false);
});

test('a quotation is someone else’s words, an apostrophe inside it included', () => {
  assert.equal(unquoted("WoW: Forever devs say gear upgrades will stay relevant: 'It's very much our intention to try'").includes('our'), false);
  assert.equal(unquoted('He said “we are here” today').includes('we'), false);
});

test('a review’s verdict is the outlet’s own words after "review –"', () => {
  assert.deepEqual(reviewVerdict('Penguin Colony review – an Antarctic odyssey of Nazis and Lovecraftian horrors'), { game: 'Penguin Colony', verdict: 'an Antarctic odyssey of Nazis and Lovecraftian horrors' });
  assert.deepEqual(reviewVerdict("Review: The Witch's Bakery (Switch 2) – A Cosy Narrative Sim That Rises To The Occasion"), { game: "The Witch's Bakery", verdict: 'A Cosy Narrative Sim That Rises To The Occasion' });
  assert.equal(reviewVerdict('Asus ROG Xbox Ally X20 review'), null);
});

test('release dates: stated plainly, ahead, never a demo, a console’s name no series', () => {
  const at = Date.parse('2026-10-16T15:48:00Z');
  assert.deepEqual(releaseDate({ title: 'Vixen 357 coming to PS5, Xbox Series, PS4, Xbox One, Switch, and PC on October 23', published: at }), { date: '2026-10-23', sentence: 'Vixen 357 coming to PS5, Xbox Series, PS4, Xbox One, Switch, and PC on October 23' });
  assert.equal(releaseDate({ title: 'Guns of Eschaton launches December 8', published: at }).date, '2026-12-08');
  assert.equal(releaseDate({ title: 'Second Stone demo launches October 19', published: at }), null);
  assert.equal(releaseDate({ title: 'The Third Version of Arizona Sunshine Is Dated for January 2027', published: at }), null); // a month is no date
  // a day already past without a year is next year's
  assert.equal(releaseDate({ title: 'Some Game launches January 9', published: at }).date, '2027-01-09');
  // a date past when filed is not ahead
  assert.equal(releaseDate({ title: 'Some Game launched on October 2, 2026', published: at }), null);
});

test('London days in summer and winter time', () => {
  assert.deepEqual(londonDay(Date.parse('2026-10-15T23:30:00Z')), { day: '2026-10-16', hour: 0 });
  assert.deepEqual(londonDayBounds('2026-10-16'), { start: Date.parse('2026-10-15T23:00:00Z'), end: Date.parse('2026-10-16T23:00:00Z') });
  assert.deepEqual(londonDayBounds('2026-12-16'), { start: Date.parse('2026-12-16T00:00:00Z'), end: Date.parse('2026-12-17T00:00:00Z') });
  // the clocks go back on 25 Oct 2026: a 25-hour day
  const b = londonDayBounds('2026-10-25');
  assert.equal((b.end - b.start) / 3600_000, 25);
});

test('a reading covers from its oldest item, an evergreen page and a long gap aside', () => {
  const H = 3600_000;
  const at = Date.parse('2026-10-16T16:00:00Z');
  // GameSpot: 29 items in two days and one 120 days older
  const ts = [...Array.from({ length: 29 }, (_, i) => at - i * 1.5 * H), at - 120 * 24 * H];
  assert.deepEqual(readingCovers(ts, at), [at - 28 * 1.5 * H, at]);
  // a trade desk's weekend: a 64-hour gap is still read whole
  const trade = [at, at - 10 * H, at - 74 * H, at - 80 * H];
  assert.deepEqual(readingCovers(trade, at), [at - 80 * H, at]);
  assert.deepEqual(mergeIntervals([[5, 9], [1, 3], [2, 6], [11, 12]]), [[1, 9], [11, 12]]);
  assert.equal(linkKey('https://Example.com/a/b/?utm=1#x'), 'https://example.com/a/b');
});

test('two reports are one event only when they share what happened, not just a franchise’s names', () => {
  const desk = new NewsDesk({ log: { info() {}, warn() {}, error() {} } });
  const at = Date.parse('2026-10-14T10:00:00Z');
  const mk = (id, source, title) => ({ id, source, title, summary: '', published: at, kw: keywords(title) });
  const a = mk('a', 'eurogamer', "Ubisoft closing Trials developer RedLynx and downsizing Assassin's Creed: Black Flag Resynced team in Singapore");
  const b = mk('b', 'gibiz', 'Ubisoft closing Trials developer RedLynx and cutting jobs in Singapore studio');
  const c = mk('c', 'rps', "Cut Assassin's Creed Black Flag Resynced epilogue scene allegedly taken down by Ubisoft following datamine");
  for (const s of [a, b, c]) desk.stories.set(s.id, s);
  assert.equal(sameGamesEvent(desk, a, b), true);
  assert.equal(sameGamesEvent(desk, a, c), false);
  const events = [...clusterEvents([a, b, c], desk).values()].map((e) => e.map((s) => s.id).sort().join(''));
  assert.deepEqual(events.sort(), ['ab', 'c']);
});

test('the accent’s distances and contrasts', () => {
  assert.equal(deltaE2000('#feae34', '#feae34'), 0);
  assert.ok(Math.abs(deltaE2000('#000000', '#ffffff') - 100) < 0.01);
  assert.ok(Math.abs(deltaE2000('#fee761', '#feae34') - deltaE2000('#feae34', '#fee761')) < 1e-9);
  assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 1e-9);
  // the lemon sits further from NEWS IN 60's yellow than WORLD NOW's red sits from SEVEN DAYS's coral
  assert.ok(deltaE2000('#fee761', '#feae34') > deltaE2000('#e43b44', '#f6757a'));
});

test('the hand check scores the tool against the editor', () => {
  const items = [
    { outlet: 'a', title: 'One', out: null, chosen: true },
    { outlet: 'a', title: 'Two', out: 'guide' },
    { outlet: 'b', title: 'Three', out: null, chosen: true },
    { outlet: 'b', title: 'Four', out: 'outlet voice' },
  ];
  const labels = [
    { outlet: 'a', title: 'One', hand: 'use' },
    { outlet: 'a', title: 'Two', hand: 'out' },
    { outlet: 'b', title: 'Three', hand: 'out' },
    { outlet: 'b', title: 'Four', hand: 'use' },
  ];
  const r = score(items, labels);
  assert.deepEqual([r.tp, r.fp, r.fn, r.tn, r.precision, r.recall], [1, 1, 1, 1, 50, 50]);
  const c = score(items, labels, { chosen: true });
  assert.deepEqual([c.n, c.tp, c.fp, c.precision], [2, 1, 1, 50]);
});
