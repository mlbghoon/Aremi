# 백엔드가 해야 할 일

> 지금은 백엔드가 거의 없다 — 데이터는 브라우저(localStorage)에, 지도/경로 프록시만 Next.js API
> 라우트(`app/api/*`)로 돌고 있다. 앱으로 나아가려면 백엔드가 맡아야 할 일이 늘어난다. 이 문서는
> **무엇을, 왜, 어떤 스택으로** 할지 정리한다.

## 왜 백엔드가 꼭 필요한가

1. **비밀 키를 숨겨야 한다.** 카카오모빌리티 REST 키·ODsay 키·TMap 키는 **앱에 넣으면 추출당한다.**
   Supabase 문서도 명시: *"secret keys는 Edge Functions·서버 등 개발자가 통제하는 곳에서만. 모바일/데스크톱/CLI
   에 절대 번들하지 말 것."* ([Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys))
   → 그래서 지도/경로 호출은 **서버 프록시**를 통해야 하고, 우리 `app/api/directions|transit|walk`가 이미 그 역할이다.
2. **여러 기기 동기화·계정.** 폰과 노트북에서 같은 일정을 보려면 localStorage로는 안 되고 클라우드 저장이 필요하다.
3. **백그라운드 알림.** 앱이 꺼져 있어도 "출발 알림"이 울리려면 서버가 시각을 계산해 푸시를 보내야 한다.
4. **사진·공유.** 다이어리 사진 저장, 코스 공유는 저장소와 서버 로직이 필요하다.

## 백엔드가 맡을 일 (목록)

| # | 역할 | 지금 | 앞으로 |
| --- | --- | --- | --- |
| 1 | **지도/경로 프록시** (비밀 키 보관) | Next.js API 3개 존재 | 호스팅 + 쿼터/레이트리밋 + 결과 캐싱 |
| 2 | **인증(계정)** | 없음 | Supabase Auth (카카오 로그인 등) |
| 3 | **데이터 저장·동기화** | localStorage | Postgres: 일정(events)·구간 이동수단 |
| 4 | **사진 저장** | 없음(스텁) | Supabase Storage + 썸네일 |
| 5 | **푸시 알림** | 앱 열림 시에만 | 서버가 출발 시각 계산 → FCM/APNs 푸시 |
| 6 | **공유·투표** (나중) | 없음 | share token + Realtime 집계 |
| 7 | **법무/운영** | — | 위치기반서비스 신고, API 상용 약관·쿼터 |

## 추천 스택

**Supabase 하나로 대부분 커버** — Auth + Postgres + Storage + Realtime + Edge Functions.
지도/경로 프록시는 두 갈래 중 택1:

- **A. Next.js API 라우트를 Vercel에 그대로 호스팅** (가장 적은 변경). 앱은 그 URL로 호출.
- **B. Supabase Edge Functions로 이전** — 프록시 3개를 Deno 함수로. 백엔드를 Supabase로 일원화하고 싶을 때.

둘 다 "비밀 키는 서버에만" 원칙을 지킨다. 초기엔 A가 빠르다.

## 데이터 모델 초안 (Postgres)

지금 `lib/types.ts`의 `Place`(=일정)를 거의 그대로 옮긴다.

```sql
-- 사용자별 일정
create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,                         -- 'YYYY-MM-DD'
  title text not null,
  place_name text not null,
  lat double precision not null,
  lng double precision not null,
  kind text not null,                         -- 'anchor' | 'flexible'
  start_time text,                            -- 'HH:MM'
  end_time text,
  note text,
  repeat text default 'none',                 -- none|daily|weekdays|weekly
  depart_alarm int,                           -- 출발 알림 리드타임(분)
  created_at timestamptz default now()
);

-- 구간별 이동수단 (도착 일정 기준)
create table leg_modes (
  user_id uuid references auth.users not null,
  event_id uuid references events not null,
  mode text not null,                         -- car|transit|walk
  primary key (user_id, event_id)
);

-- 사진 (Storage 객체 참조)
create table event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events not null,
  storage_path text not null,
  created_at timestamptz default now()
);
```

- **RLS(행 수준 보안)** 로 `user_id = auth.uid()` 만 접근하게 잠근다.
- 동기화: 앱은 로컬 우선(오프라인) → 온라인 시 Supabase와 upsert 동기화. 초기엔 단순 "로그인 시 서버가 진실" 로 시작해도 됨.

## 푸시(백그라운드 출발 알림) 흐름

1. 앱이 기기 푸시 토큰을 서버에 등록.
2. 서버(크론/Edge Function)가 그날 각 사용자의 일정+구간 이동시간으로 **출발 시각**을 계산.
   (지금 `lib/schedule.ts`의 로직을 서버로 이식)
3. 출발 시각 - 리드타임에 FCM(Android)/APNs(iOS)로 푸시.
- Capacitor면 `@capacitor/push-notifications` + FCM/APNs 설정. Expo면 Expo Push.

## 지도/경로 API 상용 주의 (운영)

- 카카오모빌리티·ODsay·TMap **무료 쿼터·상용 이용약관**을 프로덕션 전에 확인. 사용자가 늘면 유료 전환/한도 상향 필요.
- 프록시에 **캐싱**(같은 구간 반복 호출 줄이기)과 **레이트리밋**(키 남용 방지)을 넣는다.

## 출처

- [Supabase API keys — 비밀 키는 서버에만](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase + Next.js 통합](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase Edge Functions + Next.js](https://www.iloveblogs.blog/guides/nextjs-supabase-edge-functions-guide)
