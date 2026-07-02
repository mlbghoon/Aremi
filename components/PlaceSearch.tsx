"use client";

import { useEffect, useRef, useState } from "react";
import { searchSample } from "@/lib/samplePlaces";

export interface SearchResult {
  name: string;
  lat: number;
  lng: number;
  address?: string;
}

interface Props {
  /** 카카오 SDK가 준비됐는가. true면 카카오 로컬 검색, 아니면 내장 샘플 검색 */
  kakaoReady: boolean;
  onAdd: (r: SearchResult) => void;
}

export default function PlaceSearch({ kakaoReady, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const placesRef = useRef<any>(null);

  useEffect(() => {
    if (kakaoReady && window.kakao?.maps?.services && !placesRef.current) {
      placesRef.current = new window.kakao.maps.services.Places();
    }
  }, [kakaoReady]);

  function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    setSearched(true);
    if (!q) {
      setResults([]);
      return;
    }

    if (kakaoReady && placesRef.current) {
      placesRef.current.keywordSearch(q, (data: any[], status: string) => {
        if (status === window.kakao.maps.services.Status.OK) {
          setResults(
            data.slice(0, 8).map((d) => ({
              name: d.place_name,
              lat: parseFloat(d.y),
              lng: parseFloat(d.x),
              address: d.road_address_name || d.address_name,
            }))
          );
        } else {
          setResults([]);
        }
      });
    } else {
      setResults(searchSample(q));
    }
  }

  return (
    <div className="search">
      <form onSubmit={runSearch} className="search-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            kakaoReady ? "장소 검색 (예: 강남역 스타벅스)" : "장소 검색 (예: 강남역)"
          }
          aria-label="장소 검색"
        />
        <button type="submit">검색</button>
      </form>

      {!kakaoReady && (
        <p className="hint">
          지금은 키가 없어 <b>샘플 장소(서울 주요 지점)</b>로 검색해요. 카카오 키를 넣으면
          전국 어디든 검색됩니다.
        </p>
      )}

      <ul className="results">
        {results.map((r, i) => (
          <li key={`${r.name}-${i}`}>
            <button
              className="result"
              onClick={() => {
                onAdd(r);
                setQuery("");
                setResults([]);
                setSearched(false);
              }}
            >
              <span className="result-name">{r.name}</span>
              {r.address && <span className="result-addr">{r.address}</span>}
            </button>
          </li>
        ))}
        {searched && results.length === 0 && (
          <li className="no-result">검색 결과가 없어요.</li>
        )}
      </ul>
    </div>
  );
}
