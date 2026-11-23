// Draws Wrapped story cards (1080x1920) as receipts on a coloured desk, entirely on the laptop.

export interface CardSpec {
  kicker: string;
  headline: string;
  line: string;
}

export interface CardMeta {
  year: number;
  index: number;
  total: number;
  footer: string;
}

const W = 1080;
const H = 1920;
const DESKS = ["#c8452f", "#2f6f6a", "#e0a526", "#3b3a8f", "#7a3b5c", "#1d1b17"];
const PAPER = "#fbf8f1";
const INK = "#1d1b17";
const SOFT = "#6b6457";
const STAMP = "#b0322a";
const FONT = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

let fontsReady: Promise<unknown> | undefined;
export function loadCardFonts(): Promise<unknown> {
  fontsReady ??= Promise.all([
    document.fonts.load(`400 40px ${FONT}`),
    document.fonts.load(`600 40px ${FONT}`),
    document.fonts.load(`700 40px ${FONT}`),
  ]).catch(() => undefined);
  return fontsReady;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function dashed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.restore();
}

function zigzagPaper(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const tooth = 24;
  ctx.beginPath();
  ctx.moveTo(x, y + tooth / 2);
  for (let i = 0; i < w / tooth; i++) {
    ctx.lineTo(x + i * tooth + tooth / 2, y);
    ctx.lineTo(x + (i + 1) * tooth, y + tooth / 2);
  }
  ctx.lineTo(x + w, y + h - tooth / 2);
  for (let i = Math.floor(w / tooth); i > 0; i--) {
    ctx.lineTo(x + i * tooth - tooth / 2, y + h);
    ctx.lineTo(x + (i - 1) * tooth, y + h - tooth / 2);
  }
  ctx.closePath();
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();
}

function barcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  let s = seed + 7;
  let cx = x;
  ctx.fillStyle = INK;
  while (cx < x + w) {
    s = (s * 9301 + 49297) % 233280;
    const bar = 3 + (s % 4) * 3;
    ctx.fillRect(cx, y, bar, h);
    cx += bar + 4 + (s % 3) * 3;
  }
}

function stamp(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.07);
  ctx.font = `700 30px ${FONT}`;
  const tw = ctx.measureText(text).width;
  ctx.strokeStyle = STAMP;
  ctx.fillStyle = STAMP;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.88;
  ctx.strokeRect(-tw / 2 - 18, -30, tw + 36, 56);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export async function drawCard(spec: CardSpec, meta: CardMeta): Promise<HTMLCanvasElement> {
  await loadCardFonts();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = DESKS[meta.index % DESKS.length];
  ctx.fillRect(0, 0, W, H);

  const px = 110;
  const pw = W - px * 2;
  const py = 170;
  const ph = H - py * 2;
  zigzagPaper(ctx, px, py, pw, ph);

  const left = px + 70;
  const inner = pw - 140;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText("R E C E I P T S", W / 2, py + 130);
  ctx.font = `400 28px ${FONT}`;
  ctx.fillStyle = SOFT;
  ctx.fillText(`MY ${meta.year}, ITEMISED`, W / 2, py + 180);
  dashed(ctx, left, py + 230, inner);

  ctx.textAlign = "left";
  ctx.fillStyle = SOFT;
  ctx.font = `600 34px ${FONT}`;
  ctx.fillText(spec.kicker.toUpperCase(), left, py + 340);

  // Headline: largest size that fits in three lines.
  ctx.fillStyle = INK;
  let size = 150;
  let lines: string[] = [];
  for (; size >= 60; size -= 6) {
    ctx.font = `700 ${size}px ${FONT}`;
    lines = wrap(ctx, spec.headline, inner);
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= inner)) break;
  }
  let y = py + 340 + size * 1.15;
  for (const l of lines.slice(0, 3)) {
    ctx.fillText(l, left, y);
    y += size * 1.08;
  }

  ctx.font = `400 42px ${FONT}`;
  y += 40;
  for (const l of wrap(ctx, spec.line, inner).slice(0, 5)) {
    ctx.fillText(l, left, y);
    y += 58;
  }

  const bottom = py + ph;
  dashed(ctx, left, bottom - 400, inner);
  ctx.font = `400 26px ${FONT}`;
  ctx.fillStyle = SOFT;
  wrap(ctx, meta.footer, inner).slice(0, 2).forEach((l, i) => ctx.fillText(l, left, bottom - 340 + i * 38));
  barcode(ctx, left, bottom - 240, inner, 90, meta.index * 31 + meta.year);
  ctx.textAlign = "center";
  ctx.fillText(`${meta.index + 1} / ${meta.total}`, W / 2, bottom - 100);
  stamp(ctx, "READ ON MY LAPTOP", px + pw - 260, bottom - 470);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not export the card"))), "image/png"),
  );
}

export async function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const url = URL.createObjectURL(await canvasToBlob(canvas));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
