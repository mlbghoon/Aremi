"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    kakao?: any;
  }
}

export const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

type Status = "disabled" | "loading" | "ready" | "error";

/**
 * 카카오맵 SDK를 한 번만 로드한다.
 * 키가 없으면 'disabled' — 호출부는 간이 지도로 폴백한다.
 */
export function useKakao(): Status {
  const [status, setStatus] = useState<Status>(
    KAKAO_KEY ? "loading" : "disabled"
  );

  useEffect(() => {
    if (!KAKAO_KEY) return;
    if (window.kakao?.maps) {
      setStatus("ready");
      return;
    }

    const ID = "kakao-maps-sdk";
    const existing = document.getElementById(ID) as HTMLScriptElement | null;

    const onLoad = () => {
      window.kakao.maps.load(() => setStatus("ready"));
    };

    if (existing) {
      existing.addEventListener("load", onLoad);
      return () => existing.removeEventListener("load", onLoad);
    }

    const script = document.createElement("script");
    script.id = ID;
    script.async = true;
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=services`;
    script.addEventListener("load", onLoad);
    script.addEventListener("error", () => setStatus("error"));
    document.head.appendChild(script);

    return () => script.removeEventListener("load", onLoad);
  }, []);

  return status;
}
