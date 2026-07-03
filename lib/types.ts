export type PlaceKind = "anchor" | "flexible";

/** 이동수단 */
export type Mode = "car" | "transit" | "walk";

/** 지도에 그릴 구간: 폴리라인 + 이동수단 */
export interface Segment {
  path: { lat: number; lng: number }[];
  mode: Mode;
}

/** 반복 규칙 */
export type RepeatRule = "none" | "daily" | "weekdays" | "weekly";

/** 하나의 일정(event). 장소가 붙어 있어 동선에 들어간다. */
export interface Place {
  id: string;
  /** 이 일정이 속한 날짜 "YYYY-MM-DD" */
  date: string;
  /** 일정명 — 무엇을 하는지 (예: "팀 회식") */
  title: string;
  /** 장소명 — 어디서 (예: "강남 OO고깃집") */
  name: string;
  lat: number;
  lng: number;
  /** 'anchor' = 시간 고정 약속, 'flexible' = 아무때나 들르면 되는 곳 */
  kind: PlaceKind;
  /** anchor일 때 시작 시각 "HH:MM" — 경로 최적화·시간표의 기준 */
  startTime?: string;
  /** anchor일 때 종료 시각 "HH:MM" */
  endTime?: string;
  /** 메모 */
  note?: string;
  /** 반복 규칙 (기본 'none') */
  repeat?: RepeatRule;
  /**
   * 출발 알림. 이 일정까지 가는 데 걸리는 실제 이동시간을 반영해
   * "출발해야 할 시각"에 알림을 준다. 값 = 출발 시각보다 몇 분 앞서 알릴지.
   * 0 = 정확히 출발 시각, undefined = 알림 없음. (직전 일정이 있는 anchor에만 의미)
   */
  departAlarm?: number;
  /** 수동 방문 순서. 설정되면 자동 최적화 대신 이 순서를 쓴다. */
  order?: number;
  /** 다녀옴(방문 완료) 체크 — 다이어리(기록)용 */
  done?: boolean;
  /** 분류 색 (없으면 kind 기본색) */
  color?: string;
}

/** 일정 표시 색 (분류색 우선, 없으면 kind 기본) */
export function eventColor(p: { color?: string; kind: PlaceKind }): string {
  return p.color || (p.kind === "anchor" ? "#7c6cff" : "#5b8cff");
}

/** 배경색 위에 올릴 글자색 (밝으면 검정, 어두우면 흰색) */
export function textOn(hex: string): string {
  const h = hex.replace("#", "");
  const n =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#1a1a1a" : "#ffffff";
}

export interface Leg {
  distanceM: number;
}
