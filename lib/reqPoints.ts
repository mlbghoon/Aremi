/**
 * 경로 API 라우트(directions/transit/walk) 공용: 요청 body의 points를
 * 파싱 + 개수 상한 + 좌표 검증한다.
 *
 * 이 라우트들은 공개·비인증 POST이고 구간(leg)마다 유료 업스트림을 호출한다.
 * 상한이 없으면 좌표를 잔뜩 넣어 유료 호출을 폭주시킬 수 있으므로 여기서 막는다.
 */
export type Pt = { lat: number; lng: number };

/** 하루 방문지는 현실적으로 10곳 이하 — 유료 호출 폭주 방지 상한 */
export const MAX_POINTS = 10;

/** 대략적인 한국(제주~강원, 서해~동해) 범위 밖 좌표는 거른다 */
function inKR(p: any): p is Pt {
  return (
    p != null &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= 33 &&
    p.lat <= 39.5 &&
    p.lng >= 124 &&
    p.lng <= 132
  );
}

/**
 * body에서 points를 읽어 검증한다.
 * - 좌표가 2개 미만: 그릴 구간이 없음 → ok:true, points:[] (에러 아님, 정상 빈 응답)
 * - 좌표가 너무 많거나 형식 오류: ok:false + 에러 메시지
 * 통과 시 lat/lng만 남긴 정규화된 배열을 돌려준다(잉여 필드 제거).
 */
export async function readPoints(
  req: Request
): Promise<{ ok: true; points: Pt[] } | { ok: false; error: string }> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return { ok: false, error: "잘못된 요청" };
  }
  const raw = Array.isArray(body?.points) ? body.points : [];
  if (raw.length > MAX_POINTS) {
    return { ok: false, error: `좌표가 너무 많습니다 (최대 ${MAX_POINTS}곳)` };
  }
  for (const p of raw) {
    if (!inKR(p)) return { ok: false, error: "좌표 형식이 올바르지 않습니다" };
  }
  return { ok: true, points: raw.map((p: Pt) => ({ lat: p.lat, lng: p.lng })) };
}
