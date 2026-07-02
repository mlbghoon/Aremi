# Vercel 배포 (내부 테스트 / 실사용)

> 링크 하나로 아이폰·안드로이드에서 바로 쓰게 만드는 가장 빠른 길. 표준 Next.js 앱이라 Vercel이 자동 인식한다.
> 키 값은 여기 적지 않는다(깃에 올라감). 값은 로컬 `.env.local` 또는 [`GET-KEYS.md`](GET-KEYS.md) 참고.

## 먼저 알아둘 것

- **별도 데이터 백엔드 불필요.** Next.js `app/api/*`(카카오모빌리티·ODsay·TMap 프록시)가 Vercel에서 **서버리스 함수**로 돌아 비밀 키를 지켜준다. 즉 배포 = 프록시 백엔드도 함께 배포됨.
- **사용자 데이터는 각자 기기에** 저장된다(localStorage + IndexedDB). 계정·동기화는 나중에 Supabase 단계. → 실사용 검증엔 이걸로 충분.

## 1. 프로젝트 임포트

1. https://vercel.com → **GitHub로 로그인**
2. **Add New… → Project** → `mlbghoon/Aremi` **Import**
3. Framework = **Next.js** 자동 감지. 설정 그대로 두면 됨.

## 2. 환경변수 (Environment Variables) — 중요 ⚠️

`.env.local`은 깃에 안 올라가니 **Vercel에 직접** 넣는다. Import 화면(또는 Project → Settings → Environment Variables)에 아래 **4개**를 추가한다. 값은 로컬 `.env.local`에서 복사.

| 이름 | 용도 | 공개/비밀 |
| --- | --- | --- |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 지도 + 장소 검색 | 공개(도메인 등록으로 보호) |
| `KAKAO_REST_KEY` | 자동차 경로 | 비밀 |
| `ODSAY_KEY` | 대중교통 | 비밀 |
| `TMAP_APP_KEY` | 도보 경로 | 비밀 |

> 이전에 노출된 키는 로테이션한 새 값으로 넣을 것.

## 3. Deploy

**Deploy** 누르면 몇 분 뒤 주소가 나온다 (예: `aremi.vercel.app`).

## 4. 배포 후 도메인 등록 (지도·대중교통 켜기)

배포 주소가 나온 뒤:

- **카카오** 콘솔 → 플랫폼 키 → JavaScript 키 → **JS SDK 도메인** 에 배포 주소 추가
  ```
  https://<배포주소>      예) https://aremi.vercel.app
  ```
- **대중교통(ODsay)**: ODsay 앱의 **URI**에 배포 도메인(프로토콜 제외) 추가
  ```
  <배포주소>            예) aremi.vercel.app
  ```
  그리고 Vercel 환경변수에 아래를 **추가한 뒤 재배포**:
  ```
  ODSAY_REFERER = https://<배포주소>
  ```
  (ODsay가 Referer를 검사하기 때문. 서버 코드는 `process.env.ODSAY_REFERER`를 그대로 보낸다.)
- **자동차·도보**는 서버에서 부르고 도메인 제한이 없어 **추가 설정 없이 동작**한다.

> 도메인/키 등록을 안 해도 앱은 돌아간다 — 지도는 간이 지도, 대중교통은 직선 폴백. 나머지는 정상.

## 5. 폰에서 테스트

- 배포 주소를 폰 브라우저에서 열고 **"홈 화면에 추가"** → 앱 아이콘으로 전체화면 실행(PWA).
- 친구들에게 링크 공유 → 로그인 없이 바로 사용, 데이터는 각자 기기에.

## 아직 안 되는 것 (Supabase 단계에서 해결)

- 여러 기기 **동기화**, **클라우드 사진 백업**
- **백그라운드 출발 알림** (지금은 앱 열려 있을 때만)
- **"같이 정하기"** 공유/투표
- iOS 홈 아이콘: 현재 SVG라 기기에 따라 스크린샷 대체 가능 → `app/apple-icon.png`(180×180) 넣으면 개선

## 참고

- 배포 전 로컬 확인: `npm run build` (이미 통과 확인됨)
- 자세한 2단계(스토어 출시)·법무(위치기반서비스 신고)는 [`publishing.md`](publishing.md)
- 앱화(Capacitor 등)는 [`going-native.md`](going-native.md), 백엔드 설계는 [`backend.md`](backend.md)
