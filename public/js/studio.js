// Composes the broadcast: camera shots, full-screen scenes, the graphics
// package (logo bug, world clocks, lower third, subtitles, ticker) and
// transitions. Everything is drawn at the native 384x216 pixel grid.
import { P } from './palette.js';
import { drawText, measureText, wrapText, LINE_HEIGHT } from './font.js';
import { drawAnchor, drawHands } from './anchors.js';
import { W, H, DESK_Y, ANCHOR_X, ANCHOR_Y, drawSet, drawDesk, drawStripes } from './set.js';
import { r, zoneTime, longDate, easeOut } from './util.js';
import { lookOf, portraitOf, presenterName, THEME_ACCENT } from './cast.js';
import { drawCloseup } from './scenes/portraits.js';
import { drawWorldMap } from './scenes/worldmap.js';
import * as cards from './scenes/cards.js';
import { drawLogo, measureLogo } from './logo.js';

export { W, H };

const SOLO_X = 192;
const CLOCKS = [
  ['LONDON', 'Europe/London'],
  ['NEW YORK', 'America/New_York'],
  ['TOKYO', 'Asia/Tokyo'],
  ['DUBAI', 'Asia/Dubai'],
  ['SÃO PAULO', 'America/Sao_Paulo'],
];

// Which graphics sit on top of each shot
const OVERLAYS = {
  wide: 'news',
  close: 'news',
  full: 'news',
  map: 'news',
  fact: 'news',
  montage: 'news',
  breakingCard: 'bug',
  ad: 'ad',
};

export function slotPositions(cast) {
  return cast?.B ? { A: ANCHOR_X.A, B: ANCHOR_X.B } : { A: SOLO_X };
}

export class Renderer {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.audio = audio;
    this.stage = document.createElement('canvas');
    this.stage.width = W;
    this.stage.height = H;
    this.sctx = this.stage.getContext('2d');
    this.sctx.imageSmoothingEnabled = false;
    this.anim = {};
  }

  anchorState(slot, t, scene) {
    const a = (this.anim[slot] ??= { blinkAt: 1 + Math.random() * 2, blinkUntil: 0, gestureUntil: 0, nextGesture: 2 });
    if (t > a.blinkAt) {
      a.blinkUntil = t + 0.12;
      a.blinkAt = t + 2 + Math.random() * 3.5;
    }
    const speaking = this.audio.isSpeaking(slot);
    if (speaking && t > a.nextGesture) {
      a.gestureUntil = t + 0.6 + Math.random() * 0.8;
      a.nextGesture = t + 2.5 + Math.random() * 4;
    }
    const level = this.audio.level(slot);
    const other = slot === 'A' ? 'B' : 'A';
    let look = 0;
    if (scene.cast?.[other] && this.audio.isSpeaking(other) && scene.shot === 'wide') look = slot === 'A' ? 1 : -1;
    return {
      t,
      speaking,
      emotion: scene.anchors[slot]?.emotion || 'neutral',
      mouth: level > 0.62 ? 2 : level > 0.22 ? 1 : 0,
      blink: t < a.blinkUntil,
      look,
      bob: speaking && Math.sin(t * 5.3) > 0.7 ? 1 : 0,
      gesture: speaking && t < a.gestureUntil ? 1 : 0,
    };
  }

  drawStudio(ctx, t, scene) {
    drawSet(ctx, t, { ...scene, channel: scene.channel.name });
    const pos = slotPositions(scene.cast);
    const slots = Object.keys(pos);
    const states = Object.fromEntries(slots.map((s) => [s, this.anchorState(s, t, scene)]));
    for (const s of slots) drawAnchor(ctx, pos[s], ANCHOR_Y, lookOf(scene.cast[s]), states[s]);
    drawDesk(ctx, t, scene.channel.name, true);
    for (const s of slots) drawHands(ctx, pos[s], DESK_Y, lookOf(scene.cast[s]), states[s].gesture);
  }

  drawShot(t, scene) {
    const ctx = this.ctx;
    const dt = t - (scene.shotSince || 0);
    const img = scene.storyId ? scene.images.get(scene.storyId) : null;
    const card = scene.card || {};
    const program = scene.program;
    switch (scene.shot) {
      case 'start':
        return cards.drawStartScreen(ctx, t, { channel: scene.channel.name, prompt: card.prompt || 'CLICK TO TUNE IN' });
      case 'standby':
        return cards.drawStandby(ctx, t, { channel: scene.channel.name, message: card.message || 'PREPARING THE NEXT PROGRAMME' });
      case 'title':
        return cards.drawTitleCard(ctx, t, dt, { channel: program?.title || scene.channel.name, subtitle: program?.tagline || scene.channel.slogan, date: longDate().toUpperCase() });
      case 'endcard':
        return cards.drawEndCard(ctx, t, dt, { channel: program?.title || scene.channel.name, line1: card.line1 || 'STAY WITH US', line2: card.line2 || '' });
      case 'ident':
        return this.drawIdent(ctx, t, dt, scene);
      case 'promo':
        return this.drawPromo(ctx, t, dt, scene);
      case 'montage': {
        const item = scene.rundown[card.index] || {};
        const pic = scene.images.get(item.storyId);
        return cards.drawHeadlineFrame(ctx, t, dt, { index: card.index, total: scene.rundown.length, headline: item.headline, source: item.source, category: item.category, image: pic?.card || null });
      }
      case 'breakingCard':
        return cards.drawBreakingCard(ctx, t, dt, { headline: card.headline, source: card.source });
      case 'fact':
        return cards.drawFactCard(ctx, t, dt, { fact: card.fact, label: card.label, source: card.source, image: img?.card || null });
      case 'map':
        return drawWorldMap(ctx, t, dt, { lat: card.lat, lon: card.lon, place: card.place });
      case 'ad':
        return card.ad?.draw(ctx, t, dt, { line: card.line ?? -1, speaking: this.audio.isSpeaking('ad'), duration: card.ad.duration });
      case 'full':
        if (img?.full) {
          // slow Ken Burns pan across a native-resolution pixel-art photo
          const maxX = img.full.width - W;
          const maxY = img.full.height - H;
          const p = easeOut(Math.min(1, dt / 16));
          const ox = Math.round(maxX * (scene.panDir > 0 ? p : 1 - p));
          const oy = Math.round(maxY * (scene.panDir > 0 ? 1 - p : p));
          ctx.drawImage(img.full, -ox, -oy);
          return;
        }
        break;
      case 'close': {
        const slot = scene.focus in (scene.cast || {}) ? scene.focus : 'A';
        const withBox = !!img?.small;
        const solo = !scene.cast?.B;
        const side = withBox ? (slot === 'B' ? 'right' : 'left') : solo ? 'center' : slot === 'B' ? 'right' : 'left';
        const accent = scene.lowerThird?.breaking ? P.red : THEME_ACCENT[program?.theme] || null;
        drawCloseup(ctx, t, portraitOf(scene.cast[slot]), this.anchorState(slot, t, scene), { side, accent });
        if (withBox) {
          const bw = img.small.width;
          const bh = img.small.height;
          const bx = side === 'left' ? 248 : 32;
          const by = 30;
          r(ctx, bx - 3, by - 3, bw + 6, bh + 6, P.white);
          r(ctx, bx - 2, by - 2, bw + 4, bh + 4, P.black);
          ctx.drawImage(img.small, bx, by);
          r(ctx, bx - 3, by + bh + 3, bw + 6, 2, accent || P.red);
        }
        return;
      }
      default:
        break;
    }
    // wide (and fallbacks)
    this.drawStudio(this.sctx, t, scene);
    ctx.drawImage(this.stage, 0, 0);
  }

  /** Channel ident between programmes and breaks. */
  drawIdent(ctx, t, dt, scene) {
    drawStripes(ctx, 0, 0, W, H, t, P.navy, P.ink);
    // radiating "bits"
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39996 + t * 0.15;
      const d = ((t * 40 + i * 37) % 260) + 10;
      const x = Math.round(W / 2 + Math.cos(a) * d * 1.4);
      const y = Math.round(H / 2 - 8 + Math.sin(a) * d * 0.8);
      r(ctx, x, y, 2, 2, i % 5 === 0 ? P.red : i % 3 === 0 ? P.cyan : P.blue);
    }
    const scale = 3;
    const size = measureLogo({ variant: 'full', scale, slogan: true });
    const y = Math.round((H - size.h) / 2 - 6 + (1 - easeOut(dt / 0.6)) * 30);
    drawLogo(ctx, W / 2, y, { variant: 'full', scale, t, slogan: true, align: 'center' });
  }

  /** "Up next" promo at the end of a break. */
  drawPromo(ctx, t, dt, scene) {
    const next = scene.card?.next;
    const accent = THEME_ACCENT[next?.theme] || P.red;
    drawStripes(ctx, 0, 0, W, H, t, P.ink, P.black);
    const slide = easeOut(dt / 0.5);
    const bx = Math.round(-W + slide * W);
    r(ctx, bx, 64, W, 64, accent);
    r(ctx, bx, 128, W, 3, P.black);
    drawText(ctx, scene.card?.label || 'UP NEXT', 24, 44, { color: P.yellow, scale: 2, shadow: P.black });
    if (next) {
      const tx = Math.round(W + 20 - easeOut((dt - 0.2) / 0.6) * (W - 4));
      drawText(ctx, next.title, tx, 74, { color: P.white, scale: 4, shadow: P.black });
      drawText(ctx, next.tagline || '', tx + 2, 112, { color: P.white, shadow: P.black });
      if (dt > 0.9) {
        const names = (next.presenters || []).map(presenterName).join('  &  ');
        drawText(ctx, names ? `WITH ${names}` : '', 24, 150, { color: P.cream, shadow: P.black });
      }
    }
    if (dt > 1.2) drawText(ctx, scene.card?.footer || 'AFTER THE BREAK', 24, 168, { color: P.fog });
    const lw = measureLogo({ variant: 'bug' }).w;
    drawLogo(ctx, W - lw - 10, H - 24, { variant: 'bug', t });
  }

  drawOverlays(t, scene) {
    const mode = OVERLAYS[scene.shot];
    if (!mode) return;
    const ctx = this.ctx;

    if (mode === 'ad') {
      r(ctx, 6, 6, measureText('ADVERTISEMENT') + 8, 11, P.black);
      drawText(ctx, 'ADVERTISEMENT', 10, 8, { color: P.fog });
      return;
    }

    // Logo bug + LIVE / REPLAY + programme name
    const bug = drawLogo(ctx, 6, 6, { variant: 'bug', t });
    let x = 6 + bug.w + 2;
    const live = scene.replay ? 'REPLAY' : 'LIVE';
    const lw = measureText(live) + (scene.replay ? 8 : 14);
    r(ctx, x, 6, lw, 13, scene.replay ? P.yellow : P.black);
    if (!scene.replay && Math.floor(t * 1.5) % 2 === 0) r(ctx, x + 4, 10, 4, 4, P.red);
    drawText(ctx, live, x + (scene.replay ? 4 : 10), 9, { color: scene.replay ? P.black : P.white });
    x += lw;
    if (scene.program && mode === 'news') {
      const pw = measureText(scene.program.title) + 8;
      r(ctx, x, 6, pw, 13, THEME_ACCENT[scene.program.theme] || P.red);
      drawText(ctx, scene.program.title, x + 4, 9, { color: scene.program.theme === 'flash' ? P.black : P.white });
    }

    // World clocks, rotating
    const [city, tz] = CLOCKS[Math.floor(t / 6) % CLOCKS.length];
    const clock = `${city} ${zoneTime(tz).label}`;
    const cw = measureText(clock) + 10;
    r(ctx, W - cw - 6, 6, cw, 13, P.black);
    r(ctx, W - cw - 6, 18, cw, 1, P.steel);
    drawText(ctx, clock, W - 11, 9, { color: P.white, align: 'right' });

    if (mode === 'bug') return this.drawTicker(t, scene.ticker);

    // Breaking banner
    if (scene.breaking) {
      const bt = t - scene.breaking.since;
      if (bt < 22) {
        const flash = Math.floor(t * 3) % 2 === 0;
        r(ctx, 0, 24, W, 14, flash ? P.red : P.darkRed);
        r(ctx, 0, 24, 64, 14, P.yellow);
        drawText(ctx, 'BREAKING', 6, 28, { color: P.black });
        const text = `${scene.breaking.source.toUpperCase()}: ${scene.breaking.text}`;
        const tw = measureText(text);
        const tx = Math.round(W - ((bt * 40) % (tw + W)));
        ctx.save();
        ctx.beginPath();
        ctx.rect(66, 24, W - 66, 14);
        ctx.clip();
        drawText(ctx, text, tx, 28, { color: P.white });
        ctx.restore();
      }
    }

    // Lower third
    let subtitleBottom = 198;
    const lt = scene.lowerThird;
    if (lt) {
      const dt = t - lt.since;
      const off = Math.round((1 - easeOut(dt / 0.35)) * -W);
      const accent = lt.breaking ? P.red : THEME_ACCENT[scene.program?.theme] || P.blue;
      const tag = lt.breaking ? 'BREAKING' : lt.source.toUpperCase();
      const tagW = measureText(tag) + 10;
      const nameW = measureText(lt.anchorName) + 10;
      r(ctx, 12 + off, 166, tagW, 12, lt.breaking ? P.red : P.navy);
      drawText(ctx, tag, 17 + off, 169, { color: lt.breaking && Math.floor(t * 3) % 2 ? P.yellow : P.white });
      r(ctx, 12 + tagW + off, 166, nameW, 12, P.black);
      drawText(ctx, lt.anchorName, 17 + tagW + off, 169, { color: P.silver });
      r(ctx, 12 + off, 178, W - 24, 17, P.white);
      r(ctx, 12 + off, 178, 3, 17, accent);
      r(ctx, 12 + off, 195, W - 24, 2, P.fog);
      drawText(ctx, lt.headline, 20 + off, 183, { color: P.black });
      subtitleBottom = 162;
    }

    // Subtitles
    if (scene.subtitles && scene.subtitle) {
      const lines = wrapText(scene.subtitle, W - 48).slice(-2);
      const lh = LINE_HEIGHT - 1;
      const boxH = lines.length * lh + 6;
      const y0 = subtitleBottom - boxH;
      const maxW = Math.max(...lines.map((l) => measureText(l)));
      ctx.fillStyle = 'rgba(24,20,37,0.78)';
      ctx.fillRect(Math.floor(W / 2 - maxW / 2 - 6), y0, maxW + 12, boxH);
      lines.forEach((line, i) => drawText(ctx, line, W / 2, y0 + 5 + i * lh, { color: P.cream, align: 'center' }));
    }

    this.drawTicker(t, scene.ticker);
  }

  drawTicker(t, items) {
    const ctx = this.ctx;
    const y = 202;
    r(ctx, 0, y, W, 14, P.ink);
    r(ctx, 0, y, W, 1, P.blue);
    if (items?.length) {
      const gap = 18;
      const widths = items.map((it) => measureText(`${it.source} ▸ ${it.text}`) + gap);
      const total = widths.reduce((a, b) => a + b, 0);
      let x = 52 - ((t * 32) % total);
      ctx.save();
      ctx.beginPath();
      ctx.rect(50, y, W - 50, 14);
      ctx.clip();
      for (let pass = 0; pass < 2 && x < W; pass++) {
        items.forEach((it, i) => {
          if (x + widths[i] > 50 && x < W) {
            const sw = drawText(ctx, `${it.source} ▸`, x, y + 4, { color: P.yellow });
            drawText(ctx, it.text, x + sw + 4, y + 4, { color: P.white });
            r(ctx, x + widths[i] - gap / 2 - 1, y + 6, 2, 2, P.red);
          }
          x += widths[i];
        });
      }
      ctx.restore();
    }
    r(ctx, 0, y, 48, 14, P.yellow);
    r(ctx, 48, y, 2, 14, P.orange);
    drawText(ctx, 'LATEST', 6, y + 4, { color: P.black });
  }

  render(t, scene) {
    this.drawShot(t, scene);
    this.drawOverlays(t, scene);
    if (scene.stinger) {
      const p = (t - scene.stinger.start) / cards.STINGER_DURATION;
      if (p >= 1) scene.stinger = null;
      else if (p > 0) cards.drawStinger(this.ctx, t, p, { channel: scene.channel.name });
    }
  }
}
