// PAY ATTENTION's lab cases (public/lab/quiz.html): every board the lab shows, with its data and its clock. The lab
// draws them; test/pay-attention-graphics.test.js draws the same boards at the same moments and checks every text stays
// whole inside its board. Real questions from the writer's editions of 13 Oct unless marked otherwise.
//
//   quizCases({ Q, pics, HN, NOW }) -> [[id, caption, { len, moments: { open, reading, countdown, locks, step4, reveal,
//   settled }, draw(ctx, t) }], ...]   (Q: scenes/cards-quiz.js; pics: { device, ice, corridor, rocket, owl, phone })
export const MOMENTS = Object.freeze(['open', 'reading', 'countdown', 'locks', 'step4', 'reveal', 'settled']);

export function quizCases({ Q, pics: PICS, HN, NOW }) {
  const H = 3600_000;
  // ---------------------------------------------------------------- data: real questions from the editions of 13 Oct
  const LOLA = { seat: 'A', name: 'LOLA', id: 'lola' };
  const SAM = { seat: 'B', name: 'SAM', id: 'sam' };
  const PENNY = { seat: 'A', name: 'PENNY', id: 'penny' };
  const UNIT8 = { seat: 'B', name: 'UNIT-8', id: 'unit8' };
  const aired = (programme, hoursAgo, source) => ({ programme, at: NOW - hoursAgo * H, source });
  const PIC_APPLE = { type: 'picture', key: 'sde48459db6', words: 'Apple launches Apple TV 4K with Siri AI and voice commands', steps: [8, 16, 32, 64], aired: { programme: 'tech-bytes', at: 1791919961993, source: 'TechCrunch' }, options: [{ letter: 'A', words: 'Apple launches Apple TV 4K with Siri AI and voice commands', desk: 'tech' }, { letter: 'B', words: 'Long-lost horror gaming cult classic P.T. gets much-needed PC port', desk: 'tech' }, { letter: 'C', words: 'Antarctic Sea Ice Grows to Its 2026 Maximum', desk: 'science' }], answer: 'A' };
  // the hardest: three headlines of 71-72 characters, each on its tile's three lines
  const PIC_LONG = { type: 'picture', key: 'hard72', words: 'Bumble agrees to a $1.3B acquisition deal as online dating faces a reset', steps: [8, 16, 32, 64], aired: { programme: 'tech-bytes', at: NOW - 26 * H, source: 'The Wall Street Journal' }, options: [{ letter: 'A', words: 'Fitbit Edge is Google’s middle ground between Fitbit Air and Pixel Watch' }, { letter: 'B', words: 'Smart ring maker Ultrahuman to roll out biological-age model across UAE' }, { letter: 'C', words: 'Bumble agrees to a $1.3B acquisition deal as online dating faces a reset' }], answer: 'C' };
  const PIC_ROCKET = { type: 'picture', key: 'saaf6e65b18', words: 'Mars moon lander set to launch on 19 October', steps: [8, 16, 32, 64], aired: { programme: 'cosmos', at: 1791920000891, source: 'ESA' }, options: [{ letter: 'A', words: 'Prime Video unveils Blade Runner 2099 full trailer' }, { letter: 'B', words: 'Mars moon lander set to launch on 19 October' }, { letter: 'C', words: 'Stinky \'skunk\' plant cleared from river' }], answer: 'B' };
  const WHERE_US = { type: 'where', key: 's971565739d', words: "'Jellyfish' effect lights up US sky", masked: "'Jellyfish' effect lights up ▮▮▮▮▮ sky", desk: 'science', aired: { programme: 'tech-bytes', at: 1791919961993, source: 'BBC Science' }, options: [{ letter: 'A', label: 'UAE', country: 'United Arab Emirates', lat: 23.4, lon: 53.8 }, { letter: 'B', label: 'USA', country: 'United States', lat: 39.8, lon: -98.6 }, { letter: 'C', label: 'JAPAN', country: 'Japan', lat: 36.2, lon: 138.3 }], answer: 'B' };
  const WHERE_F1 = { type: 'where', key: 'sc5e0195fa8', words: "F1 in Singapore: There's new fastest car now", masked: "F1 in ▮▮▮▮▮: There's new fastest car now", desk: 'tech', aired: { programme: 'tech-bytes', at: 1791845049947, source: 'Ars Technica' }, options: [{ letter: 'A', label: 'SINGAPORE', country: 'Singapore', lat: 1.35, lon: 103.8 }, { letter: 'B', label: 'NEW ZEALAND', country: 'New Zealand', lat: -41.3, lon: 174 }, { letter: 'C', label: 'UNITED KINGDOM', country: 'United Kingdom', lat: 54, lon: -2 }], answer: 'A' };
  // a three-line hard case: the full name on the tag, the longest masked headline (71 characters)
  const WHERE_UAE = { type: 'where', key: 's7a20cda744', words: 'Smart ring maker Ultrahuman to roll out biological-age model across UAE', masked: 'Smart ring maker Ultrahuman to roll out biological-age model across ▮▮▮▮▮', desk: 'tech', aired: { programme: 'tech-bytes', at: 1791845049947, source: 'TechCrunch' }, options: [{ letter: 'A', label: 'NETHERLANDS', country: 'Netherlands', lat: 52.2, lon: 5.5 }, { letter: 'B', label: 'UNITED ARAB EMIRATES', country: 'United Arab Emirates', lat: 23.4, lon: 53.8 }, { letter: 'C', label: 'TANZANIA', country: 'Tanzania', lat: -6.4, lon: 34.9 }], answer: 'B' };
  // neighbouring pins in three regions (Egypt, Jordan, Greece: within 15 degrees), a lab headline of the desk's form
  const WHERE_NEAR = { type: 'where', key: 'near', words: 'Ancient harbour found beneath Alexandria shoreline by divers', masked: 'Ancient harbour found beneath ▮▮▮▮▮ shoreline by divers', aired: aired('cosmos', 30, 'Lab'), options: [{ letter: 'A', label: 'JORDAN', lat: 31.2, lon: 36.5 }, { letter: 'B', label: 'GREECE', lat: 39.1, lon: 21.8 }, { letter: 'C', label: 'EGYPT', lat: 26.8, lon: 30.8 }], answer: 'C' };
  const HM_HOMEPOD = { type: 'howmany', words: 'Apple refreshes its HomePod mini', masked: "The new ▮▮▮▮ HomePod mini with Siri AI and a 'SoundGlow' visual feature will be available starting October 30.", sentence: "The new $149 HomePod mini with Siri AI and a 'SoundGlow' visual feature will be available starting October 30.", figure: { value: '$149', label: 'HOMEPOD MINI', qualifier: '', exact: true }, aired: { programme: 'tech-bytes', at: 1791921931674, source: 'TechCrunch' } };
  const HM_BUMBLE = { type: 'howmany', words: 'Bumble agrees to a $1.3B acquisition deal', masked: 'After years of declining subscriber numbers and falling revenue, Bumble just agreed to a ▮▮▮▮▮▮ acquisition.', sentence: 'After years of declining subscriber numbers and falling revenue, Bumble just agreed to a $1.3 billion acquisition.', figure: { value: '$1.3 billion', label: 'ACQUISITION', qualifier: '', exact: true }, aired: { programme: 'tech-bytes', at: 1791919961993, source: 'TechCrunch' } };
  const HM_OWLS = { type: 'howmany', words: 'Owls ringed to measure benefits of wildlife farming', masked: 'A barn owl and ▮▮ chicks are ringed to see if conservation-focused farming is working, according to BBC Science.', sentence: 'A barn owl and 15 chicks are ringed to see if conservation-focused farming is working, according to BBC Science.', figure: { value: '15', label: 'CHICKS', qualifier: '', exact: true }, aired: { programme: 'cosmos', at: 1791922668133, source: 'BBC Science' } };
  // a six-digit figure with a qualifier kept beside the mask (a lab sentence of the form the desk takes)
  const HM_SIX = { type: 'howmany', words: 'Red squirrel project opens community grant', masked: 'The project says up to ▮▮▮▮▮▮ red squirrels could return to the woods within ten years.', sentence: 'The project says up to 250,000 red squirrels could return to the woods within ten years.', figure: { value: '250,000', label: 'RED SQUIRRELS', qualifier: 'UP TO', exact: false }, aired: aired('cosmos', 52, 'BBC Science') };
  const LET_XBOX = { type: 'letters', words: 'Xbox is officially embracing chaos of AI-powered game ports', desk: 'tech', reveal: { shown: [0, 4, 5, 7, 8, 18, 19, 28, 29, 34, 35, 37, 38, 40, 41, 48, 49, 53, 54], order: [3, 46, 11, 31, 56, 21, 50, 12, 52, 57, 25, 36, 51, 15, 24, 47, 14, 27, 2, 44, 22, 33, 1, 42, 32, 45, 58, 9, 6, 16, 13, 10, 30, 39, 17, 20, 55, 26, 23, 43], stages: [10, 20, 30] }, aired: { programme: 'tech-bytes', at: 1791919961993, source: 'The Verge' } };
  const LET_SQUIRREL = { type: 'letters', words: 'Red squirrel project opens £250k community grant', desk: 'science', reveal: { shown: [0, 3, 4, 12, 13, 20, 21, 26, 27, 28, 29, 30, 31, 32, 33, 42, 43], order: [40, 2, 25, 18, 46, 5, 7, 47, 10, 6, 36, 24, 1, 8, 23, 35, 22, 11, 39, 41, 19, 45, 16, 37, 15, 34, 14, 9, 38, 44, 17], stages: [8, 16, 24] }, aired: { programme: 'cosmos', at: 1791922668133, source: 'BBC Science' } };
  const LET_APPLE = { type: 'letters', words: 'Apple’s smart home lineup includes smart lock', desk: 'tech', reveal: { shown: [0, 5, 7, 8, 13, 14, 18, 19, 25, 26, 34, 35, 40, 41], order: [44, 22, 32, 3, 15, 12, 36, 38, 43, 23, 2, 28, 42, 20, 30, 21, 10, 9, 16, 4, 33, 1, 24, 6, 31, 29, 39, 11, 37, 17, 27], stages: [8, 16, 24] }, aired: { programme: 'tech-bytes', at: 1791921931674, source: 'TechCrunch' } };
  // TODAY OR NOT TODAY: real headlines of the archive, with the lab's own airings (the archive has no story from two days back yet)
  const TODAY_ITEMS = [
    { words: 'Antarctic Sea Ice Grows to Its 2026 Maximum', answer: 'EARLIER', aired: aired('cosmos', 76, 'NASA') },
    { words: 'Facebook will let you customize your feed algorithm using AI', answer: 'TODAY', aired: aired('tech-bytes', 1.2, 'The Verge') },
    { words: 'Paris Auto Show is full of interesting cars Americans can’t have', answer: 'EARLIER', aired: aired('money-minute', 100, 'The Verge') },
  ];

  // (each board's options are built once, as the director's will be: the boards cache by their objects)
  const lockList = (locks) => locks.map(([seat, answer, at]) => ({ seat, answer, at }));
  const picBoard = (q, image, players, locks, kicker, extra = {}) => {
    const o = { question: q, image, players, kicker, optionsAt: 1, countdown: { at: 15, dur: 7 * HN }, locks: lockList(locks), revealAt: 23, now: NOW, ...extra };
    return { len: 26, moments: { open: 0.8, reading: 8, countdown: 15.6, locks: 18.6, step4: 20.5, reveal: 23.4, settled: 25.5 }, draw: (ctx, t) => Q.drawQuestionBoard(ctx, t, o) };
  };
  const letBoard = (q, players, buzzes, winner, kicker, extra = {}) => {
    const o = { question: q, players, kicker, stageTimes: [3, 3 + 3 * HN, 3 + 6 * HN], countdown: { at: 3, dur: 9 * HN }, buzzes, winner, revealAt: 13, now: NOW, ...extra };
    return { len: 16, moments: { open: 0.8, reading: 2.5, countdown: 5, locks: 8.2, step4: 10.5, reveal: 13.4, settled: 15.5 }, draw: (ctx, t) => Q.drawLettersBoard(ctx, t, o) };
  };
  const whereBoard = (q, players, locks, kicker) => {
    const o = { question: q, players, kicker, pinsAt: 2.2, countdown: { at: 5, dur: 6 * HN }, locks: lockList(locks), revealAt: 13, now: NOW };
    return { len: 17, moments: { open: 0.6, reading: 2.5, countdown: 6, locks: 9.2, step4: 11.5, reveal: 13.3, settled: 16.5 }, draw: (ctx, t) => Q.drawWhereBoard(ctx, t, o) };
  };
  const hmBoard = (q, players, guesses, kicker) => {
    const o = { question: q, players, kicker, countdown: { at: 6, dur: 4 * HN }, guesses: guesses.map(([seat, said, at, points]) => ({ seat, said, at, points })), revealAt: 11, now: NOW };
    return { len: 14, moments: { open: 0.8, reading: 2.5, countdown: 6.5, locks: 8, step4: 9.5, reveal: 11.4, settled: 13.5 }, draw: (ctx, t) => Q.drawHowManyBoard(ctx, t, o) };
  };
  const todayBoard = (item, index, players, locks, tally) => {
    const o = { item, index, total: 6, players, countdown: { at: 3.2, dur: 3 * HN }, locks: lockList(locks), tally, revealAt: 6, now: NOW };
    return { len: 8, moments: { open: 0.8, reading: 2, countdown: 3.6, locks: 5, step4: 5.5, reveal: 6.2, settled: 7.8 }, draw: (ctx, t) => Q.drawTodayBoard(ctx, t, o) };
  };
  const still = (draw, len = 3) => ({ len, moments: { open: 0.5, reading: 1.2, countdown: len, locks: len, step4: len, reveal: len, settled: len }, draw });

  return [
    ['picture', 'PICTURE THIS · real (13 Oct): Lola at step 2, Sam at step 3 on another tile', picBoard(PIC_APPLE, PICS.device, [LOLA, SAM], [['A', 'A', 16.2], ['B', 'B', 18.1]], Q.kickerOf({ type: 'picture', k: 1, n: 3 }))],
    ['picture72', 'PICTURE THIS · the hardest: three 71-72 character headlines on three-line tiles, both shapes on one tile, a long source', picBoard(PIC_LONG, PICS.phone, [PENNY, UNIT8], [['A', 'C', 16.4], ['B', 'C', 17.2]], Q.kickerOf({ type: 'picture', k: 3, n: 3 }))],
    ['picturedon', 'PICTURE THIS as DOUBLE OR NOTHING · real (13 Oct): both wrong on one tile', picBoard(PIC_ROCKET, PICS.rocket, [PENNY, UNIT8], [['A', 'A', 19.5], ['B', 'A', 20.1]], Q.kickerOf({ double: 'science' }), { double: 'A' })],
    ['letters', 'LETTER BY LETTER · real (13 Oct), 59 characters: Sam stalls at stage 2, Lola names it at stage 3', letBoard(LET_XBOX, [LOLA, SAM], [{ seat: 'B', at: 7, stall: true }, { seat: 'A', at: 10.6 }], 'A', Q.kickerOf({ type: 'letters', k: 2, n: 3, desk: 'tech' }))],
    ['letters2', 'LETTER BY LETTER · real (13 Oct): a currency figure among the tiles; nobody names it', letBoard(LET_SQUIRREL, [PENNY, UNIT8], [], null, Q.kickerOf({ type: 'letters', k: 3, n: 3, desk: 'science' }))],
    ['sudden', 'SUDDEN DEATH (the tie-break) · real (13 Oct)', letBoard(LET_APPLE, [LOLA, SAM], [{ seat: 'A', at: 6.5 }], 'A', Q.kickerOf({ sudden: true }))],
    ['where', 'WHERE IN THE WORLD? · real (13 Oct): the place masked; both lock in on the same pin', whereBoard(WHERE_US, [LOLA, SAM], [['A', 'B', 8.1], ['B', 'B', 9.0]], Q.kickerOf({ type: 'where', k: 1, n: 3 }))],
    ['where2', 'WHERE IN THE WORLD? · real (13 Oct): one right, one wrong, pins half a world apart', whereBoard(WHERE_F1, [LOLA, SAM], [['A', 'A', 8.1], ['B', 'B', 9.0]], Q.kickerOf({ type: 'where', k: 2, n: 3 }))],
    ['whereuae', 'WHERE IN THE WORLD? · the hardest: "UNITED ARAB EMIRATES" on its tag, the longest masked headline', whereBoard(WHERE_UAE, [PENNY, UNIT8], [['A', 'B', 8.1], ['B', 'C', 9.0]], Q.kickerOf({ type: 'where', k: 3, n: 3 }))],
    ['wherenear', 'WHERE IN THE WORLD? · the hardest: three neighbouring pins (Egypt, Jordan, Greece) and both players on one', whereBoard(WHERE_NEAR, [LOLA, SAM], [['A', 'A', 8.1], ['B', 'A', 9.0]], Q.kickerOf({ type: 'where', k: 2, n: 3 }))],
    ['howmany', 'HOW MANY? · real (13 Oct): a price, Sam closer', hmBoard(HM_HOMEPOD, [LOLA, SAM], [['A', '$200', 7, 0], ['B', '$120', 8.5, 2]], Q.kickerOf({ type: 'howmany', k: 1, n: 3 }))],
    ['howmany2', 'HOW MANY? · real (13 Oct): billions, a six-block mask', hmBoard(HM_BUMBLE, [PENNY, UNIT8], [['A', '$1.2 billion', 7, 2], ['B', '$900 million', 8.5, 0]], Q.kickerOf({ type: 'howmany', k: 3, n: 3 }))],
    ['howmany3', 'HOW MANY? · a six-digit figure with its qualifier kept (UP TO): the right number is the closest guess, 2 points (no exact bonus on a qualified figure)', hmBoard(HM_SIX, [LOLA, SAM], [['A', '200,000', 7, 0], ['B', '250,000', 8.5, 2]], Q.kickerOf({ type: 'howmany', k: 2, n: 3 }))],
    ['howmanyowl', 'HOW MANY? · real (13 Oct): exactly right on 15 chicks', hmBoard(HM_OWLS, [LOLA, SAM], [['A', '12', 7, 0], ['B', '15', 8.5, 3]], Q.kickerOf({ type: 'howmany', k: 2, n: 3 }))],
    ['today', 'TODAY OR NOT TODAY? · headline 4 of 6: the two differ', todayBoard(TODAY_ITEMS[0], 3, [LOLA, SAM], [['A', 'EARLIER', 4.2], ['B', 'TODAY', 4.8]], { A: [true, true, false], B: [true, false, true] })],
    ['today2', 'TODAY OR NOT TODAY? · headline 2 of 6: both say TODAY', todayBoard(TODAY_ITEMS[1], 1, [PENNY, UNIT8], [['A', 'TODAY', 4.0], ['B', 'TODAY', 4.6]], { A: [false], B: [true] })],
    ['today3', 'TODAY OR NOT TODAY? · headline 6 of 6: the longest headline, both wrong', todayBoard(TODAY_ITEMS[2], 5, [LOLA, SAM], [['A', 'TODAY', 4.0], ['B', 'TODAY', 4.6]], { A: [true, true, false, true, false], B: [true, false, true, true, true] })],
    ['scores', 'THE SCORES · half time', still((ctx, t) => Q.drawScoresStrip(ctx, t, { players: [LOLA, SAM], scores: { A: 12, B: 8 }, title: 'HALF TIME' }))],
    ['scorestie', 'THE SCORES · a tie (sudden death follows)', still((ctx, t) => Q.drawScoresStrip(ctx, t, { players: [PENNY, UNIT8], scores: { A: 15, B: 15 }, title: 'LEVEL: SUDDEN DEATH' }))],
    ['result', 'FINAL SCORE · the winner lit', still((ctx, t) => Q.drawScoresStrip(ctx, t, { players: [LOLA, SAM], scores: { A: 17, B: 13 }, title: 'FINAL SCORE', winner: 'A' }))],
    ['strip', 'THE SCORES · the one-line strip over the studio', still((ctx, t) => Q.drawScoresStrip(ctx, t, { players: [PENNY, UNIT8], scores: { A: 9, B: 11 }, compact: true }))],
    ['don', 'DOUBLE OR NOTHING · Sam picks between two desks (the pick at 2 s)', still((ctx, t) => Q.drawDoubleCard(ctx, t, { players: [LOLA, SAM], player: 'B', leader: 'A', offered: ['science', 'tech'], pick: 'tech', pickAt: 2 }), 3)],
    ['donone', 'DOUBLE OR NOTHING · one desk on offer', still((ctx, t) => Q.drawDoubleCard(ctx, t, { players: [PENNY, UNIT8], player: 'A', leader: 'B', offered: ['business'], pick: 'business', pickAt: 0.6 }))],
    ['table', "THE WEEK'S TABLE · half wins after a drawn game, tonight's players' shapes", still((ctx, t) => Q.drawTableBoard(ctx, t, { players: [LOLA, SAM], standings: [{ id: 'penny', name: 'PENNY', played: 4, wins: 3 }, { id: 'lola', name: 'LOLA', played: 3, wins: 2.5 }, { id: 'nova', name: 'NOVA', played: 3, wins: 1.5 }, { id: 'unit8', name: 'UNIT-8', played: 2, wins: 1 }, { id: 'paco', name: 'PACO', played: 3, wins: 1 }, { id: 'sam', name: 'SAM', played: 3, wins: 0.5 }, { id: 'max', name: 'MAX', played: 1, wins: 0 }, { id: 'ada', name: 'ADA', played: 1, wins: 0 }] }), 3)],
    ['round', 'ROUND TWO · PICTURE THIS', still((ctx, t) => Q.drawRoundCard(ctx, t, { type: 'picture', k: 2 }))],
    ['roundhm', 'ROUND THREE · HOW MANY? (a round with an unqualified figure: the exact bonus stated)', still((ctx, t) => Q.drawRoundCard(ctx, t, { type: 'howmany', k: 3, exact: true }))],
    ['roundsd', 'TIE-BREAK · SUDDEN DEATH', still((ctx, t) => Q.drawRoundCard(ctx, t, { sudden: true }))],
    // the visual-variety round (scenes/cards-quiz-more.js): the rounds' transitions, the half-time race, the reveal views
    ...(Q.drawRoundTransition ? [
      ['transition', 'ROUND TWO as a transition · PICTURE THIS: its emblem, the bulbs\' chase, the score so far', still((ctx, t) => Q.drawRoundTransition(ctx, t, { type: 'picture', k: 2, players: [LOLA, SAM], scores: { A: 4, B: 7 } }), 2.5)],
      ['transitionwhere', 'ROUND ONE as a transition · WHERE IN THE WORLD? (no score yet)', still((ctx, t) => Q.drawRoundTransition(ctx, t, { type: 'where', k: 1, players: [PENNY, UNIT8], scores: { A: 0, B: 0 } }), 2.5)],
      ['transitionhm', 'ROUND THREE as a transition · HOW MANY? with the exact bonus, the score so far', still((ctx, t) => Q.drawRoundTransition(ctx, t, { type: 'howmany', k: 3, exact: true, players: [PENNY, UNIT8], scores: { A: 12, B: 9 } }), 2.5)],
      ['transitiontoday', 'ROUND THREE as a transition · TODAY OR NOT TODAY?', still((ctx, t) => Q.drawRoundTransition(ctx, t, { type: 'today', k: 3, players: [LOLA, SAM], scores: { A: 10, B: 10 } }), 2.5)],
      ['transitionsd', 'TIE-BREAK as a transition · SUDDEN DEATH, level', still((ctx, t) => Q.drawRoundTransition(ctx, t, { sudden: true, players: [LOLA, SAM], scores: { A: 15, B: 15 } }), 2.5)],
      ['halftime', 'HALF-TIME · the race: each lane, the points each round gave, who leads', still((ctx, t) => Q.drawHalftimeBoard(ctx, t, { players: [PENNY, UNIT8], scores: { A: 5, B: 8 }, rounds: [{ A: 0, B: 2 }, { A: 5, B: 6 }] }), 3)],
      ['halftimelevel', 'HALF-TIME · level, a big score', still((ctx, t) => Q.drawHalftimeBoard(ctx, t, { players: [LOLA, SAM], scores: { A: 14, B: 14 }, rounds: [{ A: 6, B: 8 }, { A: 8, B: 6 }] }), 3)],
      ['pictureopen', 'PICTURE THIS · the picture alone across the frame at its first step, the frame on its plate', still((ctx, t) => Q.drawPictureOpen(ctx, t, { question: PIC_APPLE, image: PICS.device, kicker: Q.kickerOf({ type: 'picture', k: 1, n: 3 }), pictureCredit: { credit: 'FILE · JANE DOE · CC BY 4.0 · PIXELATED', tag: 'FILE' } }), 3)],
      ['revealpicture', 'PICTURE THIS · the reveal view: the picture large and whole, the right headline in gold, the choices', still((ctx, t) => Q.drawRevealView(ctx, t, { board: 'picture', o: { question: PIC_LONG, image: PICS.phone, players: [PENNY, UNIT8], locks: lockList([['A', 'C', 1], ['B', 'A', 1.2]]), viewAt: 0, revealAt: 0.4, now: NOW, pictureCredit: { credit: 'FILE · JANE DOE · CC BY 4.0 · PIXELATED', tag: 'FILE' } } }), 3.5)],
      ['revealwhere', 'WHERE IN THE WORLD? · the reveal view: the map across the board, the move onto the right country', still((ctx, t) => Q.drawRevealView(ctx, t, { board: 'where', o: { question: WHERE_UAE, players: [PENNY, UNIT8], locks: lockList([['A', 'B', 1], ['B', 'C', 1.2]]), viewAt: 0, revealAt: 0.4, now: NOW } }), 3.5)],
      ['revealletters', 'LETTER BY LETTER · the reveal view: the headline as it aired on its programme\'s strap', still((ctx, t) => Q.drawRevealView(ctx, t, { board: 'letters', o: { question: LET_XBOX, players: [LOLA, SAM], winner: 'A', viewAt: 0, revealAt: 0.4, now: NOW } }), 3)],
      ['revealhowmany', 'HOW MANY? · the reveal view: the figure as it aired, the guesses on a line', still((ctx, t) => Q.drawRevealView(ctx, t, { board: 'howmany', o: { question: HM_BUMBLE, players: [PENNY, UNIT8], guesses: [{ seat: 'A', said: '$1.2 billion', at: 0, points: 2 }, { seat: 'B', said: '$900 million', at: 0, points: 0 }], viewAt: 0, revealAt: 0.4, now: NOW } }), 3)],
      ['revealhowmany2', 'HOW MANY? · the reveal view: a six-digit figure with its qualifier, exactly right', still((ctx, t) => Q.drawRevealView(ctx, t, { board: 'howmany', o: { question: HM_SIX, players: [LOLA, SAM], guesses: [{ seat: 'A', said: '200,000', at: 0, points: 0 }, { seat: 'B', said: '250,000', at: 0, points: 2 }], viewAt: 0, revealAt: 0.4, now: NOW } }), 3)],
    ] : []),
  ];
}
