import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notNews } from '../server/news.js';
import { dropPageFurniture } from '../server/transcript.js';
import { shortHeadline } from '../server/writer.js';
import { topicOf } from '../server/topics.js';

// Faults heard on a live trace with real news (10 Oct), each kept from airing again.

test('a newsletter that greets its readers is no report (The Verge: "Hi, friends! ... Part time, anyway.")', () => {
  assert.ok(notNews({ title: 'The techlash has gone Hollywood', summary: 'Hi, friends! Part time, anyway. Thanks to everyone who sent well wishes and tips for managing three kids.' }));
  assert.ok(notNews({ title: 'This week in batteries', summary: 'Welcome to the weekly briefing.' }));
  assert.ok(notNews({ title: 'Gadgets of the week', summary: 'The new phones arrived.', body: 'Happy Friday! Here is what landed this week.' }));
  assert.ok(!notNews({ title: 'Central bank raises rates', summary: 'Hiring slowed in September, officials said.' }));
  assert.ok(!notNews({ title: 'Hi-tech port opens in Rotterdam', summary: 'Hi-tech cranes began work on Monday.' }), 'a hyphenated "Hi-tech" is no greeting');
});

test('a feed summary cut right after a title\'s full stop loses the half sentence ("Byrnes texted Ohio Sen. […]")', () => {
  const summary = 'A jury found an Ohio political blogger guilty. On Friday, a judge ordered DJ Byrnes to pay a $200 fine. Byrnes texted Ohio Sen. [&#8230;]';
  assert.equal(dropPageFurniture(summary), 'A jury found an Ohio political blogger guilty. On Friday, a judge ordered DJ Byrnes to pay a $200 fine.');
  assert.equal(dropPageFurniture('Gov. Smith signed the bill on Monday. It takes effect in May.'), 'Gov. Smith signed the bill on Monday. It takes effect in May.', 'a title inside a whole sentence stays');
});

test('a two-sentence title that does not fit the strap is its first sentence, never "... AI AGENTS. IT’S"', () => {
  assert.equal(shortHeadline('Anthropic can’t reliably control its AI agents. It’s cutting off its internal evals from the live internet instead', 56), 'Anthropic can’t reliably control its AI agents');
  assert.equal(shortHeadline('U.S. stocks rise. Bonds fall', 56), 'U.S. stocks rise. Bonds fall', 'a short one fits whole');
});

test('a film is CULTURE whatever its plot ("a family on trial" is not JUSTICE)', () => {
  assert.equal(topicOf({ title: 'Director of Fjord takes ‘risky position’ of moderator', summary: 'Cristian Mungiu’s sixth feature, Fjord, concerns a family on trial.', category: 'tech' }), 'CULTURE');
  assert.equal(topicOf({ title: 'Court upholds ban on protest camp', summary: 'The judges ruled on Monday.', category: 'world' }), 'PROTESTS');
  assert.notEqual(topicOf({ title: 'FBI director testifies before senators', summary: 'The director answered questions for three hours.', category: 'world' }), 'CULTURE', 'a director is not a film');
});
