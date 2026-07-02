# 배포하기 — 2단계 (내부 테스트 → 스토어 출시)

> 사람들이 실제로 쓰게 하는 방법. **1단계**는 우리 개발자 몇 명이 테스트용으로, **2단계**는 구글 플레이·
> 애플 앱스토어 정식 출시다. 프레임워크 선택은 [`going-native.md`](going-native.md), 서버는 [`backend.md`](backend.md).

## 공통 준비물

- 앱 아이콘 / 스플래시 이미지
- 번들 ID(iOS) · 패키지명(Android) — 예: `ai.blumn.aremi`
- **개인정보처리방침 URL** (스토어 필수) — 특히 위치·알림·사진을 쓰면 반드시
- 스토어 개발자 계정 (아래 각 단계)

---

## 1단계 — 내부 테스트 (우리끼리)

목표: 스토어 심사 없이 빠르게 몇 명이 실기기에서 써보기.

### 가장 빠른 길 — 웹으로 (스토어 불필요)

- 웹앱을 **Vercel 등에 배포**하고 링크 공유. 폰 브라우저에서 **홈 화면에 추가(PWA)** 하면 앱처럼 아이콘이 생긴다.
- 장점: 계정·빌드·심사 전부 불필요, 고치면 즉시 반영. **초기 검증엔 이게 제일 낫다.**
- 한계: 진짜 푸시 알림/네이티브 기능은 제한적. (배포 시 그 포트/도메인을 카카오 JS SDK 도메인에 등록)

### 네이티브 셸로 테스트 (설치형)

Capacitor(또는 Expo)로 빌드해 나눠준다.

- **Android (쉬움):**
  - **APK 직접 공유** — 빌드한 `.apk`를 링크로 전달해 설치. 가장 간단.
  - 또는 **Play 내부 테스트(Internal testing) 트랙** / **Firebase App Distribution** — 테스터 관리가 편함.
  - Expo면 **EAS Build + 내부 배포** — 설치 URL 하나로 APK 배포. ([Expo 내부 배포](https://docs.expo.dev/build/internal-distribution/))
- **iOS (Apple 계정 필요):**
  - **TestFlight 내부 테스터** — 최대 **100명**, 각 **30기기**, **심사 없이** 바로 설치. (단 Apple Developer Program $99/년 가입 필요)
  - 또는 ad-hoc 프로비저닝(기기 UDID 등록).

> 요약: **Android는 APK만 뿌리면 끝, iOS는 Apple 계정($99/년) + TestFlight가 사실상 필수.**

---

## 2단계 — 스토어 정식 출시

### 🍎 Apple App Store

- **비용:** Apple Developer Program **연 $99**. ([멤버십](https://developer.apple.com/programs/whats-included/))
- **절차:** App Store Connect에 앱 등록 → 메타데이터·스크린샷·**개인정보 라벨(nutrition label)** 입력 →
  **TestFlight 외부 베타**(최대 **10,000명**, 베타 앱 심사 있음)로 검증 → **App Review** 제출(자동 검사 + 사람 리뷰).
- **위치 권한:** 각 권한이 왜 필요한지 **앱 내 설명 문자열**(`NSLocationWhenInUseUsageDescription` 등)과
  **리뷰 노트**에 명확히 적어야 한다. 없어도 되는 기능은 권한 없이도 동작하게 하라는 게 애플 방침.
  ([App Review 가이드라인](https://developer.apple.com/app-store/review/guidelines/))
- **웹뷰 앱 주의:** 단순 웹사이트 래핑은 반려 사유(4.2 "minimum functionality")가 될 수 있다. 네이티브 기능
  (푸시·위치·사진·오프라인)과 앱다운 UX가 있어야 안전.

### 🤖 Google Play Store

- **비용:** Google Play Developer **1회 $25**.
- **⚠️ 새 개인 계정 폐쇄 테스트 요건(중요):** **2023-11-13 이후 만든 개인 계정**은 프로덕션(정식 출시) 신청 전에
  **폐쇄 테스트(Closed testing)를 최소 12명의 테스터가 14일 연속** 참여한 상태로 진행해야 한다.
  (원래 20명 → 2024.12에 12명으로 완화. **법인/조직 계정은 면제.** 에뮬레이터·봇·중복계정 불가, 실제 안드로이드 기기+실계정.)
  ([Play Console 도움말](https://support.google.com/googleplay/android-developer/answer/14151465), [정책 변경 설명](https://primetestlab.com/blog/google-play-changed-20-to-12-testers))
- **절차:** Play Console 앱 생성 → **Data safety(데이터 보안) 폼** + 콘텐츠 등급 + 개인정보처리방침 →
  폐쇄 테스트로 12명/14일 통과 → 프로덕션 접근 신청 → 정식 출시. (API 자동 제출 전 **최소 1회 수동 업로드** 필요)

### 🇰🇷 한국 — 위치기반서비스 신고 (놓치기 쉬움)

- **위치정보를 다루는 서비스**는 방송미디어통신위원회에 **위치기반서비스사업 신고**를 해야 한다.
  소상공인/1인은 **간이 신고(소상공인등의 위치기반서비스사업 신고)** 가능하고, 온라인(**emsit.go.kr**)으로 접수한다.
  ([전자민원센터](https://www.emsit.go.kr/cp/cv/Cp1440000_0182_01Reg.do), [LBS 안내](https://www.lbsc.kr/front/content/contentViewer.do?contentId=CONTENT_0000091))
- **우리 적용 판단:** 지금 MVP는 **사용자의 실시간 위치를 수집·공유하지 않고** 장소·경로만 그린다 →
  당장은 신고 대상이 아닐 수 있다. 하지만 큰 그림의 **"내 위치 출발 / 약속 모드(실시간 위치 공유)"** 를 붙이는 순간
  **신고 필요**. 기능 붙이기 전에 확인·신고할 것.
- **지도/경로 API 상용 조건:** 카카오·ODsay·TMap의 **무료 쿼터와 상용 이용약관**을 정식 출시 전 반드시 확인(사용량↑ 시 유료).

### 한눈에

| 항목 | Apple | Google |
| --- | --- | --- |
| 계정 비용 | $99 / 년 | $25 / 1회 |
| 내부 테스트 | TestFlight 내부(100명, 심사 X) | 내부 트랙 / APK / Firebase |
| 정식 전 필수 | App Review | (새 개인계정) 폐쇄 테스트 **12명×14일** |
| 위치 권한 | 사용목적 문자열 + 리뷰노트 | Data safety 폼 |
| 공통(KR) | 위치 기능 붙이면 위치기반서비스 신고 | 동일 |

---

## 우리 앱 기준 추천 순서

1. **웹 배포(Vercel) + 링크/PWA 공유** — 지금 바로, 몇 명이 실사용 검증. (스토어·계정 0원)
2. 반응 좋으면 **Capacitor로 셸 빌드** → Android APK 공유 + (Apple 계정 만들어) iOS TestFlight.
3. **백엔드 붙이기**([`backend.md`](backend.md)) — 계정·동기화·사진·푸시. 위치 기능 넣기 전 **위치기반서비스 신고** 확인.
4. **Google 폐쇄 테스트(12명/14일)** 시작 — 시간이 걸리니 정식 출시 목표일 2~3주 전에 착수.
5. 스토어 메타데이터·개인정보처리방침·스크린샷 준비 → **정식 출시**.

## 출처

- [Google Play 새 개인계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465)
- [20→12명 완화 설명](https://primetestlab.com/blog/google-play-changed-20-to-12-testers)
- [Apple Developer Program 멤버십/비용](https://developer.apple.com/programs/whats-included/)
- [Apple App Review 가이드라인](https://developer.apple.com/app-store/review/guidelines/)
- [Expo 내부 배포](https://docs.expo.dev/build/internal-distribution/) · [EAS Submit](https://docs.expo.dev/submit/introduction/)
- [위치기반서비스 신고(전자민원센터)](https://www.emsit.go.kr/cp/cv/Cp1440000_0182_01Reg.do) · [소상공인 LBS 신고 안내](https://www.lbsc.kr/front/content/contentViewer.do?contentId=CONTENT_0000091)
