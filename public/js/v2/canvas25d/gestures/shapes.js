// Hand shapes used when authoring gestures (owner: HANDS & GESTURES stream):
// curl per finger [thumb, index, middle, ring, pinky], 0 open → 1 curled,
// and hand directions. SHAPES is the catalogue the lab's hand-shape sheet
// draws (curl, spread, facing, sup and a display direction).

export const OPEN = [0.1, 0.02, 0.0, 0.04, 0.1];
export const POINT = [0.75, 0.0, 0.92, 0.96, 0.98];
export const FIST = [0.85, 0.95, 0.97, 0.98, 1];
export const CUP = [0.2, 0.15, 0.12, 0.15, 0.2];
export const UP = [0.04, -1, 0.12];
export const RELAX = [0.35, 0.62, 0.66, 0.7, 0.74];
export const THUMB = [-0.1, 0.95, 0.97, 0.98, 1];
export const STEEPLE = [0.22, 0.06, 0.08, 0.1, 0.16];
export const CHIN = [0.32, 0.22, 0.7, 0.8, 0.86];
export const GRIP = [0.3, 0.3, 0.34, 0.38, 0.44]; // holding the edge of the papers
export const PEN = [0.42, 0.5, 0.64, 0.72, 0.78];
export const FLAT = [0.12, 0.04, 0.03, 0.05, 0.08]; // a calm open hand (offer, palms)
export const PINCH = [0.42, 0.4, 0.78, 0.84, 0.88]; // thumb and index meeting (the glasses' temple corner)

/** Count shapes: n fingers up, in the order index, middle, ring, pinky, thumb. */
export const COUNT = [
  null,
  [0.85, 0.0, 0.97, 0.98, 1],
  [0.85, 0.0, 0.0, 0.98, 1],
  [0.85, 0.0, 0.0, 0.02, 1],
  [0.85, 0.0, 0.0, 0.02, 0.04],
  [0.05, 0.0, 0.0, 0.02, 0.04],
];

export const SHAPES = {
  open: { curl: OPEN, spread: 0.45, facing: 1 },
  relaxed: { curl: RELAX, spread: 0.15, facing: 1, dir: [-0.6, 0.3, 0.7] },
  point: { curl: POINT, spread: 0.1, facing: 0.2, dir: [0.9, -0.35, 0.1] },
  fist: { curl: FIST, spread: 0, facing: 1 },
  count1: { curl: COUNT[1], spread: 0.15, facing: 1 },
  count2: { curl: COUNT[2], spread: 0.3, facing: 1 },
  count3: { curl: COUNT[3], spread: 0.35, facing: 1 },
  count4: { curl: COUNT[4], spread: 0.4, facing: 1 },
  count5: { curl: COUNT[5], spread: 0.5, facing: 1 },
  thumbs: { curl: THUMB, spread: 0, facing: -1, dir: [-0.6, 0.05, 0.8] },
  steeple: { curl: STEEPLE, spread: 0.35, facing: 0.1, dir: [-0.55, -0.75, 0.35] },
  chin: { curl: CHIN, spread: 0.1, facing: -0.6, dir: [-0.1, -1, 0.2] },
  grip: { curl: GRIP, spread: 0.05, facing: 0, dir: [0.1, 0.2, 1] },
  pen: { curl: PEN, spread: 0.1, facing: -0.8, dir: [-0.7, 0.2, 0.7] },
  offer: { curl: FLAT, spread: 0.3, facing: 0.35, sup: 1, dir: [0.8, 0.1, 0.55] },
  pinch: { curl: PINCH, spread: 0.06, facing: -0.4, dir: [-0.34, -0.9, 0.26] },
};
