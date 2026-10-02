import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import { NewsDesk, cleanHtml, decodeEntities, extractImage, normalizeTitleKey, parseFeed, storyId } from '../server/news.js';

// ---------------------------------------------------------------- helpers

const silentLogger = { info() {}, warn() {}, error() {} };

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

const FEED = { name: 'Fuente', category: 'mundo' };

/** A story object as produced by parseFeed, `minutesAgo` old. */
const makeStory = (id, source, minutesAgo, extra = {}) => ({
  id,
  title: `Titular de ${id}`,
  summary: '',
  link: `https://example.test/${id}`,
  source,
  category: 'general',
  published: NOW - minutesAgo * 60_000,
  image: null,
  ...extra,
});

const noNetwork = async (url) => {
  throw new Error(`unexpected network access to ${url}`);
};

function makeDesk({ stories = [], fetchImpl = noNetwork, feeds } = {}) {
  const desk = new NewsDesk({ log: silentLogger, fetchImpl });
  for (const s of stories) desk.stories.set(s.id, s);
  if (feeds) desk.loadFeeds = () => feeds;
  return desk;
}

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
  { name: 'Alfa', url: 'https://alfa.test/rss', category: 'general' },
  { name: 'Beta', url: 'https://beta.test/rss', category: 'tecnologia' },
  { name: 'Gamma', url: 'https://gamma.test/rss' },
];

// ---------------------------------------------------------------- parseFeed

describe('parseFeed', () => {
  test('parses an RSS 2.0 item with CDATA, media:thumbnail and pubDate', () => {
    const pubDate = new Date(Date.UTC(2026, 9, 1, 10, 30, 0)).toUTCString();
    const xml = rssFeed(
      rssItem({
        title: '<![CDATA[Terremoto de magnitud 6 sacude Chile]]>',
        link: 'https://example.com/noticia/1?at_medium=rss&amp;at_campaign=x',
        description: '<![CDATA[<p>Un <strong>fuerte</strong> sismo ha sacudido la costa.</p><p>No hay v&#237;ctimas.</p>]]>',
        pubDate,
        extra:
          '<media:thumbnail url="https://img.example.com/small.jpg" width="240" height="135"/>' +
          '<media:thumbnail url="https://img.example.com/large.jpg" width="976" height="549"/>',
      })
    );

    const stories = parseFeed(xml, FEED);

    assert.equal(stories.length, 1);
    const [s] = stories;
    assert.equal(s.title, 'Terremoto de magnitud 6 sacude Chile');
    assert.equal(s.summary, 'Un fuerte sismo ha sacudido la costa. No hay víctimas.');
    assert.equal(s.link, 'https://example.com/noticia/1?at_medium=rss&at_campaign=x');
    assert.equal(s.source, 'Fuente');
    assert.equal(s.category, 'mundo');
    assert.equal(s.published, Date.parse(pubDate));
    assert.equal(s.image, 'https://img.example.com/large.jpg');
    assert.match(s.id, /^s[0-9a-f]{10}$/);
  });

  test('story id ignores the query string and fragment of the link', () => {
    const xml = rssFeed(
      rssItem({ title: 'Uno', link: 'https://example.com/a?utm_source=rss' }),
      rssItem({ title: 'Dos', link: 'https://example.com/a#top' }),
      rssItem({ title: 'Tres', link: 'https://example.com/b' })
    );
    const [one, two, three] = parseFeed(xml, FEED);
    assert.equal(one.id, two.id);
    assert.notEqual(one.id, three.id);
    assert.equal(one.id, storyId('https://example.com/a'));
  });

  test('defaults the category to "general" when the feed has none', () => {
    const [s] = parseFeed(rssFeed(rssItem({ title: 'X', link: 'https://example.com/x' })), { name: 'Sin categoria' });
    assert.equal(s.category, 'general');
  });

  test('parses an Atom entry (alternate link, summary, updated)', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom feed</title>
  <entry>
    <title>Entrada Atom</title>
    <link rel="self" href="https://example.com/atom/self"/>
    <link rel="alternate" type="text/html" href="https://example.com/atom/articulo"/>
    <id>tag:example.com,2026:1</id>
    <summary>Resumen de la entrada.</summary>
    <updated>2026-10-01T10:30:00Z</updated>
  </entry>
</feed>`;

    const stories = parseFeed(xml, { name: 'Atomico', category: 'ciencia' });

    assert.equal(stories.length, 1);
    assert.equal(stories[0].title, 'Entrada Atom');
    assert.equal(stories[0].link, 'https://example.com/atom/articulo');
    assert.equal(stories[0].summary, 'Resumen de la entrada.');
    assert.equal(stories[0].published, Date.parse('2026-10-01T10:30:00Z'));
    assert.equal(stories[0].source, 'Atomico');
    assert.equal(stories[0].category, 'ciencia');
  });

  test('Atom: link without rel counts as alternate; <content> is used when there is no summary', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Sin rel</title>
    <link href="https://example.com/atom/sin-rel"/>
    <content type="html">&lt;p&gt;Contenido &lt;b&gt;html&lt;/b&gt; final&lt;/p&gt;</content>
    <published>2026-10-01T08:00:00Z</published>
  </entry>
</feed>`;
    const [s] = parseFeed(xml, FEED);
    assert.equal(s.link, 'https://example.com/atom/sin-rel');
    assert.equal(s.summary, 'Contenido html final.');
    assert.equal(s.published, Date.parse('2026-10-01T08:00:00Z'));
  });

  test('parses an RSS 1.0 (rdf:RDF) item with dc:date', () => {
    const xml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <item rdf:about="https://example.com/rdf/1"><title>Item RDF</title><link>https://example.com/rdf/1</link><description>Texto.</description><dc:date>2026-10-01T10:00:00Z</dc:date></item>
</rdf:RDF>`;
    const [s] = parseFeed(xml, FEED);
    assert.equal(s.title, 'Item RDF');
    assert.equal(s.published, Date.parse('2026-10-01T10:00:00Z'));
  });

  test('picks the real image over a tracking pixel in the description HTML', () => {
    const xml = rssFeed(
      rssItem({
        title: 'Noticia con p&#237;xel de seguimiento',
        link: 'https://example.com/tracker',
        description:
          '<![CDATA[<p><img src="http://secure-uk.imrworldwide.com/cgi-bin/m?ci=bbc&amp;cc=1&amp;ml_name=ref" width="1" height="1"/></p>' +
          '<p><img src="https://img.example.com/photos/real.jpg?w=640&amp;h=360" alt="foto"/>Texto de la noticia.</p>]]>',
      })
    );
    const [s] = parseFeed(xml, FEED);
    assert.equal(s.image, 'https://img.example.com/photos/real.jpg?w=640&h=360');
    assert.equal(s.title, 'Noticia con píxel de seguimiento');
  });

  test('image is null when the only candidate is a tracking pixel', () => {
    const xml = rssFeed(
      rssItem({
        title: 'Solo tracker',
        link: 'https://example.com/only-tracker',
        description: '<![CDATA[<img src="http://secure-uk.imrworldwide.com/cgi-bin/m?ci=bbc"/>Texto.]]>',
      })
    );
    assert.equal(parseFeed(xml, FEED)[0].image, null);
  });

  test('decodes numeric HTML entities (decimal and hex) and &amp; in summaries', () => {
    const xml = rssFeed(
      rssItem({
        title: 'Entidades',
        link: 'https://example.com/entities',
        description: '<![CDATA[Jos&#x00E9; y Mar&#237;a hablaron de I+D &amp; innovaci&#243;n&hellip;]]>',
      })
    );
    assert.equal(parseFeed(xml, FEED)[0].summary, 'José y María hablaron de I+D & innovación…');
  });

  test(
    'decodes named accented entities such as &aacute; / &eacute; / &ntilde; in summaries',
    {
      todo:
        'BUG server/news.js:25-32 - NAMED_ENTITIES has no Latin-1 letters, so "&aacute;" inside CDATA/escaped HTML is left as literal text',
    },
    () => {
      const xml = rssFeed(
        rssItem({
          title: 'Entidades con nombre',
          link: 'https://example.com/named-entities',
          description: '<![CDATA[<p>Jos&eacute; vive en Espa&ntilde;a y habl&oacute; con Mar&iacute;a, que est&aacute; all&iacute;.</p>]]>',
        })
      );
      assert.equal(parseFeed(xml, FEED)[0].summary, 'José vive en España y habló con María, que está allí.');
    }
  );

  test('strips the "Leer la noticia completa" boilerplate and caps the summary at 900 chars', () => {
    const xml = rssFeed(
      rssItem({ title: 'Boilerplate', link: 'https://example.com/b1', description: 'Texto util. Leer la noticia completa.' }),
      rssItem({ title: 'Largo', link: 'https://example.com/b2', description: 'palabra '.repeat(300) })
    );
    const [a, b] = parseFeed(xml, FEED);
    assert.equal(a.summary, 'Texto util.');
    assert.ok(b.summary.length <= 900);
  });

  test('skips items without title or link, and falls back to a permalink guid', () => {
    const xml = rssFeed(
      '<item><title>Sin enlace</title></item>',
      '<item><link>https://example.com/sin-titulo</link></item>',
      '<item><title>Con guid</title><guid isPermaLink="true">https://example.com/guid</guid></item>'
    );
    const stories = parseFeed(xml, FEED);
    assert.deepEqual(stories.map((s) => [s.title, s.link]), [['Con guid', 'https://example.com/guid']]);
  });

  test('a missing or invalid date falls back to the current time', () => {
    const before = Date.now();
    const xml = rssFeed(
      '<item><title>Sin fecha</title><link>https://example.com/nodate</link></item>',
      rssItem({ title: 'Fecha rota', link: 'https://example.com/baddate', pubDate: 'ayer por la tarde' })
    );
    for (const s of parseFeed(xml, FEED)) {
      assert.ok(s.published >= before && s.published <= Date.now() + 1000, `published=${s.published}`);
    }
  });

  test('returns [] for empty or non-feed documents', () => {
    assert.deepEqual(parseFeed('', FEED), []);
    assert.deepEqual(parseFeed('<html><body>no es un feed</body></html>', FEED), []);
    assert.deepEqual(parseFeed(rssFeed(), FEED), []);
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
        { '@_url': 'https://img.test/logo.svg?v=2', '@_width': '1500' },
        { '@_url': 'https://img.test/photo.jpg', '@_width': '100' },
      ],
    };
    assert.equal(extractImage(item), 'https://img.test/photo.jpg');
  });

  test('ignores URLs that are not http(s)', () => {
    const item = {
      'media:content': [
        { '@_url': 'data:image/png;base64,AAAA', '@_width': '900' },
        { '@_url': '//img.test/protocol-relative.jpg', '@_width': '800' },
        { '@_url': 'ftp://img.test/old.jpg', '@_width': '700' },
        { '@_url': '/relative/path.jpg', '@_width': '600' },
      ],
    };
    assert.equal(extractImage(item), null);
  });

  test('ignores tracking pixels and gifs', () => {
    const item = {
      'media:thumbnail': [
        { '@_url': 'http://secure-uk.imrworldwide.com/cgi-bin/m?ci=x', '@_width': '1' },
        { '@_url': 'https://img.test/spacer.gif', '@_width': '1' },
        { '@_url': 'https://img.test/ok.jpg', '@_width': '10' },
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
    const item = { 'content:encoded': '<p><img class="x" src="https://img.test/a.jpg?w=1&amp;h=2"></p>' };
    assert.equal(extractImage(item), 'https://img.test/a.jpg?w=1&h=2');
    assert.equal(extractImage({ summary: "<img src='https://img.test/single-quoted.jpg'>" }), 'https://img.test/single-quoted.jpg');
  });

  test('returns null when there is nothing usable', () => {
    assert.equal(extractImage({}), null);
    assert.equal(extractImage({ description: 'solo texto' }), null);
  });
});

// ---------------------------------------------------------------- cleanHtml / decodeEntities

describe('cleanHtml', () => {
  test('strips tags, scripts, styles and comments', () => {
    const html = '<script>alert("x")</script><style>p { color: red }</style><!-- comentario --><div><b>Hola</b> <a href="/x">mundo</a></div>';
    assert.equal(cleanHtml(html), 'Hola mundo');
  });

  test('collapses whitespace and newlines', () => {
    assert.equal(cleanHtml('  uno \n\n  dos\t\ttres   '), 'uno dos tres');
  });

  test('turns paragraph and line breaks into sentence breaks', () => {
    assert.equal(cleanHtml('<p>Primero</p><p>Segundo</p>'), 'Primero. Segundo.');
    assert.equal(cleanHtml('a<br>b<br/>c'), 'a. b. c');
  });

  test('decodes entities after stripping tags (escaped markup is not re-interpreted as a tag boundary)', () => {
    assert.equal(cleanHtml('<p>Tom &amp; Jerry &mdash; &quot;ok&quot;</p>'), 'Tom & Jerry — "ok".');
  });

  test(
    'keeps a literal "..." ellipsis intact',
    { todo: 'BUG server/news.js:43 - /(\\.\\s*){2,}/ collapses "..." into ". " ("Espera... mira" -> "Espera. mira")' },
    () => {
      assert.equal(cleanHtml('Espera... mira esto'), 'Espera... mira esto');
    }
  );
});

describe('decodeEntities', () => {
  test('decodes numeric, hex and the supported named entities', () => {
    assert.equal(decodeEntities('&#233; &#x00E9; &#X41; &amp; &lt;b&gt; &quot;q&quot; &apos;a&apos; &hellip; &ndash; &mdash;'), 'é é A & <b> "q" \'a\' … – —');
  });

  test('leaves unknown entities untouched', () => {
    assert.equal(decodeEntities('&unknownentity; y &'), '&unknownentity; y &');
  });
});

// ---------------------------------------------------------------- normalizeTitleKey

describe('normalizeTitleKey', () => {
  test('is identical for titles that differ only in accents, punctuation and case', () => {
    const a = normalizeTitleKey('Sánchez anuncia nuevas medidas económicas, hoy');
    const b = normalizeTitleKey('SANCHEZ anuncia: nuevas medidas economicas hoy!');
    const c = normalizeTitleKey('  sánchez   ANUNCIA “nuevas” medidas económicas... hoy ');
    assert.equal(a, b);
    assert.equal(a, c);
    assert.equal(a, 'sanchez anuncia nuevas medidas economicas'); // "hoy" is too short to count
  });

  test('differs for different headlines', () => {
    assert.notEqual(normalizeTitleKey('El Gobierno aprueba el plan de vivienda'), normalizeTitleKey('El Gobierno rechaza el plan de vivienda'));
  });

  test('ignores short words and only uses the first 8 significant words', () => {
    const key = normalizeTitleKey('El de la en los tres gatos negros duermen siempre tranquilos aunque llueva muchisimo fuera');
    assert.equal(key.split(' ').length, 8);
    assert.equal(key, normalizeTitleKey('El de la en los tres gatos negros duermen siempre tranquilos aunque llueva muchisimo y otra cosa'));
  });

  test('is an empty string when there are no significant words', () => {
    assert.equal(normalizeTitleKey('¿Y ya?'), '');
  });
});

// ---------------------------------------------------------------- NewsDesk: selection

describe('NewsDesk.pickStories', () => {
  const stories = () => [
    makeStory('a1', 'A', 1),
    makeStory('a2', 'A', 2),
    makeStory('a3', 'A', 3),
    makeStory('b1', 'B', 4),
    makeStory('b2', 'B', 5),
    makeStory('c1', 'C', 6),
  ];

  test('round-robins across sources, newest first inside each source', () => {
    const desk = makeDesk({ stories: stories() });
    assert.deepEqual(desk.pickStories(4).map((s) => s.id), ['a1', 'b1', 'c1', 'a2']);
  });

  test('returns everything available (still interleaved) when asked for more than exists', () => {
    const desk = makeDesk({ stories: stories() });
    assert.deepEqual(desk.pickStories(99).map((s) => s.id), ['a1', 'b1', 'c1', 'a2', 'b2', 'a3']);
  });

  test('excludes stories that were marked as covered', () => {
    const desk = makeDesk({ stories: stories() });
    desk.markCovered(['a1', 'b1']);
    assert.deepEqual(desk.pickStories(3).map((s) => s.id), ['a2', 'b2', 'c1']);
    assert.deepEqual(desk.uncovered().map((s) => s.id), ['a2', 'a3', 'b2', 'c1']);
  });

  test('returns an empty list once everything is covered', () => {
    const desk = makeDesk({ stories: stories() });
    desk.markCovered(desk.pickStories(99).map((s) => s.id));
    assert.deepEqual(desk.pickStories(3), []);
  });

  test('puts stories with an image first in the running order', () => {
    const list = stories();
    list[3].image = 'https://img.test/b1.jpg'; // b1
    const desk = makeDesk({ stories: list });
    assert.deepEqual(desk.pickStories(4).map((s) => s.id), ['b1', 'a1', 'c1', 'a2']);
  });

  test('get() returns a story by id', () => {
    const desk = makeDesk({ stories: stories() });
    assert.equal(desk.get('b2').source, 'B');
    assert.equal(desk.get('nope'), undefined);
  });
});

// ---------------------------------------------------------------- NewsDesk: refresh

describe('NewsDesk.refresh', () => {
  test('stores fresh stories, tags them with the feed name and records feed status', async () => {
    const xml = rssFeed(
      rssItem({ title: 'Primera noticia del día', link: 'https://example.com/1', description: 'Resumen uno.' }),
      rssItem({ title: 'Segunda noticia distinta', link: 'https://example.com/2', description: 'Resumen dos.' })
    );
    const desk = makeDesk({
      feeds: [FEEDS[0]],
      fetchImpl: routedFetch({ 'https://alfa.test/rss': xml }),
    });

    const added = await desk.refresh();

    assert.equal(added, 2);
    assert.equal(desk.stories.size, 2);
    assert.deepEqual(desk.feedStatus, { Alfa: { ok: true, items: 2 } });
    assert.ok([...desk.stories.values()].every((s) => s.source === 'Alfa' && s.category === 'general'));
    assert.ok(desk.lastRefresh >= NOW);
  });

  test('dedupes the same link across feeds (first feed wins) and across refreshes', async () => {
    const xml = rssFeed(
      rssItem({ title: 'Noticia compartida por todos', link: 'https://example.com/shared' }),
      rssItem({ title: 'Otra noticia compartida', link: 'https://example.com/shared-2?utm=1' })
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
      'https://alfa.test/rss': rssFeed(rssItem({ title: 'Sánchez anuncia nuevas medidas económicas hoy', link: 'https://alfa.test/a' })),
      'https://beta.test/rss': rssFeed(rssItem({ title: 'SANCHEZ anuncia: nuevas medidas economicas hoy!', link: 'https://beta.test/b' })),
      'https://gamma.test/rss': rssFeed(rssItem({ title: 'Una historia completamente diferente', link: 'https://gamma.test/c' })),
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
      stories: [makeStory('old', 'Vieja', 30, { title: 'Sánchez anuncia nuevas medidas económicas hoy' })],
      feeds: [FEEDS[0]],
      fetchImpl: routedFetch({
        'https://alfa.test/rss': rssFeed(rssItem({ title: 'SANCHEZ anuncia nuevas medidas economicas hoy', link: 'https://alfa.test/new' })),
      }),
    });
    assert.equal(await desk.refresh(), 0);
    assert.deepEqual([...desk.stories.keys()], ['old']);
  });

  test('records an HTTP 403 for one feed in feedStatus without throwing, and keeps the other feeds', async () => {
    const fetchImpl = routedFetch({
      'https://alfa.test/rss': rssFeed(rssItem({ title: 'Noticia de Alfa en directo', link: 'https://alfa.test/1' })),
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

    routes['https://alfa.test/rss'] = rssFeed(rssItem({ title: 'Ya funciona otra vez', link: 'https://alfa.test/ok' }));
    await desk.refresh();
    assert.deepEqual(desk.feedStatus.Alfa, { ok: true, items: 1 });
  });

  test('drops items older than maxStoryAgeHours but keeps recent ones', async () => {
    const maxAge = config.maxStoryAgeHours;
    const xml = rssFeed(
      rssItem({ title: 'Noticia reciente de hoy', link: 'https://example.com/fresh', pubDate: rssDate(1) }),
      rssItem({ title: 'Casi caducada pero valida', link: 'https://example.com/almost', pubDate: rssDate(maxAge - 1) }),
      rssItem({ title: 'Noticia antigua caducada', link: 'https://example.com/stale', pubDate: rssDate(maxAge + 1) })
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
      rssItem({ title: 'Noticia primera para todos los feeds', link: 'https://example.com/real-1' }),
      rssItem({ title: 'Noticia segunda para todos los feeds', link: 'https://example.com/real-2' })
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
    for (const f of feeds) {
      assert.equal(typeof f.name, 'string');
      assert.match(f.url, /^https?:\/\//);
    }

    const added = await desk.refresh();

    assert.equal(added, 2);
    assert.equal(desk.stories.size, 2);
    assert.deepEqual(Object.keys(desk.feedStatus).sort(), feeds.map((f) => f.name).sort());
    assert.deepEqual(calls.map((c) => c.url).sort(), feeds.map((f) => f.url).sort());
    assert.ok(calls.every((c) => /LiveNewsBot/.test(c.init.headers['user-agent'])));
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
