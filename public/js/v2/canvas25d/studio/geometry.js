// World geometry and projection of the GLOBIT 24 2.5D studio (owner: STUDIO
// SET stream; the camera stream and the runtime read it).
//
// World units are centimetres (the rig's units): X right, Y down with the
// desk top at Y = 0, Z away from the camera. The camera never rotates (a
// studio pedestal: it trucks, pedestals, dollies and zooms), so every plane
// facing the lens (back wall, set flats, presenters, desk front) is a 2D
// layer scaled by k = F·zoom / (Z − cam.z) — that is the per-layer parallax —
// while the desk top and the floor are true perspective surfaces.
// A camera is { x, y, z, zoom, hy, soft } (camera.js makeCamera): hy is the
// screen row of world Y = cam.y, soft > 0.5 means "background out of focus".

export const F = 1000;
export const SET = {
  presenterZ: 1000,
  neckY: -30, // neck base of a seated presenter, relative to the desk top (desk at elbow height)
  seatX: { A: -74, B: 74, solo: 0 }, // solo programmes sit centred, in front of the wall
  wallZ: 1400,
  flatsZ: 1180,
  deskFrontZ: 900,
  deskDepth: 82,
  deskHW: 238,
  deskCurve: 58,
  deskH: 52,
  floorY: 52,
  screen: { x0: -73, x1: 73, y0: -110, y1: -22 },
};

export const kAt = (cam, Z) => (F * cam.zoom) / (Z - cam.z);
export const sxOf = (cam, k, X) => 192 + (X - cam.x) * k;
export const syOf = (cam, k, Y) => cam.hy + (Y - cam.y) * k;
