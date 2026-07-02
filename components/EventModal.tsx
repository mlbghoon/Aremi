"use client";

import { useState } from "react";
import { Place, RepeatRule } from "@/lib/types";

const CATEGORIES: { label: string; color: string }[] = [
  { label: "기본", color: "" },
  { label: "업무", color: "#5b8cff" },
  { label: "개인", color: "#34d399" },
  { label: "약속", color: "#f472b6" },
  { label: "볼일", color: "#fbbf24" },
  { label: "건강", color: "#f87171" },
];
import { formatKorean } from "@/lib/date";
import PlaceSearch, { SearchResult } from "@/components/PlaceSearch";

interface Props {
  initial: Place;
  isNew: boolean;
  kakaoReady: boolean;
  onSave: (ev: Place) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function EventModal({
  initial,
  isNew,
  kakaoReady,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [ev, setEv] = useState<Place>(initial);
  const hasPlace = ev.lat !== 0 || ev.lng !== 0;

  function patch(p: Partial<Place>) {
    setEv((prev) => ({ ...prev, ...p }));
  }

  function pickPlace(r: SearchResult) {
    setEv((prev) => ({
      ...prev,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      title: prev.title?.trim() ? prev.title : r.name,
    }));
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isNew ? "일정 추가" : "일정 편집"}</h3>
          <button className="modal-x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <label className="field">
          <span>일정 이름</span>
          <input
            value={ev.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="예: 팀 회식"
          />
        </label>

        <label className="field">
          <span>날짜</span>
          <input
            type="date"
            value={ev.date}
            onChange={(e) => patch({ date: e.target.value })}
          />
          <small className="dim">{formatKorean(ev.date)}</small>
        </label>

        <div className="field">
          <span>장소 (선택)</span>
          {hasPlace ? (
            <div className="picked-place">
              📍 {ev.name}
              <button
                className="repick"
                onClick={() => patch({ name: "", lat: 0, lng: 0 })}
              >
                변경
              </button>
            </div>
          ) : (
            <>
              <PlaceSearch kakaoReady={kakaoReady} onAdd={pickPlace} />
              <small className="dim">
                장소 없이도 저장돼요 (약 먹기·집안일 등). 장소가 있으면 동선에 들어갑니다.
              </small>
            </>
          )}
        </div>

        <div className="field">
          <span>시간</span>
          <div className="ev-time">
            <div className="seg">
              <button
                className={ev.kind === "flexible" ? "on" : ""}
                onClick={() =>
                  patch({
                    kind: "flexible",
                    startTime: undefined,
                    endTime: undefined,
                  })
                }
              >
                아무때나
              </button>
              <button
                className={ev.kind === "anchor" ? "on" : ""}
                onClick={() =>
                  patch({
                    kind: "anchor",
                    startTime: ev.startTime ?? "12:00",
                    endTime: ev.endTime ?? "13:00",
                  })
                }
              >
                시간 고정
              </button>
            </div>
            {ev.kind === "anchor" && (
              <div className="time-range">
                <input
                  type="time"
                  value={ev.startTime ?? "12:00"}
                  onChange={(e) => patch({ startTime: e.target.value })}
                />
                <span>~</span>
                <input
                  type="time"
                  value={ev.endTime ?? "13:00"}
                  onChange={(e) => patch({ endTime: e.target.value })}
                />
              </div>
            )}
          </div>
        </div>

        <div className="field">
          <span>반복</span>
          <div className="pillrow">
            {(
              [
                ["none", "안 함"],
                ["daily", "매일"],
                ["weekdays", "평일"],
                ["weekly", "매주"],
              ] as [RepeatRule, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                className={(ev.repeat ?? "none") === v ? "on" : ""}
                onClick={() => patch({ repeat: v })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {ev.kind === "anchor" && (
          <div className="field">
            <span>출발 알림</span>
            <div className="pillrow">
              {(
                [
                  [undefined, "없음"],
                  [0, "출발 시각"],
                  [5, "5분 여유"],
                  [10, "10분 여유"],
                ] as [number | undefined, string][]
              ).map(([v, label]) => (
                <button
                  key={label}
                  className={ev.departAlarm === v ? "on" : ""}
                  onClick={() => {
                    patch({ departAlarm: v });
                    if (
                      v != null &&
                      typeof Notification !== "undefined" &&
                      Notification.permission === "default"
                    ) {
                      Notification.requestPermission();
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <small className="dim">
              직전 일정에서 여기까지 걸리는 시간을 계산해, 출발할 때 알려줘요.
              (앱이 열려 있을 때)
            </small>
          </div>
        )}

        <div className="field">
          <span>분류</span>
          <div className="cat-row">
            {CATEGORIES.map((c) => (
              <button
                key={c.label}
                className={`cat${(ev.color ?? "") === c.color ? " on" : ""}`}
                onClick={() => patch({ color: c.color || undefined })}
              >
                <i
                  style={{
                    background: c.color || "var(--muted)",
                  }}
                />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>메모</span>
          <input
            value={ev.note ?? ""}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="주차, 준비물, 같이 가는 사람 등"
          />
        </label>

        <div className="modal-actions">
          {!isNew && (
            <button
              className="btn-del"
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  window.confirm(`'${ev.title || ev.name}' 일정을 삭제할까요?`)
                ) {
                  onDelete(ev.id);
                  onClose();
                }
              }}
            >
              삭제
            </button>
          )}
          <div className="spacer" />
          <button className="btn-ghost" onClick={onClose}>
            취소
          </button>
          <button
            className="btn-save"
            disabled={!hasPlace && !ev.title.trim()}
            onClick={() => {
              onSave(ev);
              onClose();
            }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
