export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371000; // 지구 반지름 (m)

/** 두 좌표 사이 직선(대권) 거리, 미터. MVP는 도로거리 대신 이걸로 순서를 정한다. */
export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 사람이 읽기 좋은 거리 표기 */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

/** 직선거리 기준 대략적인 차량 이동시간(분). 도심 평균 22km/h 가정 + 우회 보정 1.3배 */
export function roughDriveMinutes(distanceM: number): number {
  const roadM = distanceM * 1.3;
  const speedMPerMin = (22 * 1000) / 60;
  return Math.max(1, Math.round(roadM / speedMPerMin));
}

/** 직선거리 기준 대략적인 도보 시간(분). 보행 4.5km/h + 우회 보정 1.25배 */
export function roughWalkMinutes(distanceM: number): number {
  const roadM = distanceM * 1.25;
  const speedMPerMin = (4.5 * 1000) / 60;
  return Math.max(1, Math.round(roadM / speedMPerMin));
}
