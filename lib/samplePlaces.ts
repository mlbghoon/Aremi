// 카카오 키가 없을 때 장소 검색에 쓰는 내장 샘플 목록(서울 주요 지점).
// 키를 넣으면 이 목록 대신 카카오 로컬 검색이 동작한다.
export interface SamplePlace {
  name: string;
  lat: number;
  lng: number;
}

export const SAMPLE_PLACES: SamplePlace[] = [
  { name: "강남역", lat: 37.4979, lng: 127.0276 },
  { name: "역삼역", lat: 37.5006, lng: 127.0364 },
  { name: "선릉역", lat: 37.5045, lng: 127.0489 },
  { name: "삼성역 (코엑스)", lat: 37.5089, lng: 127.0631 },
  { name: "신논현역", lat: 37.5045, lng: 127.0253 },
  { name: "교대역", lat: 37.4934, lng: 127.0145 },
  { name: "고속터미널", lat: 37.5051, lng: 127.0048 },
  { name: "압구정로데오", lat: 37.5273, lng: 127.0402 },
  { name: "청담역", lat: 37.5193, lng: 127.053 },
  { name: "잠실역 (롯데월드)", lat: 37.5133, lng: 127.1001 },
  { name: "홍대입구역", lat: 37.5572, lng: 126.9245 },
  { name: "합정역", lat: 37.5495, lng: 126.9136 },
  { name: "여의도역", lat: 37.5215, lng: 126.9242 },
  { name: "서울역", lat: 37.5547, lng: 126.9707 },
  { name: "명동", lat: 37.5636, lng: 126.9869 },
  { name: "종로3가", lat: 37.5704, lng: 126.9919 },
  { name: "광화문", lat: 37.5759, lng: 126.9769 },
  { name: "이태원", lat: 37.5345, lng: 126.9946 },
  { name: "성수동 (서울숲)", lat: 37.5446, lng: 127.056 },
  { name: "건대입구", lat: 37.5404, lng: 127.0699 },
  { name: "왕십리역", lat: 37.5614, lng: 127.0376 },
  { name: "용산역", lat: 37.5299, lng: 126.9646 },
  { name: "사당역", lat: 37.4766, lng: 126.9816 },
  { name: "신촌", lat: 37.5559, lng: 126.9368 },
];

export function searchSample(query: string): SamplePlace[] {
  const q = query.trim();
  if (!q) return [];
  return SAMPLE_PLACES.filter((p) => p.name.includes(q)).slice(0, 8);
}
