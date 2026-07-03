"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Place } from "@/lib/types";
import {
  formatKorean,
  relativeLabel,
  onThisDay,
  todayStr,
  addDays,
  monthMatrix,
  monthTitle,
} from "@/lib/date";
import { photoStore } from "@/lib/photos";
import { eventsOnDate, eventsOnDateOrdered } from "@/lib/recurrence";
import MemoryMap, { Pin } from "@/components/MemoryMap";

interface Props {
  events: Place[];
  journals: Record<string, string>;
  moods: Record<string, string>;
  dones: Record<string, boolean>;
  orderByKey: Record<string, number>;
  onOpen: (date: string) => void;
  onBack: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

const SCAN_DAYS = 400;

export default function FeedView({
  events,
  journals,
  moods,
  dones,
  orderByKey,
  onOpen,
  onBack,
  onExport,
  onImport,
}: Props) {
  const today = todayStr();
  const importRef = useRef<HTMLInputElement>(null);

  // 반복 일정도 반영 (eventsOnDate)
  const dayEvents = (d: string) =>
    eventsOnDateOrdered(events, d, orderByKey).sort(
      (a, b) => (a.order ?? 999) - (b.order ?? 999)
    );
  const hasContent = (d: string) =>
    eventsOnDate(events, d).length > 0 ||
    !!journals[d]?.trim() ||
    !!moods[d];

  // 연속 기록(스트릭): 오늘(없으면 어제)부터 거슬러 세기
  const streak = useMemo(() => {
    let cur = hasContent(today) ? today : addDays(today, -1);
    let n = 0;
    while (hasContent(cur)) {
      n++;
      cur = addDays(cur, -1);
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, journals, moods, today]);

  const monthCells = useMemo(() => monthMatrix(today), [today]);
  const [mode, setMode] = useState<"list" | "map">("list");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  // 추억 지도 핀: 장소 있는 과거 일정 (반복 포함)
  const occurrences = useMemo<Pin[]>(() => {
    const out: Pin[] = [];
    for (let i = 0; i <= SCAN_DAYS; i++) {
      const d = addDays(today, -i);
      for (const e of eventsOnDate(events, d)) {
        if (e.lat === 0 && e.lng === 0) continue;
        out.push({
          id: e.id,
          name: e.title || e.name,
          lat: e.lat,
          lng: e.lng,
          date: d,
          done: !!dones[`${e.id}|${d}`],
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, dones, today]);

  // 날짜 범위 필터 + 같은 위치는 합치기(최근 날짜 대표)
  const shownPins = useMemo(() => {
    const to = rangeTo || today;
    const filtered = occurrences.filter(
      (p) => (!rangeFrom || p.date >= rangeFrom) && p.date <= to
    );
    const byLoc = new Map<string, Pin>();
    for (const p of filtered) {
      const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      const ex = byLoc.get(k);
      if (!ex) byLoc.set(k, p);
      else
        byLoc.set(k, {
          ...(p.date > ex.date ? p : ex),
          done: p.done || ex.done,
        });
    }
    return [...byLoc.values()];
  }, [occurrences, rangeFrom, rangeTo, today]);

  const days = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i <= SCAN_DAYS; i++) {
      const d = addDays(today, -i);
      if (hasContent(d)) set.add(d);
    }
    // 스캔 창보다 오래된 명시적 일정/일기도 포함
    for (const e of events) if (e.date && e.date <= today) set.add(e.date);
    for (const [d, txt] of Object.entries(journals))
      if (txt?.trim() && d <= today) set.add(d);
    return [...set].sort().reverse(); // 최신순
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, journals, moods, today]);

  // 각 날짜의 대표 사진(그날 첫 사진)을 로드
  const [covers, setCovers] = useState<Record<string, string>>({});
  const coverUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    (async () => {
      const map: Record<string, string> = {};
      for (const date of days) {
        const evs = eventsOnDate(events, date);
        for (const e of evs) {
          const metas = await photoStore.list(e.id);
          if (metas.length) {
            const url = await photoStore.getURL(metas[0].id);
            if (url) {
              map[date] = url;
              urls.push(url);
            }
            break;
          }
        }
      }
      if (!alive) {
        urls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      coverUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      coverUrlsRef.current = urls;
      setCovers(map);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, events]);
  useEffect(() => () => coverUrlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const dayCard = (date: string) => {
    const evs = dayEvents(date);
    const isDone = (e: Place) => !!dones[`${e.id}|${date}`];
    const doneCount = evs.filter(isDone).length;
    const recall = onThisDay(date, today);
    const journal = journals[date]?.trim();
    return (
      <button key={date} className="feed-card" onClick={() => onOpen(date)}>
        {covers[date] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="feed-cover" src={covers[date]} alt="" />
        )}
        <div className="feed-card-top">
          {moods[date] && <span className="feed-mood">{moods[date]}</span>}
          <span className="feed-rel">{relativeLabel(date, today)}</span>
          {recall && <span className="feed-recall">🎈 {recall}</span>}
          <span className="feed-date">{formatKorean(date)}</span>
        </div>
        {evs.length > 0 && (
          <div className="feed-places">
            {evs.slice(0, 4).map((e) => (
              <span key={e.id} className={`feed-chip${isDone(e) ? " done" : ""}`}>
                {isDone(e) ? "✓ " : ""}
                {e.title || e.name}
              </span>
            ))}
            {evs.length > 4 && <span className="feed-more">+{evs.length - 4}</span>}
          </div>
        )}
        {evs.length > 0 && (
          <div className="feed-meta">
            {evs.length}곳{doneCount > 0 && ` · ${doneCount} 다녀옴`}
          </div>
        )}
        {journal && <div className="feed-journal">“{journal}”</div>}
      </button>
    );
  };

  const recalls = days.filter((d) => onThisDay(d, today));

  return (
    <main className="cal-screen">
      <header className="app-bar row">
        <button className="icon-back" onClick={onBack} aria-label="뒤로">
          ←
        </button>
        <div className="app-bar-title">
          <h1>돌아보기</h1>
          <span className="app-bar-sub">지난 날들을 다시 보기</span>
        </div>
        <div className="feed-toggle">
          <button
            className={mode === "list" ? "on" : ""}
            onClick={() => setMode("list")}
          >
            목록
          </button>
          <button
            className={mode === "map" ? "on" : ""}
            onClick={() => setMode("map")}
          >
            지도
          </button>
        </div>
      </header>

      {mode === "map" ? (
        <div className="feed-map-wrap">
          <div className="map-range">
            <div className="range-presets">
              <button
                onClick={() => {
                  setRangeFrom("");
                  setRangeTo("");
                }}
              >
                전체
              </button>
              <button
                onClick={() => {
                  setRangeFrom(addDays(today, -7));
                  setRangeTo("");
                }}
              >
                최근 1주
              </button>
              <button
                onClick={() => {
                  setRangeFrom(addDays(today, -30));
                  setRangeTo("");
                }}
              >
                최근 1개월
              </button>
              <span className="range-count">{shownPins.length}곳</span>
            </div>
            <div className="range-inputs">
              <input
                type="date"
                value={rangeFrom}
                max={rangeTo || today}
                onChange={(e) => setRangeFrom(e.target.value)}
              />
              <span>~</span>
              <input
                type="date"
                value={rangeTo || today}
                max={today}
                onChange={(e) => setRangeTo(e.target.value)}
              />
            </div>
          </div>
          <div className="feed-map">
            <MemoryMap pins={shownPins} onPick={onOpen} />
          </div>
        </div>
      ) : (
        <div className="feed">
        <div className="pixels-card">
          <div className="pixels-head">
            <span>{monthTitle(today)} 한눈에</span>
            {streak > 0 && <span className="streak">🔥 {streak}일 연속</span>}
          </div>
          <div className="pixels-grid">
            {monthCells.map((c) => {
              const mood = moods[c.dateStr];
              const has = hasContent(c.dateStr);
              return (
                <button
                  key={c.dateStr}
                  className={`pixel${c.inMonth ? "" : " out"}${
                    c.dateStr === today ? " today" : ""
                  }`}
                  onClick={() => onOpen(c.dateStr)}
                  disabled={!c.inMonth}
                >
                  {mood ? (
                    <span className="pixel-mood">{mood}</span>
                  ) : has ? (
                    <i className="pixel-dot" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {recalls.length > 0 && (
          <div className="recall-strip">
            <div className="recall-head">🎈 오늘의 회상</div>
            {recalls.map(dayCard)}
          </div>
        )}

        {days.length === 0 ? (
          <div className="empty-hint">
            <p>아직 돌아볼 기록이 없어요.</p>
            <p className="dim">
              지난 날에 일정을 넣거나 하루 일기를 쓰면 여기에 쌓여요.
            </p>
          </div>
        ) : (
          <>
            <div className="feed-section-label">전체 기록</div>
            {days.map(dayCard)}
          </>
        )}

        <div className="backup-row">
          <button onClick={onExport}>⬇ 백업 내보내기</button>
          <button onClick={() => importRef.current?.click()}>⬆ 가져오기</button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              if (importRef.current) importRef.current.value = "";
            }}
          />
        </div>
        </div>
      )}
    </main>
  );
}
