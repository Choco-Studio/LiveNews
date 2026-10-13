// Channel palette (based on ENDESGA 32) so every element shares one look.
export const P = {
  black: '#181425',
  ink: '#262b44',
  slate: '#3a4466',
  steel: '#5a6988',
  fog: '#8b9bb4',
  silver: '#c0cbdc',
  white: '#ffffff',
  red: '#e43b44',
  darkRed: '#a22633',
  maroon: '#3e2731',
  rust: '#be4a2f',
  orange: '#f77622',
  yellow: '#feae34',
  cream: '#ead4aa',
  skin: '#e4a672',
  skinShade: '#b86f50',
  tan: '#c28569',
  tanShade: '#8f563b',
  brown: '#733e39',
  green: '#63c74d',
  darkGreen: '#265c42',
  cyan: '#2ce8f5',
  blue: '#0099db',
  navy: '#124e89',
  pink: '#f6757a',
  magenta: '#b55088',
  purple: '#68386c',
};

// The colours the channel's quantizers map to (the weather's nearest colour, the ads' shades): the palette as it was
// before the pitch's greens, so nothing already drawn changes its look.
export const QUANT = Object.freeze(Object.values(P));

// Two more of ENDESGA 32's own greens, for FULL TIME's pitch (a mown stripe under the lights; the pitch in shadow or at
// night). Drawn by name only: never a quantizer's choice.
P.midGreen = '#3e8948';
P.deepGreen = '#193c3e';

