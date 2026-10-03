// Showcase recorder: contact sheet. Frames sampled during the recording are
// laid out in a grid (nearest-neighbour 2x, so pixels stay crisp) with a
// caption under each: recording time, shot, programme / ad, who is speaking
// and the first words heard. Composed in a browser canvas (no image library
// needed in Node) and returned as a PNG.

/** Runs in the browser. tiles: [{ png (data URL), label, sub }]. */
export async function composeSheetInPage({ tiles, cols, scale, title }) {
  const W = 384 * scale;
  const H = 216 * scale;
  const LAB = 34;
  const PAD = 8;
  const rows = Math.ceil(tiles.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * (W + PAD) + PAD;
  c.height = 40 + rows * (H + LAB + PAD) + PAD;
  const g = c.getContext('2d');
  g.fillStyle = '#101418';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#e8e4d8';
  g.font = 'bold 20px sans-serif';
  g.fillText(title, PAD, 27);
  g.imageSmoothingEnabled = false;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const img = new Image();
    img.src = t.png;
    await img.decode();
    const x = PAD + (i % cols) * (W + PAD);
    const y = 40 + Math.floor(i / cols) * (H + LAB + PAD);
    g.drawImage(img, x, y, W, H);
    g.fillStyle = '#ffd34d';
    g.font = 'bold 15px monospace';
    g.fillText(t.label, x, y + H + 15);
    g.fillStyle = '#b8c0c8';
    g.font = '13px monospace';
    const sub = t.sub.length > Math.floor(W / 8) ? `${t.sub.slice(0, Math.floor(W / 8) - 1)}…` : t.sub;
    g.fillText(sub, x, y + H + 30);
  }
  return c.toDataURL('image/png');
}

/**
 * Runs in the browser: the "audio picture" - one lane per stem (RMS dBFS,
 * -60..0) on the recording clock, with shots, speech (who), music cues and the
 * quiet intervals (grave stories, ads) marked, so a mix can be judged at a glance.
 * lanes: [{ name, color, values (dB every `hop` s) }].
 */
export function composeAudioSheetInPage({ lanes, hop, seconds, shots, speech, cues, quiet, title }) {
  const pxPerSec = Math.max(8, Math.min(40, Math.floor(3600 / Math.max(1, seconds))));
  const W = Math.ceil(seconds * pxPerSec) + 140;
  const LANE = 110;
  const TOP = 90;
  const H = TOP + lanes.length * (LANE + 10) + 40;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1014';
  g.fillRect(0, 0, W, H);
  const X = (t) => 120 + t * pxPerSec;
  g.fillStyle = '#e8e4d8';
  g.font = 'bold 18px sans-serif';
  g.fillText(title, 10, 22);
  // Shots (top band) and music cues.
  g.font = '11px monospace';
  for (const s of shots) {
    g.fillStyle = '#38424c';
    g.fillRect(X(s.t), 30, 1, H - 60);
    g.fillStyle = '#9fb0c0';
    g.fillText(s.label, X(s.t) + 2, 42);
  }
  for (const q of cues) {
    g.fillStyle = '#c9a0ff';
    g.fillRect(X(q.t), 48, 2, 10);
    g.fillText(q.label, X(q.t) + 4, 57);
  }
  for (const q of quiet) {
    g.fillStyle = q.kind === 'ad' ? 'rgba(255,170,60,0.10)' : 'rgba(255,60,60,0.12)';
    g.fillRect(X(q.from), TOP - 20, (q.to - q.from) * pxPerSec, H - TOP);
    g.fillStyle = q.kind === 'ad' ? '#ffb050' : '#ff7070';
    g.fillText(q.kind === 'ad' ? 'AD (no bed)' : 'GRAVE (no bed)', X(q.from) + 2, TOP - 8);
  }
  lanes.forEach((lane, li) => {
    const y0 = TOP + li * (LANE + 10);
    g.fillStyle = '#151a20';
    g.fillRect(120, y0, W - 130, LANE);
    for (const dbl of [-12, -24, -36, -48]) {
      const y = y0 + (-dbl / 60) * LANE;
      g.fillStyle = '#222a33';
      g.fillRect(120, y, W - 130, 1);
      g.fillStyle = '#56616c';
      g.fillText(`${dbl}`, 96, y + 4);
    }
    if (lane.name === 'voice') {
      for (const s of speech) {
        g.fillStyle = 'rgba(80,200,255,0.10)';
        g.fillRect(X(s.start), y0, (s.end - s.start) * pxPerSec, LANE);
        g.fillStyle = '#7fd4ff';
        g.fillText(s.who, X(s.start) + 2, y0 + LANE - 4);
      }
    }
    g.fillStyle = lane.color;
    g.beginPath();
    g.moveTo(X(0), y0 + LANE);
    lane.values.forEach((v, i) => g.lineTo(X(i * hop), y0 + Math.min(LANE, Math.max(0, (-v / 60) * LANE))));
    g.lineTo(X(lane.values.length * hop), y0 + LANE);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8e4d8';
    g.font = 'bold 13px sans-serif';
    g.fillText(lane.name, 8, y0 + 18);
    g.font = '11px monospace';
  });
  for (let t = 0; t <= seconds; t += 5) {
    g.fillStyle = '#8a96a2';
    g.fillText(`${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`, X(t) - 10, H - 12);
  }
  return c.toDataURL('image/png');
}
