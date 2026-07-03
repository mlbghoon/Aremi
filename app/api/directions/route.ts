import { NextRequest, NextResponse } from "next/server";
import { readPoints } from "@/lib/reqPoints";

/**
 * 카카오모빌리티 "다중 경유지 길찾기"를 호출해 실제 도로 경로를 돌려준다.
 * REST 키는 비밀이라 서버(여기)에서만 호출하고, 브라우저에는 좌표 목록만 보낸다.
 *
 * 요청:  POST { points: [{lat,lng}, ...] }   (방문 순서대로)
 * 응답:  { path: [{lat,lng}, ...] }           (도로를 따라가는 폴리라인)
 *        실패 시 { path: [], error }          → 클라이언트는 직선으로 폴백
 */
export async function POST(req: NextRequest) {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) {
    return NextResponse.json(
      { path: [], error: "KAKAO_REST_KEY 미설정" },
      { status: 200 }
    );
  }

  const parsed = await readPoints(req);
  if (!parsed.ok) {
    return NextResponse.json({ path: [], error: parsed.error }, { status: 200 });
  }
  const points = parsed.points;

  if (points.length < 2) {
    return NextResponse.json({ path: [] }, { status: 200 });
  }

  // 카카오 좌표는 x=경도(lng), y=위도(lat)
  const origin = { x: points[0].lng, y: points[0].lat };
  const destination = {
    x: points[points.length - 1].lng,
    y: points[points.length - 1].lat,
  };
  const waypoints = points.slice(1, -1).map((p) => ({ x: p.lng, y: p.lat }));

  try {
    const res = await fetch(
      "https://apis-navi.kakaomobility.com/v1/waypoints/directions",
      {
        method: "POST",
        headers: {
          Authorization: `KakaoAK ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin,
          destination,
          waypoints,
          priority: "RECOMMEND",
          car_fuel: "GASOLINE",
        }),
        // 응답이 늦으면 직선으로 폴백
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { path: [], error: `카카오 응답 ${res.status}` },
        { status: 200 }
      );
    }

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || route.result_code !== 0) {
      return NextResponse.json(
        { path: [], error: route?.result_msg ?? "경로 없음" },
        { status: 200 }
      );
    }

    // sections[]는 구간(경유지 사이)별 정보. 각 section의 distance/duration으로 leg를 만들고,
    // roads[].vertexes = [x1,y1,x2,y2,...]는 모두 이어 붙여 전체 폴리라인을 만든다.
    const path: { lat: number; lng: number }[] = [];
    const legs: { distanceM: number; durationMin: number }[] = [];
    for (const section of route.sections ?? []) {
      legs.push({
        distanceM: section.distance ?? 0,
        durationMin: Math.max(1, Math.round((section.duration ?? 0) / 60)),
      });
      for (const road of section.roads ?? []) {
        const v: number[] = road.vertexes ?? [];
        for (let i = 0; i + 1 < v.length; i += 2) {
          path.push({ lng: v[i], lat: v[i + 1] });
        }
      }
    }

    return NextResponse.json({ path, legs }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { path: [], error: e?.message ?? "호출 실패" },
      { status: 200 }
    );
  }
}
