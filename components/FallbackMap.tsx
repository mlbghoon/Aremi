"use client";

import { useEffect, useRef, useState } from "react";
import { Place } from "@/lib/types";

/**
 * 카카오 키가 없을 때 쓰는 간이 지도.
 * 실제 타일은 없지만 좌표를 그대로 투영해서 핀과 동선의 "모양"을 보여준다.
 * 스크롤(휠)·드래그·버튼으로 확대/축소/이동할 수 있다.
 */
export default function FallbackMap({ route }: { route: Place[] }) {
  const W = 600;
  const H = 460;
  const pad = 48;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null
  );

  // 장소 구성이 바뀌면 보기를 초기화(전체가 보이도록)
  const idsKey = route.map((p) => p.id).join("|");
  useEffect(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
  }, [idsKey]);

  // 휠 줌(커서 기준). preventDefault를 위해 native non-passive 리스너로 붙인다.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const next = clamp(v.scale * factor, 0.5, 12);
        const k = next / v.scale;
        // 커서 아래 지점이 그대로 있도록 평행이동 보정
        return { scale: next, tx: cx - k * (cx - v.tx), ty: cy - k * (cy - v.ty) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function zoomAtCenter(factor: number) {
    const el = wrapRef.current;
    const rect = el?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : W / 2;
    const cy = rect ? rect.height / 2 : H / 2;
    setView((v) => {
      const next = clamp(v.scale * factor, 0.5, 12);
      const k = next / v.scale;
      return { scale: next, tx: cx - k * (cx - v.tx), ty: cy - k * (cy - v.ty) };
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setView((v) => ({
      ...v,
      tx: drag.current!.tx + (e.clientX - drag.current!.x),
      ty: drag.current!.ty + (e.clientY - drag.current!.y),
    }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  if (route.length === 0) {
    return (
      <div className="map-empty">
        왼쪽에서 갈 곳을 추가하면
        <br />
        여기에 동선이 그려져요.
      </div>
    );
  }

  // 좌표 → 화면(W×H) 투영
  const lats = route.map((p) => p.lat);
  const lngs = route.map((p) => p.lng);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);
  if (maxLat - minLat < 0.001) {
    minLat -= 0.005;
    maxLat += 0.005;
  }
  if (maxLng - minLng < 0.001) {
    minLng -= 0.005;
    maxLng += 0.005;
  }
  const x = (lng: number) =>
    pad + ((lng - minLng) / (maxLng - minLng)) * (W - 2 * pad);
  const y = (lat: number) =>
    pad + (1 - (lat - minLat) / (maxLat - minLat)) * (H - 2 * pad);

  const points = route.map((p) => ({ px: x(p.lng), py: y(p.lat), place: p }));
  const polyline = points.map((p) => `${p.px},${p.py}`).join(" ");

  return (
    <div
      ref={wrapRef}
      className="fallback-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <svg
        className="fallback-map"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="간이 동선 지도"
        style={{
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: "0 0",
        }}
      >
        <rect x={0} y={0} width={W} height={H} fill="#eef2f6" />
        {route.length > 1 && (
          <polyline
            points={polyline}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {points.map(({ px, py, place }, i) => (
          <g key={place.id}>
            <circle
              cx={px}
              cy={py}
              r={15}
              fill={place.kind === "anchor" ? "#ef4444" : "#3b82f6"}
              stroke="#fff"
              strokeWidth={2}
            />
            <text
              x={px}
              y={py + 5}
              textAnchor="middle"
              fontSize={14}
              fontWeight={700}
              fill="#fff"
            >
              {i + 1}
            </text>
            <text
              x={px}
              y={py - 22}
              textAnchor="middle"
              fontSize={12}
              fill="#1f2937"
            >
              {place.title || place.name}
            </text>
          </g>
        ))}
      </svg>

      <div className="map-ctrl">
        <button onClick={() => zoomAtCenter(1.3)} aria-label="확대">
          +
        </button>
        <button onClick={() => zoomAtCenter(1 / 1.3)} aria-label="축소">
          −
        </button>
        <button
          className="fit"
          onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
          aria-label="전체 보기"
        >
          ⤢
        </button>
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
