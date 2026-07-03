import { Place, Mode } from "./types";
import { haversine, roughDriveMinutes, roughWalkMinutes } from "./geo";

/**
 * 코스 공유: 그 날의 동선(방문지 목록)을 URL 자체에 담아 링크로 공유한다.
 * 백엔드/계정 없이 동작하도록, 코스를 압축해 링크 해시(#course=…)에 넣는다.
 * 해시는 서버로 전송되지 않으므로 위치 데이터가 서버에 남지 않는다(프라이버시).
 *
 * 받은 사람은 읽기 전용으로 지도·순서·시간표를 보고, "내 캘린더에 담기"로 가져온다.
 */

export interface SharedStop {
  title: string;
  name: string;
  lat: number;
  lng: number;
  kind: "anchor" | "flexible";
  startTime?: string;
  endTime?: string;
  note?: string;
  /** 직전 지점 → 이 지점 이동수단 */
  mode?: Mode;
}

export interface SharedCourse {
  v: 1;
  /** 원본 날짜 (참고용 — 받는 사람은 원하는 날짜에 담는다) */
  date: string;
  /** 코스 이름 (선택) */
  title?: string;
  stops: SharedStop[];
}

const PREFIX = "course=";

// ── UTF-8 안전 base64 (한글 포함) ──
function toB64(s: string): string {
  const bytes = encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
  return btoa(bytes);
}
function fromB64(b: string): string {
  const bytes = atob(b)
    .split("")
    .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return decodeURIComponent(bytes);
}

/** 앱 상태(장소 배열)에서 공유용 코스를 만든다. route는 방문 순서대로 정렬돼 있어야 한다. */
export function buildCourse(args: {
  date: string;
  route: Place[];
  modeOf: (id: string) => Mode;
  title?: string;
}): SharedCourse {
  return {
    v: 1,
    date: args.date,
    title: args.title?.trim() || undefined,
    stops: args.route.map((p) => ({
      title: p.title,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      kind: p.kind,
      startTime: p.startTime,
      endTime: p.endTime,
      note: p.note,
      mode: args.modeOf(p.id),
    })),
  };
}

export function encodeCourse(course: SharedCourse): string {
  return toB64(JSON.stringify(course));
}

export function decodeCourse(code: string): SharedCourse | null {
  try {
    const obj = JSON.parse(fromB64(code));
    if (!obj || obj.v !== 1 || !Array.isArray(obj.stops) || obj.stops.length === 0)
      return null;
    // 좌표 최소 검증
    for (const s of obj.stops) {
      if (!Number.isFinite(s?.lat) || !Number.isFinite(s?.lng)) return null;
    }
    return obj as SharedCourse;
  } catch {
    return null;
  }
}

/** 공유 링크 전체 URL을 만든다 (해시에 코스를 담는다). */
export function courseUrl(course: SharedCourse, base?: string): string {
  const root =
    base ??
    (typeof window !== "undefined"
      ? window.location.origin + window.location.pathname
      : "");
  return `${root}#${PREFIX}${encodeCourse(course)}`;
}

/** 현재 URL 해시에서 코스를 읽는다 (없으면 null). */
export function courseFromHash(hash: string): SharedCourse | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!h.startsWith(PREFIX)) return null;
  return decodeCourse(h.slice(PREFIX.length));
}

/** 이동수단별 대략 이동시간(분) — 받은 코스 뷰의 시간표 추정용(API 호출 없이). */
function roughMinutes(a: SharedStop, b: SharedStop, mode?: Mode): number {
  const d = haversine(a, b);
  if (mode === "walk") return roughWalkMinutes(d);
  if (mode === "transit") return Math.round(roughDriveMinutes(d) * 1.3);
  return roughDriveMinutes(d);
}

/** 받은 코스의 각 구간(직전→현재) 대략 이동시간. travel[0]은 0(첫 지점 앞엔 구간 없음). */
export function roughTravel(course: SharedCourse): number[] {
  return course.stops.map((s, i) =>
    i === 0 ? 0 : roughMinutes(course.stops[i - 1], s, s.mode)
  );
}

/** 받은 코스를 내 캘린더에 담는다: 새 id 부여, 대상 날짜로, 순서·이동수단 보존. */
export function importCourse(
  course: SharedCourse,
  targetDate: string,
  newId: () => string
): {
  events: Place[];
  modeByStop: Record<string, Mode>;
  orderByKey: Record<string, number>;
} {
  const events: Place[] = [];
  const modeByStop: Record<string, Mode> = {};
  const orderByKey: Record<string, number> = {};
  course.stops.forEach((s, i) => {
    const id = newId();
    events.push({
      id,
      date: targetDate,
      title: s.title,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      kind: s.kind,
      startTime: s.startTime,
      endTime: s.endTime,
      note: s.note,
    });
    if (s.mode) modeByStop[id] = s.mode;
    orderByKey[`${id}|${targetDate}`] = i; // 공유자가 정한 순서 보존
  });
  return { events, modeByStop, orderByKey };
}
