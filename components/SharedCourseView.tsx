"use client";

import { useMemo } from "react";
import { Place, Segment } from "@/lib/types";
import { SharedCourse, roughTravel } from "@/lib/shareCourse";
import { buildSchedule, minToHHMM } from "@/lib/schedule";
import { formatKorean } from "@/lib/date";
import { useKakao } from "@/lib/useKakao";
import KakaoMap from "@/components/KakaoMap";
import FallbackMap from "@/components/FallbackMap";

interface Props {
  course: SharedCourse;
  onImport: () => void;
  onClose: () => void;
}

/**
 * 링크로 받은 코스를 읽기 전용으로 보여준다.
 * 지도 + 방문 순서 + (대략) 시간표. "내 캘린더에 담기"로 가져간다.
 * API 호출 없이 로컬 추정만으로 동작하므로 키가 없어도 열린다.
 */
export default function SharedCourseView({ course, onImport, onClose }: Props) {
  const kakaoReady = useKakao() === "ready";

  const route = useMemo<Place[]>(
    () =>
      course.stops.map((s, i) => ({
        id: `s${i}`,
        date: course.date,
        title: s.title,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        kind: s.kind,
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
      })),
    [course]
  );

  const segments = useMemo<Segment[]>(
    () =>
      route.slice(1).map((dest, idx) => ({
        path: [
          { lat: route[idx].lat, lng: route[idx].lng },
          { lat: dest.lat, lng: dest.lng },
        ],
        mode: course.stops[idx + 1].mode ?? "car",
      })),
    [route, course]
  );

  const schedule = useMemo(() => {
    const now = new Date();
    return buildSchedule(
      route,
      roughTravel(course),
      now.getHours() * 60 + now.getMinutes()
    );
  }, [route, course]);

  return (
    <main className="shared-screen">
      <header className="shared-top">
        <span className="shared-badge">받은 코스</span>
        <h1 className="shared-title">{course.title || "동선 코스"}</h1>
        <p className="shared-meta">
          {formatKorean(course.date)} 기준 · {course.stops.length}곳
        </p>
      </header>

      <div className="shared-map">
        {kakaoReady ? (
          <KakaoMap route={route} segments={segments} />
        ) : (
          <FallbackMap route={route} />
        )}
      </div>

      <div className="shared-sheet">
        <ol className="shared-list">
          {route.map((p, i) => {
            const st = schedule.stops[i];
            const hasPlace = !!p.name && p.name !== p.title;
            return (
              <li key={p.id} className="shared-stop">
                <span className="shared-no">{i + 1}</span>
                <div className="shared-info">
                  <div className="shared-name">{p.title || p.name}</div>
                  {hasPlace && <div className="shared-place">📍 {p.name}</div>}
                  <div className="shared-sched">
                    {p.kind === "anchor" && p.startTime
                      ? `🕐 ${p.startTime}${p.endTime ? `~${p.endTime}` : ""} 약속`
                      : `예상 도착 ${minToHHMM(st.arriveMin)}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="shared-hint">
          ⓘ 예상 도착은 대략적이에요. <b>담으면 내 출발지·실제 이동시간</b> 기준으로
          출발 시각과 동선이 다시 계산돼요.
          {!schedule.hasReference && " (고정 약속이 없어 특히 대략적이에요.)"}
        </p>

        <div className="shared-cta">
          <button className="shared-import" onClick={onImport}>
            📥 내 캘린더에 담기
          </button>
          <button className="shared-close" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </main>
  );
}
