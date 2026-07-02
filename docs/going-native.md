# 웹앱 → 모바일 앱으로 만들기 (React Native? Capacitor?)

> 지금 Aremi는 Next.js(React) 웹앱이고, 폰 프레임 안에서 모바일 앱처럼 보이게 만들어 뒀다.
> 이걸 **실제 설치형 앱**으로 만드는 방법과, React Native가 맞는지 정리한다.

## 한 줄 결론

**지금은 Capacitor로 현재 웹앱을 그대로 감싸는 게 가장 빠르고 싸다. React Native는 사실상 UI 재작성이라
지금 단계에선 비추천.** 이유: 우리는 이미 완성도 있는 React 웹 UI(달력·지도·다이어리)를 갖고 있고,
카카오맵 JS SDK도 webview에서 그대로 돈다. RN으로 가면 이 UI와 지도를 전부 다시 붙여야 한다.

## 세 가지 선택지

| 방식 | 무엇 | 재작성량 | 학습곡선 | 네이티브 느낌 | 우리 적합도 |
| --- | --- | --- | --- | --- | --- |
| **Capacitor** | 웹앱을 네이티브 컨테이너(webview)로 감싸 스토어에 올림 | **거의 없음** (지금 코드 재사용) | 낮음 (웹 그대로) | 표준 앱은 충분 | ★★★ 지금 최적 |
| **Expo (React Native)** | RN으로 네이티브 UI 작성, 빌드·배포는 EAS가 편하게 | UI 전면 재작성 | 중간 | 좋음 | ★ 나중 옵션 |
| **Bare React Native** | Expo 없이 RN 직접 | UI 전면 재작성 + 네이티브 설정 | 높음 | 최고 | ✗ 오버스펙 |

핵심 차이: **Capacitor는 "웹이 본체"** — 브라우저에서 개발/테스트하고 그대로 iOS·Android로 내보낸다.
**React Native는 "네이티브가 본체"** — 시뮬레이터가 기준이고 웹은 별도다. 무거운 애니메이션·게임이 아니면
표준 업무/일정 앱에서 둘의 체감 성능 차이는 미미하다. ([nextnative.dev 비교](https://nextnative.dev/comparisons/capacitor-vs-react-native))

## 우리 코드 관점

- **재사용됨(어느 쪽이든):** `lib/optimize.ts`, `schedule.ts`, `recurrence.ts`, `geo.ts`, `date.ts` — 순수 TS 로직. 프레임워크 무관.
- **Capacitor면 거의 그대로 재사용:** `components/*`, `app/page.tsx`, `globals.css`, **카카오맵 JS SDK**(webview에서 동작).
- **RN이면 다시 만들어야:** 모든 화면(RN 컴포넌트), CSS(→ RN 스타일), 지도(→ `react-native-webview`로 카카오 JS를 띄우거나 네이티브 SDK 래퍼), 바텀시트/모달 등.

→ 이미 만든 UI 자산을 살리려면 Capacitor가 압도적으로 유리하다.

## Capacitor 도입 시 구조 (중요)

Capacitor는 프론트엔드 웹 자산을 컨테이너에 담는다. 그런데 **우리 `app/api/*`(카카오모빌리티·ODsay·TMap
프록시)는 비밀 키를 쓰므로 앱 안에 넣으면 안 된다.** 그래서 배포 모델을 정해야 한다:

1. **원격 URL 방식 (가장 빠름)** — `capacitor.config`의 `server.url`을 배포된 웹 주소로 지정.
   앱은 사실상 그 사이트를 띄우는 네이티브 셸. SSR·API 라우트 그대로. 단 항상 온라인 필요, "웹뷰 앱" 성격.
   → **Level-1 내부 테스트에 최적.**
2. **정적 export + 별도 백엔드 (제대로 된 앱)** — `next build`(`output: 'export'`)로 프론트를 정적 SPA로
   번들해 앱에 포함. **API 라우트는 export되지 않으므로** 백엔드(예: Vercel 함수 또는 Supabase Edge Functions)로
   옮겨 호스팅하고 앱이 그 엔드포인트를 호출. 오프라인·성능·앱스토어 심사에 더 적합. (Capacitor 8 + Next.js 정적 export 경로 존재 — [capgo 가이드](https://capgo.app/blog/building-a-native-mobile-app-with-nextjs-and-capacitor/))

우리 `page.tsx`는 대부분 `"use client"`라 정적 export가 어렵지 않다. 백엔드 분리는 [`backend.md`](backend.md) 참고.

## 필요해질 네이티브 플러그인 (Capacitor)

| 기능 | 플러그인 | 용도 |
| --- | --- | --- |
| 현위치 | `@capacitor/geolocation` | "지금 내 위치"에서 출발, 실시간 요소 |
| 푸시 알림 | `@capacitor/push-notifications` (+ FCM/APNs) | **백그라운드 출발 알림** (지금은 앱 열려야만 울림) |
| 카메라·파일 | `@capacitor/camera`, `filesystem` | 다이어리 **사진 첨부** |
| 공유 | `@capacitor/share` | 코스/일정 공유 |

## 언제 React Native로 갈까

- 지도 위 무거운 실시간 애니메이션, 대규모 제스처 인터랙션, 네이티브 수준 성능이 정말 필요할 때.
- 그 시점엔 순수 로직(`lib/*`)은 그대로 옮기고 UI만 RN으로 다시 만든다.
- **지금 MVP·초기 사용자 검증 단계에선 그럴 이유가 없다.**

## 작업 체크리스트 (Capacitor)

1. `npm i @capacitor/core @capacitor/cli && npx cap init`
2. 배포 모델 결정 (원격 URL vs 정적 export + 백엔드 분리)
3. `npx cap add ios && npx cap add android`
4. 필요한 플러그인 추가(위치/푸시/카메라)
5. 카카오맵 JS 도메인에 앱에서 쓰는 오리진 등록 (또는 정적 번들 오리진 처리)
6. Xcode / Android Studio로 실행 → 실기기 확인
7. 배포는 [`publishing.md`](publishing.md)

## 출처

- [Capacitor vs React Native (nextnative.dev)](https://nextnative.dev/comparisons/capacitor-vs-react-native)
- [React Native vs Expo vs Capacitor 2026 (PkgPulse)](https://www.pkgpulse.com/guides/react-native-vs-expo-vs-capacitor-cross-platform-mobile-2026)
- [Next.js + Capacitor 8 (capgo)](https://capgo.app/blog/building-a-native-mobile-app-with-nextjs-and-capacitor/)
- [Expo EAS Build/Submit 문서](https://docs.expo.dev/submit/introduction/)
