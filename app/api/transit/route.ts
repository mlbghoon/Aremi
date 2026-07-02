import { NextRequest, NextResponse } from "next/server";
import https from "https";

/**
 * ODsay "대중교통 길찾기"로 각 구간의 지하철/버스 경로를 받아온다.
 * ODsay는 출발→도착 한 쌍만 받으므로 구간(leg)마다 한 번씩 호출한다.
 *
 * ⚠️ ODsay URI(웹) 키는 Referer로 인증한다. 그런데 fetch()는 'Referer'가
 * 금지(forbidden) 헤더라 무시한다. 그래서 여기선 Node https 모듈로 호출해
 * Referer를 실제로 실어 보낸다.
 *
 * 요청:  POST { points: [{lat,lng}, ...] }
 * 응답:  { legs: [{ durationMin, steps:[{kind,name,from,to}], note? }, ...] }
 */
export async function POST(req: NextRequest) {
  const key = process.env.ODSAY_KEY;
  if (!key) {
    return NextResponse.json(
      { legs: [], error: "ODSAY_KEY 미설정" },
      { status: 200 }
    );
  }

  let points: { lat: number; lng: number }[] = [];
  try {
    const body = await req.json();
    points = Array.isArray(body?.points) ? body.points : [];
  } catch {
    return NextResponse.json({ legs: [], error: "잘못된 요청" }, { status: 200 });
  }

  if (points.length < 2) {
    return NextResponse.json({ legs: [] }, { status: 200 });
  }

  // ODsay는 등록된 도메인(기본 localhost:3000)으로 Referer를 검사한다.
  // 개발 포트를 바꿔도 인증이 유지되도록 등록 도메인을 고정으로 보낸다.
  const referer = process.env.ODSAY_REFERER ?? "http://localhost:3000";

  const legs = [];
  for (let i = 1; i < points.length; i++) {
    legs.push(await onePath(key, points[i - 1], points[i], referer));
  }

  return NextResponse.json({ legs }, { status: 200 });
}

interface Step {
  kind: "subway" | "bus" | "walk";
  name: string;
  from?: string;
  to?: string;
}

/** Referer 헤더를 실제로 보내기 위해 https 모듈로 GET (fetch는 Referer를 막는다) */
function getJsonWithReferer(url: string, referer: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const r = https.get(url, { headers: { Referer: referer } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    r.on("error", reject);
    r.setTimeout(8000, () => r.destroy(new Error("timeout")));
  });
}

async function onePath(
  key: string,
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  referer: string
): Promise<{
  durationMin: number;
  steps: Step[];
  path: { lat: number; lng: number }[];
  note?: string;
}> {
  try {
    const url =
      `https://api.odsay.com/v1/api/searchPubTransPathT?apiKey=${encodeURIComponent(
        key
      )}` +
      `&SX=${a.lng}&SY=${a.lat}&EX=${b.lng}&EY=${b.lat}&output=json&lang=0`;
    const d = await getJsonWithReferer(url, referer);

    if (d?.error) {
      return {
        durationMin: 0,
        steps: [],
        path: [a, b],
        note: d.error?.[0]?.message ?? "경로 없음",
      };
    }
    const best = d?.result?.path?.[0];
    if (!best) {
      return { durationMin: 0, steps: [], path: [a, b], note: "대중교통 경로 없음" };
    }

    const steps: Step[] = (best.subPath ?? [])
      .map((sp: any): Step | null => {
        if (sp.trafficType === 1) {
          return {
            kind: "subway",
            name: sp.lane?.[0]?.name ?? "지하철",
            from: sp.startName,
            to: sp.endName,
          };
        }
        if (sp.trafficType === 2) {
          const no = sp.lane?.[0]?.busNo;
          return {
            kind: "bus",
            name: no ? `${no}번` : "버스",
            from: sp.startName,
            to: sp.endName,
          };
        }
        return null; // 도보 구간은 요약에서 생략
      })
      .filter(Boolean) as Step[];

    // loadLane으로 실제 노선 좌표를 받아 폴리라인을 만든다 (직선 대신)
    const path = await loadLanePath(key, best.info?.mapObj, referer, a, b);

    return { durationMin: best.info?.totalTime ?? 0, steps, path };
  } catch {
    return { durationMin: 0, steps: [], path: [a, b], note: "호출 실패" };
  }
}

/** mapObj로 노선 geometry를 받아 [출발, ...노선좌표, 도착] 폴리라인을 만든다 */
async function loadLanePath(
  key: string,
  mapObj: string | undefined,
  referer: string,
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): Promise<{ lat: number; lng: number }[]> {
  if (!mapObj) return [a, b];
  try {
    const url =
      `https://api.odsay.com/v1/api/loadLane?apiKey=${encodeURIComponent(key)}` +
      `&mapObject=${encodeURIComponent("0:0@" + mapObj)}&output=json`;
    const d = await getJsonWithReferer(url, referer);
    const coords: { lat: number; lng: number }[] = [];
    for (const lane of d?.result?.lane ?? []) {
      for (const sec of lane.section ?? []) {
        for (const g of sec.graphPos ?? []) {
          coords.push({ lat: g.y, lng: g.x });
        }
      }
    }
    if (coords.length < 2) return [a, b];
    // 역까지 걷는 짧은 구간은 출발·도착 핀과 직선으로 연결
    return [a, ...coords, b];
  } catch {
    return [a, b];
  }
}
