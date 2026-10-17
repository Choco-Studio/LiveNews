// The verbatim lint (server/compliance/verbatim.js; docs/publishing/verbatim.md): runs of the outlet's own words in
// what we say, outside attributed quotations; the 12-word run and the 20 % share; the episode lint the writer team
// runs and the publish-time check applies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, quotedSpans, verbatimRuns, storyReport, lintEpisode, MAX_RUN, MAX_SHARE } from '../server/compliance/verbatim.js';
import { preflight } from '../server/compliance/index.js';

const ARTICLE = 'The city council voted on Tuesday to close the old harbour bridge to cars from next spring, after engineers found that its steel supports had corroded far faster than expected. The mayor said the decision was painful but necessary. "We cannot ask people to drive over a bridge we no longer trust," she told reporters. A temporary ferry will carry cyclists and pedestrians across the river while a replacement is designed.';

test('words and attributed quotations: a speaker\'s quoted words are exempt, an outlet\'s phrase in quotation marks is not', () => {
  assert.deepEqual(tokens("Don't stop — it's 3.5% now").map((t) => t.w), ['dont', 'stop', 'its', '3', '5', 'now']);
  const said = 'The mayor was clear. "We cannot ask people to drive over a bridge we no longer trust," she told reporters.';
  assert.equal(quotedSpans(said).length, 1);
  const scare = 'The bridge was described as "corroded far faster than expected" in a report.';
  assert.equal(quotedSpans(scare).length, 1, 'described as… is an attribution');
  assert.equal(quotedSpans('Officials called it "a painful but necessary step" for the river.').length, 0, 'no verb of saying: not exempt');
});

test('runs: the longest stretch of the source\'s words, in order', () => {
  const aired = 'Engineers found that its steel supports had corroded far faster than expected, so the bridge will close to cars.';
  const runs = verbatimRuns(aired, [ARTICLE], { min: 6 });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].length, 12);
  assert.equal(runs[0].text, 'Engineers found that its steel supports had corroded far faster than expected');
});

test('a story read out from its article breaks both rules; a story told in our words with the mayor\'s quote passes', () => {
  const copied = storyReport('The city council voted on Tuesday to close the old harbour bridge to cars from next spring, after engineers found that its steel supports had corroded far faster than expected.', [ARTICLE]);
  assert.ok(copied.longest > MAX_RUN);
  assert.deepEqual(copied.violations.map((v) => v.rule).sort(), ['run', 'share']);
  const ours = storyReport('The old harbour bridge will shut to cars next spring. Its steel has rusted faster than engineers thought. "We cannot ask people to drive over a bridge we no longer trust," the mayor told reporters. A ferry will take cyclists and walkers across meanwhile.', [ARTICLE]);
  assert.deepEqual(ours.violations, [], JSON.stringify(ours.runs));
  assert.equal(ours.quoted, 13, 'the quote (13 words) is not counted');
  assert.ok(ours.share <= MAX_SHARE);
});

test('the episode lint: per story, with the reading and the expert\'s answer; a story without its sources is unverified', () => {
  const ep = {
    segments: [
      { type: 'story', storyId: 's1', text: 'The city council voted on Tuesday to close the old harbour bridge to cars from next spring.' },
      { type: 'cross', part: 'piece', kind: 'expert', storyId: 's1', text: 'A temporary ferry will carry cyclists and pedestrians across the river while a replacement is designed.' },
      { type: 'story', storyId: 's2', text: 'Rain is on the way.' },
    ],
  };
  const r = lintEpisode(ep, { getStory: (id) => (id === 's1' ? { title: 'Harbour bridge to close', summary: '', body: ARTICLE } : null) });
  assert.equal(r.ok, false);
  assert.ok(r.violations.every((v) => v.storyId === 's1'));
  assert.equal(r.stories.find((s) => s.storyId === 's2').unverified, true);
  assert.equal(lintEpisode(ep, { getStory: () => null, strict: true }).violations.filter((v) => v.rule === 'unverified').length, 2);
  // the publish-time check refuses it (the writer team's lint is upstream; this is the last net)
  const pf = preflight({ id: 'e1', kind: 'episode', episode: { id: 'e1', provider: 'mock', program: { id: 'world-now' }, storyIds: ['s1'], segments: ep.segments.slice(0, 2) }, platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: true } } }, { calendar: { generatedAt: new Date().toISOString(), elections: [] }, env: { EDITORIAL_CONTACT: 'x@example.org' }, getStory: () => ({ title: 'Harbour bridge to close', body: ARTICLE }), requireReview: false });
  assert.ok(pf.violations.some((v) => v.rule === 'verbatim'));
});
