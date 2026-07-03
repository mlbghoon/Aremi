import { Place } from "./types";
import { weekdayOf } from "./date";

/** 이벤트가 특정 날짜에 발생하는가 (반복 규칙 적용) */
export function occursOn(ev: Place, dateStr: string): boolean {
  if (dateStr < ev.date) return false; // 시작일 이전
  const rep = ev.repeat ?? "none";
  if (rep === "none") return ev.date === dateStr;
  if (ev.date === dateStr) return true;
  if (rep === "daily") return true;
  if (rep === "weekly") return weekdayOf(ev.date) === weekdayOf(dateStr);
  if (rep === "weekdays") {
    const d = weekdayOf(dateStr);
    return d >= 1 && d <= 5; // 월~금
  }
  return false;
}

/**
 * 그 날짜에 열리는 모든 이벤트(반복 포함)를 돌려준다.
 * 반복 인스턴스는 id는 그대로(원본과 동일)이고 date만 그 날짜로 바뀐다.
 * → 편집/삭제는 id로 원본을 찾아 처리하면 된다.
 */
export function eventsOnDate(events: Place[], dateStr: string): Place[] {
  const out: Place[] = [];
  for (const e of events) {
    if (!occursOn(e, dateStr)) continue;
    out.push(e.date === dateStr ? e : { ...e, date: dateStr });
  }
  return out;
}

/**
 * 그 날짜의 이벤트를 돌려주되, 수동 순서(order)를 날짜별 override 맵에서 해석해 붙인다.
 * order는 이벤트 객체가 아니라 `${id}|${date}` 키 맵(orderByKey)에 저장한다.
 * → 반복 일정이라도 회차(날짜)마다 순서를 따로 가질 수 있다.
 * orderByKey에 없는 이벤트의 order는 undefined(=자동 최적화 대상)로 정규화한다.
 */
export function eventsOnDateOrdered(
  events: Place[],
  dateStr: string,
  orderByKey: Record<string, number>
): Place[] {
  return eventsOnDate(events, dateStr).map((p) => ({
    ...p,
    order: orderByKey[`${p.id}|${dateStr}`],
  }));
}
