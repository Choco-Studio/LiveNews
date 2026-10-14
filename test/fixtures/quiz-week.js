// A week of archive for PAY ATTENTION's tests (test/pay-attention-writer.test.js's fixture, shared): ten days of the
// five news programmes' airings, a third with a place, a quarter with a figure, every one with a picture; the last day
// re-aired within the last five hours. Fictional stories, deterministic.
import { Archive } from '../../server/archive.js';
import { quizEvents } from '../../server/quiz/desk.js';
import { planEdition, contestantsFrom } from '../../server/quiz/planner.js';
import { editionStories } from '../../server/quiz/edition.js';
import { writeEpisode } from '../../server/quiz/writer.js';

export const H = 3600_000;
export const DAY = 24 * H;
export const NOW = Date.parse('2026-10-15T15:00:00Z'); // Thursday 16:00 London
const COUNTRIES = [['France', 46.6, 2.2], ['Japan', 36.2, 138.3], ['Brazil', -10.8, -52.9], ['Kenya', 0.2, 37.9], ['Canada', 56.1, -106.3], ['Australia', -25.3, 133.8], ['Morocco', 31.8, -7.1], ['Peru', -9.2, -75], ['Jordan', 30.6, 36.2]];
const PROGRAMMES = [['world-now', 'world'], ['tech-bytes', 'tech'], ['cosmos', 'science'], ['money-minute', 'business'], ['news-60', 'world']];
const NOUNS = ['Telescope', 'Museum', 'Garden', 'Robot', 'Orchestra', 'Library', 'Bridge', 'Satellite', 'Festival', 'Glacier', 'Ferry', 'Observatory'];

export function quizWeek(now = NOW) {
  const a = new Archive({ dir: null, days: 14, now: () => now });
  let n = 0;
  for (let d = 9; d >= 0; d--) {
    for (let k = 0; k < 12; k++) {
      const [programId, category] = PROGRAMMES[n % PROGRAMMES.length];
      const title = `${NOUNS[n % NOUNS.length]} opens a quiet new wing number ${n + 1}`;
      const placed = n % 3 === 0;
      const [country, lat, lon] = COUNTRIES[n % COUNTRIES.length];
      const fig = n % 4 === 1;
      a.keep({ id: `e${n}`, at: now - d * DAY - (k + 1) * 50 * 60_000, programId, category, rank: k % 6, title, headline: title, link: 'https://www.bbc.co.uk/x', source: 'BBC News', image: 'https://x/y.jpg', summary: '',
        text: `${title}${placed ? ` in ${country}` : ''}. The work took ${fig ? `${120 + n} days` : 'months'}, its makers say.`,
        ...(placed ? { location: { place: country.toUpperCase(), lat, lon } } : {}), ...(fig ? { numbers: [{ value: String(120 + n), label: 'DAYS' }] } : {}) });
      n++;
    }
  }
  a.entries.slice(-24).forEach((e, i) => a.keep({ ...e, at: now - ((i * 37) % 300) * 60_000 - 60_000 }));
  a.entries.sort((x, y) => x.at - y.at);
  return a;
}

/** An edition written from the week (seeded): { plan, episode, game }; the episode as the station ships it (cast H qm). */
export function quizEdition(channel, seed = 'w', now = NOW) {
  const archive = quizWeek(now);
  const { events, avoid } = quizEvents(archive, { now, days: 7 });
  const contestants = contestantsFrom(channel, ['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam']);
  const plan = planEdition({ events, entries: archive.entries, now, contestants, history: [], avoid, seed });
  if (!plan.air) return { plan, episode: null, game: null };
  const { episode, game } = writeEpisode(plan, { channel, now, nextAt: now + 4.5 * H });
  const program = channel.programs['pay-attention'] || channel.drafts?.['pay-attention'] || {};
  return { plan, game, episode: { ...episode, quizStories: editionStories(plan, events, archive), id: `quiz-${seed}`, cast: { ...episode.cast, H: program.presenters?.[0] || 'qm' }, program: { id: 'pay-attention', title: 'PAY ATTENTION', tagline: "THE WEEK'S NEWS AS A GAME", theme: 'quiz' } } };
}
