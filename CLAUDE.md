# 팀플모임 (team-meetup) — 작업 노트

다음 세션에서 이어서 작업하기 위한 메모. 코드 구조 설명은 [README.md](README.md), Expo 규칙은 [AGENTS.md](AGENTS.md) 참고.

## 개요
대학생 팀 프로젝트용 웹앱(휴대폰 브라우저 화면에 맞춤). Expo SDK 58 + Expo Router로 만들고 **웹으로 빌드해서 Vercel에 배포**한다. 백엔드는 Supabase.
- 기능: 팀 생성/초대 코드, 공유 캘린더, 가능 시간 투표, 할 일/역할 분담, 다이어리, 시간표(주 단위, 휴강, 개인 일정, 에브리타임 이미지 자동 입력), 팀원 시간표 겹쳐보기, 회원탈퇴, 엔터로 로그인, 팀 게시판(공지/회의록, 상단 고정, 읽음 확인), 모임 방식(오프라인 장소 / 온라인 플랫폼·링크)과 일정 저장 시 공지 자동 작성, 공지 안 읽은 수 배지, 팀 캘린더 하루 타임라인(모임 가능 시간 · 팀 일정 · 내 일정[본인만]), 초록 칸 눌러 모임 생성
- 사용자는 처음에 모바일 앱(Expo Go)을 원했지만 테트리스 프로젝트처럼 **웹 + Vercel**로 바꿨다. 네이티브 앱용 코드(alert.ts, storage.ts 등)도 남아 있다.

## 배포 / 외부 서비스
- GitHub: https://github.com/2024026022yuncw/team (브랜치 `main`). **푸시하면 Vercel이 자동 배포.**
- Vercel 프로젝트: https://vercel.com/2024026022yuncw-1060s-projects/team
  - `team-xxxx-...vercel.app`처럼 무작위 글자가 들어간 주소는 **그 배포에 고정된 주소**라 새 버전이 반영되지 않는다. 사용자가 자주 헷갈렸다. 최신 버전은 Deployments의 맨 위 배포 → Visit, 또는 Overview의 Visit 버튼으로 연다.
  - 환경변수: `GEMINI_API_KEY` (Production). 선택: `GEMINI_MODEL`
- Supabase 프로젝트 ref: `vrezbqnabniscsoqkpqi`. URL과 publishable 키는 `.env`에 커밋돼 있다(공개 값, RLS로 보호).
  - Confirm email은 꺼져 있다(가입 즉시 로그인).
  - 우리는 service_role 키가 없다. DB 변경은 SQL을 만들어 주고 **사용자가 SQL Editor에서 직접 실행**한다.

## DB 마이그레이션 상태 (2026-11-16 기준, 006까지 모두 실행 완료)
- `supabase/schema.sql`: 처음 만든 전체 스키마. 이후 마이그레이션도 끝에 덧붙여 둔다.
- `supabase/migrations/002_account_timetable.sql`: 회원탈퇴 RPC, 시간표
- `003_cancellations_personal.sql`: 휴강(timetable_exceptions), 개인 일정(personal_events)
- `004_timetable_privacy.sql`: 시간표 관련 테이블은 본인만 조회. 팀원은 `team_busy_times` RPC로 바쁜 시간만(제목·장소 없이) 본다.
- `005_team_posts.sql`: 팀 게시판(공지/회의록), 읽음 확인 — 2026-11-16 실행 완료
- `006_meeting_type.sql`: 일정에 모임 방식(오프라인/온라인), 온라인 플랫폼, 링크 + 공지↔일정 연결(event_id) — 2026-11-16 실행 완료
- 새 마이그레이션은 `007_...sql`로 만들고 schema.sql 끝에도 덧붙인다. 실행은 사용자에게 안내한다.
- `supabase/diagnostics/`: 읽기 전용 진단 SQL(커밋 안 함, 로컬에만 있음)

## 시간표 이미지 인식 (api/parse-timetable.ts)
- Vercel 서버 함수. **Google Gemini 무료 API**를 쓴다. 사용자가 유료 Anthropic 키를 원하지 않아서 바꿨다.
- `@google/genai`의 `ai.models.generateContent` 사용. (interactions 베타 API는 v1에서 이미지가 안 되고 느려서 버렸다.)
- 모델 `gemini-3.8-flash`, thinkingLevel `LOW`. `MINIMAL`은 이 모델에서 400. 생각 단계 설정이 거부되면 설정 없이 재시도한다.
- 시간 제한: 기본 모델 40초 → `gemini-3.5-flash-lite` 15초 → 실패 시 안내(총 55초 < Vercel 60초)
- 로그인한 사용자만 호출 가능(Supabase 토큰 확인). 오류 원인은 `describeGeminiError`가 SDK 오류의 body와 message 양쪽에서 읽는다.

## 코드 작업 규칙
- 패키지 설치는 `npx expo install`, 서버 전용 패키지는 `npm install`
- 웹에서는 RN `Alert`가 동작하지 않는다. 항상 `@/lib/alert`의 `Alert`를 쓴다(alert.web.ts가 브라우저 confirm/alert로 대체).
- 푸시 전에 확인: `npx tsc --noEmit` → `npx expo export --platform web`
- 사생활: 팀원 시간표는 RLS 때문에 실시간 알림이 오지 않는다. 겹쳐보기는 15초마다 자동으로 새로고침한다.
- 날짜 키는 로컬 기준 `YYYY-MM-DD`이고, 주는 월요일에 시작한다(`startOfWeek`). 일요일에는 "이번 주"가 지난 월요일부터라 사용자가 헷갈린 적이 있다.

## 사용자와 일하는 방식
- 한국어로 소통한다. 코딩 초보라서 **화면에서 어디를 누르는지 단계별로**, 필요하면 바로 열 수 있는 주소로 안내한다.
- 기능 수정 요청이 오면 → 고치고 → 타입 검사와 빌드 → **커밋하고 푸시까지** 하는 흐름을 원한다.
- 유료 서비스는 피하고 싶어 한다.
- API 키 같은 비밀값은 채팅에 붙여넣지 말고 Vercel에만 넣게 안내한다.

## 다음에 해볼 만한 것 (제안만 했고 아직 안 함)
- 휴강/시간표 화면에 "이번 주/다음 주"를 더 크게 표시, 일요일에는 다음 주를 기본으로 보여주기
- 휴강 여러 주 한꺼번에 처리, 휴강 메모
- 푸시 알림, 팀 채팅, 회의록
