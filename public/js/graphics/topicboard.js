// The topic board: what a story with neither a cleared picture nor a place shows behind its headline (the montage's
// frame, STILL TO COME's single story). The locator board (graphics/locator.js) is the floor for a story with a place;
// the stories with neither show the story's own strongest element instead (public/js/boardspec.js decides which, the
// server puts it on the rundown item as `board`): never a bare section word ("WORLD" alone in a ring looked like
// something failed to load: the coordinator's review of round 7).
//
//   figure   the key figure big ("139", "$1.3BN"), what it counts beside it ("MIGRANTS", "ACQUISITION") and its
//            qualifier over that ("AT LEAST"), behind the programme's accent rule;
//   quote    the channel's quote card in small: an ink plate, the accent quotation mark, the words, a rule and who said
//            them ("- INDIAN VILLAGERS");
//   actor    a wordmark plate: the name in the channel's type, a rule, what it is ("REPLIT", "COMPANY AND ONLINE CODING
//            ENVIRONMENT"); never a logo;
//   topic    the topic in words ("AI SURVEILLANCE") beside one of the channel's line glyphs on a tile (24x24 at 2x: a
//            chip, an orbit, a pulse line, scales...), the last resort;
//   phrase   the headline's key phrase as a wordmark plate ("CARER'S ALLOWANCE");
//   none     nothing the story says may stand alone: the section's glyph on its tile, in fog, no words (under a grave
//            story the field alone).
//
// Everything sits in the upper right of the frame, as the locator's place does: from y 74 to 123, clear of the
// captions (y 46-70, centred) and of the headline's chip (from y 127), right-aligned to graphics-safe (x 365). Under a
// grave story every board is sober: silver and fog only (no accent colour), no glyph, nothing moves but one wipe.
//
//   drawTopicBoard(ctx, item, { accent, dt, frame }) -> the spec drawn   item: a rundown item (board, headline, category,
//                                                                  grave)
// `frame` sets the board in another box (a clip's vertical stage: clip/vertical.js): { x, y, w, h } on the canvas, and
// inside it the board's own box { right, top, bottom, maxW } (the platforms' safe column); without it, the horizontal
// frame's geometry below.
//   GLYPHS                                                         the line glyphs ('#' stroke, '+' accent, 'o' white, '.' shade)
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { balanceLines } from '../gfx/index.js';
import { boardSpec } from '../boardspec.js';

const WIDTH = 384;
const HEIGHT = 216;
// the board's box: right-aligned to graphics-safe, its foot clear of the headline's chip, its head clear of the captions
export const BOX = Object.freeze({ right: 365, bottom: 123, top: 74, maxW: 300 });
// a glyph's tile: the 48 px glyph and a 2 px margin, its foot 2 px lower than the board's (at the far right, clear of the
// chip; its head clear of the captions)
const TILE = Object.freeze({ size: 52, inset: 2, x: 365 - 52, y: 125 - 52 });
// where the dot grid glows: behind the board
const GX = 292;
const GY = 98;

// 24x24 line glyphs, drawn at 2x: '#' the stroke (silver), '+' the programme's accent, 'o' white, '.' a shade (slate)
export const GLYPHS = {
  chip: [
    '                        ',
    '       #  #  #  #       ',
    '       #  #  #  #       ',
    '       #  #  #  #       ',
    '       #  #  #  #       ',
    '      ############      ',
    '     #            #     ',
    ' #####            ##### ',
    '     #  ++++++++  #     ',
    '     #  +      +  #     ',
    ' #####  + oooo +  ##### ',
    '     #  + oooo +  #     ',
    '     #  + oooo +  #     ',
    ' #####  + oooo +  ##### ',
    '     #  +      +  #     ',
    '     #  ++++++++  #     ',
    ' #####            ##### ',
    '     #            #     ',
    '      ############      ',
    '       #  #  #  #       ',
    '       #  #  #  #       ',
    '       #  #  #  #       ',
    '       #  #  #  #       ',
    '                        ',
  ],
  phone: [
    '                        ',
    '        ########        ',
    '       #        #       ',
    '       #  ####  #       ',
    '       #        #       ',
    '       #++++++++#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #+      +#       ',
    '       #++++++++#       ',
    '       #        #       ',
    '       #        #       ',
    '       #   oo   #       ',
    '        ########        ',
    '                        ',
  ],
  gamepad: [
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '    ################    ',
    '  ###              ###  ',
    '  #    +             #  ',
    ' ##    +        o    ## ',
    ' #   +++++            # ',
    ' #     +          o   # ',
    ' #     +              # ',
    ' ##                  ## ',
    '  #       ####       #  ',
    '  ###    #    #    ###  ',
    '    #####      #####    ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
  ],
  shield: [
    '                        ',
    '                        ',
    '                        ',
    '    ################    ',
    '    #              #    ',
    '    #              #    ',
    '    #              #    ',
    '    #              #    ',
    '    #           +  #    ',
    '    #          +   #    ',
    '    #         +    #    ',
    '    #   +     +    #    ',
    '    #    +   +     #    ',
    '    #     + +      #    ',
    '    #      +       #    ',
    '    ##            ##    ',
    '     #            #     ',
    '     #            #     ',
    '     ##          ##     ',
    '      ##        ##      ',
    '       ##      ##       ',
    '        ##    ##        ',
    '         ######         ',
    '                        ',
  ],
  globe: [
    '                        ',
    '         ######         ',
    '       ## +  + ##       ',
    '     ##  +    +  ##     ',
    '    #   +      +   #    ',
    '   ##################   ',
    '   #    +      +    #   ',
    '  #    +        +    #  ',
    '  #    +        +    #  ',
    ' #     +        +     # ',
    ' #     +        +     # ',
    ' #++++++++++++++++++++# ',
    ' #     +        +     # ',
    ' #     +        +     # ',
    ' #     +        +     # ',
    '  #    +        +    #  ',
    '  #    +        +    #  ',
    '   #    +      +    #   ',
    '   ##################   ',
    '    #   +      +   #    ',
    '     ##  +    +  ##     ',
    '       ## +  + ##       ',
    '         ######         ',
    '                        ',
  ],
  orbit: [
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '          ####          ',
    '        ##    ##        ',
    '       #        #       ',
    '      #          #      ',
    '   ++ #  oo       #++   ',
    ' ++  #   o        #  ++ ',
    ' +   #            #   + ',
    ' +   #            #   + ',
    ' ++  #            #  ++ ',
    '   +++#           +++   ',
    '      #++++++++++#      ',
    '       #        #       ',
    '        #      #        ',
    '         ######         ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
  ],
  atom: [
    '                        ',
    '                        ',
    '      ###      ###      ',
    '      # ###  ### #      ',
    '     ##   ####   ##     ',
    '     #     ##     #     ',
    '     ##    ##    ##     ',
    '      #   #  #   #      ',
    '      ############      ',
    '   ##### #    # #####   ',
    ' ###   ## ++++ ##   ### ',
    ' #     ## +oo+ ##     # ',
    ' #     ## +oo+ ##     # ',
    ' ###   ## ++++ ##   ### ',
    '   ##### #    # #####   ',
    '      ############      ',
    '      #   #  #   #      ',
    '     ##    ##    ##     ',
    '     #     ##     #     ',
    '     ##   ####   ##     ',
    '      # ###  ### #      ',
    '      ###      ###      ',
    '                        ',
    '                        ',
  ],
  flask: [
    '                        ',
    '                        ',
    '        ########        ',
    '         #    #         ',
    '         #    #         ',
    '         #    #         ',
    '         #    #         ',
    '         #    #         ',
    '         #    #         ',
    '         #    #         ',
    '        #      #        ',
    '        #      #        ',
    '       #        #       ',
    '       #        #       ',
    '      #++++++++++#      ',
    '      #++++++++++#      ',
    '     #+++++o++++++#     ',
    '     #+++o++++++++#     ',
    '    #++++++++o+++++#    ',
    '    #++++++++++++++#    ',
    '   #++++++++++++++++#   ',
    '   ##################   ',
    '                        ',
    '                        ',
  ],
  helix: [
    '                        ',
    '            +           ',
    '          ++ #          ',
    '        ++    ##        ',
    '      ++........##      ',
    '     +            #     ',
    '     +            #     ',
    '     +............#     ',
    '      +          #      ',
    '       +        #       ',
    '        ++....##        ',
    '          ++##          ',
    '           #+           ',
    '         ##..++         ',
    '       ##      ++       ',
    '      #          +      ',
    '     #............+     ',
    '     #            +     ',
    '     #            +     ',
    '      #..........+      ',
    '       ##      ++       ',
    '         ##  ++         ',
    '           #+           ',
    '                        ',
  ],
  leaf: [
    '                        ',
    '                        ',
    '                        ',
    '            #########   ',
    '          ###       #   ',
    '        ##          #   ',
    '       ##        +  #   ',
    '      ##    +   +   #   ',
    '     ##     +  +    #   ',
    '     #      + +     #   ',
    '    #       ++      #   ',
    '    #   +   +++++  ##   ',
    '   ##   +  +       #    ',
    '   #    + +        #    ',
    '   #    ++        #     ',
    '   #    +++++    ##     ',
    '   #   +        ##      ',
    '   #  +        ##       ',
    '   # +        ##        ',
    '   #+      ###          ',
    '   +########            ',
    '  +                     ',
    ' +                      ',
    '                        ',
  ],
  paw: [
    '                        ',
    '                        ',
    '        ++    ++        ',
    '       +  +  +  +       ',
    '       +  +  +  +       ',
    '       +  +  +  +       ',
    '       +  +  +  +       ',
    '   +++  ++    ++  +++   ',
    '  +   +          +   +  ',
    '  +   +          +   +  ',
    '  +   +          +   +  ',
    '  +   +          +   +  ',
    '   +++   ######   +++   ',
    '        #      #        ',
    '       #        #       ',
    '      #          #      ',
    '      #          #      ',
    '      #          #      ',
    '      #          #      ',
    '       #        #       ',
    '        #      #        ',
    '         ######         ',
    '                        ',
    '                        ',
  ],
  wave: [
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    '         +          +   ',
    '        + ++       + ++ ',
    ' +    ++    +    ++     ',
    '  ++ +       ++ +       ',
    '    +          +        ',
    '         #          #   ',
    '        # ##       # ## ',
    ' #    ##    #    ##     ',
    '  ## #       ## #       ',
    '    #          #        ',
    '         #          #   ',
    '        # ##       # ## ',
    ' #    ##    #    ##     ',
    '  ## #       ## #       ',
    '    #          #        ',
    '                        ',
    '                        ',
    '                        ',
    '                        ',
  ],
  pulse: [
    '                        ',
    '                        ',
    '                        ',
    '  ####################  ',
    ' #                    # ',
    ' #                    # ',
    ' #                    # ',
    ' #       +            # ',
    ' #       +            # ',
    ' #      + +   +       # ',
    ' #      + +   +       # ',
    ' #     +  +   ++      # ',
    ' # +++++   + + ++++++ # ',
    ' #         + +        # ',
    ' #         + +        # ',
    ' #         + +        # ',
    ' #          +         # ',
    ' #          +         # ',
    ' #                    # ',
    ' #                    # ',
    '  ####################  ',
    '                        ',
    '                        ',
    '                        ',
  ],
  chart: [
    '                        ',
    '                        ',
    '  #                     ',
    '  #                     ',
    '  #             ++++    ',
    '  #               ++    ',
    '  #              + +    ',
    '  #             +  +    ',
    '  #            +        ',
    '  #      +    +...      ',
    '  #     + ++ + ...      ',
    '  #   ++    +  ...      ',
    '  #  +         ...      ',
    '  # +     ...  ...      ',
    '  #       ...  ...      ',
    '  #       ...  ...      ',
    '  #  ...  ...  ...      ',
    '  #  ...  ...  ...      ',
    '  #  ...  ...  ...      ',
    '  #  ...  ...  ...      ',
    '  #                     ',
    '  ####################  ',
    '                        ',
    '                        ',
  ],
  bolt: [
    '                        ',
    '              ###       ',
    '             #  #       ',
    '             # #        ',
    '            #  #        ',
    '           #   #        ',
    '           #  #         ',
    '          #   #         ',
    '         #   #          ',
    '         #   ######     ',
    '        #        #      ',
    '       #         #      ',
    '       #        #       ',
    '      ######   #        ',
    '           #   #        ',
    '           #  #         ',
    '          #  #          ',
    '          # #           ',
    '          # #           ',
    '          ##            ',
    '         ##             ',
    '         ##             ',
    '         #              ',
    '                        ',
  ],
  house: [
    '                        ',
    '           ##           ',
    '          #  #          ',
    '         #    # ##      ',
    '        #      ###      ',
    '       #        ##      ',
    '      #         ##      ',
    '     #           ##     ',
    '    #              #    ',
    '   ##              ##   ',
    '  # #              # #  ',
    ' #  #              #  # ',
    '    #              #    ',
    '    #        oooo  #    ',
    '    #  ++++  o  o  #    ',
    '    #  +  +  o  o  #    ',
    '    #  +  +  oooo  #    ',
    '    #  +  +        #    ',
    '    #  +  +        #    ',
    '    #  +  +        #    ',
    '    #  +  +        #    ',
    '    ###++++#########    ',
    '                        ',
    '                        ',
  ],
  bag: [
    '                        ',
    '                        ',
    '                        ',
    '          ++++          ',
    '         ++  ++         ',
    '        ++    ++        ',
    '        +      +        ',
    '        +      +        ',
    '    ####+######++###    ',
    '    #              #    ',
    '    #              #    ',
    '    #              #    ',
    '    #              #    ',
    '    #              #    ',
    '    #              #    ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   ##################   ',
    '                        ',
    '                        ',
  ],
  ballot: [
    '                        ',
    '                        ',
    '        oooooooo        ',
    '        o      o        ',
    '        o    + o        ',
    '        o   +  o        ',
    '        o + +  o        ',
    '        o  +   o        ',
    '        o      o        ',
    '        o      o        ',
    '        oooooooo        ',
    '   ######      ######   ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   #                #   ',
    '   ##################   ',
    '                        ',
    '                        ',
  ],
  scales: [
    '                        ',
    '           oo           ',
    '           oo           ',
    '           ##           ',
    '           ##           ',
    '   ##################   ',
    '    +      ##      +    ',
    '    +      ##      +    ',
    '   + +     ##     + +   ',
    '   + +     ##     + +   ',
    '  +   +    ##    +   +  ',
    '  +   +    ##    +   +  ',
    '  +   +    ##    +   +  ',
    ' +     +   ##   +     + ',
    '+++++++++  ##  +++++++++',
    ' +++++++   ##   +++++++ ',
    '  +++++    ##    +++++  ',
    '           ##           ',
    '           ##           ',
    '           ##           ',
    '           ##           ',
    '        ########        ',
    '       ##########       ',
    '                        ',
  ],
  book: [
    '                        ',
    '                        ',
    '                        ',
    '                        ',
    ' #####            ##### ',
    ' #    ############    # ',
    ' #         ##         # ',
    ' #         ##         # ',
    ' #  +++++  ##  +++++  # ',
    ' #         ##         # ',
    ' #         ##         # ',
    ' #  +++++  ##  +++++  # ',
    ' #         ##         # ',
    ' #         ##         # ',
    ' #  +++++  ##  +++++  # ',
    ' #         ##         # ',
    ' #         ##         # ',
    ' #         ##         # ',
    ' #         ##         # ',
    ' #####     ##    ###### ',
    '      ###########       ',
    '                        ',
    '                        ',
    '                        ',
  ],
  film: [
    '                        ',
    '                        ',
    '                        ',
    '  ####################  ',
    '  #   #          #   #  ',
    '  # o #          # o #  ',
    '  #   #          #   #  ',
    '  #   #          #   #  ',
    '  # o #   +      # o #  ',
    '  #   #   ++     #   #  ',
    '  #   #   ++++   #   #  ',
    '  # o #   +++++  # o #  ',
    '  #   #   +++++  #   #  ',
    '  #   #   ++++   #   #  ',
    '  # o #   ++     # o #  ',
    '  #   #   +      #   #  ',
    '  #   #          #   #  ',
    '  # o #          # o #  ',
    '  #   #          #   #  ',
    '  #   #          #   #  ',
    '  ####################  ',
    '                        ',
    '                        ',
    '                        ',
  ],
  wheel: [
    '                        ',
    '         ######         ',
    '       ##      ##       ',
    '     ##  ......  ##     ',
    '    #  ..      ..  #    ',
    '   #  .          .  #   ',
    '   # .            . #   ',
    '  # .              . #  ',
    '  # .              . #  ',
    ' # .       ++       . # ',
    ' # .      +  ++     . # ',
    ' # ######+    +###### # ',
    ' # ######+    +###### # ',
    ' # .      +   +     . # ',
    ' # .      ++++      . # ',
    '  # .      ##      . #  ',
    '  # .      ##      . #  ',
    '   # .     ##     . #   ',
    '   #  .    ##    .  #   ',
    '    #  ..  ##  ..  #    ',
    '     ##  ..##..  ##     ',
    '       ##      ##       ',
    '         ######         ',
    '                        ',
  ],
  train: [
    '                        ',
    '      ############      ',
    '     #            #     ',
    '     #            #     ',
    '     # ++++++++++ #     ',
    '     # +        + #     ',
    '     # +        + #     ',
    '     # +        + #     ',
    '     # +        + #     ',
    '     # ++++++++++ #     ',
    '     #            #     ',
    '     #            #     ',
    '     #            #     ',
    '     #            #     ',
    '     #  o      o  #     ',
    '     #            #     ',
    '     #            #     ',
    '     #            #     ',
    '      ############      ',
    '        #      #        ',
    '       #        #       ',
    '      ............      ',
    '     #            #     ',
    '                        ',
  ],
  plane: [
    '                        ',
    '           ##           ',
    '           ##           ',
    '           ##           ',
    '           ##           ',
    '           ##           ',
    '           ##           ',
    '           ##           ',
    '           ##           ',
    '         ######         ',
    '       ##  ##  ##       ',
    '      #    ##    #      ',
    '    ##     ##     ##    ',
    '  ##    ########    ##  ',
    ' #  ####   ##   ####  # ',
    ' ###       ##       ### ',
    '           ##           ',
    '           ##           ',
    '           ++           ',
    '          +##+          ',
    '        ++ ## ++        ',
    '       +        +       ',
    '       ++++++++++       ',
    '                        ',
  ],
  medal: [
    '     ++          ++     ',
    '      ++        ++      ',
    '      ++        ++      ',
    '       ++      ++       ',
    '       ++      ++       ',
    '        ++    ++        ',
    '        ++    ++        ',
    '         ++  ++         ',
    '        ########        ',
    '       #        #       ',
    '      #          #      ',
    '     #   oooooo   #     ',
    '     #  o      o  #     ',
    '    #  o        o  #    ',
    '    #  o        o  #    ',
    '    #  o        o  #    ',
    '    #  o        o  #    ',
    '    #  o        o  #    ',
    '     #  o      o  #     ',
    '     #   oooooo   #     ',
    '      #          #      ',
    '       #        #       ',
    '        ########        ',
    '                        ',
  ],
};
// the section's glyph, for a story that offers nothing else (drawn large and quiet, no words)
const SECTION_GLYPH = [
  [/^(?:tech|technology)/, 'chip'],
  [/^(?:science|cosmos|space)/, 'orbit'],
  [/^(?:business|money|economy|markets?)/, 'chart'],
  [/^(?:sport)/, 'medal'],
  [/^(?:health)/, 'pulse'],
  [/^(?:environment|climate)/, 'leaf'],
  [/^(?:politics)/, 'ballot'],
];

// the field: stepped ink to black with a dot grid that brightens behind the board, made once per size
const FIELDS = new Map();
function field(W = WIDTH, H = HEIGHT, gx = GX, gy = GY) {
  const key = `${W}x${H}|${gx},${gy}`;
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
      const d = Math.hypot(x - gx, (y - gy) * 1.5);
      if (d > 170 && (x + y) % 16 !== 0) continue;
      g.fillStyle = d < 90 ? P.steel : P.slate;
      g.fillRect(x, y, 1, 1);
    }
  }
  FIELDS.set(key, c);
  return c;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (k) => 1 - Math.pow(1 - clamp01(k), 3);

/** A glyph at (x, y), `scale` px a cell; colours by cell kind, a black outline so it holds on any field. */
export function drawGlyph(ctx, name, x, y, { scale = 2, colours = {}, outline = true } = {}) {
  const rows = GLYPHS[name];
  if (!rows) return false;
  if (outline) {
    ctx.fillStyle = P.black;
    for (let ry = 0; ry < rows.length; ry++) for (let rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] !== ' ' && rows[ry][rx] !== '.') ctx.fillRect(x + rx * scale - 1, y + ry * scale - 1, scale + 2, scale + 2);
  }
  for (let ry = 0; ry < rows.length; ry++) {
    const row = rows[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch === ' ') continue;
      ctx.fillStyle = colours[ch] || P.silver;
      ctx.fillRect(x + rx * scale, y + ry * scale, scale, scale);
    }
  }
  return true;
}

// an opening quotation mark, two "6" shapes (as the channel's quote card: scenes/cards.js)
const QUOTE_MARK = ['..##..##', '.##..##.', '##..##..', '########', '########', '.##..##.'];
function quoteMark(ctx, x, y, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < QUOTE_MARK.length; r++) for (let c = 0; c < QUOTE_MARK[r].length; c++) if (QUOTE_MARK[r][c] === '#') ctx.fillRect(x + c, y + r, 1, 1);
}

/** An ink plate as the channel's cards draw them: a slate top line, a black edge under and to the right. */
function plate(ctx, x, y, w, h) {
  ctx.fillStyle = P.black;
  ctx.fillRect(x + 1, y + h, w, 1);
  ctx.fillRect(x + w, y + 1, 1, h);
  ctx.fillStyle = P.ink;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.slate;
  ctx.fillRect(x, y, w, 1);
}

// layouts are worked out once per spec (a board is drawn every frame for seconds)
const LAYOUTS = new WeakMap();

function figureLayout(spec, B = BOX) {
  const value = String(spec.value || '');
  const label = String(spec.label || '');
  const qual = String(spec.qual || '');
  // what it counts: one line at 2x when short, else up to two lines at 1x
  let lab = { lines: [], scale: 2, w: 0, h: 0 };
  if (label) {
    const two = balanceLines(label, 132, 2, 1);
    if (label.length <= 11 && two.length === 1 && !two[0].endsWith('...')) lab = { lines: two, scale: 2, w: measureText(two[0], 2), h: 14 };
    else {
      const lines = balanceLines(label, 132, 1, 2);
      lab = { lines, scale: 1, w: Math.max(...lines.map((l) => measureText(l))), h: lines.length * 11 - 4 };
    }
  }
  const qw = qual ? measureText(qual, 1, 'micro') : 0;
  const side = Math.max(lab.w, qw);
  let scale = 6;
  while (scale > 3 && measureText(value, scale) + (side ? 8 + side : 0) > B.maxW) scale--;
  const vw = measureText(value, scale);
  const w = vw + (side ? 8 + side : 0);
  const x = B.right - w;
  const vh = 7 * scale;
  return { kind: 'figure', value, scale, vw, vh, x, y: B.bottom - vh, w, lab, qual, qw, labX: x + vw + 8, bottom: B.bottom };
}

function quoteLayout(spec, B = BOX) {
  const text = `${spec.text || ''}`;
  // 2x when the words fit two lines of the plate, else 1x in up to three
  const maxW = Math.min(236, B.maxW - 34);
  let scale = 2;
  let lines = balanceLines(text, maxW, 2, 2);
  if (lines.length > 2 || lines.some((l) => l.endsWith('...'))) {
    scale = 1;
    lines = balanceLines(text, maxW, 1, 3);
  }
  const lh = scale === 2 ? 16 : 11;
  const textH = lines.length * lh - (lh - 7 * scale);
  const by = spec.by ? `- ${spec.by}` : '';
  const tw = Math.max(...lines.map((l) => measureText(l, scale)), by ? measureText(by, 1, 'micro') : 0);
  const w = Math.min(B.maxW, tw + 24 + 10);
  // (a quote of two lines at 2x or three at 1x sets its plate tighter, so it still ends above the headline's chip)
  const pad = textH > 20 ? { t: 6, g: 4, a: 3, b: 5 } : { t: 7, g: 5, a: 4, b: 6 };
  const h = pad.t + textH + pad.g + 1 + pad.a + 5 + pad.b;
  return { kind: 'quote', lines, scale, lh, textH, by, w, h, pad, x: B.right - w, y: Math.max(B.top - 2, B.bottom + 2 - h) };
}

function wordmarkLayout(name, about, B = BOX) {
  // the name at 3x when it fits, else 2x (in two lines if need be), else 1x
  let scale = 3;
  let lines = [name];
  if (measureText(name, 3) > B.maxW - 20 || (about && name.length > 16)) {
    scale = 2;
    lines = measureText(name, 2) <= B.maxW - 20 ? [name] : balanceLines(name, B.maxW - 20, 2, 2);
    if (lines.length > 2 || lines.some((l) => l.endsWith('...'))) {
      scale = 1;
      lines = balanceLines(name, B.maxW - 20, 1, 2);
    }
  }
  if (about && lines.length > 1 && scale === 2) about = null; // (two lines of name leave no room for what it is)
  const lh = scale === 3 ? 25 : scale === 2 ? 16 : 11;
  const nameH = lines.length * lh - (lh - 7 * scale);
  const aw = about ? measureText(about) : 0;
  const nw = Math.max(...lines.map((l) => measureText(l, scale)));
  // (what it is, when it does not fit a narrow box, is left out rather than cut)
  if (about && aw > B.maxW - 20) about = null;
  const w = Math.min(B.maxW, Math.max(nw, about ? measureText(about) : 0) + 20);
  const h = about ? 6 + nameH + 4 + 1 + 4 + 7 + 6 : 8 + nameH + 5 + 1 + 7;
  return { kind: 'wordmark', lines, scale, lh, nameH, about, w, h, x: B.right - w, y: Math.max(B.top - 2, B.bottom - h) };
}

function topicLayout(spec, B = BOX, T = TILE) {
  const label = String(spec.label || '');
  const tile = T.size;
  const tx = T.x;
  const ty = T.y;
  // the words at 2x beside the tile (in two lines when long), else 1x
  let scale = 2;
  let lines = balanceLines(label, B.maxW - tile - 14, 2, 1);
  if (lines.length > 1 || lines[0]?.endsWith('...')) {
    lines = balanceLines(label, 150, 2, 2);
    if (lines.length > 2 || lines.some((l) => l.endsWith('...'))) {
      scale = 1;
      lines = balanceLines(label, B.maxW - tile - 14, 1, 2);
    }
  }
  const lh = scale === 2 ? 18 : 11;
  const textH = lines.length * lh - (lh - 7 * scale);
  const tw = Math.max(...lines.map((l) => measureText(l, scale)));
  return { kind: 'topic', label, lines, scale, lh, textH, tw, tile, tx, ty, lx: tx - 12 - tw, ly: ty + Math.round((tile - textH) / 2) };
}

function layoutOf(spec, B = BOX, T = TILE) {
  const key = B === BOX ? '' : `${B.right},${B.top},${B.bottom},${B.maxW}`;
  let byBox = LAYOUTS.get(spec);
  if (!byBox) LAYOUTS.set(spec, (byBox = new Map()));
  let L = byBox.get(key);
  if (L) return L;
  if (spec.kind === 'figure') L = figureLayout(spec, B);
  else if (spec.kind === 'quote') L = quoteLayout(spec, B);
  else if (spec.kind === 'actor') L = wordmarkLayout(String(spec.name || ''), spec.about || null, B);
  else if (spec.kind === 'phrase') L = wordmarkLayout(String(spec.text || ''), null, B);
  else if (spec.kind === 'topic' && spec.glyph && GLYPHS[spec.glyph]) L = topicLayout(spec, B, T);
  else if (spec.kind === 'topic' && spec.label) L = wordmarkLayout(String(spec.label), null, B);
  else L = { kind: 'none' };
  byBox.set(key, L);
  return L;
}

/** The board a rundown item shows: the server's spec, else one read from its headline alone. */
export function specOf(item = {}) {
  if (item.board && typeof item.board === 'object' && item.board.kind) return item.board;
  if (item.$board) return item.$board;
  const spec = boardSpec({ headline: item.headline || item.title || '', kicker: item.kicker || null, grave: !!item.grave });
  try {
    Object.defineProperty(item, '$board', { value: spec, enumerable: false, configurable: true });
  } catch {
    // (a frozen item: worked out again next frame)
  }
  return spec;
}

/** Draw the topic board for a rundown item with neither a picture nor a place. */
export function drawTopicBoard(ctx, item = {}, { accent = P.red, dt = 9, frame = null } = {}) {
  const spec = specOf(item);
  const grave = !!(spec.grave || item.grave);
  const acc = grave ? P.fog : accent;
  const strong = grave ? P.silver : P.white;
  // the board's box and tile: the horizontal frame's, or a frame's own (its box given inside the frame)
  const fx = frame?.x ?? 0;
  const fy = frame?.y ?? 0;
  const B = frame ? { right: fx + frame.right, top: fy + frame.top, bottom: fy + frame.bottom, maxW: frame.maxW } : BOX;
  const T = frame ? { size: TILE.size, inset: TILE.inset, x: B.right - TILE.size, y: B.bottom + 2 - TILE.size } : TILE;
  const L = layoutOf(spec, B, T);
  if (frame) ctx.drawImage(field(frame.w, frame.h, frame.right - 70, frame.bottom - 25), fx, fy);
  else ctx.drawImage(field(), 0, 0);
  // one wipe, left to right over the board's box (0.1 to 0.45 s); the accent rules grow after it
  const wipe = ease((dt - 0.1) / 0.35);
  const rule = ease((dt - 0.3) / 0.35);
  if (L.kind === 'none') {
    const cat = String(item.category || '').toLowerCase();
    const glyph = grave ? null : (SECTION_GLYPH.find(([re]) => re.test(cat)) || [null, 'globe'])[1];
    const shownTile = Math.round(T.size * wipe);
    if (glyph && shownTile > 0) {
      ctx.save();
      try {
        ctx.beginPath();
        ctx.rect(T.x, T.y, shownTile, T.size + 2);
        ctx.clip();
        plate(ctx, T.x, T.y, T.size, T.size);
        drawGlyph(ctx, glyph, T.x + T.inset, T.y + T.inset, { scale: 2, colours: { '#': P.fog, '+': P.steel, o: P.silver, '.': P.slate }, outline: false });
      } finally {
        ctx.restore();
      }
    }
    return spec;
  }
  const box = L.kind === 'figure' ? { x: L.x - 10, w: L.w + 10 } : L.kind === 'topic' ? { x: L.lx - 4, w: B.right - L.lx + 6 } : { x: L.x, w: L.w + 2 };
  const shown = Math.round(box.w * wipe);
  if (shown <= 0) return spec;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(box.x, B.top - 4, shown, B.bottom - B.top + 8);
    ctx.clip();
    if (L.kind === 'figure') drawFigure(ctx, L, { acc, strong, grave, rule });
    else if (L.kind === 'quote') drawQuote(ctx, L, { acc, strong, grave, rule });
    else if (L.kind === 'wordmark') drawWordmark(ctx, L, { acc, strong, grave, rule });
    else if (L.kind === 'topic') drawTopic(ctx, L, spec, { acc, strong, grave, rule, accent });
  } finally {
    ctx.restore();
  }
  return spec;
}

function drawFigure(ctx, L, { acc, strong, grave, rule }) {
  // the accent rule beside the figure grows down, as the rule beside every headline
  const bar = Math.round(L.vh * rule);
  if (bar > 0) {
    ctx.fillStyle = acc;
    ctx.fillRect(L.x - 10, L.y, 2, bar);
  }
  // (no shadow: at this size any shadow falls inside the figure's own counters, the slashed zero's above all)
  drawText(ctx, L.value, L.x, L.y, { color: strong, scale: L.scale });
  const lab = L.lab;
  let y = L.bottom - lab.h;
  for (let i = 0; i < lab.lines.length; i++) drawText(ctx, lab.lines[i], L.labX, y + i * (lab.scale === 2 ? 18 : 11), { color: lab.scale === 2 ? strong : P.silver, scale: lab.scale, shadow: P.black });
  if (L.qual) drawText(ctx, L.qual, L.labX, y - 9, { color: grave ? P.fog : P.silver, font: 'micro' });
}

function drawQuote(ctx, L, { acc, strong, rule }) {
  plate(ctx, L.x, L.y, L.w, L.h);
  quoteMark(ctx, L.x + 9, L.y + L.pad.t + 1, acc);
  const tx = L.x + 24;
  let y = L.y + L.pad.t;
  for (let i = 0; i < L.lines.length; i++) drawText(ctx, L.lines[i], tx, y + i * L.lh, { color: strong, scale: L.scale });
  y += L.textH + L.pad.g;
  const rw = Math.round((L.w - 34) * rule);
  if (rw > 0) {
    ctx.fillStyle = acc;
    ctx.fillRect(tx, y, rw, 1);
  }
  if (L.by) drawText(ctx, L.by, tx, y + 1 + L.pad.a, { color: P.fog, font: 'micro' });
}

function drawWordmark(ctx, L, { acc, strong, rule }) {
  plate(ctx, L.x, L.y, L.w, L.h);
  const tx = L.x + 10;
  let y = L.y + (L.about ? 7 : 9);
  for (let i = 0; i < L.lines.length; i++) drawText(ctx, L.lines[i], tx, y + i * L.lh, { color: strong, scale: L.scale });
  y += L.nameH + 5;
  const rw = Math.round((L.w - 20) * rule);
  if (rw > 0) {
    ctx.fillStyle = acc;
    ctx.fillRect(tx, y, rw, 1);
  }
  if (L.about) drawText(ctx, L.about, tx, y + 5, { color: P.fog });
}

function drawTopic(ctx, L, spec, { acc, strong, accent }) {
  plate(ctx, L.tx, L.ty, L.tile, L.tile);
  drawGlyph(ctx, spec.glyph, L.tx + TILE.inset, L.ty + TILE.inset, { scale: 2, colours: { '#': P.silver, '+': accent, o: P.white, '.': P.slate }, outline: false });
  // the words, right-aligned to the tile, with the accent bar under them
  for (let i = 0; i < L.lines.length; i++) drawText(ctx, L.lines[i], L.tx - 12, L.ly + i * L.lh, { color: strong, scale: L.scale, align: 'right', shadow: P.black });
  ctx.fillStyle = acc;
  ctx.fillRect(L.tx - 12 - Math.min(L.tw, 24), L.ly + L.textH + 4, Math.min(L.tw, 24), 2);
}
