import { Place } from "./types";
import { haversine, LatLng } from "./geo";

/**
 * 솔로 모드의 핵심: "이 순서로 도는 게 제일 낫다"를 정한다.
 *
 * 규칙
 *  - anchor(시간 고정) 장소는 fixedTime 순서를 절대 어기지 않는다.
 *  - flexible(아무때나) 장소는 그 사이 빈 구간 중 가장 가까운 곳에 끼워 넣는다.
 *
 * 장소 수가 적으므로(보통 3~8개) 직선거리 기반 greedy 삽입 + 2-opt면 충분하다.
 * 실제 도로거리/교통은 나중에 카카오·티맵 API로 정교화한다.
 */
export function optimizeRoute(places: Place[]): Place[] {
  if (places.length <= 1) return [...places];

  const anchors = places
    .filter((p) => p.kind === "anchor")
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const flexible = places.filter((p) => p.kind !== "anchor");

  // anchor를 시간 순서대로 깔고, flexible을 가장 싸게 끼워 넣는다.
  let route: Place[] = [...anchors];
  for (const f of flexible) {
    let bestIdx = route.length;
    let bestCost = Infinity;
    for (let i = 0; i <= route.length; i++) {
      const cost = insertionCost(route, i, f);
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }
    route.splice(bestIdx, 0, f);
  }

  return twoOpt(route);
}

/** route의 i 위치에 p를 끼울 때 늘어나는 거리 */
function insertionCost(route: Place[], i: number, p: LatLng): number {
  const prev = route[i - 1];
  const next = route[i];
  if (!prev && !next) return 0;
  if (!prev) return haversine(p, next);
  if (!next) return haversine(prev, p);
  return haversine(prev, p) + haversine(p, next) - haversine(prev, next);
}

export function routeLength(route: Place[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += haversine(route[i - 1], route[i]);
  }
  return total;
}

/** 각 구간(직전 → 현재) 거리 배열. 첫 stop은 0 */
export function legDistances(route: Place[]): number[] {
  return route.map((p, i) => (i === 0 ? 0 : haversine(route[i - 1], p)));
}

/** anchor들이 fixedTime 오름차순을 유지하는가 */
function anchorsInOrder(route: Place[]): boolean {
  const times = route
    .filter((p) => p.kind === "anchor")
    .map((p) => p.startTime ?? "");
  for (let i = 1; i < times.length; i++) {
    if (times[i] < times[i - 1]) return false;
  }
  return true;
}

/** anchor 순서를 깨지 않는 선에서만 구간을 뒤집어 총거리를 줄인다 */
function twoOpt(initial: Place[]): Place[] {
  let route = initial;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const cand = [
          ...route.slice(0, i),
          ...route.slice(i, j + 1).reverse(),
          ...route.slice(j + 1),
        ];
        if (
          anchorsInOrder(cand) &&
          routeLength(cand) < routeLength(route) - 1e-6
        ) {
          route = cand;
          improved = true;
        }
      }
    }
  }
  return route;
}
