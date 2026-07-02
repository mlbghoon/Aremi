"use client";

import { useEffect, useRef } from "react";
import { useKakao } from "@/lib/useKakao";

export interface Pin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  date: string;
  done?: boolean;
}

/** 과거 방문 장소들을 핀으로 모아 보여주는 지도 (추억 지도) */
export default function MemoryMap({
  pins,
  onPick,
}: {
  pins: Pin[];
  onPick: (date: string) => void;
}) {
  const status = useKakao();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  useEffect(() => {
    if (status !== "ready" || !ref.current || mapRef.current) return;
    const kakao = window.kakao;
    mapRef.current = new kakao.maps.Map(ref.current, {
      center: new kakao.maps.LatLng(37.5665, 126.978),
      level: 8,
    });
    mapRef.current.addControl(
      new kakao.maps.ZoomControl(),
      kakao.maps.ControlPosition.RIGHT
    );
  }, [status]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    if (!pins.length) return;

    const bounds = new kakao.maps.LatLngBounds();
    pins.forEach((p) => {
      const pos = new kakao.maps.LatLng(p.lat, p.lng);
      const el = document.createElement("div");
      el.style.cssText = "transform:translate(-50%,-50%);cursor:pointer;";
      el.innerHTML = `<div title="${p.name}" style="width:15px;height:15px;border-radius:50%;background:${
        p.done ? "#34d399" : "#7c6cff"
      };border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>`;
      el.onclick = () => onPick(p.date);
      const ov = new kakao.maps.CustomOverlay({
        position: pos,
        content: el,
        xAnchor: 0.5,
        yAnchor: 0.5,
        clickable: true,
      });
      ov.setMap(map);
      overlaysRef.current.push(ov);
      bounds.extend(pos);
    });
    map.setBounds(bounds);
  }, [status, pins, onPick]);

  if (status !== "ready") {
    return (
      <div className="map-empty">
        지도를 불러오는 중…
        <br />
        (카카오 키가 없으면 표시되지 않아요)
      </div>
    );
  }
  return <div ref={ref} className="memory-map" />;
}
