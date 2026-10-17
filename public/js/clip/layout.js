// The vertical picture's geometry (9:16 for Shorts, Reels and TikTok: docs/publishing/vertical.md). The channel draws
// at 384x216 and is scaled 5x to 1920x1080 by nearest neighbour; the vertical picture keeps the same pixel, 216x384
// at 5x is 1080x1920, so a pixel on a phone is as big as on the horizontal channel and nothing is ever resampled.
//
// The frame, top to bottom (every band a whole number of pixels, every edge on the 1x grid):
//   MAST     0-31    the channel's bug and the programme's tag (the feeds' own buttons sit over the top ~8 %: only
//                    branding lives here)
//   TITLE   32-71    the story's tag and headline (on a clip: its hook title, laid over this band)
//   STAGE   72-247   the picture: the presenter's single, the board, the map, the picture, the quiz board
//   CAPS   248-299   the captions, two lines of 2x type (a line box is 24 px: 3 px over the caps for an accent, 2 under)
//   FOOT   300-383   the source line and the channel's name on a calm dark ground: the feeds lay their own caption
//                    text and buttons over the bottom ~20 %, and it needs a dark ground to be read on
// The feeds' right-hand buttons cover x >= 188 from about y 150 down: nothing essential sits there below the stage's
// top (the RECREATION label stands at the stage's top right, above them).
export const VW = 216;
export const VH = 384;
export const V = Object.freeze({
  margin: 8,
  mast: Object.freeze({ y: 0, h: 32 }),
  title: Object.freeze({ y: 32, h: 40 }),
  stage: Object.freeze({ y: 72, h: 176 }),
  caps: Object.freeze({ y: 248, h: 52 }),
  foot: Object.freeze({ y: 300, h: 84 }),
});
/** The part of the frame no feed covers (TikTok, Reels and Shorts measured together: docs/publishing/vertical.md §2). */
export const PLATFORM_SAFE = Object.freeze({ left: 8, right: 188, top: 32, bottom: 300 });
/** The horizontal channel's frame (the renderer's picture the vertical one is composed from). */
export const HW = 384;
export const HH = 216;
