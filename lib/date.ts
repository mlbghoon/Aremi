export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Date → "YYYY-MM-DD" (로컬 기준) */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

/** "YYYY-MM-DD" → 로컬 Date (자정) */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function addMonths(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setMonth(d.getMonth() + n);
  return toDateStr(d);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayOf(dateStr: string): number {
  return parseDate(dateStr).getDay();
}

/** "2026-07-03" → "7월 3일 (목)" */
export function formatKorean(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[weekdayOf(dateStr)]})`;
}

/** "2026년 7월" */
export function monthTitle(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  return `${y}년 ${m}월`;
}

/** 그 주의 일요일 날짜 */
export function startOfWeek(dateStr: string): string {
  return addDays(dateStr, -weekdayOf(dateStr));
}

/** 그 주 일~토 7일 */
export function weekDates(dateStr: string): string[] {
  const sun = startOfWeek(dateStr);
  return Array.from({ length: 7 }, (_, i) => addDays(sun, i));
}

export interface Cell {
  dateStr: string;
  day: number;
  inMonth: boolean;
}

/** 해당 월의 6주(42칸) 달력 격자(일요일 시작) */
export function monthMatrix(dateStr: string): Cell[] {
  const [y, m] = dateStr.split("-").map(Number);
  const month0 = m - 1;
  const first = new Date(y, month0, 1);
  const startDow = first.getDay();
  const cells: Cell[] = [];
  let cur = new Date(y, month0, 1 - startDow);
  for (let i = 0; i < 42; i++) {
    cells.push({
      dateStr: toDateStr(cur),
      day: cur.getDate(),
      inMonth: cur.getMonth() === month0,
    });
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return cells;
}

export const WEEKDAY_LABELS = WEEKDAYS;

/** a와 b(YYYY-MM-DD) 사이 일수 차이 (a - b) */
export function daysBetween(a: string, b: string): number {
  const ms = parseDate(a).getTime() - parseDate(b).getTime();
  return Math.round(ms / 86400000);
}

/** "오늘 / 어제 / N일 전 / M/D" 상대 표기 (기준일 today) */
export function relativeLabel(dateStr: string, today: string): string {
  const d = daysBetween(today, dateStr); // 과거면 양수
  if (d === 0) return "오늘";
  if (d === 1) return "어제";
  if (d > 1 && d < 7) return `${d}일 전`;
  if (d === 7) return "1주 전";
  if (d >= 14 && d < 60 && d % 7 === 0) return `${d / 7}주 전`;
  const [, m, day] = dateStr.split("-").map(Number);
  return `${m}/${day}`;
}

/** 같은 월·일인데 연도가 과거면 "작년 오늘 / N년 전 오늘" */
export function onThisDay(dateStr: string, today: string): string | null {
  const [y1, m1, d1] = dateStr.split("-").map(Number);
  const [y0, m0, d0] = today.split("-").map(Number);
  if (m1 === m0 && d1 === d0 && y1 < y0) {
    const diff = y0 - y1;
    return diff === 1 ? "작년 오늘" : `${diff}년 전 오늘`;
  }
  return null;
}

// ── 시간대 격자(주/일 뷰) ──
export const GRID_START_HOUR = 6; // 06:00부터
export const GRID_END_HOUR = 24; // 24:00까지
export const HOUR_PX = 44;

export function hmToMin(t?: string): number | undefined {
  if (!t) return undefined;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h * 60 + m;
}

/** 분(자정 기준) → 격자 위쪽 px */
export function minToTop(min: number): number {
  const clamped = Math.max(GRID_START_HOUR * 60, Math.min(GRID_END_HOUR * 60, min));
  return ((clamped - GRID_START_HOUR * 60) / 60) * HOUR_PX;
}
