// A fake AI provider for the writer's tests (no key, no network): it answers each stage of the provider chain (write,
// rewrite, review) with canned model outputs, in order, and records every request it was sent. The canned stories are
// invented (a fictional outlet, real places so the gazetteer knows them); the canned scripts cover the cases the own-words
// check must handle: a script in the channel's own words, one that copies its article, and ones with paraphrase traps
// (a figure changed, an attribution moved, a hedge dropped).
//
//   createFakeModel({ name, write, rewrite, review, fail }) -> provider (+ .calls)
//     each of write / rewrite / review: a string, a function (request) -> string, or an array of them (one per call,
//     the last one repeated); `fail`: { stage: Error } makes that stage throw (a provider down or out of quota)
//   STORIES, script(segments), seg(id, text, extra), GOOD, COPIED, TRAPS

export function createFakeModel({ name = 'fakeai', write = null, rewrite = null, review = null, fail = {} } = {}) {
  const queues = { write, rewrite, review };
  const used = { write: 0, rewrite: 0, review: 0 };
  const calls = [];
  return {
    name,
    calls,
    available: () => true,
    async generate(request) {
      const stage = request.stage || 'write';
      calls.push({ stage, prompt: request.prompt, request });
      if (fail[stage]) throw fail[stage];
      let answer = queues[stage];
      if (Array.isArray(answer)) answer = answer[Math.min(used[stage], answer.length - 1)];
      used[stage]++;
      // a review that is not scripted returns the script it was given (an editor with nothing to correct)
      if (answer == null && stage === 'review') answer = JSON.stringify(request.script);
      if (answer == null) throw new Error(`fake model: no ${stage} reply scripted`);
      const text = typeof answer === 'function' ? answer(request) : answer;
      const tokens = (s) => Math.ceil(String(s || '').length / 4);
      return { text, usage: { input: tokens(request.prompt), output: tokens(text), cached: 0 } };
    },
  };
}

const NOW = Date.now();

const LISBON_ARTICLE =
  'The city council may close the old harbour bridge to cars next spring, after engineers found corrosion in its steel supports. ' +
  'Mayor Ana Silva said the closure would cost about 40 million euros over two years. ' +
  'Opposition leader Rui Costa said the decision was rushed and would hurt local shops on both banks of the river. ' +
  '"We cannot ask people to drive over a bridge we no longer trust," Silva told reporters on Tuesday. ' +
  'A temporary ferry would carry cyclists and pedestrians across the river while a replacement is designed.';

const SEVILLE_ARTICLE =
  'A solar farm outside Seville began supplying power to the grid on Monday, its operator said. ' +
  'The plant can supply about 40,000 homes and cost 120 million euros to build on former farmland. ' +
  'The regional government expects the farm to cut emissions by 60,000 tonnes a year. ' +
  'Police said a man allegedly stole copper cable from the site during construction last year.';

const OSLO_ARTICLE =
  'The main public library in Oslo will open on Sundays from next month, the city announced on Wednesday. ' +
  'Visitor numbers rose by 12 percent last year, and the library wants to give students more space at weekends. ' +
  'The extra opening hours will be paid for by a grant of 3 million kroner. ' +
  'Librarians said the change could be extended to branch libraries if demand stays high.';

const GDANSK_ARTICLE =
  'Train drivers in Gdansk will strike for 24 hours on Friday in a dispute over pay, their union said. ' +
  'The union is asking for a rise of 15 percent and says talks with the regional rail operator have broken down. ' +
  'The operator said it would run a reduced timetable with buses replacing some trains.';

/** Four candidate stories with their articles (the news desk's `body`). */
export const STORIES = [
  { id: 'lis', title: 'Lisbon council may close old harbour bridge to cars', summary: 'The city council may close the old harbour bridge to cars next spring, after engineers found corrosion in its steel supports.', body: LISBON_ARTICLE, source: 'Harbour Herald', category: 'world', link: 'https://example.test/lis', published: NOW - 60_000, weight: 1, image: null },
  { id: 'sev', title: 'Solar farm near Seville starts supplying the grid', summary: 'A solar farm outside Seville began supplying power to the grid on Monday, its operator said.', body: SEVILLE_ARTICLE, source: 'Pixel Wire', category: 'world', link: 'https://example.test/sev', published: NOW - 120_000, weight: 1, image: null },
  { id: 'osl', title: 'Oslo library to open on Sundays', summary: 'The main public library in Oslo will open on Sundays from next month, the city announced on Wednesday.', body: OSLO_ARTICLE, source: 'Circuit Weekly', category: 'world', link: 'https://example.test/osl', published: NOW - 180_000, weight: 1, image: null },
  { id: 'gda', title: 'Gdansk train drivers to strike on Friday', summary: 'Train drivers in Gdansk will strike for 24 hours on Friday in a dispute over pay, their union said.', body: GDANSK_ARTICLE, source: 'Harbour Herald', category: 'world', link: 'https://example.test/gda', published: NOW - 240_000, weight: 1, image: null },
];

/** A story segment as the writer gives it. */
export const seg = (storyId, text, extra = {}) => ({ type: 'story', storyId, anchor: 'A', emotion: 'neutral', headline: null, text, shot: 'wide', breaking: false, location: null, fact: null, ...extra });

/** A whole script: intro, the story segments, outro. */
export const script = (segments, title = 'Fake bulletin') =>
  JSON.stringify({
    title,
    segments: [{ type: 'intro', anchor: 'A', emotion: 'neutral', text: 'This is THE DUO.' }, ...segments, { type: 'outro', anchor: 'A', emotion: 'neutral', text: 'That was THE DUO.' }],
  });

/** The stories in the channel's own words: facts kept, sentences composed, the mayor's words as an attributed quote. */
export const GOOD = {
  lis: 'Cars may be kept off the old harbour bridge in Lisbon. Engineers found corrosion in its steel supports, and the council may shut it to traffic next spring. "We cannot ask people to drive over a bridge we no longer trust," Silva told reporters. The Harbour Herald reports that the mayor puts the cost at about 40 million euros.',
  sev: 'Power from a new solar farm near Seville is now flowing into the grid. Its operator says the plant, built on former farmland for 120 million euros, has enough output for about 40,000 homes. The regional government expects emissions to fall by 60,000 tonnes a year, Pixel Wire reports.',
  osl: 'From next month, readers in Oslo can use the main public library on Sundays too. Visits were up 12 percent last year, the city says, and students want more space at weekends. The extra hours are funded with 3 million kroner from a grant, Circuit Weekly reports.',
  gda: 'Rail travel in Gdansk faces a day of disruption on Friday. Train drivers plan a 24-hour strike over pay and want a rise of 15 percent, their union says. The operator says buses will replace some trains on a reduced timetable.',
};

/** The same stories read out from their articles (the fallback writer's way): every one breaks the verbatim rule. */
export const COPIED = {
  lis: 'The city council may close the old harbour bridge to cars next spring, after engineers found corrosion in its steel supports, the Harbour Herald reports.',
  sev: 'A solar farm outside Seville began supplying power to the grid on Monday, its operator said. The plant can supply about 40,000 homes and cost 120 million euros to build on former farmland.',
  osl: 'The main public library in Oslo will open on Sundays from next month, the city announced on Wednesday. Visitor numbers rose by 12 percent last year.',
  gda: 'Train drivers in Gdansk will strike for 24 hours on Friday in a dispute over pay, their union said.',
};

/** Paraphrase traps: each sentence changes what its source says while the words are the writer's own. */
export const TRAPS = {
  // a figure changed: 45,000 homes for "about 40,000"
  figure: 'Its operator says the plant near Seville can now supply 45,000 homes with power.',
  // a figure swapped for another of the same source: 60,000 homes (the 60,000 is the tonnes of emissions)
  swapped: 'Its operator says the plant, built on former farmland for 120 million euros, has enough output for about 60,000 homes.',
  // an attribution moved: the mayor's cost estimate given to the opposition leader
  attribution: 'Rui Costa said about 40 million euros is what the closure would cost over two years.',
  // a hedge dropped: "may close" said as "will close"
  hedge: 'Next spring the council will close the old bridge over the harbour to cars.',
  // a caution dropped: "allegedly stole" said as a fact
  caution: 'During construction last year, a man stole copper cable from the solar site.',
};
