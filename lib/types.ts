export type PlaceKind = "anchor" | "flexible";

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
}

export interface Leg {
  distanceM: number;
}
