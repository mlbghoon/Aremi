"use client";

import { useState } from "react";
import { Place } from "@/lib/types";
import { eventsOnDate } from "@/lib/recurrence";
import {
  addDays,
  addMonths,
  formatKorean,
  GRID_END_HOUR,
  GRID_START_HOUR,
  hmToMin,
  HOUR_PX,
  minToTop,
  monthMatrix,
  monthTitle,
  todayStr,
  weekDates,
  WEEKDAY_LABELS,
} from "@/lib/date";

type ViewMode = "month" | "week" | "day";

interface Props {
  events: Place[];
  onOpenEvent: (ev: Place) => void;
  onCreate: (date: string, startTime?: string) => void;
  onViewRoute: (date: string) => void;
  onViewDiary: (date: string) => void;
}

export default function CalendarView({
  events,
  onOpenEvent,
  onCreate,
  onViewRoute,
  onViewDiary,
}: Props) {
  const [mode, setMode] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(todayStr());
  const today = todayStr();

  // 반복 규칙을 적용해 그 날짜의 이벤트(정렬)를 구한다
  const dayEvents = (d: string) => eventsOnDate(events, d).sort(sortByTime);

  function nav(delta: number) {
    if (mode === "month") setCursor((c) => addMonths(c, delta));
    else if (mode === "week") setCursor((c) => addDays(c, delta * 7));
    else setCursor((c) => addDays(c, delta));
  }

  const title =
    mode === "month"
      ? monthTitle(cursor)
      : mode === "week"
      ? `${monthTitle(weekDates(cursor)[0])} · ${weekLabel(cursor)}`
      : formatKorean(cursor);

  return (
    <div className="calv">
      <div className="calv-toolbar">
        <div className="calv-row">
          <div className="calv-nav">
            <button onClick={() => nav(-1)} aria-label="이전">
              ‹
            </button>
            <button className="today-btn" onClick={() => setCursor(today)}>
              오늘
            </button>
            <button onClick={() => nav(1)} aria-label="다음">
              ›
            </button>
          </div>
          <div className="calv-title">{title}</div>
        </div>
        <div className="calv-row">
          <div className="calv-modes">
            {(["month", "week", "day"] as ViewMode[]).map((m) => (
              <button
                key={m}
                className={mode === m ? "on" : ""}
                onClick={() => setMode(m)}
              >
                {m === "month" ? "월" : m === "week" ? "주" : "일"}
              </button>
            ))}
          </div>
          <button className="add-btn" onClick={() => onCreate(cursor)}>
            + 일정
          </button>
        </div>
      </div>

      {mode === "month" && (
        <MonthView
          cursor={cursor}
          today={today}
          dayEvents={dayEvents}
          onOpenEvent={onOpenEvent}
          onPickDay={(d) => {
            setCursor(d);
            setMode("day");
          }}
        />
      )}
      {mode === "week" && (
        <TimeGrid
          days={weekDates(cursor)}
          today={today}
          dayEvents={dayEvents}
          onOpenEvent={onOpenEvent}
          onCreate={onCreate}
          onPickDay={(d) => {
            setCursor(d);
            setMode("day");
          }}
        />
      )}
      {mode === "day" && (
        <>
          <TimeGrid
            days={[cursor]}
            today={today}
            dayEvents={dayEvents}
            onOpenEvent={onOpenEvent}
            onCreate={onCreate}
            onPickDay={() => {}}
          />
          <div className="day-actions">
            <button className="view-map-btn" onClick={() => onViewRoute(cursor)}>
              🗺️ 동선 보기
            </button>
            <button
              className="view-map-btn ghost"
              onClick={() => onViewDiary(cursor)}
            >
              📖 이 날 기록
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MonthView({
  cursor,
  today,
  dayEvents,
  onOpenEvent,
  onPickDay,
}: {
  cursor: string;
  today: string;
  dayEvents: (d: string) => Place[];
  onOpenEvent: (ev: Place) => void;
  onPickDay: (d: string) => void;
}) {
  const cells = monthMatrix(cursor);
  return (
    <div className="mv">
      <div className="mv-wd">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className={dowClass(i)}>
            {w}
          </div>
        ))}
      </div>
      <div className="mv-grid">
        {cells.map((c, i) => {
          const evs = dayEvents(c.dateStr);
          return (
            <div
              key={c.dateStr}
              className={`mv-cell${c.inMonth ? "" : " out"}`}
              onClick={() => onPickDay(c.dateStr)}
            >
              <div
                className={`mv-daynum ${dowClass(i % 7)}${
                  c.dateStr === today ? " today" : ""
                }`}
              >
                {c.day}
              </div>
              <div className="mv-evs">
                {evs.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    className={`mv-chip ${e.kind}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpenEvent(e);
                    }}
                  >
                    {e.repeat && e.repeat !== "none" ? "↻ " : ""}
                    {e.kind === "anchor" && e.startTime && (
                      <b>{e.startTime}</b>
                    )}{" "}
                    {e.title || e.name}
                  </button>
                ))}
                {evs.length > 3 && (
                  <div className="mv-more">+{evs.length - 3}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({
  days,
  today,
  dayEvents,
  onOpenEvent,
  onCreate,
  onPickDay,
}: {
  days: string[];
  today: string;
  dayEvents: (d: string) => Place[];
  onOpenEvent: (ev: Place) => void;
  onCreate: (date: string, startTime?: string) => void;
  onPickDay: (d: string) => void;
}) {
  const hours: number[] = [];
  for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) hours.push(h);
  const bodyH = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_PX;

  function slotClick(e: React.MouseEvent, date: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    let min = GRID_START_HOUR * 60 + (y / HOUR_PX) * 60;
    min = Math.round(min / 30) * 30;
    const h = Math.floor(min / 60);
    const m = min % 60;
    onCreate(date, `${pad2(h)}:${pad2(m)}`);
  }

  return (
    <div className="tg">
      <div className="tg-allday">
        <div className="tg-gutter">종일</div>
        {days.map((d) => (
          <div key={d} className="tg-allday-col">
            {dayEvents(d)
              .filter((e) => e.kind === "flexible")
              .map((e) => (
                <button
                  key={e.id}
                  className="tg-allday-chip"
                  onClick={() => onOpenEvent(e)}
                >
                  {e.repeat && e.repeat !== "none" ? "↻ " : ""}
                  {e.title || e.name}
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="tg-head">
        <div className="tg-gutter" />
        {days.map((d) => {
          const [, , dd] = d.split("-");
          return (
            <button
              key={d}
              className={`tg-dayhead${d === today ? " today" : ""}`}
              onClick={() => onPickDay(d)}
            >
              {formatKorean(d).replace(/\d+월 /, "")}
              {days.length > 1 && <b> {Number(dd)}</b>}
            </button>
          );
        })}
      </div>

      <div className="tg-body" style={{ height: bodyH }}>
        <div className="tg-gutter">
          {hours.map((h) => (
            <div key={h} className="tg-hour" style={{ height: HOUR_PX }}>
              {h}:00
            </div>
          ))}
        </div>
        {days.map((d) => {
          const timed = dayEvents(d).filter((e) => e.kind === "anchor");
          const packed = packColumns(timed);
          return (
            <div
              key={d}
              className="tg-col"
              onClick={(e) => slotClick(e, d)}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="tg-line"
                  style={{ height: HOUR_PX }}
                />
              ))}
              {packed.map(({ ev, col, cols }) => {
                const s = hmToMin(ev.startTime) ?? GRID_START_HOUR * 60;
                const e = hmToMin(ev.endTime) ?? s + 60;
                const top = minToTop(s);
                const h = Math.max(20, minToTop(e) - top);
                return (
                  <button
                    key={ev.id}
                    className="tg-event"
                    style={{
                      top,
                      height: h,
                      left: `calc(${(col / cols) * 100}% + 2px)`,
                      width: `calc(${(1 / cols) * 100}% - 4px)`,
                    }}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      onOpenEvent(ev);
                    }}
                  >
                    <b>{ev.startTime}</b>{" "}
                    {ev.repeat && ev.repeat !== "none" ? "↻ " : ""}
                    {ev.title || ev.name}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── helpers ──
function sortByTime(a: Place, b: Place): number {
  const at = a.kind === "anchor" ? a.startTime ?? "99:99" : "zz";
  const bt = b.kind === "anchor" ? b.startTime ?? "99:99" : "zz";
  return at.localeCompare(bt);
}

function packColumns(
  events: Place[]
): { ev: Place; col: number; cols: number }[] {
  const sorted = [...events].sort(sortByTime);
  const colEnd: number[] = [];
  const placed = sorted.map((ev) => {
    const s = hmToMin(ev.startTime) ?? 0;
    const e = hmToMin(ev.endTime) ?? s + 60;
    let c = 0;
    while (c < colEnd.length && colEnd[c] > s) c++;
    colEnd[c] = e;
    return { ev, col: c };
  });
  const cols = Math.max(1, colEnd.length);
  return placed.map((p) => ({ ...p, cols }));
}

function dowClass(i: number): string {
  return i === 0 ? "sun" : i === 6 ? "sat" : "";
}

function weekLabel(dateStr: string): string {
  const ds = weekDates(dateStr);
  const a = ds[0].split("-")[2];
  const b = ds[6].split("-")[2];
  return `${Number(a)}~${Number(b)}일`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
