import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  NewsDesk,
  cleanHtml,
  extractLocalImage,
  localFeedPath,
  decodeEntities,
  extractImage,
  interestScore,
  isBreaking,
  isLiveBlog,
  keywords,
  normalizeTitleKey,
  parseFeed,
  sameEvent,
  storyId,
} from '../server/news.js';

// ---------------------------------------------------------------- helpers

const silentLogger = { info() {}, warn() {}, error() {} };

const MINUTE = 60_000;
const HOUR = 3600_000;
const NOW = Date.now();
/** RFC 822 date as found in RSS feeds, `hoursAgo` hours before now. */
const rssDate = (hoursAgo) => new Date(NOW - hoursAgo * HOUR).toUTCString();

const rssItem = ({ title, link, description = '', pubDate = rssDate(1), extra = '' }) =>
  `<item><title>${title}</title><link>${link}</link><description>${description}</description><pubDate>${pubDate}</pubDate>${extra}</item>`;

const rssFeed = (...items) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>Test feed</title>${items.join('\n')}</channel></rss>`;

/** One-item feed whose description is `description` (wrapped in CDATA), parsed into a single story. */
const summaryOf = (description, feed = FEED) =>
  parseFeed(rssFeed(rssItem({ title: 'Some title', link: 'https://example.com/x', description: `<![CDATA[${description}]]>` })), feed)[0].summary;

const FEED = { name: 'Test Wire', category: 'world' };

const LONG_SUMMARY = 'A reasonably long summary that goes well beyond eighty characters so that it counts as real substance.';

/**
 * A story as produced by parseFeed, `minutesAgo` old. The default title is
 * unique per id (ids of 1-2 characters are not keywords), so two default
 * stories are never mistaken for the same event.
 */
const makeStory = (id, source, minutesAgo, extra = {}) => ({
  id,
  title: `${id} dispatch`,
  summary: LONG_SUMMARY,
  link: `https://example.test/${id}`,
  source,
  category: 'world',
  weight: 1,
  published: NOW - minutesAgo * MINUTE,
  image: null,
  ...extra,
});

const noNetwork = async (url) => {
  throw new Error(`unexpected network access to ${url}`);
};

function makeDesk({ stories = [], fetchImpl = noNetwork, feeds } = {}) {
  const desk = new NewsDesk({ log: silentLogger, fetchImpl, lookup: async () => [{ address: '93.184.216.34', family: 4 }] });
  for (const s of stories) desk.stories.set(s.id, s);
  if (feeds) desk.loadFeeds = () => feeds;
  return desk;
}

const ids = (stories) => stories.map((s) => s.id);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `${actual} is not close to ${expected}`);

/**
 * Fake fetch driven by a `url -> spec` table. A spec is an XML/HTML string
 * (HTTP 200), a number (HTTP status with no useful body) or an Error (network
 * failure). Unknown URLs get a 404.
 */
function routedFetch(routes) {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    const spec = routes[url];
    if (spec instanceof Error) throw spec;
    if (typeof spec === 'number') return new Response('error', { status: spec });
    if (typeof spec === 'string') return new Response(spec, { status: 200 });
    return new Response('not found', { status: 404 });
  };
  fetchImpl.requested = requested;
  return fetchImpl;
}

const FEEDS = [
  { name: 'Alfa', url: 'https://alfa.test/rss', category: 'world', weight: 1.2 },
  { name: 'Beta', url: 'https://beta.test/rss', category: 'tech', weight: 0.8 },
  { name: 'Gamma', url: 'https://gamma.test/rss' },
];

// ---------------------------------------------------------------- parseFeed

describe('parseFeed', () => {
  test('parses an RSS 2.0 item with CDATA, media:thumbnail and pubDate', () => {
    const pubDate = new Date(Date.UTC(2026, 9, 1, 10, 30, 0)).toUTCString();
    const xml = rssFeed(
      rssItem({
        title: '<![CDATA[Magnitude 6 earthquake shakes Chile]]>',
        link: 'https://example.com/news/1?at_medium=rss&amp;at_campaign=x',
        description: '<![CDATA[<p>A <strong>strong</strong> quake hit the coast.</p><p>No victims reported, say officials in Santiago.</p>]]>',
        pubDate,
        extra:
          '<media:thumbnail url="https://img.example.com/small.jpg" width="240" height="135"/>' +
          '<media:thumbnail url="https://img.example.com/large.jpg" width="976" height="549"/>',
      })
    );

    const stories = parseFeed(xml, { ...FEED, weight: 1.1 });

    assert.equal(stories.length, 1);
    const [s] = stories;
    assert.equal(s.title, 'Magnitude 6 earthquake shakes Chile');
    assert.equal(s.summary, 'A strong quake hit the coast. No victims reported, say officials in Santiago.');
    assert.equal(s.link, 'https://example.com/news/1?at_medium=rss&at_campaign=x');
    assert.equal(s.source, 'Test Wire');
    assert.equal(s.category, 'world');
    assert.equal(s.weight, 1.1);
    assert.equal(s.published, Date.parse(pubDate));
    assert.equal(s.image, 'https://img.example.com/large.jpg');
    assert.match(s.id, /^s[0-9a-f]{10}$/);
  });

  test('story id ignores the query string and fragment of the link', () => {
    const xml = rssFeed(
      rssItem({ title: 'One', link: 'https://example.com/a?utm_source=rss' }),
      rssItem({ title: 'Two', link: 'https://example.com/a#top' }),
      rssItem({ title: 'Three', link: 'https://example.com/b' })
    );
    const [one, two, three] = parseFeed(xml, FEED);
    assert.equal(one.id, two.id);
    assert.notEqual(one.id, three.id);
    assert.equal(one.id, storyId('https://example.com/a'));
  });

  test('defaults the category to "general" when the feed has none', () => {
    const [s] = parseFeed(rssFeed(rssItem({ title: 'X', link: 'https://example.com/x' })), { name: 'No category' });
    assert.equal(s.category, 'general');
  });

  test('stories carry the weight of their feed, defaulting to 1 when it is missing or not a number', () => {
    const weightOf = (feed) => parseFeed(rssFeed(rssItem({ title: 'X', link: 'https://example.com/x' })), feed)[0].weight;
    assert.equal(weightOf({ name: 'A', weight: 1.2 }), 1.2);
    assert.equal(weightOf({ name: 'A', weight: 0.7 }), 0.7);
    assert.equal(weightOf({ name: 'A', weight: '0.8' }), 0.8);
    assert.equal(weightOf({ name: 'A' }), 1);
    assert.equal(weightOf({ name: 'A', weight: 'heavy' }), 1);
  });

  test('parses an Atom entry (alternate link, summary, updated)', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom feed</title>
  <entry>
    <title>Atom entry</title>
    <link rel="self" href="https://example.com/atom/self"/>
    <link rel="alternate" type="text/html" href="https://example.com/atom/article"/>
    <id>tag:example.com,2026:1</id>
    <summary>Summary of the entry.</summary>
    <updated>2026-10-01T10:30:00Z</updated>
  </entry>
</feed>`;

    const stories = parseFeed(xml, { name: 'Atomic', category: 'science', weight: 0.9 });

    assert.equal(stories.length, 1);
    assert.equal(stories[0].title, 'Atom entry');
    assert.equal(stories[0].link, 'https://example.com/atom/article');
    assert.equal(stories[0].summary, 'Summary of the entry.');
    assert.equal(stories[0].published, Date.parse('2026-10-01T10:30:00Z'));
    assert.equal(stories[0].source, 'Atomic');
    assert.equal(stories[0].category, 'science');
    assert.equal(stories[0].weight, 0.9);
  });

  test('Atom: link without rel counts as alternate; <content> is used when there is no summary', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>No rel</title>
    <link href="https://example.com/atom/no-rel"/>
    <content type="html">&lt;p&gt;Final &lt;b&gt;html&lt;/b&gt; content&lt;/p&gt;</content>
    <published>2026-10-01T08:00:00Z</published>
  </entry>
</feed>`;
    const [s] = parseFeed(xml, FEED);
    assert.equal(s.link, 'https://example.com/atom/no-rel');
    assert.equal(s.summary, 'Final html content.');
    assert.equal(s.published, Date.parse('2026-10-01T08:00:00Z'));
  });

  test('parses an RSS 1.0 (rdf:RDF) item with dc:date', () => {
    const xml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <item rdf:about="https://example.com/rdf/1"><title>RDF item</title><link>https://example.com/rdf/1</link><description>Text.</description><dc:date>2026-10-01T10:00:00Z</dc:date></item>
</rdf:RDF>`;
    const [s] = parseFeed(xml, FEED);
    assert.equal(s.title, 'RDF item');
    assert.equal(s.published, Date.parse('2026-10-01T10:00:00Z'));
  });

  test('picks the real image over a tracking pixel in the description HTML', () => {
    const xml = rssFeed(
      rssItem({
        title: 'Story with a tracking p&#237;xel',
        link: 'https://example.com/tracker',
        description:
          '<![CDATA[<p><img src="http://secure-uk.imrworldwide.com/cgi-bin/m?ci=bbc&amp;cc=1&amp;ml_name=ref" width="1" height="1"/></p>' +
          '<p><img src="https://img.example.com/photos/real.jpg?w=640&amp;h=360" alt="photo"/>Story text.</p>]]>',
      })
    );
    const [s] = parseFeed(xml, FEED);
    assert.equal(s.image, 'https://img.example.com/photos/real.jpg?w=640&h=360');
    assert.equal(s.title, 'Story with a tracking píxel');
  });

  test('image is null when the only candidate is a tracking pixel', () => {
    const xml = rssFeed(
      rssItem({
        title: 'Only a tracker',
        link: 'https://example.com/only-tracker',
        description: '<![CDATA[<img src="http://secure-uk.imrworldwide.com/cgi-bin/m?ci=bbc"/>Text.]]>',
      })
    );
    assert.equal(parseFeed(xml, FEED)[0].image, null);
  });

  test('decodes numeric HTML entities (decimal and hex) and &amp; in summaries', () => {
    const xml = rssFeed(
      rssItem({
        title: 'Entities',
        link: 'https://example.com/entities',
        description: '<![CDATA[Jos&#x00E9; and Mar&#237;a talked about R&amp;D and innovati&#243;n&hellip;]]>',
      })
    );
    assert.equal(parseFeed(xml, FEED)[0].summary, 'José and María talked about R&D and innovatión…');
  });

  test('decodes named accented entities such as &eacute; / &ntilde; / &oacute; in summaries', () => {
    const xml = rssFeed(
      rssItem({
        title: 'Named entities',
        link: 'https://example.com/named-entities',
        description: '<![CDATA[<p>Jos&eacute; lives in Espa&ntilde;a and spoke to Mar&iacute;a, who is over there.</p>]]>',
      })
    );
    assert.equal(parseFeed(xml, FEED)[0].summary, 'José lives in España and spoke to María, who is over there.');
  });

  test('keeps a real ellipsis in the summary', () => {
    assert.equal(summaryOf('He waited... and waited&hellip; then left.'), 'He waited... and waited… then left.');
  });

  test('strips feed boilerplate: "Continue reading...", "Read more", "The post X appeared first on Y."', () => {
    assert.equal(summaryOf('Useful text. Continue reading...'), 'Useful text.');
    assert.equal(summaryOf('Useful text. Continue reading'), 'Useful text.');
    assert.equal(summaryOf('Useful text. Read more...'), 'Useful text.');
    assert.equal(summaryOf('Useful text. The post Big launch day appeared first on Example Tech.'), 'Useful text.');
    assert.equal(summaryOf('Useful text. Comments'), 'Useful text.');
    assert.equal(summaryOf('Texto util. Leer la noticia completa.'), 'Texto util.');
  });

  test('boilerplate is removed whatever its case', () => {
    assert.equal(summaryOf('Useful text. CONTINUE READING'), 'Useful text.');
    assert.equal(summaryOf('Useful text. read more'), 'Useful text.');
  });

  test('also strips the trailing "»", "…" and "→" variants, and a bare "Comments" after a sentence end', () => {
    assert.equal(summaryOf('Useful text. Continue reading »'), 'Useful text.');
    assert.equal(summaryOf('Useful text. Read more…'), 'Useful text.');
    assert.equal(summaryOf('Useful text. Read more →'), 'Useful text.');
    assert.equal(summaryOf('Useful text! Comments'), 'Useful text!');
    assert.equal(summaryOf('Useful text? Comment'), 'Useful text?');
  });

  test('does not cut an ordinary sentence that ends with the word "comment"', () => {
    assert.equal(summaryOf('The spokesman declined to comment.'), 'The spokesman declined to comment.');
    assert.equal(summaryOf('The spokesman declined to comment'), 'The spokesman declined to comment');
    assert.equal(summaryOf('He said "no comment"'), 'He said "no comment"');
    assert.equal(summaryOf('There were 12 comments. Comments are closed on the old thread.'), 'There were 12 comments. Comments are closed on the old thread.');
  });

  test('does not remove "read more" / "continue reading" from the middle of a sentence', () => {
    assert.equal(summaryOf('Children who read more are happier.'), 'Children who read more are happier.');
    assert.equal(summaryOf('Readers who continue reading the series will find answers.'), 'Readers who continue reading the series will find answers.');
  });

  test('only the boilerplate at the very end of the summary is removed', () => {
    assert.equal(summaryOf('Read more about it. Useful text. Read more...'), 'Read more about it. Useful text.');
  });

  test(
    'does not cut a real sentence that happens to end with "read more" or "continue reading"',
    () => {
      assert.equal(summaryOf('Experts say children should read more.'), 'Experts say children should read more.');
      assert.equal(summaryOf('Please continue reading.'), 'Please continue reading.');
    }
  );

  test(
    'does not wipe a sentence that merely contains "the post ... appeared first on"',
    () => {
      assert.equal(summaryOf('The post office said it appeared first on Monday that stamps rise.'), 'The post office said it appeared first on Monday that stamps rise.');
    }
  );

  test('caps the summary at 900 characters', () => {
    const xml = rssFeed(rssItem({ title: 'Long', link: 'https://example.com/b2', description: 'word '.repeat(500) }));
    assert.ok(parseFeed(xml, FEED)[0].summary.length <= 900);
  });

  test('skips items without title or link, and falls back to a permalink guid', () => {
    const xml = rssFeed(
      '<item><title>No link</title></item>',
      '<item><link>https://example.com/no-title</link></item>',
      '<item><title>With guid</title><guid isPermaLink="true">https://example.com/guid</guid></item>'
    );
    const stories = parseFeed(xml, FEED);
    assert.deepEqual(stories.map((s) => [s.title, s.link]), [['With guid', 'https://example.com/guid']]);
  });

  test('a missing or invalid date falls back to the current time, one second older per position (newest first)', () => {
    const before = Date.now();
    const xml = rssFeed(
      '<item><title>No date</title><link>https://example.com/nodate</link></item>',
      rssItem({ title: 'Broken date', link: 'https://example.com/baddate', pubDate: 'yesterday afternoon' })
    );
    const [a, b] = parseFeed(xml, FEED);
    assert.ok(a.published >= before && a.published <= Date.now() + 1000, `published=${a.published}`);
    assert.equal(a.published - b.published, 1000);
    const fixed = parseFeed(xml, FEED, { now: 5_000_000 });
    assert.deepEqual(fixed.map((s) => s.published), [5_000_000, 4_999_000], 'a given "now" makes it deterministic');
  });

  test('returns [] for empty or non-feed documents', () => {
    assert.deepEqual(parseFeed('', FEED), []);
    assert.deepEqual(parseFeed('<html><body>not a feed</body></html>', FEED), []);
    assert.deepEqual(parseFeed(rssFeed(), FEED), []);
  });

  test('one item with an impossible numeric entity does not make the whole feed fail', () => {
    const xml = rssFeed(
      rssItem({ title: 'Good item', link: 'https://example.com/good' }),
      rssItem({ title: 'Bad &#x110000; entity', link: 'https://example.com/bad', description: '<![CDATA[Broken &#1114112; entity]]>' })
    );
    const stories = parseFeed(xml, FEED);
    assert.deepEqual(stories.map((s) => s.title), ['Good item', 'Bad &#x110000; entity']);
    assert.equal(stories[1].summary, 'Broken &#1114112; entity');
  });
});

// ---------------------------------------------------------------- extractImage

describe('extractImage', () => {
  test('prefers the widest media:content', () => {
    const item = {
      'media:content': [
        { '@_url': 'https://img.test/300.jpg', '@_width': '300' },
        { '@_url': 'https://img.test/1200.jpg', '@_width': '1200' },
        { '@_url': 'https://img.test/600.jpg', '@_width': '600' },
      ],
    };
    assert.equal(extractImage(item), 'https://img.test/1200.jpg');
  });

  test('prefers media:content over an unsized image found in the description', () => {
    const item = {
      description: '<img src="https://img.test/from-html.jpg">',
      'media:content': { '@_url': 'https://img.test/media.jpg', '@_width': '400' },
    };
    assert.equal(extractImage(item), 'https://img.test/media.jpg');
  });

  test('reads media:content nested in media:group, and honours medium/type', () => {
    const item = {
      'media:group': {
        'media:content': [
          { '@_url': 'https://img.test/video.mp4', '@_type': 'video/mp4', '@_width': '1920' },
          { '@_url': 'https://img.test/pic.jpg', '@_medium': 'image', '@_width': '500' },
        ],
      },
    };
    assert.equal(extractImage(item), 'https://img.test/pic.jpg');
  });

  test('ignores .svg images, even when they are the widest', () => {
    const item = {
      'media:content': [
        { '@_url': 'https://img.test/logo.svg', '@_width': '2000' },
        { '@_url': 'https://img.test/chart.svg?v=2', '@_width': '1500' },
        { '@_url': 'https://img.test/photo.jpg', '@_width': '800' },
      ],
    };
    assert.equal(extractImage(item), 'https://img.test/photo.jpg');
  });

  test('ignores URLs that are not http(s); a protocol-relative URL is read as https', () => {
    const item = {
      'media:content': [
        { '@_url': 'data:image/png;base64,AAAA', '@_width': '900' },
        { '@_url': 'ftp://img.test/old.jpg', '@_width': '700' },
        { '@_url': '/relative/path.jpg', '@_width': '600' },
        { '@_url': 'file:///etc/hosts.jpg', '@_width': '600' },
      ],
    };
    assert.equal(extractImage(item), null);
    assert.equal(extractImage({ 'media:content': { '@_url': '//img.test/protocol-relative.jpg', '@_width': '800' } }), 'https://img.test/protocol-relative.jpg');
  });

  test('ignores tracking pixels and gifs', () => {
    const item = {
      'media:thumbnail': [
        { '@_url': 'http://secure-uk.imrworldwide.com/cgi-bin/m?ci=x', '@_width': '1' },
        { '@_url': 'https://img.test/spacer.gif', '@_width': '1' },
        { '@_url': 'https://img.test/ok.jpg', '@_width': '800' },
      ],
    };
    assert.equal(extractImage(item), 'https://img.test/ok.jpg');
  });

  test('uses image enclosures and Atom enclosure links', () => {
    assert.equal(extractImage({ enclosure: { '@_url': 'https://img.test/e.jpg', '@_type': 'image/jpeg' } }), 'https://img.test/e.jpg');
    assert.equal(extractImage({ enclosure: { '@_url': 'https://img.test/e.png' } }), 'https://img.test/e.png');
    assert.equal(extractImage({ enclosure: { '@_url': 'https://cdn.test/a.mp3', '@_type': 'audio/mpeg' } }), null);
    assert.equal(
      extractImage({ link: [{ '@_rel': 'enclosure', '@_type': 'image/png', '@_href': 'https://img.test/atom.png' }] }),
      'https://img.test/atom.png'
    );
  });

  test('falls back to <img> tags in content/description and decodes entities in the src', () => {
    const item = { 'content:encoded': '<p><img class="x" src="https://img.test/a.jpg?a=1&amp;b=2"></p>' };
    assert.equal(extractImage(item), 'https://img.test/a.jpg?a=1&b=2');
    assert.equal(extractImage({ summary: "<img src='https://img.test/single-quoted.jpg'>" }), 'https://img.test/single-quoted.jpg');
  });

  test('returns null when there is nothing usable', () => {
    assert.equal(extractImage({}), null);
    assert.equal(extractImage({ description: 'text only' }), null);
  });
});

// ---------------------------------------------------------------- cleanHtml / decodeEntities

describe('cleanHtml', () => {
  test('strips tags, scripts, styles and comments', () => {
    const html = '<script>alert("x")</script><style>p { color: red }</style><!-- comment --><div><b>Hello</b> <a href="/x">world</a></div>';
    assert.equal(cleanHtml(html), 'Hello world');
  });

  test('collapses runs of spaces and tabs', () => {
    assert.equal(cleanHtml('  one \t two\t\tthree   '), 'one two three');
  });

  test('turns paragraph, list, heading and line breaks into sentence breaks', () => {
    assert.equal(cleanHtml('<p>First</p><p>Second</p>'), 'First. Second.');
    assert.equal(cleanHtml('a<br>b<br/>c'), 'a. b. c');
    assert.equal(cleanHtml('<ul><li>One</li><li>Two</li></ul>'), 'One. Two.');
    assert.equal(cleanHtml('<h2>Headline</h2><p>Body text.</p>'), 'Headline. Body text.');
  });

  test('does not double the punctuation when the sentence already ended', () => {
    assert.equal(cleanHtml('<p>Done.</p><p>Really?</p><p>Yes!</p><p>Note:</p><p>Body</p>'), 'Done. Really? Yes! Note: Body.');
    assert.equal(cleanHtml('<p>Wait&hellip;</p><p>Next</p>'), 'Wait… Next.');
  });

  test('keeps a real "..." ellipsis intact, also right before a break', () => {
    assert.equal(cleanHtml('Wait... look at this'), 'Wait... look at this');
    assert.equal(cleanHtml('Wait&hellip; look at this'), 'Wait… look at this');
    assert.equal(cleanHtml('Done...<br>Next'), 'Done... Next');
  });

  test('drops leading dots and whitespace', () => {
    assert.equal(cleanHtml('  ...and then'), 'and then');
    assert.equal(cleanHtml('<p></p><p>Text</p>'), 'Text.');
  });

  test('decodes entities after stripping tags (escaped markup is not re-interpreted as a tag boundary)', () => {
    assert.equal(cleanHtml('<p>Tom &amp; Jerry &mdash; &quot;ok&quot;</p>'), 'Tom & Jerry — "ok".');
  });

  test('returns an empty string for empty input', () => {
    assert.equal(cleanHtml(''), '');
    assert.equal(cleanHtml('<p> </p>'), '');
  });

  test('a plain newline inside a sentence is just whitespace, not a sentence break', () => {
    assert.equal(cleanHtml('Police said,\nthe suspect fled'), 'Police said, the suspect fled');
    assert.equal(cleanHtml('uno \n\n  dos\t\ttres'), 'uno dos tres');
    assert.equal(cleanHtml('<p>Police said,\nthe suspect fled</p><p>Next\nparagraph</p>'), 'Police said, the suspect fled. Next paragraph.');
  });

  test('newlines between block elements (pretty-printed HTML) do not double the sentence break', () => {
    assert.equal(cleanHtml('<p>Done.</p>\n<p>Next</p>\n'), 'Done. Next.');
    assert.equal(cleanHtml('<p>First</p>\n\n<p>Second</p>'), 'First. Second.');
    assert.equal(cleanHtml('<p>a</p></p><br><p>b</p>'), 'a. b.');
  });

  test('a break right after a literal newline still ends the sentence', () => {
    assert.equal(cleanHtml('First line\n<br>Second line'), 'First line. Second line');
  });

  test('the internal block marker never leaks into the result', () => {
    assert.ok(!cleanHtml('<p>a</p><p>b</p><li>c</li><h2>d</h2>e<br>f').includes('\u0001'));
  });
});

describe('decodeEntities', () => {
  test('decodes numeric, hex and the supported named entities', () => {
    assert.equal(decodeEntities('&#233; &#x00E9; &#X41; &amp; &lt;b&gt; &quot;q&quot; &apos;a&apos; &hellip; &ndash; &mdash;'), 'é é A & <b> "q" \'a\' … – —');
    assert.equal(decodeEntities('&laquo;a&raquo; &ldquo;b&rdquo; &lsquo;c&rsquo; a&nbsp;b'), '«a» “b” ‘c’ a b');
  });

  test('decodes accented named entities, upper and lower case', () => {
    assert.equal(decodeEntities('Jos&eacute; Espa&ntilde;a &Eacute;cole &uuml;ber &ccedil;a &agrave; &icirc; &otilde; &Aring;'), 'José España École über ça à î õ Å');
  });

  test('entity names are case-insensitive for the plain named ones', () => {
    assert.equal(decodeEntities('&AMP; &Hellip;'), '& …');
  });

  test('leaves unknown entities untouched', () => {
    assert.equal(decodeEntities('&unknownentity; and a lone &'), '&unknownentity; and a lone &');
  });

  test('decodes only once (an escaped entity stays a literal entity)', () => {
    assert.equal(decodeEntities('&amp;eacute; &amp;amp;'), '&eacute; &amp;');
  });

  test('a numeric entity beyond the Unicode range is left as it is instead of throwing', () => {
    assert.equal(decodeEntities('x &#1114112; y &#x110000; z &#99999999999; w'), 'x &#1114112; y &#x110000; z &#99999999999; w');
    assert.equal(decodeEntities('ok &#x10FFFF; &#65;'), `ok ${String.fromCodePoint(0x10ffff)} A`);
  });
});

// ---------------------------------------------------------------- isBreaking

describe('isBreaking', () => {
  test('recognises an explicit BREAKING marker at the start of the headline', () => {
    for (const title of ['BREAKING: Magnitude 7 earthquake hits Japan', 'Breaking: minister resigns', 'Breaking news: minister resigns', 'breaking news - minister resigns', 'Breaking | minister resigns', 'BREAKING — minister resigns', '  BREAKING: leading spaces']) {
      assert.equal(isBreaking(title), true, title);
    }
  });

  test('recognises a BREAKING marker at the end of the headline, after a separator', () => {
    for (const title of ['Minister resigns | BREAKING', 'Minister resigns, breaking', 'Minister resigns - BREAKING', 'Minister resigns – breaking', 'Minister resigns — Breaking  ']) {
      assert.equal(isBreaking(title), true, title);
    }
  });

  test('recognises the capitalised word BREAKING anywhere', () => {
    assert.equal(isBreaking('BREAKING minister resigns'), true);
    assert.equal(isBreaking('Minister resigns BREAKING'), true);
    assert.equal(isBreaking('BREAKING NEWS'), true);
  });

  test('live blogs ("– live", "live updates") are rolling coverage, not breaking news, but isLiveBlog() spots them', () => {
    for (const title of ['Iran strikes – live', 'Iran strikes - live', 'Election night — live', 'Election night -live', 'Live updates: vote count under way', 'Live update: vote count under way', 'Vote count: live updates', 'Premier League – live', 'Live: storm reaches the coast']) {
      assert.equal(isBreaking(title), false, title);
      assert.equal(isLiveBlog(title), true, title);
    }
    assert.equal(isBreaking('BREAKING: storm hits the coast – live'), true, 'an explicit marker still wins');
  });

  test('isLiveBlog() ignores headlines that merely contain "live"', () => {
    for (const title of ['Live music festival opens in Lisbon', 'Olive harvest begins early', 'Alive and well after ten days at sea', 'Long-lived trees found in Chile', 'Minister resigns', '', undefined]) {
      assert.equal(isLiveBlog(title), false, String(title));
    }
  });

  test('recognises the Spanish "última hora"', () => {
    assert.equal(isBreaking('Última hora: dimite el ministro'), true);
    assert.equal(isBreaking('ÚLTIMA HORA: dimite el ministro'), true);
    assert.equal(isBreaking('Dimite el ministro, última hora'), true);
  });

  test('does not react to "breaking" as an ordinary word or part of a compound', () => {
    for (const title of [
      'Record-breaking heatwave hits southern Europe',
      'Ground-breaking study on sleep published',
      'Heart-breaking scenes after the flood',
      'Bread-breaking ceremony held in Rome',
      'Man charged with breaking into home',
      'Breaking the news gently to children',
      'Breaking Bad star dies',
      'Law-breaking tourists fined',
    ]) {
      assert.equal(isBreaking(title), false, title);
    }
  });

  test('does not react to other headlines that merely contain "live"', () => {
    for (const title of ['Live music festival opens in Lisbon', 'Olive harvest begins early', 'Alive and well after ten days at sea', 'Deliver the goods, says union', 'Update on the budget talks', 'Minister resigns']) {
      assert.equal(isBreaking(title), false, title);
    }
  });

  test('always returns a boolean, also for empty or missing titles', () => {
    assert.equal(isBreaking(''), false);
    assert.equal(isBreaking(undefined), false);
    assert.equal(isBreaking('BREAKING: x'), true);
  });

  test(
    'does not mistake a headline that ENDS in "record-breaking" (or is all capitals) for breaking news',
    () => {
      for (const title of ['The heatwave is record-breaking', 'Sales are record-breaking', 'The scenes were heart-breaking', 'RECORD-BREAKING HEATWAVE HITS EUROPE']) {
        assert.equal(isBreaking(title), false, title);
      }
    }
  );
});

// ---------------------------------------------------------------- normalizeTitleKey

describe('normalizeTitleKey', () => {
  test('is identical for titles that differ only in accents, punctuation and case', () => {
    const a = normalizeTitleKey('Sánchez announces new economic measures, today');
    const b = normalizeTitleKey('SANCHEZ announces: new economic measures today!');
    const c = normalizeTitleKey('  sánchez   ANNOUNCES “new” economic measures... today ');
    assert.equal(a, b);
    assert.equal(a, c);
    assert.equal(a, 'sanchez announces economic measures today'); // "new" is too short to count
  });

  test('differs for different headlines', () => {
    assert.notEqual(normalizeTitleKey('Government approves the housing plan'), normalizeTitleKey('Government rejects the housing plan'));
  });

  test('ignores short words and only uses the first 8 significant words', () => {
    const key = normalizeTitleKey('The of a in us three black cats sleep always peacefully although raining heavily outside');
    assert.equal(key.split(' ').length, 8);
    assert.equal(key, normalizeTitleKey('The of a in us three black cats sleep always peacefully although raining heavily elsewhere and more'));
  });

  test('is an empty string when there are no significant words', () => {
    assert.equal(normalizeTitleKey('Is it up?'), '');
  });
});

// ---------------------------------------------------------------- keywords / sameEvent

describe('keywords', () => {
  test('lowercases, strips accents and punctuation, and drops stopwords and tiny words', () => {
    const kw = keywords('BREAKING: The Président says "Café" talks are over in Zürich!');
    assert.ok(kw instanceof Set);
    assert.deepEqual([...kw].sort(), ['breaking', 'cafe', 'president', 'talks', 'zurich']);
  });

  test('keeps numbers and splits on any non-alphanumeric character', () => {
    assert.deepEqual([...keywords('COVID-19: 4000 hospitalised')].sort(), ['4000', 'covid', 'hospitalised']);
  });

  test('stopwords include the common Spanish ones too', () => {
    assert.deepEqual([...keywords('El presidente de la república')].sort(), ['presidente', 'republica']);
  });

  test('is empty when nothing is left', () => {
    assert.equal(keywords('The new live update').size, 0);
    assert.equal(keywords('').size, 0);
  });
});

describe('sameEvent', () => {
  const set = (...words) => new Set(words);

  test('headlines about the same event with different wording match', () => {
    assert.equal(sameEvent(keywords('Earthquake strikes northern Japan'), keywords('Powerful earthquake hits northern Japan')), true);
    assert.equal(sameEvent(keywords('Fed raises interest rates by 0.5 points'), keywords('US Fed raises rates again, markets slide')), true);
  });

  test('unrelated headlines do not match', () => {
    assert.equal(sameEvent(keywords('Earthquake strikes northern Japan'), keywords('Parliament passes new budget law')), false);
    assert.equal(sameEvent(keywords('Earthquake strikes northern Japan'), keywords('Tourism in northern Norway booms')), false);
  });

  test('a single shared keyword is never enough', () => {
    assert.equal(sameEvent(set('japan', 'quake'), set('japan', 'tourism')), false);
    assert.equal(sameEvent(set('japan'), set('japan')), false);
  });

  test('needs at least 2 shared keywords and a 20% overlap (shared / union)', () => {
    const base = ['a1', 'a2'];
    const pad = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}`);
    // 2 shared, union = 2 + 4 + 4 = 10 -> exactly 0.2: a match
    assert.equal(sameEvent(set(...base, ...pad(4, 'x')), set(...base, ...pad(4, 'y'))), true);
    // 2 shared, union = 2 + 4 + 5 = 11 -> 0.18: not a match
    assert.equal(sameEvent(set(...base, ...pad(4, 'x')), set(...base, ...pad(5, 'y'))), false);
  });

  test('is symmetric and false for empty sets', () => {
    const a = keywords('Earthquake strikes northern Japan');
    const b = keywords('Powerful earthquake hits northern Japan');
    assert.equal(sameEvent(a, b), sameEvent(b, a));
    assert.equal(sameEvent(new Set(), new Set()), false);
    assert.equal(sameEvent(a, new Set()), false);
  });
});

// ---------------------------------------------------------------- interestScore

describe('interestScore', () => {
  const base = { published: NOW, summary: LONG_SUMMARY, weight: 1, outlets: 1, image: null };
  const score = (extra = {}, now = NOW) => interestScore({ ...base, ...extra }, now);

  test('a brand-new story from one outlet with a real summary and no picture scores exactly 1', () => {
    close(score(), 1);
  });

  test('recency halves the score after 6 hours and keeps falling', () => {
    close(score({ published: NOW - 6 * HOUR }), 0.5);
    close(score({ published: NOW - 18 * HOUR }), 0.25);
    assert.ok(score({ published: NOW - HOUR }) > score({ published: NOW - 2 * HOUR }));
  });

  test('a story dated in the future is not boosted above a fresh one', () => {
    close(score({ published: NOW + 5 * HOUR }), 1);
  });

  test('more outlets covering the event raise the score by 0.9 per extra outlet, capped at 5 outlets', () => {
    close(score({ outlets: 2 }), 1.9);
    close(score({ outlets: 3 }), 2.8);
    close(score({ outlets: 5 }), 4.6);
    close(score({ outlets: 50 }), 4.6);
  });

  test('a missing outlets count counts as a single outlet', () => {
    close(score({ outlets: undefined }), 1);
  });

  test('feed weight multiplies the score; a missing weight counts as 1', () => {
    close(score({ weight: 1.2 }), 1.2);
    close(score({ weight: 0.7 }), 0.7);
    close(score({ weight: undefined }), 1);
  });

  test('a picture adds 15%', () => {
    close(score({ image: 'https://img.test/a.jpg' }), 1.15);
  });

  test('a thin summary (80 characters or fewer, or none) costs 30%', () => {
    close(score({ summary: 'x'.repeat(80) }), 0.7);
    close(score({ summary: 'x'.repeat(81) }), 1);
    close(score({ summary: '' }), 0.7);
    close(score({ summary: undefined }), 0.7);
  });

  test('every time the editor passed a story over its score is multiplied by 0.6', () => {
    close(score({ offered: 1 }), 0.6);
    close(score({ offered: 2 }), 0.36);
    close(score({ offered: 0 }), 1);
  });

  test('the factors combine multiplicatively', () => {
    const s = { published: NOW - 6 * HOUR, outlets: 3, weight: 1.1, image: 'https://img.test/a.jpg', summary: 'short', offered: 1 };
    close(score(s), 0.5 * 2.8 * 1.1 * 1.15 * 0.7 * 0.6);
  });

  test('now defaults to the current time', () => {
    const fresh = interestScore({ ...base, published: Date.now() });
    assert.ok(fresh > 0.99 && fresh <= 1.0001, String(fresh));
  });
});

// ---------------------------------------------------------------- NewsDesk: trending

describe('NewsDesk.updateTrending', () => {
  const quake = (id, source, title, minutesAgo = 10) => makeStory(id, source, minutesAgo, { title });

  test('outlets is the number of distinct outlets reporting the same event (the story itself included)', () => {
    const desk = makeDesk({
      stories: [
        quake('q1', 'BBC', 'Earthquake strikes northern Japan'),
        quake('q2', 'Sky', 'Powerful earthquake hits northern Japan'),
        quake('q3', 'DW', 'Japan earthquake: northern coast hit'),
        makeStory('other', 'NPR', 5, { title: 'Parliament passes new budget law' }),
      ],
    });

    desk.updateTrending();

    assert.equal(desk.get('q1').outlets, 3);
    assert.equal(desk.get('q2').outlets, 3);
    assert.equal(desk.get('q3').outlets, 3);
    assert.equal(desk.get('other').outlets, 1);
  });

  test('several reports from the same outlet count once', () => {
    const desk = makeDesk({
      stories: [
        quake('q1', 'BBC', 'Earthquake strikes northern Japan'),
        quake('q2', 'BBC', 'Japan earthquake: what we know so far'),
        quake('q3', 'Sky', 'Powerful earthquake hits northern Japan'),
      ],
    });

    desk.updateTrending();

    assert.equal(desk.get('q1').outlets, 2);
    assert.equal(desk.get('q2').outlets, 2);
    assert.equal(desk.get('q3').outlets, 2);
  });

  test('an event covered by a single outlet has outlets = 1', () => {
    const desk = makeDesk({ stories: [makeStory('a', 'BBC', 1), makeStory('b', 'Sky', 2)] });
    desk.updateTrending();
    assert.deepEqual([desk.get('a').outlets, desk.get('b').outlets], [1, 1]);
  });

  test('is recomputed on every call, so it follows stories that arrive or leave', () => {
    const desk = makeDesk({ stories: [quake('q1', 'BBC', 'Earthquake strikes northern Japan')] });
    desk.updateTrending();
    assert.equal(desk.get('q1').outlets, 1);

    desk.stories.set('q2', quake('q2', 'Sky', 'Powerful earthquake hits northern Japan'));
    desk.updateTrending();
    assert.equal(desk.get('q1').outlets, 2);

    desk.stories.delete('q2');
    desk.updateTrending();
    assert.equal(desk.get('q1').outlets, 1);
  });

  test('refresh() updates the trending counts of the stories it stores', async () => {
    const fetchImpl = routedFetch({
      'https://alfa.test/rss': rssFeed(
        rssItem({ title: 'Earthquake strikes northern Japan', link: 'https://alfa.test/quake' }),
        rssItem({ title: 'Parliament passes new budget law', link: 'https://alfa.test/budget' })
      ),
      'https://beta.test/rss': rssFeed(rssItem({ title: 'Powerful earthquake hits northern Japan', link: 'https://beta.test/quake' })),
    });
    const desk = makeDesk({ feeds: FEEDS.slice(0, 2), fetchImpl });

    await desk.refresh();

    const bySource = (source, text) => [...desk.stories.values()].find((s) => s.source === source && s.title.includes(text));
    assert.equal(bySource('Alfa', 'Earthquake').outlets, 2);
    assert.equal(bySource('Beta', 'earthquake').outlets, 2);
    assert.equal(bySource('Alfa', 'budget').outlets, 1);
  });
});

// ---------------------------------------------------------------- NewsDesk: candidates / pickStories

describe('NewsDesk.candidates', () => {
  test('ranks by interest: a story covered by several outlets beats a fresher single-outlet one', () => {
    const desk = makeDesk({
      stories: [
        makeStory('fresh', 'A', 5, { title: 'Local bakery wins award' }),
        makeStory('big1', 'B', 120, { title: 'Earthquake strikes northern Japan' }),
        makeStory('big2', 'C', 130, { title: 'Powerful earthquake hits northern Japan' }),
        makeStory('big3', 'D', 140, { title: 'Japan earthquake: northern coast hit' }),
      ],
    });
    desk.updateTrending();

    const [first, second] = desk.candidates(5);

    assert.equal(first.id, 'big1');
    assert.equal(second.id, 'fresh');
  });

  test('with everything else equal the freshest story comes first', () => {
    const desk = makeDesk({ stories: [makeStory('old', 'A', 300), makeStory('new', 'B', 10), makeStory('mid', 'C', 100)] });
    assert.deepEqual(ids(desk.candidates(3)), ['new', 'mid', 'old']);
  });

  test('feed weight, a picture and a real summary all push a story up', () => {
    const desk = makeDesk({
      stories: [
        makeStory('plain', 'A', 10),
        makeStory('weighty', 'B', 10, { weight: 1.2 }),
        makeStory('picture', 'C', 10, { image: 'https://img.test/c.jpg' }),
        makeStory('thin', 'D', 10, { summary: '' }),
      ],
    });
    assert.deepEqual(ids(desk.candidates(4)), ['weighty', 'picture', 'plain', 'thin']);
  });

  test('stories the editor already passed over sink in the ranking', () => {
    const desk = makeDesk({ stories: [makeStory('fresh', 'A', 10, { offered: 2 }), makeStory('older', 'B', 60)] });
    assert.deepEqual(ids(desk.candidates(2)), ['older', 'fresh']);
  });

  test('returns at most `count` stories, and fewer when there are fewer', () => {
    const desk = makeDesk({ stories: [makeStory('a', 'A', 1), makeStory('b', 'B', 2), makeStory('c', 'C', 3)] });
    assert.equal(desk.candidates(2).length, 2);
    assert.equal(desk.candidates(99).length, 3);
    assert.deepEqual(desk.candidates(0), []);
  });

  test('filters by category; null means every category; an empty list means none', () => {
    const desk = makeDesk({
      stories: [
        makeStory('w', 'A', 1, { category: 'world' }),
        makeStory('t', 'B', 2, { category: 'tech' }),
        makeStory('s', 'C', 3, { category: 'science' }),
        makeStory('b', 'D', 4, { category: 'business' }),
      ],
    });
    assert.deepEqual(ids(desk.candidates(10, { categories: ['tech', 'science'] })), ['t', 's']);
    assert.deepEqual(ids(desk.candidates(10, { categories: ['business'] })), ['b']);
    assert.equal(desk.candidates(10, { categories: null }).length, 4);
    assert.equal(desk.candidates(10, {}).length, 4);
    assert.deepEqual(desk.candidates(10, { categories: [] }), []);
    assert.deepEqual(desk.candidates(10, { categories: ['sport'] }), []);
  });

  test('keeps one story per event: the highest-ranked report wins', () => {
    const desk = makeDesk({
      stories: [
        makeStory('q-old', 'A', 120, { title: 'Earthquake strikes northern Japan' }),
        makeStory('q-new', 'B', 20, { title: 'Powerful earthquake hits northern Japan' }),
        makeStory('budget', 'C', 60, { title: 'Parliament passes new budget law' }),
      ],
    });
    desk.updateTrending();

    const picked = desk.candidates(5);

    assert.deepEqual(ids(picked), ['q-new', 'budget']);
  });

  test('takes at most 3 stories per outlet by default, or `perSource`', () => {
    const stories = Array.from({ length: 5 }, (_, i) => makeStory(`a${i}`, 'Alpha', i + 1)).concat([makeStory('b0', 'Beta', 10), makeStory('c0', 'Gamma', 11)]);
    const desk = makeDesk({ stories });

    assert.deepEqual(ids(desk.candidates(10)), ['a0', 'a1', 'a2', 'b0', 'c0']);
    assert.deepEqual(ids(desk.candidates(10, { perSource: 1 })), ['a0', 'b0', 'c0']);
    assert.deepEqual(ids(desk.candidates(10, { perSource: 99 })), ['a0', 'a1', 'a2', 'a3', 'a4', 'b0', 'c0']);
  });

  test('the per-outlet cap is applied before `count`, so other outlets fill the list', () => {
    const stories = Array.from({ length: 4 }, (_, i) => makeStory(`a${i}`, 'Alpha', i + 1)).concat([makeStory('b0', 'Beta', 30)]);
    assert.deepEqual(ids(makeDesk({ stories }).candidates(4, { perSource: 2 })), ['a0', 'a1', 'b0']);
  });

  test('excludes covered stories', () => {
    const desk = makeDesk({ stories: [makeStory('a', 'A', 1), makeStory('b', 'B', 2), makeStory('c', 'C', 3)] });
    desk.markCovered(['a']);
    assert.deepEqual(ids(desk.candidates(5)), ['b', 'c']);
  });

  test('returns an empty list when there are no stories or everything is covered', () => {
    assert.deepEqual(makeDesk().candidates(5), []);
    const desk = makeDesk({ stories: [makeStory('a', 'A', 1), makeStory('b', 'B', 2)] });
    desk.markCovered(ids(desk.candidates(99)));
    assert.deepEqual(desk.candidates(5), []);
  });

  test('`now` sets the clock used for the recency ranking', () => {
    // A is brand new, B is 6 hours older but covered by two outlets (x1.9).
    const stories = () => [
      makeStory('A', 'Alpha', 0, { title: 'Parliament passes new budget law' }),
      makeStory('B', 'Beta', 6 * 60, { title: 'Earthquake strikes northern Japan', outlets: 2 }),
    ];
    const desk = makeDesk({ stories: stories() });
    assert.deepEqual(ids(desk.candidates(2, { now: NOW })), ['A', 'B']);
    assert.deepEqual(ids(desk.candidates(2, { now: NOW + 24 * HOUR })), ['B', 'A']);
  });

  test('works on stories that were never run through updateTrending (outlets defaults to 1)', () => {
    const desk = makeDesk({ stories: [makeStory('a', 'A', 1)] });
    assert.deepEqual(ids(desk.candidates(1)), ['a']);
  });
});

describe('NewsDesk.pickStories', () => {
  test('is an alias for candidates(count) with the default options', () => {
    const stories = [
      makeStory('a1', 'A', 1),
      makeStory('a2', 'A', 2),
      makeStory('a3', 'A', 3),
      makeStory('a4', 'A', 4),
      makeStory('b1', 'B', 20, { category: 'tech' }),
    ];
    const desk = makeDesk({ stories });
    assert.deepEqual(ids(desk.pickStories(10)), ids(desk.candidates(10)));
    assert.deepEqual(ids(desk.pickStories(10)), ['a1', 'a2', 'a3', 'b1']);
    assert.deepEqual(ids(desk.pickStories(2)), ['a1', 'a2']);
  });

  test('skips covered stories', () => {
    const desk = makeDesk({ stories: [makeStory('a', 'A', 1), makeStory('b', 'B', 2)] });
    desk.markCovered(['a']);
    assert.deepEqual(ids(desk.pickStories(5)), ['b']);
  });
});

describe('NewsDesk.uncovered / get', () => {
  test('uncovered() lists stories that have not been covered, newest first', () => {
    const desk = makeDesk({ stories: [makeStory('old', 'A', 50), makeStory('new', 'B', 1), makeStory('mid', 'C', 20)] });
    desk.markCovered(['mid']);
    assert.deepEqual(ids(desk.uncovered()), ['new', 'old']);
  });

  test('get() returns a story by id', () => {
    const desk = makeDesk({ stories: [makeStory('x', 'Src', 1)] });
    assert.equal(desk.get('x').source, 'Src');
    assert.equal(desk.get('nope'), undefined);
  });
});

// ---------------------------------------------------------------- NewsDesk: markCovered / markOffered

describe('NewsDesk.markCovered', () => {
  const quakeStories = () => [
    makeStory('q1', 'BBC', 10, { title: 'Earthquake strikes northern Japan' }),
    makeStory('q2', 'Sky', 12, { title: 'Powerful earthquake hits northern Japan' }),
    makeStory('q3', 'Same outlet', 14, { title: 'Japan earthquake: northern coast hit' }),
    makeStory('budget', 'NPR', 5, { title: 'Parliament passes new budget law' }),
  ];

  test('marks the given stories as covered, with a timestamp', () => {
    const desk = makeDesk({ stories: [makeStory('a', 'A', 1), makeStory('b', 'B', 2)] });
    const before = Date.now();

    desk.markCovered(['a']);

    assert.ok(desk.covered.get('a') >= before);
    assert.equal(desk.covered.has('b'), false);
    assert.deepEqual(ids(desk.uncovered()), ['b']);
  });

  test('also covers other outlets\' reports of the same event, but not unrelated stories', () => {
    const desk = makeDesk({ stories: quakeStories() });

    desk.markCovered(['q1']);

    assert.deepEqual([...desk.covered.keys()].sort(), ['q1', 'q2', 'q3']);
    assert.deepEqual(ids(desk.uncovered()), ['budget']);
    assert.deepEqual(ids(desk.candidates(10)), ['budget']);
  });

  test('works from any report of the event', () => {
    const desk = makeDesk({ stories: quakeStories() });
    desk.markCovered(['q3']);
    assert.deepEqual([...desk.covered.keys()].sort(), ['q1', 'q2', 'q3']);
  });

  test('an id that is no longer on the desk is still remembered, and nothing else is covered', () => {
    const desk = makeDesk({ stories: quakeStories() });
    desk.markCovered(['gone']);
    assert.deepEqual([...desk.covered.keys()], ['gone']);
  });

  test('accepts several ids and an empty list', () => {
    const desk = makeDesk({ stories: quakeStories() });
    desk.markCovered([]);
    assert.equal(desk.covered.size, 0);
    desk.markCovered(['q1', 'budget']);
    assert.equal(desk.covered.size, 4);
  });

  test('covers again a report of the same event that an earlier episode covered (fix r2: a re-run keeps its mates off the air)', () => {
    const desk = makeDesk({ stories: quakeStories() });
    desk.covered.set('q2', 1234);
    desk.coveredSeq.set('q2', 0);
    desk.markCovered(['q1']);
    assert.ok(desk.covered.get('q2') > 1234, 'the mate is covered now');
    assert.equal(desk.coveredSeq.get('q2'), desk.coverSeq, 'with this episode, so recycling waits the full gap for it too');
  });
});

describe('NewsDesk.markOffered', () => {
  test('counts how many times a story was offered to the writer', () => {
    const desk = makeDesk({ stories: [makeStory('a', 'A', 1), makeStory('b', 'B', 2)] });

    desk.markOffered(['a']);
    desk.markOffered(['a', 'b']);

    assert.equal(desk.get('a').offered, 2);
    assert.equal(desk.get('b').offered, 1);
  });

  test('a story offered 3 times is covered (dropped); before that it stays available', () => {
    const desk = makeDesk({ stories: [makeStory('a', 'A', 1), makeStory('b', 'B', 2)] });

    desk.markOffered(['a']);
    desk.markOffered(['a']);
    assert.equal(desk.covered.has('a'), false);
    assert.deepEqual(ids(desk.candidates(5)), ['b', 'a'], 'a has sunk in the ranking but is still there');

    desk.markOffered(['a']);
    assert.equal(desk.covered.has('a'), true);
    assert.deepEqual(ids(desk.candidates(5)), ['b']);
  });

  test('ignores ids it does not know', () => {
    const desk = makeDesk({ stories: [makeStory('a', 'A', 1)] });
    assert.doesNotThrow(() => desk.markOffered(['nope']));
    assert.equal(desk.covered.size, 0);
  });

  test('does not cover other reports of the same event (only markCovered does)', () => {
    const desk = makeDesk({
      stories: [
        makeStory('q1', 'BBC', 10, { title: 'Earthquake strikes northern Japan' }),
        makeStory('q2', 'Sky', 12, { title: 'Powerful earthquake hits northern Japan' }),
      ],
    });
    desk.markOffered(['q1']);
    desk.markOffered(['q1']);
    desk.markOffered(['q1']);
    assert.deepEqual([...desk.covered.keys()], ['q1']);
  });
});

// ---------------------------------------------------------------- NewsDesk: refresh

describe('NewsDesk.refresh', () => {
  test('stores fresh stories, tags them with the feed name, category and weight, and records feed status', async () => {
    const xml = rssFeed(
      rssItem({ title: 'First story of the day', link: 'https://example.com/1', description: 'Summary one.' }),
      rssItem({ title: 'Second distinct story', link: 'https://example.com/2', description: 'Summary two.' })
    );
    const desk = makeDesk({
      feeds: [FEEDS[0]],
      fetchImpl: routedFetch({ 'https://alfa.test/rss': xml }),
    });

    const added = await desk.refresh();

    assert.equal(added, 2);
    assert.equal(desk.stories.size, 2);
    assert.deepEqual(desk.feedStatus, { Alfa: { ok: true, items: 2 } });
    assert.ok([...desk.stories.values()].every((s) => s.source === 'Alfa' && s.category === 'world' && s.weight === 1.2));
    assert.ok(desk.lastRefresh >= NOW);
  });

  test('dedupes the same link across feeds (first feed wins) and across refreshes', async () => {
    const xml = rssFeed(
      rssItem({ title: 'Story shared by everyone', link: 'https://example.com/shared' }),
      rssItem({ title: 'Another shared story', link: 'https://example.com/shared-2?utm=1' })
    );
    const fetchImpl = routedFetch(Object.fromEntries(FEEDS.map((f) => [f.url, xml])));
    const desk = makeDesk({ feeds: FEEDS, fetchImpl });

    assert.equal(await desk.refresh(), 2);
    assert.equal(desk.stories.size, 2);
    assert.ok([...desk.stories.values()].every((s) => s.source === 'Alfa'));
    assert.equal(Object.keys(desk.feedStatus).length, 3);

    assert.equal(await desk.refresh(), 0, 'a second refresh must not add duplicates');
    assert.equal(desk.stories.size, 2);
  });

  test('dedupes near-identical titles coming from different feeds with different links', async () => {
    const fetchImpl = routedFetch({
      'https://alfa.test/rss': rssFeed(rssItem({ title: 'Sánchez announces new economic measures today', link: 'https://alfa.test/a' })),
      'https://beta.test/rss': rssFeed(rssItem({ title: 'SANCHEZ announces: new economic measures today!', link: 'https://beta.test/b' })),
      'https://gamma.test/rss': rssFeed(rssItem({ title: 'A completely different story', link: 'https://gamma.test/c' })),
    });
    const desk = makeDesk({ feeds: FEEDS, fetchImpl });

    const added = await desk.refresh();

    assert.equal(added, 2);
    assert.deepEqual([...desk.stories.values()].map((s) => s.source).sort(), ['Alfa', 'Gamma']);
    // Beta did respond fine, its story was just a duplicate.
    assert.deepEqual(desk.feedStatus.Beta, { ok: true, items: 1 });
  });

  test('also dedupes against titles of stories already in the desk', async () => {
    const desk = makeDesk({
      stories: [makeStory('old', 'Old', 30, { title: 'Sánchez announces new economic measures today' })],
      feeds: [FEEDS[0]],
      fetchImpl: routedFetch({
        'https://alfa.test/rss': rssFeed(rssItem({ title: 'SANCHEZ announces new economic measures today', link: 'https://alfa.test/new' })),
      }),
    });
    assert.equal(await desk.refresh(), 0);
    assert.deepEqual([...desk.stories.keys()], ['old']);
  });

  test('records an HTTP 403 for one feed in feedStatus without throwing, and keeps the other feeds', async () => {
    const fetchImpl = routedFetch({
      'https://alfa.test/rss': rssFeed(rssItem({ title: 'Live story from Alfa', link: 'https://alfa.test/1' })),
      'https://beta.test/rss': 403,
      'https://gamma.test/rss': new Error('connect ECONNRESET'),
    });
    const desk = makeDesk({ feeds: FEEDS, fetchImpl });

    const added = await desk.refresh();

    assert.equal(added, 1);
    assert.deepEqual(desk.feedStatus.Alfa, { ok: true, items: 1 });
    assert.deepEqual(desk.feedStatus.Beta, { ok: false, error: 'HTTP 403' });
    assert.deepEqual(desk.feedStatus.Gamma, { ok: false, error: 'connect ECONNRESET' });
    assert.equal(desk.stories.size, 1);
  });

  test('a feed that recovers flips its status back to ok', async () => {
    const routes = { 'https://alfa.test/rss': 403 };
    const desk = makeDesk({ feeds: [FEEDS[0]], fetchImpl: routedFetch(routes) });
    await desk.refresh();
    assert.equal(desk.feedStatus.Alfa.ok, false);

    routes['https://alfa.test/rss'] = rssFeed(rssItem({ title: 'Working again now', link: 'https://alfa.test/ok' }));
    await desk.refresh();
    assert.deepEqual(desk.feedStatus.Alfa, { ok: true, items: 1 });
  });

  test('drops items older than maxStoryAgeHours but keeps recent ones', async () => {
    const maxAge = config.maxStoryAgeHours;
    const xml = rssFeed(
      rssItem({ title: 'Fresh news from today', link: 'https://example.com/fresh', pubDate: rssDate(1) }),
      rssItem({ title: 'Almost expired but valid', link: 'https://example.com/almost', pubDate: rssDate(maxAge - 1) }),
      rssItem({ title: 'Old expired report', link: 'https://example.com/stale', pubDate: rssDate(maxAge + 1) })
    );
    const desk = makeDesk({ feeds: [FEEDS[0]], fetchImpl: routedFetch({ 'https://alfa.test/rss': xml }) });

    const added = await desk.refresh();

    assert.equal(added, 2);
    assert.deepEqual([...desk.stories.values()].map((s) => s.link).sort(), ['https://example.com/almost', 'https://example.com/fresh']);
    // The feed itself delivered 3 items; the stale one is filtered by the desk.
    assert.equal(desk.feedStatus.Alfa.items, 3);
  });

  test('forgets stored stories (and old covered marks) once they age out', async () => {
    const maxAge = config.maxStoryAgeHours * HOUR;
    const desk = makeDesk({
      stories: [makeStory('stale', 'X', 0, { published: Date.now() - maxAge - HOUR }), makeStory('fresh', 'X', 10)],
      feeds: [FEEDS[0]],
      fetchImpl: routedFetch({ 'https://alfa.test/rss': rssFeed() }),
    });
    desk.covered.set('ancient', Date.now() - maxAge * 2 - 1000);
    desk.covered.set('recent', Date.now() - HOUR);

    await desk.refresh();

    assert.deepEqual([...desk.stories.keys()], ['fresh']);
    assert.deepEqual([...desk.covered.keys()], ['recent']);
  });

  test('works with the real config/feeds.json when every URL returns the same XML', async () => {
    const xml = rssFeed(
      rssItem({ title: 'First story for all feeds', link: 'https://example.com/real-1' }),
      rssItem({ title: 'Second story for all feeds', link: 'https://example.com/real-2' })
    );
    const calls = [];
    const desk = makeDesk({
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response(xml, { status: 200 });
      },
    });
    const feeds = desk.loadFeeds();
    assert.ok(feeds.length >= 2, 'config/feeds.json should list several feeds');

    const added = await desk.refresh();

    assert.equal(added, 2);
    assert.equal(desk.stories.size, 2);
    assert.deepEqual(Object.keys(desk.feedStatus).sort(), feeds.map((f) => f.name).sort());
    assert.deepEqual(calls.map((c) => c.url).sort(), feeds.map((f) => f.url).sort());
    assert.ok(calls.every((c) => /LiveNewsBot/.test(c.init.headers['user-agent'])));
    // the first feed wins the duplicates, and its category and weight are carried over
    assert.ok([...desk.stories.values()].every((s) => s.source === feeds[0].name && s.category === feeds[0].category && s.weight === feeds[0].weight));
  });
});

describe('config/feeds.json', () => {
  const feeds = makeDesk().loadFeeds();

  test('every feed has a unique name, an http(s) URL, a category and a positive numeric weight', () => {
    assert.ok(feeds.length >= 2);
    assert.equal(new Set(feeds.map((f) => f.name)).size, feeds.length, 'feed names must be unique (they key feedStatus)');
    for (const f of feeds) {
      assert.equal(typeof f.name, 'string', JSON.stringify(f));
      assert.match(f.url, /^https?:\/\//, f.name);
      assert.match(f.category, /^[a-z]+$/, f.name);
      assert.ok(typeof f.weight === 'number' && f.weight > 0 && f.weight <= 2, `${f.name} weight ${f.weight}`);
    }
  });
});

// ---------------------------------------------------------------- NewsDesk: resolveImage

describe('NewsDesk.resolveImage', () => {
  const page = (meta) => `<html><head><title>t</title>${meta}</head><body></body></html>`;

  test('returns the feed image without fetching anything', async () => {
    const desk = makeDesk();
    const story = makeStory('x', 'S', 1, { image: 'https://img.test/already.jpg' });
    assert.equal(await desk.resolveImage(story), 'https://img.test/already.jpg');
  });

  test('reads og:image from the article page and resolves relative URLs', async () => {
    const fetchImpl = routedFetch({
      'https://example.test/x': page('<meta property="og:image" content="/media/cover.jpg?a=1&amp;b=2">'),
    });
    const desk = makeDesk({ fetchImpl });
    const story = makeStory('x', 'S', 1);

    assert.equal(await desk.resolveImage(story), 'https://example.test/media/cover.jpg?a=1&b=2');
    assert.equal(story.image, 'https://example.test/media/cover.jpg?a=1&b=2');
  });

  test('understands twitter:image and the reversed attribute order', async () => {
    const fetchImpl = routedFetch({
      'https://example.test/x': page('<meta content="https://img.test/tw.jpg" name="twitter:image">'),
    });
    const story = makeStory('x', 'S', 1);
    assert.equal(await makeDesk({ fetchImpl }).resolveImage(story), 'https://img.test/tw.jpg');
  });

  test('rejects unusable og:image values (tracking pixel, svg)', async () => {
    for (const bad of ['https://img.test/pixel.png', 'https://img.test/logo.svg']) {
      const fetchImpl = routedFetch({ 'https://example.test/x': page(`<meta property="og:image" content="${bad}">`) });
      const story = makeStory('x', 'S', 1);
      assert.equal(await makeDesk({ fetchImpl }).resolveImage(story), null, bad);
    }
  });

  test('only tries each story once, even when the fetch fails', async () => {
    const fetchImpl = routedFetch({ 'https://example.test/x': 500 });
    const desk = makeDesk({ fetchImpl });
    const story = makeStory('x', 'S', 1);

    assert.equal(await desk.resolveImage(story), null);
    assert.equal(await desk.resolveImage(story), null);
    assert.equal(fetchImpl.requested.length, 1);
    assert.equal(story.imageChecked, true);
  });
});

// ---------------------------------------------------------------- local feeds: pictures shipped with offline fixtures

describe('local feed pictures (offline fixtures only)', () => {
  const item = (url) => ({ title: 't', 'media:content': { '@_url': url, '@_medium': 'image' } });

  test('extractLocalImage resolves a relative picture path inside the feed folder, as a file: URL', () => {
    const dir = path.join(os.tmpdir(), 'feeds');
    assert.equal(extractLocalImage(item('img/a.png'), dir), pathToFileURL(path.join(dir, 'img', 'a.png')).href);
    assert.equal(extractLocalImage({ enclosure: { '@_url': 'b.jpg', '@_type': 'image/jpeg' } }, dir), pathToFileURL(path.join(dir, 'b.jpg')).href);
  });

  test('it never escapes the folder, never takes absolute paths or URLs, and only picture files', () => {
    const dir = path.join(os.tmpdir(), 'feeds');
    for (const url of ['../secret.png', 'img/../../x.png', '/etc/passwd.png', 'file:///etc/a.png', 'https://img.test/a.png', 'img/a.svg', 'notes.txt', '\\\\server\\a.png']) {
      assert.equal(extractLocalImage(item(url), dir), null, url);
    }
  });

  test('parseFeed uses it only when told the feed is local, and marks those stories local', () => {
    const xml = rssFeed('<item><title>Local</title><link>https://fixtures.test/1</link><description>Text.</description><media:content url="img/x.png" medium="image"/></item>');
    const remote = parseFeed(xml, FEED)[0];
    // A remote feed resolves a relative picture against the item's web page, never on the local disk.
    assert.equal(remote.image, 'https://fixtures.test/img/x.png');
    assert.ok(!('local' in remote));
    const dir = path.join(os.tmpdir(), 'feeds');
    const local = parseFeed(xml, FEED, { baseDir: dir })[0];
    assert.equal(local.image, pathToFileURL(path.join(dir, 'img', 'x.png')).href);
    assert.equal(local.local, true);
  });

  test('localFeedPath: repo-relative paths and file: URLs are local, web URLs are not', () => {
    assert.ok(localFeedPath('config/fixtures/world.xml').endsWith(path.join('config', 'fixtures', 'world.xml')));
    assert.equal(localFeedPath(pathToFileURL('/tmp/feed.xml').href), path.resolve('/tmp/feed.xml'));
    assert.equal(localFeedPath('https://example.test/rss'), null);
  });

  test('refresh() remembers the folders of local feeds (the only places pictures may be served from)', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livenews-local-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'feed.xml');
    fs.writeFileSync(file, rssFeed('<item><title>A local story here</title><link>https://fixtures.test/a</link><description>Text.</description><media:content url="pic.png" medium="image"/></item>'));
    const desk = makeDesk({ feeds: [{ name: 'Local', url: pathToFileURL(file).href, category: 'world' }] });
    await desk.refresh();
    assert.deepEqual([...desk.localImageRoots], [dir]);
    const story = [...desk.stories.values()][0];
    assert.equal(fileURLToPath(story.image), path.join(dir, 'pic.png'));
  });

  test('resolveImage never looks for an article page behind a local story', async () => {
    const story = { id: 'l1', link: 'https://fixtures.globit.invalid/1', image: null, local: true };
    assert.equal(await makeDesk({ fetchImpl: noNetwork }).resolveImage(story), null);
  });
});

describe('parseFeed: live blogs', () => {
  test('a live blog is flagged "live" (for the writer) but is not breaking news', () => {
    const xml = rssFeed('<item><title>Election night – live</title><link>https://example.test/live</link><description>Updates.</description></item>');
    const [s] = parseFeed(xml, FEED);
    assert.equal(s.live, true);
    assert.equal(isBreaking(s.title), false);
  });
});

describe('NewsDesk.deskView', () => {
  test('lists the most interesting stories first with what an editor needs to see, and nothing more', () => {
    const now = Date.now();
    const desk = makeDesk({
      stories: [
        { id: 'a', title: 'Old story', summary: 'x'.repeat(100), source: 'A', category: 'world', weight: 1, published: now - 20 * 3600_000, image: null },
        { id: 'b', title: 'BREAKING: fresh story', summary: 'x'.repeat(100), source: 'B', category: 'tech', weight: 1, published: now, image: 'https://img.test/b.jpg', live: false },
      ],
    });
    desk.covered.set('a', now);
    const view = desk.deskView(80, now);
    assert.deepEqual(view.map((v) => v.id), ['b', 'a']);
    assert.deepEqual(Object.keys(view[0]).sort(), ['breaking', 'category', 'covered', 'hasImage', 'id', 'imageCredit', 'imageCreditVia', 'imageVia', 'live', 'outlets', 'score', 'source', 'title']);
    assert.equal(view[0].breaking, true);
    assert.equal(view[0].hasImage, true);
    assert.equal(view[1].covered, true);
    assert.equal(desk.deskView(1, now).length, 1);
  });
});

describe('news: editorial fixes (round 1)', () => {
  test('the WordPress boilerplate regex stays linear on hostile input (no ReDoS)', async () => {
    const { stripBoilerplate } = await import('../server/news.js');
    for (const tail of ['A'.repeat(200) + ' x', 'ABCDEFGHIJ'.repeat(40) + 'z more words', 'Big News Site '.repeat(60) + 'x']) {
      const t0 = performance.now();
      stripBoilerplate(`Real text. The post Some title appeared first on ${tail}`);
      assert.ok(performance.now() - t0 < 50, `${(performance.now() - t0).toFixed(1)} ms`);
    }
    assert.equal(stripBoilerplate('Real story text. The post Big news appeared first on Example News Site.'), 'Real story text.');
    assert.equal(stripBoilerplate('Real story text. The post Big news appeared first on example.com'), 'Real story text.');
  });

  test('breaking news tops the desk (x3); a live page sinks (x0.5)', () => {
    const base = { published: 1000, outlets: 1, weight: 1, summary: 'x'.repeat(100) };
    const plain = interestScore({ ...base, title: 'Canal reopens' }, 1000);
    assert.equal(interestScore({ ...base, title: 'BREAKING: Canal reopens' }, 1000), plain * 3);
    assert.equal(interestScore({ ...base, title: 'Talks – live', live: true }, 1000), plain * 0.5);
  });

  test('a programme\'s first category weighs 1.5x in its candidates', () => {
    const desk = new NewsDesk({ log: { info() {}, warn() {} } });
    const now = Date.now();
    const add = (id, category, ageMin) => desk.stories.set(id, { id, title: `Story ${id} about ${category} things`, summary: 'x'.repeat(100), source: `Outlet ${id}`, category, weight: 1, published: now - ageMin * 60_000, kw: new Set([id, category]) });
    add('t1', 'tech', 0);
    add('s1', 'science', 30);
    assert.deepEqual(desk.candidates(2, { categories: ['science', 'tech'], now }).map((s) => s.id), ['s1', 't1']);
    assert.deepEqual(desk.candidates(2, { categories: ['tech', 'science'], now }).map((s) => s.id), ['t1', 's1']);
  });

  test('plainTitle strips the outlet\'s BREAKING and live markers', async () => {
    const { plainTitle } = await import('../server/news.js');
    assert.equal(plainTitle('BREAKING: Panama Canal reopens'), 'Panama Canal reopens');
    assert.equal(plainTitle('Minister resigns – BREAKING'), 'Minister resigns');
    assert.equal(plainTitle('Climate talks in Nairobi – live'), 'Climate talks in Nairobi');
    assert.equal(plainTitle('Live updates: election night'), 'Election night');
    assert.equal(plainTitle('Record-breaking heatwave hits Europe'), 'Record-breaking heatwave hits Europe');
  });
});

describe('editorial-2 r3: Guardian live patterns and shouting headlines', () => {
  test('the Guardian\'s live pages are spotted, and their markers never reach speech', async () => {
    const { plainTitle } = await import('../server/news.js');
    const cases = {
      'UK inflation falls to 2.3% as energy bills ease – business live': 'UK inflation falls to 2.3% as energy bills ease',
      'Politics live: PM faces questions on housing': 'Politics: PM faces questions on housing',
      'Ukraine war live: talks resume in Geneva': 'Ukraine war: talks resume in Geneva',
      'Election night – as it happened': 'Election night',
    };
    for (const [title, said] of Object.entries(cases)) {
      assert.equal(isLiveBlog(title), true, title);
      assert.equal(isBreaking(title), false, title);
      assert.equal(plainTitle(title), said, title);
    }
    for (const title of ['Live music festival opens in Lisbon', 'Olive harvest: a record year', 'Deliver the goods, says union']) assert.equal(isLiveBlog(title), false, title);
  });

  test('sentenceCase keeps place names (also a two-word place at the very end) and acronyms, and never throws', async () => {
    const { sentenceCase } = await import('../server/news.js');
    assert.equal(sentenceCase('THOUSANDS FLEE AS WILDFIRE SPREADS NEAR LOS ANGELES'), 'Thousands flee as wildfire spreads near Los Angeles');
    assert.equal(sentenceCase('FLOODS IN NEW ZEALAND'), 'Floods in New Zealand');
    assert.equal(sentenceCase('UN SAYS AID REACHES SOUTH SUDAN'), 'UN says aid reaches South Sudan');
    assert.equal(sentenceCase('Normal headline stays as written'), 'Normal headline stays as written');
    for (const t of ['NEW YORK', 'IN NEW YORK CITY', 'TO SAN FRANCISCO', '!!! LOS ANGELES !!!']) assert.doesNotThrow(() => sentenceCase(t), t);
  });
});

describe('sentenceCase keeps acronyms and codes it does not know (fix round 1)', () => {
  test('ESA, Q3, COP29 stay; ordinary short words and places do not shout', async () => {
    const { sentenceCase } = await import('../server/news.js');
    assert.equal(sentenceCase('NASA AND ESA LAUNCH JOINT MISSION'), 'NASA and ESA launch joint mission');
    assert.equal(sentenceCase('UK GDP SHRINKS IN Q3'), 'UK GDP shrinks in Q3');
    assert.equal(sentenceCase('G7 LEADERS MEET AT COP29'), 'G7 leaders meet at COP29');
    assert.equal(sentenceCase('WHO WARNS OF CHOLERA IN DRC'), 'WHO warns of cholera in DRC');
    assert.equal(sentenceCase('OIL PRICES FALL AS DEMAND COOLS'), 'Oil prices fall as demand cools');
    assert.equal(sentenceCase('MAN HELD AFTER BANK RAID IN ROME'), 'Man held after bank raid in Rome');
    assert.equal(sentenceCase('THOUSANDS FLEE AS WILDFIRE SPREADS NEAR LOS ANGELES'), 'Thousands flee as wildfire spreads near Los Angeles');
  });
});
