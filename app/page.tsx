"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Place, eventColor, type Mode, type Segment } from "@/lib/types";
import { optimizeRoute } from "@/lib/optimize";
import {
  formatDistance,
  haversine,
  roughDriveMinutes,
  roughWalkMinutes,
} from "@/lib/geo";
import {
  formatKorean,
  todayStr,
  toDateStr,
  addDays,
  onThisDay,
  relativeLabel,
} from "@/lib/date";
import { eventsOnDate, eventsOnDateOrdered } from "@/lib/recurrence";
import { buildSchedule, minToHHMM } from "@/lib/schedule";
import { buildDayCard } from "@/lib/dayCard";
import { exportBackupBlob, readBackupFile } from "@/lib/backup";
import { useKakao } from "@/lib/useKakao";
import KakaoMap from "@/components/KakaoMap";
import FallbackMap from "@/components/FallbackMap";
import CalendarView from "@/components/CalendarView";
import EventModal from "@/components/EventModal";
import PlaceSearch from "@/components/PlaceSearch";
import FeedView from "@/components/FeedView";
import PhotoStrip from "@/components/PhotoStrip";
import SharedCourseView from "@/components/SharedCourseView";
import {
  SharedCourse,
  buildCourse,
  courseUrl,
  courseFromHash,
  importCourse,
} from "@/lib/shareCourse";

interface Step {
  kind: "subway" | "bus" | "walk";
  name: string;
  from?: string;
  to?: string;
}
interface LegView {
  mode: Mode;
  distanceM?: number;
  durationMin: number;
  steps?: Step[];
  note?: string;
}
interface RouteInfo {
  segments: Segment[];
  legs: (LegView | null)[];
  dashed: boolean;
}

type View = "plan" | "map" | "feed";

const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: "car", icon: "🚗", label: "자동차" },
  { id: "transit", icon: "🚇", label: "대중교통" },
  { id: "walk", icon: "🚶", label: "도보" },
];

const ENDPOINT: Record<Mode, string> = {
  car: "/api/directions",
  transit: "/api/transit",
  walk: "/api/walk",
};

const STORE_KEY = "aremi.plan.v1";
const ORIGIN_ID = "__origin__";
const RETURN_ID = "__origin_return__";
const MOODS = ["😀", "🙂", "😐", "😔", "😢", "🥳", "😴", "🥰"];

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `ev-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** 수동 순서(order)가 있으면 그대로, 없으면 자동 최적화 */
function orderRoute(places: Place[]): Place[] {
  if (places.some((p) => p.order != null)) {
    return [...places].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  }
  return optimizeRoute(places);
}

function plusHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(24 * 60 - 1, h * 60 + m + 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(
    t % 60
  ).padStart(2, "0")}`;
}

export default function Home() {
  const kakaoStatus = useKakao();
  const kakaoReady = kakaoStatus === "ready";

  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>("plan");
  const [mapMode, setMapMode] = useState<"route" | "diary">("route");
  const [events, setEvents] = useState<Place[]>([]);
  const [modeByStop, setModeByStop] = useState<Record<string, Mode>>({});
  const [journals, setJournals] = useState<Record<string, string>>({});
  const [moods, setMoods] = useState<Record<string, string>>({});
  const [dones, setDones] = useState<Record<string, boolean>>({}); // key: `${id}|${date}`
  const [orderByKey, setOrderByKey] = useState<Record<string, number>>({}); // 수동 순서, key: `${id}|${date}`
  const [mapDate, setMapDate] = useState("");
  const [modal, setModal] = useState<{ ev: Place; isNew: boolean } | null>(null);
  type Loc = { name: string; lat: number; lng: number };
  const [startPlace, setStartPlace] = useState<Loc | null>(null); // 기본(매일) 출발지
  const [startByDate, setStartByDate] = useState<Record<string, Loc>>({}); // 날짜별 출발지
  const [homeOpen, setHomeOpen] = useState(false);
  const [homeScope, setHomeScope] = useState<"day" | "default">("default");
  const [sharedCourse, setSharedCourse] = useState<SharedCourse | null>(null); // 링크로 받은 코스
  const dragIdRef = useRef<string | null>(null);

  // 불러오기 (+ 옛 형식 마이그레이션)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.events)) {
          setEvents(d.events);
        } else if (d.outings) {
          const flat: Place[] = [];
          for (const [date, list] of Object.entries(d.outings)) {
            for (const p of list as any[]) {
              flat.push({
                ...p,
                date,
                title: p.title ?? p.name,
                startTime: p.startTime ?? p.fixedTime,
              });
            }
          }
          setEvents(flat);
        }
        setModeByStop(d.modeByStop ?? {});
        setStartPlace(d.startPlace ?? null);
        setStartByDate(d.startByDate ?? {});
        setJournals(d.journals ?? {});
        setMoods(d.moods ?? {});
        // done: 예전 event.done(마스터 공유) → 날짜별 키로 마이그레이션
        const dn: Record<string, boolean> = { ...(d.dones ?? {}) };
        if (Array.isArray(d.events))
          for (const e of d.events)
            if (e.done) dn[`${e.id}|${e.date}`] = true;
        setDones(dn);
        // order: 예전 event.order(마스터 공유) → 날짜별 키로 마이그레이션
        const ob: Record<string, number> = { ...(d.orderByKey ?? {}) };
        if (Array.isArray(d.events))
          for (const e of d.events)
            if (e.order != null) ob[`${e.id}|${e.date}`] = e.order;
        setOrderByKey(ob);
      }
    } catch {
      /* 무시 */
    }
    // 링크로 받은 코스가 있으면 읽기 전용 뷰로 연다 (#course=…)
    const shared = courseFromHash(window.location.hash);
    if (shared) setSharedCourse(shared);
    setMapDate(todayStr());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          events,
          modeByStop,
          startPlace,
          startByDate,
          journals,
          moods,
          dones,
          orderByKey,
        })
      );
    } catch {
      // 용량 초과(QuotaExceededError) 등 — 저장 실패해도 앱은 계속 동작
    }
  }, [
    events,
    modeByStop,
    startPlace,
    startByDate,
    journals,
    moods,
    dones,
    orderByKey,
    mounted,
  ]);

  // 그 날짜의 출발지: 날짜별 지정 > 기본(매일) > 없음
  const originFor = (date: string): Loc | null =>
    startByDate[date] ?? startPlace ?? null;

  // 오늘의 동선에 실제 이동시간을 반영한 시간표(출발 알림용). 백그라운드 계산.
  const [todaySched, setTodaySched] = useState<{
    route: Place[];
    stops: ReturnType<typeof buildSchedule>["stops"];
  } | null>(null);

  useEffect(() => {
    if (!mounted) return;
    const today = todayStr();
    const base = orderRoute(eventsOnDate(events, today));
    const o = originFor(today);
    const origin: Place | null = o
      ? {
          id: ORIGIN_ID,
          date: today,
          title: "출발",
          name: o.name,
          lat: o.lat,
          lng: o.lng,
          kind: "flexible",
        }
      : null;
    const tRoute = origin ? [origin, ...base] : base;
    const hasAlarm = base.some((e) => e.departAlarm != null);
    if (!hasAlarm || tRoute.length < 2) {
      setTodaySched(null);
      return;
    }
    let canceled = false;
    Promise.all(
      tRoute
        .slice(1)
        .map((dest, idx) => fetchLeg(tRoute[idx], dest, modeOf(dest.id)))
    ).then((results) => {
      if (canceled) return;
      const travel = tRoute.map((_, i) =>
        i === 0 ? null : results[i - 1].leg.durationMin
      );
      const now = new Date();
      const sched = buildSchedule(
        tRoute,
        travel,
        now.getHours() * 60 + now.getMinutes()
      );
      setTodaySched({ route: tRoute, stops: sched.stops });
    });
    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, modeByStop, startPlace, startByDate, mounted]);

  // 출발 알림: 직전 일정에서 이 일정까지 걸리는 시간을 반영해 '출발 시각'에 알림
  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined")
      return;
    const tick = () => {
      if (Notification.permission !== "granted" || !todaySched) return;
      const now = new Date();
      const today = toDateStr(now);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const { route, stops } = todaySched;
      for (let i = 1; i < route.length; i++) {
        const ev = route[i];
        if (ev.departAlarm == null) continue;
        const departMin = stops[i - 1]?.departMin;
        if (departMin == null) continue;
        const alertAt = departMin - ev.departAlarm;
        const key = `${ev.id}@${today}@${Math.round(alertAt)}`;
        if (
          nowMin >= alertAt &&
          nowMin < alertAt + 1 &&
          !firedRef.current.has(key)
        ) {
          firedRef.current.add(key);
          try {
            new Notification(`🚦 지금 출발 — ${ev.title || ev.name}`, {
              body: `${route[i - 1].title || route[i - 1].name}에서 출발 · ${
                ev.startTime ?? ""
              } 약속 (${minToHHMM(stops[i].arriveMin)} 도착 예정)`,
            });
          } catch {
            /* 무시 */
          }
        }
      }
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [todaySched]);

  const dayPlaces = useMemo(
    () => eventsOnDateOrdered(events, mapDate, orderByKey),
    [events, mapDate, orderByKey]
  );
  // 장소가 있는 일정만 동선/지도에 (장소 없는 일정은 기록에만)
  const placed = useMemo(
    () => dayPlaces.filter((p) => p.lat !== 0 || p.lng !== 0),
    [dayPlaces]
  );
  const route = useMemo(() => orderRoute(placed), [placed]);
  const manualOrder = placed.some((p) => p.order != null);
  // 기록(다이어리)엔 장소 없는 일정도 포함 (시간/순서로 정렬)
  const diaryItems = useMemo(
    () =>
      [...dayPlaces].sort((a, b) => {
        const ao = a.order ?? 1e9;
        const bo = b.order ?? 1e9;
        if (ao !== bo) return ao - bo;
        return (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99");
      }),
    [dayPlaces]
  );

  // 출발지(집)를 넣으면 그 날 경로의 시작점이 되어 첫 일정도 출발/도착 시각이 계산된다.
  const origin = originFor(mapDate);
  const fullRoute = useMemo<Place[]>(() => {
    if (route.length === 0 || !origin) return route;
    const home = (id: string, title: string): Place => ({
      id,
      date: mapDate,
      title,
      name: origin.name,
      lat: origin.lat,
      lng: origin.lng,
      kind: "flexible",
    });
    // 집 출발 → … → 집 귀가 (왕복)
    return [home(ORIGIN_ID, "출발"), ...route, home(RETURN_ID, "귀가")];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, origin?.lat, origin?.lng, mapDate]);

  const [info, setInfo] = useState<RouteInfo>({
    segments: [],
    legs: [],
    dashed: false,
  });

  const modeOf = (id: string): Mode => modeByStop[id] ?? "car";

  useEffect(() => {
    if (view !== "map") return;
    let canceled = false;

    if (fullRoute.length === 0) {
      setInfo({ segments: [], legs: [], dashed: false });
      return;
    }

    const straightSegs: Segment[] = fullRoute.slice(1).map((dest, idx) => ({
      path: [
        { lat: fullRoute[idx].lat, lng: fullRoute[idx].lng },
        { lat: dest.lat, lng: dest.lng },
      ],
      mode: modeOf(dest.id),
    }));
    setInfo((prev) => ({
      segments: straightSegs,
      legs:
        prev.legs.length === fullRoute.length
          ? prev.legs
          : fullRoute.map(() => null),
      dashed: true,
    }));

    Promise.all(
      fullRoute
        .slice(1)
        .map((dest, idx) => fetchLeg(fullRoute[idx], dest, modeOf(dest.id)))
    ).then((results) => {
      if (canceled) return;
      setInfo({
        segments: results.map((r) => r.segment),
        legs: [null, ...results.map((r) => r.leg)],
        dashed: false,
      });
    });

    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullRoute, modeByStop, view]);

  const totalMin = info.legs.reduce((s, l) => s + (l?.durationMin ?? 0), 0);
  const totalDist = info.legs.reduce((s, l) => s + (l?.distanceM ?? 0), 0);

  const schedule = useMemo(() => {
    if (view !== "map" || fullRoute.length === 0) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const travel = fullRoute.map((_, i) => info.legs[i]?.durationMin ?? null);
    return buildSchedule(fullRoute, travel, nowMin);
  }, [view, fullRoute, info.legs]);

  // 홈 회상 카드: 작년/과거 같은 날 > 1주 전 (기록 있는 날 중)
  const recallDay = useMemo(() => {
    const t = todayStr();
    const past = new Set<string>();
    for (const e of events) if (e.date < t) past.add(e.date);
    for (const d of Object.keys(journals))
      if (journals[d]?.trim() && d < t) past.add(d);
    for (const d of past) if (onThisDay(d, t)) return d;
    const wk = addDays(t, -7);
    return past.has(wk) ? wk : null;
  }, [events, journals]);

  // ── 이벤트 CRUD ──
  function openCreate(date: string, startTime?: string) {
    const ev: Place = startTime
      ? {
          id: uid(),
          date,
          title: "",
          name: "",
          lat: 0,
          lng: 0,
          kind: "anchor",
          startTime,
          endTime: plusHour(startTime),
        }
      : {
          id: uid(),
          date,
          title: "",
          name: "",
          lat: 0,
          lng: 0,
          kind: "flexible",
        };
    setModal({ ev, isNew: true });
  }

  function saveEvent(ev: Place) {
    setEvents((prev) => {
      const exists = prev.some((e) => e.id === ev.id);
      return exists ? prev.map((e) => (e.id === ev.id ? ev : e)) : [...prev, ev];
    });
  }

  function deleteEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  function setStopMode(id: string, m: Mode) {
    setModeByStop((prev) => ({ ...prev, [id]: m }));
  }

  async function exportBackup() {
    const plan = {
      events,
      modeByStop,
      startPlace,
      startByDate,
      journals,
      moods,
      dones,
    };
    const blob = await exportBackupBlob(plan);
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `aremi-backup-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  async function importBackup(file: File) {
    if (!window.confirm("가져오면 현재 데이터를 덮어써요. 계속할까요?")) return;
    try {
      const plan = await readBackupFile(file);
      setEvents(plan.events ?? []);
      setModeByStop(plan.modeByStop ?? {});
      setStartPlace(plan.startPlace ?? null);
      setStartByDate(plan.startByDate ?? {});
      setJournals(plan.journals ?? {});
      setMoods(plan.moods ?? {});
      setDones(plan.dones ?? {});
      alert("가져오기 완료!");
    } catch (e: any) {
      alert(`가져오기 실패: ${e?.message ?? "파일을 확인해주세요."}`);
    }
  }

  // 그 날의 방문 순서를 orderByKey(`${id}|${date}`)에 통째로 다시 쓴다.
  // 이벤트 객체가 아니라 날짜별 키에 저장하므로 반복 일정도 회차마다 순서가 따로 남는다.
  function writeOrder(date: string, ordered: Place[]) {
    setOrderByKey((prev) => {
      const next = { ...prev };
      ordered.forEach((e, i) => {
        next[`${e.id}|${date}`] = i;
      });
      return next;
    });
  }
  // 드래그로 순서 바꾸기 → 그 날 수동 순서 부여
  function reorderDay(date: string, draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const ordered = [...route];
    const from = ordered.findIndex((e) => e.id === draggedId);
    const to = ordered.findIndex((e) => e.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    writeOrder(date, ordered);
  }
  function clearOrder(date: string) {
    // 그 날짜(`|${date}`)의 수동 순서만 지운다 → 다시 자동 최적화
    setOrderByKey((prev) => {
      const suffix = `|${date}`;
      const next: Record<string, number> = {};
      for (const k in prev) if (!k.endsWith(suffix)) next[k] = prev[k];
      return next;
    });
  }
  // ▲▼ 로 한 칸 이동 (터치에서도 동작)
  function moveStop(date: string, id: string, dir: -1 | 1) {
    const ordered = [...route];
    const from = ordered.findIndex((e) => e.id === id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    writeOrder(date, ordered);
  }
  function setHome(loc: Loc) {
    if (homeScope === "day")
      setStartByDate((prev) => ({ ...prev, [mapDate]: loc }));
    else setStartPlace(loc);
    setHomeOpen(false);
  }
  function setJournal(date: string, text: string) {
    setJournals((prev) => ({ ...prev, [date]: text }));
  }
  function setMood(date: string, emoji: string) {
    setMoods((prev) => {
      const next = { ...prev };
      if (next[date] === emoji) delete next[date];
      else next[date] = emoji;
      return next;
    });
  }
  function toggleDone(id: string, date: string) {
    const k = `${id}|${date}`;
    setDones((prev) => {
      const n = { ...prev };
      if (n[k]) delete n[k];
      else n[k] = true;
      return n;
    });
  }
  function openDiary(date: string) {
    setMapDate(date);
    setMapMode("diary");
    setView("map");
  }
  async function shareDay() {
    const blob = await buildDayCard({
      date: mapDate,
      events: route,
      journal: journals[mapDate],
      mood: moods[mapDate],
    });
    if (!blob) return;
    const file = new File([blob], "aremi-day.png", { type: "image/png" });
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: formatKorean(mapDate) });
        return;
      } catch {
        return;
      }
    }
    const u = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = u;
    link.download = "aremi-day.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function clearHome() {
    if (homeScope === "day")
      setStartByDate((prev) => {
        const next = { ...prev };
        delete next[mapDate];
        return next;
      });
    else setStartPlace(null);
  }

  // ── 코스 공유 (링크) ──
  async function shareCourseLink() {
    if (route.length === 0) {
      window.alert("공유할 코스가 없어요. 장소가 있는 일정을 먼저 추가하세요.");
      return;
    }
    const course = buildCourse({ date: mapDate, route, modeOf });
    const url = courseUrl(course);
    const nav = navigator as any;
    if (nav.share) {
      try {
        await nav.share({ title: course.title || "동선 코스", url });
      } catch {
        /* 사용자가 취소 */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      window.alert("공유 링크를 복사했어요.");
    } catch {
      window.prompt("이 링크를 복사해 공유하세요", url);
    }
  }

  function clearCourseHash() {
    if (typeof window === "undefined") return;
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search
    );
  }
  // 받은 코스를 내 캘린더에 담는다 (내 출발지 기준으로 이후 재계산됨)
  function importSharedCourse() {
    if (!sharedCourse) return;
    const target =
      sharedCourse.date >= todayStr() ? sharedCourse.date : todayStr();
    const { events: evs, modeByStop: modes, orderByKey: ord } = importCourse(
      sharedCourse,
      target,
      uid
    );
    setEvents((prev) => [...prev, ...evs]);
    setModeByStop((prev) => ({ ...prev, ...modes }));
    setOrderByKey((prev) => ({ ...prev, ...ord }));
    clearCourseHash();
    setSharedCourse(null);
    setMapDate(target);
    setView("plan");
    window.alert(
      `코스를 ${formatKorean(target)}에 담았어요. 출발지·이동시간은 내 기준으로 다시 계산돼요.`
    );
  }
  function closeSharedCourse() {
    clearCourseHash();
    setSharedCourse(null);
  }

  if (!mounted) {
    return <main className="cal-screen" />;
  }

  // 링크로 받은 코스: 읽기 전용 뷰
  if (sharedCourse) {
    return (
      <SharedCourseView
        course={sharedCourse}
        onImport={importSharedCourse}
        onClose={closeSharedCourse}
      />
    );
  }

  // ================= 동선(MAP) 화면 =================
  if (view === "map") {
    const hasOrigin = fullRoute[0]?.id === ORIGIN_ID;
    return (
      <main className="route-screen">
        <div className="route-topbar">
          <button className="icon-back" onClick={() => setView("plan")} aria-label="뒤로">
            ←
          </button>
          <div className="route-topbar-info">
            <div className="topbar-date">{formatKorean(mapDate)}</div>
            <div className="topbar-sum">
              {route.length}곳 · 이동 약 {totalMin}분
              {totalDist > 0 && <> · {formatDistance(totalDist)}</>}
            </div>
            {hasOrigin && schedule && schedule.stops.length > 1 && (
              <div className="topbar-span">
                🏠 {minToHHMM(schedule.stops[0].departMin)} 출발 ~{" "}
                {minToHHMM(
                  schedule.stops[schedule.stops.length - 1].arriveMin
                )}{" "}
                귀가
              </div>
            )}
          </div>
          <button
            className={`home-btn${origin ? " set" : ""}`}
            onClick={() => {
              setHomeScope(startByDate[mapDate] ? "day" : "default");
              setHomeOpen(true);
            }}
            title={origin ? `출발지: ${origin.name}` : "출발지 설정"}
          >
            🏠 {origin ? "출발지" : "설정"}
          </button>
        </div>

        <div className="route-map">
          {kakaoReady ? (
            <KakaoMap
              route={fullRoute}
              segments={info.segments}
              dashed={info.dashed}
            />
          ) : (
            <FallbackMap route={fullRoute} />
          )}
        </div>

        <div className="route-sheet">
          <div className="sheet-toggle">
            <button
              className={mapMode === "route" ? "on" : ""}
              onClick={() => setMapMode("route")}
            >
              🗺 동선
            </button>
            <button
              className={mapMode === "diary" ? "on" : ""}
              onClick={() => setMapMode("diary")}
            >
              📖 기록
            </button>
          </div>

          {mapMode === "diary" ? (
            diaryItems.length === 0 ? (
              <div className="empty-hint">
                <p>이 날 기록이 없어요.</p>
                <p className="dim">일정을 추가하거나 기분·일기를 남겨보세요.</p>
              </div>
            ) : (
              <>
              <div className="mood-row">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    className={moods[mapDate] === m ? "on" : ""}
                    onClick={() => setMood(mapDate, m)}
                    aria-label={`기분 ${m}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <textarea
                className="day-journal"
                value={journals[mapDate] ?? ""}
                onChange={(e) => setJournal(mapDate, e.target.value)}
                placeholder="오늘 하루 어땠나요? (한 줄 기록)"
                rows={2}
              />
              {route.length > 0 && (
                <button className="day-share-btn" onClick={shareDay}>
                  🖼 하루 공유 카드 만들기
                </button>
              )}
              <ol className="stops">
                {diaryItems.map((p, i) => {
                  const done = !!dones[`${p.id}|${mapDate}`];
                  const hasLoc = p.lat !== 0 || p.lng !== 0;
                  const timed = p.kind === "anchor" && p.startTime;
                  return (
                    <li
                      key={p.id}
                      className={`stop${done ? " done" : ""}`}
                      style={{ borderLeft: `3px solid ${eventColor(p)}` }}
                    >
                      <div className="stop-no">{i + 1}</div>
                      <div className="stop-body">
                        <div className="stop-name">{p.title || p.name}</div>
                        {(hasLoc || timed) && (
                          <div className="ev-place">
                            {hasLoc && `📍 ${p.name}`}
                            {hasLoc && timed && " · "}
                            {timed &&
                              `${p.startTime}${p.endTime ? `~${p.endTime}` : ""}`}
                          </div>
                        )}
                        {p.note && <div className="diary-memo">📝 {p.note}</div>}
                        <div className="diary-actions">
                          <button
                            className={`done-check${done ? " on" : ""}`}
                            onClick={() => toggleDone(p.id, mapDate)}
                          >
                            {done ? "✓ 다녀옴" : "다녀옴"}
                          </button>
                        </div>
                        <PhotoStrip eventId={p.id} date={mapDate} />
                      </div>
                    </li>
                  );
                })}
              </ol>
              </>
            )
          ) : route.length === 0 ? (
            <div className="empty-hint">
              <p>이 날은 장소가 있는 일정이 없어요.</p>
            </div>
          ) : (
            <>
              {schedule && schedule.worstLateMin > 0 && (
                <div className="warn-banner">
                  ⚠️ 이동 시간상 빠듯해요 — 최대 {schedule.worstLateMin}분 지각
                  예상.
                </div>
              )}
              {schedule && !schedule.hasReference && (
                <p className="note">
                  고정 일정이 없어 ‘지금 출발’ 기준으로 시각을 계산했어요.
                </p>
              )}
              <div className="order-note">
                {manualOrder ? (
                  <>
                    <span>순서 직접 정함</span>
                    <button onClick={() => clearOrder(mapDate)}>
                      자동 순서로
                    </button>
                  </>
                ) : (
                  <span className="dim">끌어서 순서를 바꿀 수 있어요</span>
                )}
              </div>
              <button className="course-share-btn" onClick={shareCourseLink}>
                🔗 이 코스 공유하기
              </button>
              <ol className="stops">
              {fullRoute.map((p, i) => {
                const leg = info.legs[i];
                const st = schedule?.stops[i];
                const prev = schedule?.stops[i - 1];
                const isOrigin = p.id === ORIGIN_ID || p.id === RETURN_ID;
                const isReturn = p.id === RETURN_ID;
                const evIdx = isOrigin ? -1 : hasOrigin ? i - 1 : i;
                return (
                  <li
                    key={p.id}
                    className={`stop${isOrigin ? "" : " draggable"}`}
                    draggable={!isOrigin}
                    onDragStart={() => {
                      dragIdRef.current = p.id;
                    }}
                    onDragOver={(e) => {
                      if (!isOrigin) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const src = dragIdRef.current;
                      dragIdRef.current = null;
                      if (!isOrigin && src) reorderDay(mapDate, src, p.id);
                    }}
                  >
                    <div className={`stop-no${isOrigin ? " origin" : ""}`}>
                      {isOrigin ? "🏠" : hasOrigin ? i : i + 1}
                    </div>
                    <div className="stop-body">
                      <div className="stop-name">
                        {isReturn ? "귀가" : isOrigin ? "출발" : p.title || p.name}
                      </div>
                      <div className="ev-place">📍 {p.name}</div>

                      {st && isOrigin && (
                        <div className="sched">
                          <span className="sched-arr">
                            {isReturn
                              ? `귀가 ${minToHHMM(st.arriveMin)}`
                              : `출발 ${minToHHMM(st.departMin)}`}
                          </span>
                        </div>
                      )}
                      {st && !isOrigin && (
                        <div className="sched">
                          {p.kind === "anchor" ? (
                            <span
                              className={`sched-fixed${
                                st.lateMin > 0 ? " late" : ""
                              }`}
                            >
                              🕐 {p.startTime}
                              {p.endTime ? `~${p.endTime}` : ""} 약속
                              {st.lateMin > 0 ? (
                                <> · ⚠️ {st.lateMin}분 늦음</>
                              ) : (
                                <> · 도착 {minToHHMM(st.arriveMin)}</>
                              )}
                            </span>
                          ) : (
                            <span className="sched-arr">
                              도착 {minToHHMM(st.arriveMin)} · 출발{" "}
                              {minToHHMM(st.departMin)}
                            </span>
                          )}
                        </div>
                      )}

                      {i > 0 && (
                        <div className="leg">
                          {prev && (
                            <span className="depart-time">
                              🚦 {minToHHMM(prev.departMin)} 출발
                            </span>
                          )}
                          <div className="leg-modes">
                            {MODES.map((m) => (
                              <button
                                key={m.id}
                                className={modeOf(p.id) === m.id ? "on" : ""}
                                onClick={() => setStopMode(p.id, m.id)}
                                title={m.label}
                              >
                                {m.icon}
                              </button>
                            ))}
                          </div>
                          <div className="leg-info">
                            {!leg ? (
                              <span className="dim">경로 계산 중…</span>
                            ) : leg.mode === "transit" ? (
                              leg.steps && leg.steps.length > 0 ? (
                                <span className="transit-steps">
                                  {leg.steps.map((s, k) => (
                                    <span key={k} className={`tchip ${s.kind}`}>
                                      {s.kind === "subway" ? "🚇" : "🚌"}{" "}
                                      {s.name}
                                    </span>
                                  ))}
                                  <span className="leg-min">
                                    {leg.durationMin}분
                                  </span>
                                </span>
                              ) : (
                                <span className="dim">
                                  {leg.note ?? "대중교통 정보 없음"}
                                </span>
                              )
                            ) : (
                              <span>
                                {leg.distanceM != null && (
                                  <>{formatDistance(leg.distanceM)} · </>
                                )}
                                {leg.mode === "walk" ? "걸어서" : "차로"}{" "}
                                {leg.durationMin}분
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {!isOrigin && (
                        <a
                          className="route-link"
                          href={`https://map.kakao.com/link/to/${encodeURIComponent(
                            p.name
                          )},${p.lat},${p.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          길찾기
                        </a>
                      )}
                    </div>
                    {!isOrigin && (
                      <div className="reorder-btns">
                        <button
                          onClick={() => moveStop(mapDate, p.id, -1)}
                          disabled={evIdx <= 0}
                          aria-label="위로"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveStop(mapDate, p.id, 1)}
                          disabled={evIdx >= route.length - 1}
                          aria-label="아래로"
                        >
                          ▼
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
              </ol>
              <footer className="legend">
                <span className="dim">
                  선 색: <i className="dot blue" />
                  자동차 <i className="dot green" />
                  대중교통 <i className="dot orange" />
                  도보
                </span>
              </footer>
            </>
          )}
        </div>

        {homeOpen && (
          <div className="modal-back" onClick={() => setHomeOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h3>출발 위치 (집·회사 등)</h3>
                <button className="modal-x" onClick={() => setHomeOpen(false)}>
                  ✕
                </button>
              </div>
              <p className="dim">
                그날 첫 일정까지 걸리는 시간을 계산해 출발 알림을 줘요.
              </p>
              <div className="pillrow">
                <button
                  className={homeScope === "default" ? "on" : ""}
                  onClick={() => setHomeScope("default")}
                >
                  매일(기본)
                </button>
                <button
                  className={homeScope === "day" ? "on" : ""}
                  onClick={() => setHomeScope("day")}
                >
                  이 날만 · {formatKorean(mapDate)}
                </button>
              </div>
              {(homeScope === "day" ? startByDate[mapDate] : startPlace) && (
                <div className="picked-place">
                  📍{" "}
                  {(homeScope === "day" ? startByDate[mapDate] : startPlace)!.name}
                  <button className="repick" onClick={clearHome}>
                    지우기
                  </button>
                </div>
              )}
              <PlaceSearch
                kakaoReady={kakaoReady}
                onAdd={(r) =>
                  setHome({ name: r.name, lat: r.lat, lng: r.lng })
                }
              />
            </div>
          </div>
        )}
      </main>
    );
  }

  // ================= 돌아보기(FEED) 화면 =================
  if (view === "feed") {
    return (
      <FeedView
        events={events}
        journals={journals}
        moods={moods}
        dones={dones}
        orderByKey={orderByKey}
        onOpen={openDiary}
        onBack={() => setView("plan")}
        onExport={exportBackup}
        onImport={importBackup}
      />
    );
  }

  // ================= 달력(PLAN) 화면 =================
  return (
    <main className="cal-screen">
      <header className="app-bar row">
        <div className="app-bar-title">
          <h1>Aremi (동선)</h1>
          <span className="app-bar-sub">일정 + 지도</span>
        </div>
        <button className="feed-btn" onClick={() => setView("feed")}>
          🕘 돌아보기
        </button>
      </header>

      {recallDay && (
        <button className="recall-home" onClick={() => openDiary(recallDay)}>
          <span className="recall-home-badge">
            🎈 {onThisDay(recallDay, todayStr()) ?? relativeLabel(recallDay, todayStr())}
          </span>
          <span className="recall-home-text">
            {formatKorean(recallDay)}, 그날을 돌아볼까요?
          </span>
        </button>
      )}

      <CalendarView
        events={events}
        onOpenEvent={(ev) =>
          setModal({ ev: events.find((e) => e.id === ev.id) ?? ev, isNew: false })
        }
        onCreate={openCreate}
        onViewRoute={(date) => {
          setMapDate(date);
          setMapMode("route");
          setView("map");
        }}
        onViewDiary={(date) => {
          setMapDate(date);
          setMapMode("diary");
          setView("map");
        }}
      />

      {modal && (
        <EventModal
          initial={modal.ev}
          isNew={modal.isNew}
          kakaoReady={kakaoReady}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}

async function fetchLeg(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number; id: string },
  mode: Mode
): Promise<{ leg: LegView; segment: Segment }> {
  const straight = [
    { lat: origin.lat, lng: origin.lng },
    { lat: dest.lat, lng: dest.lng },
  ];
  try {
    const res = await fetch(ENDPOINT[mode], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: straight }),
    });
    const data = await res.json();

    if (mode === "transit") {
      const l = data.legs?.[0];
      return {
        leg: {
          mode,
          durationMin: l?.durationMin ?? 0,
          steps: l?.steps ?? [],
          note: l?.note ?? (data.error ? "ODsay 키 필요" : undefined),
        },
        segment: { path: l?.path?.length ? l.path : straight, mode },
      };
    }

    const l = data.legs?.[0];
    const dist = l?.distanceM ?? haversine(origin, dest);
    const dur =
      l?.durationMin ??
      (mode === "walk" ? roughWalkMinutes : roughDriveMinutes)(
        haversine(origin, dest)
      );
    const gotReal = data.path?.length && !data.error;
    return {
      leg: {
        mode,
        distanceM: dist,
        durationMin: dur,
        note: data.error ? "직선 추정" : undefined,
      },
      segment: { path: gotReal ? data.path : straight, mode },
    };
  } catch {
    const d = haversine(origin, dest);
    return {
      leg: {
        mode,
        distanceM: d,
        durationMin: (mode === "walk" ? roughWalkMinutes : roughDriveMinutes)(d),
        note: "직선 추정",
      },
      segment: { path: straight, mode },
    };
  }
}
