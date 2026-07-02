import { photoStore } from "./photos";
import { Place } from "./types";
import { formatKorean } from "./date";

interface DayCardInput {
  date: string;
  events: Place[]; // 그날 이벤트(순서대로)
  journal?: string;
  mood?: string;
}

function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = url;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const ir = img.width / img.height;
  const dr = dw / dh;
  let sw: number, sh: number, sx: number, sy: number;
  if (ir > dr) {
    sh = img.height;
    sw = sh * dr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / dr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (ch === "\n") {
      lines.push(cur);
      cur = "";
      continue;
    }
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      lines.push(cur);
      cur = ch;
    } else cur += ch;
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length >= maxLines && cur) lines[maxLines - 1] += "…";
  return lines;
}

/** 하루를 요약한 공유 카드 이미지(PNG Blob) 생성 */
export async function buildDayCard(input: DayCardInput): Promise<Blob | null> {
  // 그날 모든 사진 모으기 (최대 4장)
  const urls: string[] = [];
  for (const e of input.events) {
    const metas = await photoStore.list(e.id);
    for (const m of metas) {
      const u = await photoStore.getURL(m.id);
      if (u) urls.push(u);
    }
  }
  const imgs = (await Promise.all(urls.slice(0, 4).map(loadImg))).filter(
    Boolean
  ) as HTMLImageElement[];

  const W = 1080;
  const pad = 56;
  const gap = 16;
  const innerW = W - pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  const ctx = canvas.getContext("2d")!;

  // 측정 (레이아웃 계산용)
  ctx.font = "26px sans-serif";
  const placesText = input.events
    .map((e) => e.title || e.name)
    .filter(Boolean)
    .join("  ·  ");
  const pLines = placesText ? wrap(ctx, placesText, innerW, 2) : [];
  ctx.font = "30px sans-serif";
  const jLines = input.journal?.trim()
    ? wrap(ctx, input.journal.trim(), innerW, 6)
    : [];

  const cols = imgs.length >= 2 ? 2 : 1;
  const cellW = imgs.length ? (innerW - (cols - 1) * gap) / cols : 0;
  const rows = imgs.length ? Math.ceil(imgs.length / cols) : 0;
  const gridH = rows ? rows * cellW + (rows - 1) * gap : 0;

  // 높이 계산
  let y = pad;
  const titleH = 54;
  y += titleH; // title
  if (pLines.length) y += 12 + pLines.length * 34;
  if (gridH) y += 24 + gridH;
  if (jLines.length) y += 26 + jLines.length * 44;
  y += 28 + 30; // footer
  const H = y + pad;

  canvas.height = H;

  // 배경
  ctx.fillStyle = "#12151d";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#7c6cff";
  ctx.fillRect(0, 0, 8, H); // 좌측 액센트 바

  // 그리기
  let cy = pad;
  ctx.textBaseline = "top";
  // 제목 + 기분
  ctx.fillStyle = "#e9ebf1";
  ctx.font = "700 44px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(formatKorean(input.date), pad, cy);
  if (input.mood) {
    ctx.textAlign = "right";
    ctx.font = "44px sans-serif";
    ctx.fillText(input.mood, W - pad, cy);
    ctx.textAlign = "left";
  }
  cy += titleH;

  // 장소
  if (pLines.length) {
    cy += 12;
    ctx.fillStyle = "#969bab";
    ctx.font = "26px sans-serif";
    for (const line of pLines) {
      ctx.fillText(line, pad, cy);
      cy += 34;
    }
  }

  // 사진 그리드
  if (gridH) {
    cy += 24;
    imgs.forEach((img, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const dx = pad + c * (cellW + gap);
      const dy = cy + r * (cellW + gap);
      ctx.save();
      ctx.beginPath();
      const rr = 18;
      // 둥근 모서리 클립
      ctx.moveTo(dx + rr, dy);
      ctx.arcTo(dx + cellW, dy, dx + cellW, dy + cellW, rr);
      ctx.arcTo(dx + cellW, dy + cellW, dx, dy + cellW, rr);
      ctx.arcTo(dx, dy + cellW, dx, dy, rr);
      ctx.arcTo(dx, dy, dx + cellW, dy, rr);
      ctx.closePath();
      ctx.clip();
      drawCover(ctx, img, dx, dy, cellW, cellW);
      ctx.restore();
    });
    cy += gridH;
  }

  // 일기
  if (jLines.length) {
    cy += 26;
    ctx.fillStyle = "#e9ebf1";
    ctx.font = "30px sans-serif";
    for (const line of jLines) {
      ctx.fillText(line, pad, cy);
      cy += 44;
    }
  }

  // 푸터
  cy += 28;
  ctx.fillStyle = "#626878";
  ctx.font = "24px sans-serif";
  ctx.fillText("Aremi · 동선 다이어리", pad, cy);

  urls.forEach((u) => URL.revokeObjectURL(u));

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
}
