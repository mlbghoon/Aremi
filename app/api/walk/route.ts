import { NextRequest, NextResponse } from "next/server";
import { haversine, roughWalkMinutes } from "@/lib/geo";
import { readPoints } from "@/lib/reqPoints";

/**
 * TMap 보행자 경로 API로 실제 도보 경로(인도 기준)를 받아온다.
 * TMap은 출발→도착 한 쌍씩 받으므로 구간(leg)마다 호출하고, 좌표를 이어 붙인다.
 *
 * 요청:  POST { points: [{lat,lng}, ...] }
 * 응답:  { path: [{lat,lng}...], legs: [{distanceM, durationMin}, ...] }
 *        TMAP_APP_KEY 없거나 실패한 구간은 직선 추정으로 폴백.
 */
export async function POST(req: NextRequest) {
  const key = process.env.TMAP_APP_KEY;
  if (!key) {
    return NextResponse.json(
      { path: [], legs: [], error: "TMAP_APP_KEY 미설정" },
      { status: 200 }
    );
  }

  const parsed = await readPoints(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { path: [], legs: [], error: parsed.error },
      { status: 200 }
    );
  }
  const points = parsed.points;

  if (points.length < 2) {
    return NextResponse.json({ path: [], legs: [] }, { status: 200 });
  }

  const path: { lat: number; lng: number }[] = [];
  const legs: { distanceM: number; durationMin: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const leg = await oneLeg(key, points[i - 1], points[i]);
    legs.push({ distanceM: leg.distanceM, durationMin: leg.durationMin });
    for (const pt of leg.path) path.push(pt);
  }

  return NextResponse.json({ path, legs }, { status: 200 });
}

function fallback(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const d = haversine(a, b);
  return { distanceM: d, durationMin: roughWalkMinutes(d), path: [a, b] };
}

async function oneLeg(
  key: string,
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): Promise<{ distanceM: number; durationMin: number; path: { lat: number; lng: number }[] }> {
  try {
    const res = await fetch(
      "https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1",
      {
        method: "POST",
        headers: { appKey: key, "Content-Type": "application/json" },
        body: JSON.stringify({
          startX: a.lng,
          startY: a.lat,
          endX: b.lng,
          endY: b.lat,
          startName: encodeURIComponent("출발"),
          endName: encodeURIComponent("도착"),
          reqCoordType: "WGS84GEO",
          resCoordType: "WGS84GEO",
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return fallback(a, b);

    const data = await res.json();
    const feats: any[] = data?.features ?? [];
    if (!feats.length) return fallback(a, b);

    const path: { lat: number; lng: number }[] = [];
    for (const f of feats) {
      if (f?.geometry?.type === "LineString") {
        for (const c of f.geometry.coordinates) {
          path.push({ lng: c[0], lat: c[1] });
        }
      }
    }
    if (!path.length) return fallback(a, b);

    // 첫 피처(출발점)의 properties에 totalDistance(m), totalTime(s)이 담긴다
    const total = feats[0]?.properties ?? {};
    const distanceM = total.totalDistance ?? 0;
    const durationMin = Math.max(1, Math.round((total.totalTime ?? 0) / 60));
    return { distanceM, durationMin, path };
  } catch {
    return fallback(a, b);
  }
}
