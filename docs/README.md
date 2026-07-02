# 문서 안내 (docs)

Aremi(동선) 프로젝트 문서 모음. 실행/구조/현재 기능은 루트 [`../README.md`](../README.md)를 먼저 본다.

| 문서 | 내용 | 성격 |
| --- | --- | --- |
| [`route-calendar-mvp.md`](route-calendar-mvp.md) | **지금까지 실제로 만든 MVP**와 방향, 다음 단계 | 현황 |
| [`route-calendar-app-plan.md`](route-calendar-app-plan.md) | 큰 그림(비전)·시장조사·핵심 기능·데이터 구조 | 비전 |
| [`route-calendar-money.md`](route-calendar-money.md) | 수익화 전략 (아직 미구현, 참고용) | 전략 |
| [`GET-KEYS.md`](GET-KEYS.md) | 카카오·ODsay·TMap 키 발급/설정 (초보자용) | 실행 |
| [`going-native.md`](going-native.md) | 웹앱 → 모바일 앱 (Capacitor vs React Native) | 실행/계획 |
| [`backend.md`](backend.md) | 백엔드가 해야 할 일 (프록시·인증·동기화·사진·푸시) | 계획 |
| [`deploy-vercel.md`](deploy-vercel.md) | Vercel 배포 (링크로 실사용 테스트) | 실행 |
| [`publishing.md`](publishing.md) | 배포 2단계 (내부 테스트 → 스토어 출시) | 실행/계획 |

## 지금 상태 한 줄

캘린더(월/주/일) + 일정 관리 + 동선 최적화 + 이동수단별 실제 경로(자동차/대중교통/도보) +
스마트 시간표·출발 알림 + 다이어리(기록)까지 **로컬(localStorage) MVP** 완성.
다음: **계정 + 클라우드 동기화(Supabase)** → 사진·백그라운드 알림·공유.

> 비전 문서의 '약속 모드/실시간 위치 공유', 수익화 기능은 아직 미구현이다.
> 문서와 실제 코드가 어긋나면 코드(루트 README) 쪽이 최신이다.
