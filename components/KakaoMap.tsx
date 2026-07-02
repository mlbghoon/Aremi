"use client";

import { useEffect, useRef } from "react";
import { Place } from "@/lib/types";
import type { Mode, Segment } from "@/app/page";

interface Props {
  route: Place[];
  /** 구간별 폴리라인 + 이동수단 */
  segments: Segment[];
  /** true면 점선(경로 받아오는 중) */
  dashed?: boolean;
}

const STYLE: Record<Mode, { color: string; style: string }> = {
  car: { color: "#3b82f6", style: "solid" },
  transit: { color: "#16a34a", style: "solid" },
  walk: { color: "#f59e0b", style: "shortdash" },
};

/**
 * 진짜 카카오 지도. 핀(순서 번호 + 이름) + 구간별 색깔 동선을 그린다.
 * 경로 계산은 page에서 하고, 여기는 받은 좌표를 그리기만 한다.
 */
export default function KakaoMap({ route, segments, dashed }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const fitKeyRef = useRef<string>("");

  // 지도 1회 생성
  useEffect(() => {
    const kakao = window.kakao;
    if (!kakao?.maps || !containerRef.current) return;
    mapRef.current = new kakao.maps.Map(containerRef.current, {
      center: new kakao.maps.LatLng(37.5665, 126.978),
      level: 6,
    });
    mapRef.current.addControl(
      new kakao.maps.ZoomControl(),
      kakao.maps.ControlPosition.RIGHT
    );
  }, []);

  // route / segments가 바뀔 때마다 다시 그림
  useEffect(() => {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!kakao?.maps || !map) return;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    if (route.length === 0) return;

    const stops = route.map((p) => new kakao.maps.LatLng(p.lat, p.lng));

    // 구간별 폴리라인 (이동수단 색)
    segments.forEach((seg) => {
      if (!seg.path || seg.path.length < 2) return;
      const pts = seg.path.map(
        (pt) => new kakao.maps.LatLng(pt.lat, pt.lng)
      );
      const st = STYLE[seg.mode];
      const line = new kakao.maps.Polyline({
        path: pts,
        strokeWeight: dashed ? 3 : 5,
        strokeColor: st.color,
        strokeOpacity: dashed ? 0.4 : 0.9,
        strokeStyle: dashed ? "shortdash" : (st.style as any),
      });
      line.setMap(map);
      overlaysRef.current.push(line);
    });

    // 핀: 원의 정중앙이 실제 좌표에 오도록, 이름표는 absolute로 띄운다
    const hasOrigin = route[0]?.id === "__origin__";
    route.forEach((p, i) => {
      const isOrigin = p.id === "__origin__";
      const color = isOrigin
        ? "#22c55e"
        : p.kind === "anchor"
        ? "#ef4444"
        : "#1f2937";
      const inner = isOrigin ? "🏠" : String(hasOrigin ? i : i + 1);
      const label = isOrigin ? "출발" : p.title || p.name;
      const content = document.createElement("div");
      content.style.cssText = "position:relative;font-family:inherit;";
      content.innerHTML = `
        <div style="position:absolute;bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);white-space:nowrap;background:#fff;border-radius:4px;padding:1px 6px;font-size:11px;color:#1f2937;box-shadow:0 1px 3px rgba(0,0,0,.25)">${label}</div>
        <div style="width:26px;height:26px;border-radius:50%;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${isOrigin ? 12 : 13}px">${inner}</div>`;
      const overlay = new kakao.maps.CustomOverlay({
        position: stops[i],
        content,
        xAnchor: 0.5,
        yAnchor: 0.5,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    // 장소 구성이 바뀔 때만 화면을 다시 맞춘다.
    // (이동수단 토글이나 경로 도착으로 화면이 튀지 않도록 — 사용자 줌/이동 유지)
    const fitKey = route.map((p) => `${p.lat},${p.lng}`).join("|");
    if (fitKey !== fitKeyRef.current) {
      fitKeyRef.current = fitKey;
      const bounds = new kakao.maps.LatLngBounds();
      stops.forEach((pos: any) => bounds.extend(pos));
      map.setBounds(bounds);
    }
  }, [route, segments, dashed]);

  return <div ref={containerRef} className="kakao-map" />;
}
