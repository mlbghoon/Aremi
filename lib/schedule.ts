import { Place } from "./types";

export interface SchedStop {
  arriveMin: number; // 도착 (분/일)
  departMin: number; // 출발 (분/일)
  fixedStartMin?: number;
  fixedEndMin?: number;
  /** >0이면 고정 약속에 그만큼 지각 */
  lateMin: number;
}

export interface Schedule {
  stops: SchedStop[];
  /** 고정 일정이 하나라도 있어 절대 시각 기준이 잡혔는지 (없으면 '지금 출발' 기준) */
  hasReference: boolean;
  worstLateMin: number;
}

/** 유동 일정에 머무는 기본 시간(분) — 가정값 */
const FLEX_DWELL = 30;

function toMin(t?: string): number | undefined {
  if (!t) return undefined;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h * 60 + m;
}

export function minToHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

/**
 * 실제 구간 이동시간으로 하루 시간표를 만든다.
 *  - 고정 일정은 그 시각에 맞춰 절대 시각의 기준(앵커)이 된다.
 *  - 각 장소의 도착/출발 시각을 계산하고, 고정 약속에 늦으면 lateMin으로 표시한다.
 *
 * @param travelMin travelMin[i] = (i-1 → i) 이동 분. travelMin[0]은 무시.
 * @param nowMin    고정 일정이 없을 때 쓸 '지금' (분/일)
 */
export function buildSchedule(
  route: Place[],
  travelMin: (number | null)[],
  nowMin: number
): Schedule {
  const n = route.length;
  if (n === 0) {
    return { stops: [], hasReference: false, worstLateMin: 0 };
  }

  const dwell = route.map((p) => {
    if (p.kind === "anchor") {
      const s = toMin(p.startTime);
      const e = toMin(p.endTime);
      if (s != null && e != null) return Math.max(0, e - s);
      return 60;
    }
    return FLEX_DWELL;
  });

  // depart[0] = 0 기준의 상대 시각
  const relDepart = new Array(n).fill(0);
  const relArrive = new Array(n).fill(0);
  relArrive[0] = -dwell[0];
  for (let i = 1; i < n; i++) {
    relArrive[i] = relDepart[i - 1] + (travelMin[i] ?? 0);
    relDepart[i] = relArrive[i] + dwell[i];
  }

  // 첫 고정 일정에 맞춰 절대 시각 오프셋을 잡는다. 없으면 '지금' 출발 기준.
  let offset = nowMin;
  let hasReference = false;
  for (let i = 0; i < n; i++) {
    if (route[i].kind === "anchor") {
      const s = toMin(route[i].startTime);
      if (s != null) {
        offset = s - relArrive[i];
        hasReference = true;
        break;
      }
    }
  }

  const stops: SchedStop[] = route.map((p, i) => {
    const arriveMin = relArrive[i] + offset;
    const departMin = relDepart[i] + offset;
    const fixedStartMin = p.kind === "anchor" ? toMin(p.startTime) : undefined;
    const fixedEndMin = p.kind === "anchor" ? toMin(p.endTime) : undefined;
    const lateMin =
      fixedStartMin != null ? Math.max(0, Math.round(arriveMin - fixedStartMin)) : 0;
    return { arriveMin, departMin, fixedStartMin, fixedEndMin, lateMin };
  });

  const worstLateMin = stops.reduce((m, s) => Math.max(m, s.lateMin), 0);
  return { stops, hasReference, worstLateMin };
}
