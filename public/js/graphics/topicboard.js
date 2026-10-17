// The topic board: what a story with no cleared picture and no place shows behind its headline (the montage's frame,
// STILL TO COME's single story). The locator board (graphics/locator.js) is the floor for a story with a place; half
// the stories left without a picture have none (a startup's funding, a study, a scam), and the montage's plain field
// behind them read as missing (the coordinator's review of the rights desk, round 7).
//
//   The story's topic as one of the channel's pixel glyphs (16x16, drawn at 4x in the board's upper right where the
//   locator puts its place: a chip for AI, a rocket for space, a flask for science, a chart for the economy...), on a
//   stepped ink field with a dot grid and two rings around the glyph, and the topic's name on an ink plate with the
//   programme's accent bar, as every chip on the channel. Under a grave story no glyph at all (a cartoon icon under a
//   death is never sober): the rings, the grid and the section's name only.
//
//   topicOf({ headline, category, grave }) -> { glyph, label }   (glyph null under a grave story)
//   drawTopicBoard(ctx, item, { accent, dt, frame })               item: a rundown item (headline, category, grave)
// `frame` sets the board in another box (a clip's vertical stage: clip/vertical.js): { x, y, w, h } on the canvas, the
// glyph's middle (cx, cy) inside it, and the column its name keeps to (x0, x1); the name then goes under the glyph.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';

const WIDTH = 384;
const HEIGHT = 216;
const SCALE = 4;
// the glyph's middle: where the locator puts its place (clear of the TOP STORIES tag and of the headline block)
const GX = Math.round(WIDTH * 0.66);
const GY = Math.round(HEIGHT * 0.3);

// '#' the glyph's body, '.' its shade, '+' the programme's accent, 'o' a highlight, ' ' nothing
export const GLYPHS = {
  chip: ['    # # # #     ', '    # # # #     ', '  ############  ', '  #..........#  ', '###.++++++++.###', '  #.+oooooo+.#  ', '###.+o....o+.###', '  #.+o.++.o+.#  ', '###.+o.++.o+.###', '  #.+o....o+.#  ', '###.+oooooo+.###', '  #.++++++++.#  ', '  #..........#  ', '  ############  ', '    # # # #     ', '    # # # #     '],
  rocket: ['       ##       ', '      #oo#      ', '      #oo#      ', '     ######     ', '     ##++##     ', '     #+oo+#     ', '     ##++##     ', '     ######     ', '     ######     ', '    ########    ', '   ##.####.##   ', '  ###.####.###  ', '  ##  ####  ##  ', '      +oo+      ', '     ++++++     ', '      +  +      '],
  flask: ['     ######     ', '      #oo#      ', '      #oo#      ', '      #oo#      ', '      #oo#      ', '     #oooo#     ', '    #oooooo#    ', '   #oooooooo#   ', '  #oooooooooo#  ', '  #++++++++++#  ', ' #+++o++++o+++# ', ' #++++++o+++++# ', ' #++o+++++++++# ', ' #++++++++o+++# ', '  ############  ', '                '],
  chart: ['                ', '           ++++ ', '            +++ ', '           + ++ ', '          +   + ', '         +      ', '   +    +       ', '  + +  +   ##   ', ' +   ++    ##   ', '+      ##  ##   ', '       ##  ##   ', '   ##  ##  ##   ', '   ##  ##  ##   ', '   ##  ##  ##   ', ' ############## ', '                '],
  cross: ['                ', '     ######     ', '     #++++#     ', '     #++++#     ', '     #++++#     ', '######++++######', '#++++++++++++++#', '#++++++oo++++++#', '#++++++oo++++++#', '#++++++++++++++#', '######++++######', '     #++++#     ', '     #++++#     ', '     #++++#     ', '     ######     ', '                '],
  ballot: ['      ####      ', '      #oo#      ', '      #o+#      ', '      #oo#      ', '  ############  ', '  #...####...#  ', '  ############  ', '  #..........#  ', '  #..++++++..#  ', '  #..+oooo+..#  ', '  #..++++++..#  ', '  #..........#  ', '  #..........#  ', '  ############  ', '                ', '                '],
  leaf: ['            ####', '         ###++# ', '       ##++++#  ', '     ##+++++#   ', '    #+++o++#    ', '   #+++o+++#    ', '  #+++o+++#     ', '  #++o+++#      ', ' #++o+++#       ', ' #+o+++#        ', ' #o++##         ', ' #o##           ', ' o              ', 'o               ', '                ', '                '],
  bolt: ['        ######  ', '       #++++#   ', '      #++++#    ', '     #++++#     ', '    #++++#      ', '   #+++++####   ', '  #++++++++#    ', '  #####+++#     ', '     #+++#      ', '    #+++#       ', '   #++#         ', '  #+#           ', ' ##             ', '                ', '                ', '                '],
  phone: ['   ##########   ', '   #........#   ', '   #.++++++.#   ', '   #.+oooo+.#   ', '   #.+oooo+.#   ', '   #.+oooo+.#   ', '   #.+oooo+.#   ', '   #.+oooo+.#   ', '   #.+oooo+.#   ', '   #.+oooo+.#   ', '   #.++++++.#   ', '   #........#   ', '   #...oo...#   ', '   #........#   ', '   ##########   ', '                '],
  gamepad: ['                ', '                ', '                ', '  ############  ', ' #............# ', '#..o.......+...#', '#.ooo.....+.+..#', '#..o.......+...#', '#..............#', '#....######....#', '#...#      #...#', ' ###        ### ', '                ', '                ', '                ', '                '],
  car: ['                ', '                ', '                ', '     ######     ', '    #oo##oo#    ', '   #ooo##ooo#   ', '  ############  ', ' #++++++++++++# ', ' #o++++++++++o# ', ' ############## ', '  #..#    #..#  ', '   ##      ##   ', '                ', '                ', '                ', '                '],
  globe: ['     ######     ', '   ##..##..##   ', '  #...####...#  ', ' #..######....# ', ' #...####.....# ', '#.....##..##...#', '#.........####.#', '#..##.....####.#', '#.####.....##..#', '#..####........#', ' #..###.......# ', ' #...#....##..# ', '  #......##..#  ', '   ##......##   ', '     ######     ', '                '],
  paper: ['                ', ' ############   ', ' #oooooooooo#   ', ' #o++++++++o##  ', ' #oooooooooo#.# ', ' #o####o###o#.# ', ' #oooooooooo#.# ', ' #o####o###o#.# ', ' #oooooooooo#.# ', ' #o####o###o#.# ', ' #oooooooooo#.# ', ' ############.# ', '  ............# ', '   ############ ', '                ', '                '],
  ball: ['     ######     ', '   ##oooooo##   ', '  #oooo##oooo#  ', ' #ooo######ooo# ', ' #oo##oooo##oo# ', '#oo#oooooooo#oo#', '#o#oooo##oooo#o#', '#o#ooo####ooo#o#', '#o#ooo####ooo#o#', '#o#oooo##oooo#o#', '#oo#oooooooo#oo#', ' #oo##oooo##oo# ', ' #ooo######ooo# ', '  #oooo##oooo#  ', '   ##oooooo##   ', '     ######     '],
};
// a glyph's own colours where they differ (the globe's sea and land)
const COLOURS = { globe: { '#': P.fog, '.': P.navy } };

// the topics, in the order they are tried on the headline (then the summary-free section decides)
const TOPICS = [
  ['gamepad', 'GAMES', /\b(?:video ?games?|gaming|gamers?|consoles?|playstation|xbox|nintendo|switch 2|steam deck|fortnite|gta|esports?)\b/i],
  ['chip', 'ARTIFICIAL INTELLIGENCE', /\b(?:ai|a\.i\.|artificial intelligence|chatbots?|llms?|openai|anthropic|machine learning|neural|robots?|robotics|humanoid)\b/i],
  ['rocket', 'SPACE', /\b(?:space|spacecraft|rockets?|launch(?:es|ed)?|orbit\w*|nasa|esa|astronauts?|moon|lunar|mars|satellites?|telescopes?|galax\w*|planets?|asteroids?|comets?|black holes?|universe|cosmic|starship)\b/i],
  ['cross', 'HEALTH', /\b(?:health|hospitals?|doctors?|nurses?|nhs|cancer|diseases?|vaccines?|patients?|medic\w*|surgery|virus|covid|flu|alzheimer'?s?|dementia|obesity|diabetes|anesthesia|anaesthesia)\b/i],
  ['flask', 'SCIENCE', /\b(?:scientists?|study|studies|researchers?|physicists?|chemists?|chemical|cells?|brain|dna|genes?|genetic\w*|molecul\w*|quantum|fusion|discover\w*|fossils?|dinosaurs?|experiment\w*)\b/i],
  ['leaf', 'ENVIRONMENT', /\b(?:climate|emissions|carbon|wildlife|species|nature|forests?|biodiversity|pollution|recycling|plastic|insects?|plants?|weeds?|birds?|animals?|conservation)\b/i],
  ['bolt', 'ENERGY', /\b(?:energy|oil|gas|diesel|petrol|fuel|electricity|power grid|nuclear|solar|wind farms?|heating|batter(?:y|ies))\b/i],
  ['ballot', 'POLITICS', /\b(?:elections?|votes?|voters|voting|polls?|referendum|parliament|senate|congress|ministers?|government|campaign\w*|party|parties|mps|lawmakers|midterms?)\b/i],
  ['chart', 'THE ECONOMY', /\b(?:econom\w*|inflation|gdp|prices?|banks?|banking|shares?|stocks?|markets?|budget|tax(?:es)?|interest rates?|earnings|profits?|debt|wages|bills|valuation|funding|raises|investors?|bankrupt\w*|ipo|\$\d[\d.,]*[mbk]?n?|£\d[\d.,]*[mbk]?n?|€\d[\d.,]*[mbk]?n?)\b/i],
  ['phone', 'GADGETS', /\b(?:phones?|iphone|android|smartphones?|tablets?|laptops?|apps?|glasses|headphones|earbuds|smartwatch|wearables?|speakers?|ipod|ipad|gadgets?|devices?)\b/i],
  ['car', 'TRANSPORT', /\b(?:cars?|evs?|electric vehicles?|auto|motor|driving|drivers?|roads?|trains?|rail\w*|flights?|airlines?|airports?|planes?|aircraft|buses|traffic)\b/i],
  ['ball', 'SPORT', /\b(?:football|soccer|tennis|golf|cricket|rugby|f1|formula one|olympics?|match|league|cup|champions?)\b/i],
];
const BY_SECTION = [
  [/^(?:tech|technology)/, 'chip', 'TECH'],
  [/^(?:science|cosmos|space)/, 'flask', 'SCIENCE'],
  [/^(?:business|money|economy|markets?)/, 'chart', 'BUSINESS'],
  [/^(?:sport)/, 'ball', 'SPORT'],
  [/^(?:health)/, 'cross', 'HEALTH'],
  [/^(?:environment|climate)/, 'leaf', 'ENVIRONMENT'],
  [/^(?:politics)/, 'ballot', 'POLITICS'],
  [/^(?:world|news|general|uk|us)/, 'globe', 'WORLD'],
];

// a story of crime or of the courts: no glyph either ("DNA, vehicle-tracking help investigators recover stolen Renoirs"
// is not a science story)
const CRIME = /\b(?:execut\w*|death row|firing squad|killed|kills?|dead|deaths?|died|dies|shot|shooting|stabb\w*|attacks?|war|crash\w*|victims?|abuse\w*|police|arrest\w*|charged|charges|court|trial|judge|jury|jailed|prison|sentenc\w*|convict\w*|fraud|scam\w*|stolen|theft|thieves|robbery|murder\w*|investigat\w*|accus\w*|alleg\w*|lawsuit|sued|sues|smuggl\w*|drugs?)\b/i;

/** The topic a story shows when it has neither a picture nor a place: { glyph | null, label }. */
export function topicOf({ headline = '', category = '', grave = false } = {}) {
  const section = BY_SECTION.find(([re]) => re.test(String(category || '').toLowerCase()));
  // a grave story, or one of crime: no glyph, the section's name (never a cartoon under a death or a charge)
  if (grave || CRIME.test(String(headline || ''))) return { glyph: null, label: section ? section[2] : 'NEWS' };
  const hit = TOPICS.find(([, , re]) => re.test(String(headline || '')));
  if (hit) return { glyph: hit[0], label: hit[1] };
  return section ? { glyph: section[1], label: section[2] } : { glyph: 'paper', label: 'NEWS' };
}

// the field: stepped ink to black, a dot grid, made once per size
const FIELDS = new Map();
function field(W = WIDTH, H = HEIGHT, CX = GX, CY = GY) {
  const key = `${W}x${H}|${CX},${CY}`;
  if (FIELDS.has(key)) return FIELDS.get(key);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const bands = [P.ink, '#222640', '#1e2038', '#1b1a2f', P.black];
  const bh = Math.ceil(H / bands.length);
  bands.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, i * bh, W, bh);
  });
  for (let y = 4; y < H; y += 8) {
    for (let x = 4; x < W; x += 8) {
      // the grid brightens towards the glyph
      const d = Math.hypot(x - CX, (y - CY) * 1.4);
      g.fillStyle = d < 70 ? P.steel : P.slate;
      if (d < 150 || (x + y) % 16 === 0) g.fillRect(x, y, 1, 1);
    }
  }
  FIELDS.set(key, c);
  return c;
}

function ring(ctx, r, colour, step = 1, CX = GX, CY = GY) {
  ctx.fillStyle = colour;
  const n = Math.max(24, Math.round(r * 6));
  for (let a = 0; a < n; a += step) {
    const t = (a / n) * Math.PI * 2;
    ctx.fillRect(Math.round(CX + Math.cos(t) * r), Math.round(CY + Math.sin(t) * r), 1, 1);
  }
}

/** Draw the topic board for a rundown item with neither a picture nor a place. */
export function drawTopicBoard(ctx, item = {}, { accent = P.red, dt = 9, frame = null } = {}) {
  const topic = topicOf({ headline: item.headline || item.title, category: item.category, grave: !!item.grave });
  const fx = frame?.x ?? 0;
  const fy = frame?.y ?? 0;
  const fw = frame?.w ?? WIDTH;
  const fh = frame?.h ?? HEIGHT;
  const lx = frame?.cx ?? GX; // the glyph's middle in the board
  const ly = frame?.cy ?? GY;
  const CX = fx + lx;
  const CY = fy + ly;
  ctx.drawImage(field(fw, fh, lx, ly), fx, fy);
  // two rings around the glyph's place, the outer one grows in once (0.1 to 0.5 s)
  const k = Math.max(0, Math.min(1, (dt - 0.1) / 0.4));
  const ease = 1 - Math.pow(1 - k, 3);
  ring(ctx, 40, P.slate, 1, CX, CY);
  if (ease > 0) ring(ctx, Math.round(40 + 14 * ease), topic.glyph ? P.steel : P.slate, 2, CX, CY);
  if (topic.glyph) {
    const rows = GLYPHS[topic.glyph];
    const colours = { '#': P.fog, '.': P.slate, '+': accent, o: P.white, ...(COLOURS[topic.glyph] || {}) };
    // the glyph builds from its base up (0.15 to 0.5 s), with a black outline so it holds on any field
    const shown = Math.ceil(16 * Math.max(0, Math.min(1, (dt - 0.15) / 0.35)));
    const x0 = CX - 8 * SCALE;
    const y0 = CY - 8 * SCALE;
    for (let ry = 16 - shown; ry < 16; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < 16; rx++) {
        const ch = row[rx];
        if (ch === ' ') continue;
        ctx.fillStyle = P.black;
        ctx.fillRect(x0 + rx * SCALE - 1, y0 + ry * SCALE - 1, SCALE + 2, SCALE + 2);
      }
    }
    for (let ry = 16 - shown; ry < 16; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < 16; rx++) {
        const ch = row[rx];
        if (ch === ' ') continue;
        ctx.fillStyle = colours[ch] || P.fog;
        ctx.fillRect(x0 + rx * SCALE, y0 + ry * SCALE, SCALE, SCALE);
      }
    }
  }
  // the topic's name on an ink plate with the accent bar, left of the glyph (or on the rings' middle when there is none)
  const label = topic.label;
  const tw = measureText(label, 1, 'body');
  const bw = tw + 12;
  const bh = 13;
  // (in a frame of its own the name goes under the glyph's outer ring, centred, inside the frame's column)
  const under = !!frame && !!topic.glyph;
  const x0 = fx + (frame?.x0 ?? 13);
  const x1 = fx + (frame?.x1 ?? fw - 13);
  const x = under ? Math.max(x0, Math.min(x1 - bw, CX - Math.round(bw / 2))) : topic.glyph ? Math.max(x0, CX - 8 * SCALE - 10 - bw) : Math.max(x0, Math.min(x1 - bw, CX - Math.round(bw / 2)));
  const y = under ? CY + 58 : CY - Math.round(bh / 2);
  const p = Math.max(0, Math.min(1, (dt - 0.2) / 0.3));
  const shownW = Math.round(bw * (1 - Math.pow(1 - p, 3)));
  if (shownW > 0) {
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(x, y, shownW, bh);
      ctx.clip();
      ctx.fillStyle = P.ink;
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, 2, bh);
      drawText(ctx, label, x + 7, y + 3, { color: P.white, font: 'body' });
    } finally {
      ctx.restore();
    }
  }
  return topic;
}
