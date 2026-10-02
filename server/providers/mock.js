// Offline provider: builds an episode straight from the feed text, with no AI.
// Lets the whole channel run (and be demoed) without any account or API key.

const GRAVE = /dead|death|die[sd]?|killed|kill|war\b|attack|victim|murder|shooting|earthquake|fire|crash|violen|injur|bomb|strike[sd]? on|crisis|flood|hostage|famine/i;
const LIGHT = /\bAI\b|robot|chip|phone|app\b|software|space|nasa|planet|science|scientist|discover|study finds|telescope|game/i;

function firstSentences(s, max = 2) {
  return s.split(/(?<=[.!?])\s+/).slice(0, max).join(' ').trim();
}

export function createMockProvider() {
  return {
    name: 'mock',
    available: () => true,
    async generate({ stage = 'write', script, stories, channelName, program, presenters = { A: { name: 'the presenter' } }, count }) {
      // The editor pass has nothing to fix in text copied from the feeds.
      if (stage === 'review') return { text: JSON.stringify(script), usage: { input: 0, output: 0, cached: 0 } };

      const title = program?.title || channelName;
      const solo = !presenters.B;
      const picked = stories.slice(0, count ?? program?.stories ?? 5);
      const segments = [
        {
          type: 'intro',
          anchor: 'A',
          emotion: 'happy',
          text: `Hello [wave] and welcome to ${title} on ${channelName}. I'm ${presenters.A.name}. [point_camera] Here's what's making news.`,
        },
      ];
      let chats = 0;
      picked.forEach((s, i) => {
        const anchor = solo || i % 2 === 0 ? 'A' : 'B';
        const grave = GRAVE.test(`${s.title} ${s.summary}`);
        const body = firstSentences(s.summary || s.title, program?.id === 'news-60' ? 1 : 2) || s.title;
        segments.push({
          type: 'story',
          storyId: s.id,
          anchor,
          emotion: grave ? 'serious' : LIGHT.test(s.title) ? 'happy' : 'neutral',
          headline: s.title,
          text: `${grave ? '[lean_in] ' : s.image ? '[point_screen] ' : '[raise_hand] '}${s.source} reports: ${s.title}. ${body === s.title ? '' : `${grave ? '' : solo ? '' : '[B:nod] '}${body}`}`.trim(),
          shot: s.image ? (i % 3 === 1 ? 'full' : 'close') : 'wide',
          breaking: /\bbreaking\b/i.test(s.title),
          location: null,
          fact: null,
        });
        if (!solo && !grave && LIGHT.test(s.title) && i < picked.length - 1 && chats < (program?.maxChats ?? 3)) {
          chats++;
          segments.push({ type: 'chat', anchor: anchor === 'A' ? 'B' : 'A', emotion: 'surprised', text: '[wow] Fascinating stuff. [papers] Let us move on.' });
        }
      });
      segments.push({
        type: 'outro',
        anchor: solo ? 'A' : 'B',
        emotion: 'happy',
        text: `That's ${title} for now. [wave] Stay with us here on ${channelName}.`,
      });
      return { text: JSON.stringify({ title: `${title} (demo)`, segments }), usage: { input: 0, output: 0, cached: 0 } };
    },
  };
}
