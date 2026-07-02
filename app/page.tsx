"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Place } from "@/lib/types";
import { optimizeRoute } from "@/lib/optimize";
import {
  formatDistance,
  haversine,
  roughDriveMinutes,
  roughWalkMinutes,
} from "@/lib/geo";
import { formatKorean, todayStr, toDateStr } from "@/lib/date";
import { eventsOnDate } from "@/lib/recurrence";
import { buildSchedule, minToHHMM } from "@/lib/schedule";
import { useKakao } from "@/lib/useKakao";
import KakaoMap from "@/components/KakaoMap";
import FallbackMap from "@/components/FallbackMap";
import CalendarView from "@/components/CalendarView";
import EventModal from "@/components/EventModal";
import PlaceSearch from "@/components/PlaceSearch";

export type Mode = "car" | "transit" | "walk";

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
export interface Segment {
  path: { lat: number; lng: number }[];
  mode: Mode;
}
interface RouteInfo {
  segments: Segment[];
  legs: (LegView | null)[];
  dashed: boolean;
}

type View = "plan" | "map";

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

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `ev-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
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
  const [mapDate, setMapDate] = useState("");
  const [modal, setModal] = useState<{ ev: Place; isNew: boolean } | null>(null);
  const [startPlace, setStartPlace] = useState<{
    name: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [homeOpen, setHomeOpen] = useState(false);

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
      }
    } catch {
      /* 무시 */
    }
    setMapDate(todayStr());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ events, modeByStop, startPlace })
    );
  }, [events, modeByStop, startPlace, mounted]);

  // 오늘의 동선에 실제 이동시간을 반영한 시간표(출발 알림용). 백그라운드 계산.
  const [todaySched, setTodaySched] = useState<{
    route: Place[];
    stops: ReturnType<typeof buildSchedule>["stops"];
  } | null>(null);

  useEffect(() => {
    if (!mounted) return;
    const today = todayStr();
    const base = optimizeRoute(eventsOnDate(events, today));
    const origin: Place | null = startPlace
      ? {
          id: ORIGIN_ID,
          date: today,
          title: "출발",
          name: startPlace.name,
          lat: startPlace.lat,
          lng: startPlace.lng,
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
  }, [events, modeByStop, startPlace, mounted]);

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
    () => eventsOnDate(events, mapDate),
    [events, mapDate]
  );
  const route = useMemo(() => optimizeRoute(dayPlaces), [dayPlaces]);

  // 출발지(집)를 넣으면 그 날 경로의 시작점이 되어 첫 일정도 출발/도착 시각이 계산된다.
  const fullRoute = useMemo<Place[]>(() => {
    if (route.length === 0 || !startPlace) return route;
    return [
      {
        id: ORIGIN_ID,
        date: mapDate,
        title: "출발",
        name: startPlace.name,
        lat: startPlace.lat,
        lng: startPlace.lng,
        kind: "flexible",
      },
      ...route,
    ];
  }, [route, startPlace, mapDate]);

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

  if (!mounted) {
    return <main className="cal-screen" />;
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
          </div>
          <button
            className={`home-btn${startPlace ? " set" : ""}`}
            onClick={() => setHomeOpen(true)}
            title={startPlace ? `출발지: ${startPlace.name}` : "출발지 설정"}
          >
            🏠 {startPlace ? "출발지" : "설정"}
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

          {route.length === 0 ? (
            <div className="empty-hint">
              <p>이 날은 장소가 있는 일정이 없어요.</p>
            </div>
          ) : mapMode === "diary" ? (
            <ol className="stops">
              {fullRoute.map((p, i) => {
                const isOrigin = p.id === ORIGIN_ID;
                return (
                  <li key={p.id} className="stop">
                    <div className={`stop-no${isOrigin ? " origin" : ""}`}>
                      {isOrigin ? "🏠" : hasOrigin ? i : i + 1}
                    </div>
                    <div className="stop-body">
                      <div className="stop-name">
                        {isOrigin ? "출발" : p.title || p.name}
                      </div>
                      <div className="ev-place">
                        📍 {p.name}
                        {!isOrigin && p.kind === "anchor" && p.startTime
                          ? ` · ${p.startTime}${
                              p.endTime ? `~${p.endTime}` : ""
                            }`
                          : ""}
                      </div>
                      {!isOrigin && p.note && (
                        <div className="diary-memo">📝 {p.note}</div>
                      )}
                      {!isOrigin && (
                        <button className="photo-slot" disabled>
                          ＋ 사진 (곧)
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
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
              <ol className="stops">
              {fullRoute.map((p, i) => {
                const leg = info.legs[i];
                const st = schedule?.stops[i];
                const prev = schedule?.stops[i - 1];
                const isOrigin = p.id === ORIGIN_ID;
                return (
                  <li key={p.id} className="stop">
                    <div className={`stop-no${isOrigin ? " origin" : ""}`}>
                      {isOrigin ? "🏠" : hasOrigin ? i : i + 1}
                    </div>
                    <div className="stop-body">
                      <div className="stop-name">
                        {isOrigin ? "출발" : p.title || p.name}
                      </div>
                      <div className="ev-place">📍 {p.name}</div>

                      {st && isOrigin && (
                        <div className="sched">
                          <span className="sched-arr">
                            출발 {minToHHMM(st.departMin)}
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
                여기서 그날 첫 일정까지 걸리는 시간을 계산해, 첫 일정에도 출발
                알림을 줄 수 있어요.
              </p>
              {startPlace && (
                <div className="picked-place">
                  📍 {startPlace.name}
                  <button className="repick" onClick={() => setStartPlace(null)}>
                    지우기
                  </button>
                </div>
              )}
              <PlaceSearch
                kakaoReady={kakaoReady}
                onAdd={(r) => {
                  setStartPlace({ name: r.name, lat: r.lat, lng: r.lng });
                  setHomeOpen(false);
                }}
              />
            </div>
          </div>
        )}
      </main>
    );
  }

  // ================= 달력(PLAN) 화면 =================
  return (
    <main className="cal-screen">
      <header className="app-bar">
        <h1>Aremi Project Demo (동선)</h1>
        <span className="app-bar-sub">일정 + 지도 · 날짜를 골라 계획하세요</span>
      </header>

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
