# 팀플모임 (team-meetup) — 작업 노트

다음 세션에서 이어서 작업하기 위한 메모. 코드 구조 설명은 [README.md](README.md), Expo 규칙은 [AGENTS.md](AGENTS.md) 참고.

## 개요
대학생 팀 프로젝트용 웹앱(휴대폰 브라우저 화면에 맞춤). Expo SDK 58 + Expo Router로 만들고 **웹으로 빌드해서 Vercel에 배포**한다. 백엔드는 Supabase.
- 기능: 팀 생성/초대 코드, 공유 캘린더, 가능 시간 투표, 할 일/역할 분담, 다이어리, 시간표(주 단위, 휴강, 개인 일정, 에브리타임 이미지 자동 입력), 팀원 시간표 겹쳐보기, 회원탈퇴, 엔터로 로그인, 팀 게시판(공지/회의록, 상단 고정, 읽음 확인), 모임 방식(오프라인 장소 / 온라인 플랫폼·링크)과 일정 저장 시 공지 자동 작성, 공지 안 읽은 수 배지, 팀 캘린더 하루 타임라인(모임 가능 시간 · 팀 일정 · 내 일정[본인만]), 초록 칸 눌러 모임 생성, 팀에 수업 지정(시간표 과목 선택/직접 입력, 팀 목록에 📚 표시), 친구(친구 코드·같은 팀원 바로 요청·친구를 팀에 초대/수락), 발표자(역할) 랜덤 뽑기(팀별, 서버 추첨·기록, 역할로 지정, 동시 실행 방지), AI 비서(api/assistant.ts, Gemini, 사용자 토큰으로 RLS 적용된 내 데이터만 컨텍스트)
- 사용자는 처음에 모바일 앱(Expo Go)을 원했지만 테트리스 프로젝트처럼 **웹 + Vercel**로 바꿨다. 네이티브 앱용 코드(alert.ts, storage.ts 등)도 남아 있다.

## 배포 / 외부 서비스
- GitHub: https://github.com/2024026022yuncw/team (브랜치 `main`). **푸시하면 Vercel이 자동 배포.**
- Vercel 프로젝트: https://vercel.com/2024026022yuncw-1060s-projects/team
  - **운영 주소(항상 최신): https://team-sigma-teal.vercel.app** — 사용자에게는 이 주소를 안내한다.
  - `team-xxxx-...vercel.app`처럼 무작위 글자가 들어간 주소는 **그 배포에 고정된 주소**라 새 버전이 반영되지 않는다. 사용자가 자주 헷갈렸다. 최신 버전은 Deployments의 맨 위 배포 → Visit, 또는 Overview의 Visit 버튼으로 연다.
  - 환경변수: `GEMINI_API_KEY` (Production). 선택: `GEMINI_MODEL`
- Supabase 프로젝트 ref: `vrezbqnabniscsoqkpqi`. URL과 publishable 키는 `.env`에 커밋돼 있다(공개 값, RLS로 보호).
  - Confirm email은 꺼져 있다(가입 즉시 로그인).
  - 우리는 service_role 키가 없다. DB 변경은 SQL을 만들어 주고 **사용자가 SQL Editor에서 직접 실행**한다.

## DB 마이그레이션 상태 (2026-11-23 확인: 015까지 실행 완료, 016만 확인 불가)
- `supabase/schema.sql`: 처음 만든 전체 스키마. 이후 마이그레이션도 끝에 덧붙여 둔다.
- `supabase/migrations/002_account_timetable.sql`: 회원탈퇴 RPC, 시간표
- `003_cancellations_personal.sql`: 휴강(timetable_exceptions), 개인 일정(personal_events)
- `004_timetable_privacy.sql`: 시간표 관련 테이블은 본인만 조회. 팀원은 `team_busy_times` RPC로 바쁜 시간만(제목·장소 없이) 본다.
- `005_team_posts.sql`: 팀 게시판(공지/회의록), 읽음 확인 — 2026-11-16 실행 완료
- `006_meeting_type.sql`: 일정에 모임 방식(오프라인/온라인), 온라인 플랫폼, 링크 + 공지↔일정 연결(event_id) — 2026-11-16 실행 완료
- `007_team_course.sql`: teams.course_name (팀의 수업) — 실행 완료
- `008_friends.sql`: 친구(friend_code, friendships)·팀 초대(team_invites), RPC send_friend_request/accept_friend_request/invite_friend_to_team/accept_team_invite/my_team_invites — 실행 완료(2026-11-23 REST로 확인)
- `009_team_draws.sql`: 팀별 랜덤 뽑기 기록(team_draws), RPC run_team_draw(서버에서 무작위) — 실행 완료(2026-11-23 REST로 확인)
- `010_draw_lock.sql`: run_team_draw 에 팀별 advisory lock + 15초 쿨다운(DRAW_TOO_SOON) — 함수는 존재(실행 순서상 적용됐을 것, 내용 차이는 REST로 구분 불가)
- `011_course_short.sql`: teams.course_short (아이콘 약칭, 최대 4글자) — 실행 완료(2026-11-23 REST로 확인)
- `012_member_set_course.sql`: (013 에서 취소됨 — 실행 안 해도 됨)
- `013_my_course_short.sql`: set_team_course 삭제(수업은 팀장만) + user_team_prefs(나만 보이는 약칭) — 실행 완료(2026-11-23 REST로 확인). 아이콘 표시 순서: 내 약칭 → teams.course_short(팀장) → shortCourse 자동
- `014_friend_teams.sql`: teams.allow_friend_join(기본 true) + RPC list_friend_teams/join_friend_team — 친구가 속한 팀에 초대 없이 참여 — 실행 완료(2026-11-23 REST로 확인)
- `015_member_share_friends.sql`: team_members.share_with_friends(본인만 변경, 트리거) — 친구 팀 목록은 팀장 공개 AND 그 친구가 보이기 켠 팀만 — 실행 완료(2026-11-23 REST로 확인)
- `016_guest.sql`: handle_new_user 가 이메일 없는 게스트도 처리(이름 기본 "게스트") — 트리거 함수라 REST로 실행 여부 확인 불가. 앱이 게스트 이름(display_name)을 넘기므로 실행 전에도 게스트 가입은 됨. 사용자에게 실행했는지 물어볼 것
- 대시보드 "Allow anonymous sign-ins": 2026-11-23 켜짐 확인(/auth/v1/settings 의 anonymous_users:true)
- 새 마이그레이션은 `017_...sql`로 만들고 schema.sql 끝에도 덧붙인다. 실행은 사용자에게 안내한다.
- `supabase/diagnostics/`: 읽기 전용 진단 SQL(커밋 안 함, 로컬에만 있음)

## AI 기능 (Gemini 무료 키: 시간표 이미지 인식 api/parse-timetable.ts, AI 비서 api/assistant.ts)
- Vercel 서버 함수. **Google Gemini 무료 API**를 쓴다. 사용자가 유료 Anthropic 키를 원하지 않아서 바꿨다.
- `@google/genai`의 `ai.models.generateContent` 사용. (interactions 베타 API는 v1에서 이미지가 안 되고 느려서 버렸다.)
- 공통 헬퍼 `api/_gemini.ts`의 `generateText`: 모델 체인 3.8-flash → 3.6-flash → 3.5-flash-lite → 4-hydrogen 을 차례로 시도(503/500/429/404/시간 초과 시 다음 모델, 전체 52초). thinkingLevel LOW, 거부되면 설정 없이 재시도. 시간표 인식·AI 비서 공통.
- 로그인한 사용자만 호출 가능(Supabase 토큰 확인). 오류 원인은 `describeGeminiError`가 SDK 오류의 body와 message 양쪽에서 읽는다.
- AI 비서는 사용자 토큰으로 Supabase 를 조회(RLS 그대로)해 팀 일정·내 시간표·할 일·투표·공지·다이어리를 컨텍스트로 만든다. 날짜·시간대는 클라이언트가 보낸 today/tzOffset 기준(Vercel 서버는 UTC).
- 2026-11-23 Gemini 키 교체 이력: 예전 키는 "bound service account is deleted or disabled"(401)로 죽어서 새 키로 바꿈.
- api 폴더의 `_` 로 시작하는 파일은 Vercel 이 엔드포인트로 만들지 않음(공통 코드). 로컬 node 로 테스트할 땐 확장자 없는 import 때문에 복사본에서 `.ts` 를 붙여서 돌려야 함.

## 코드 작업 규칙
- 패키지 설치는 `npx expo install`, 서버 전용 패키지는 `npm install`
- 웹에서는 RN `Alert`가 동작하지 않는다. 항상 `@/lib/alert`의 `Alert`를 쓴다(alert.web.ts가 브라우저 confirm/alert로 대체).
- 푸시 전에 확인: `npx tsc --noEmit` → `npx expo export --platform web`
- 사생활: 팀원 시간표는 RLS 때문에 실시간 알림이 오지 않는다. 겹쳐보기는 15초마다 자동으로 새로고침한다.
- 셸(node -e, sed)로 TS 를 고칠 때 정규식 백슬래시(`s` 등)가 자주 사라졌다. 정규식이 들어간 수정은 Edit 도구로 하고, 고친 뒤 `grep "replace(/s+/"` 같은 걸로 확인.
- RN 0.88: ref 타입은 `TextInputInstance`, `ScrollViewInstance` (react-native 에서 type import).
- 화면 확인이 필요하면 `(auth)/zz-preview.tsx` 임시 화면을 만들고 export → 로컬 서버 → 크롬 headless 스크린샷 → 임시 파일 삭제 (로그인 없이 볼 수 있음).
- 날짜 키는 로컬 기준 `YYYY-MM-DD`이고, 주는 월요일에 시작한다(`startOfWeek`). 일요일에는 "이번 주"가 지난 월요일부터라 사용자가 헷갈린 적이 있다.

## 사용자와 일하는 방식
- 한국어로 소통한다. 코딩 초보라서 **화면에서 어디를 누르는지 단계별로**, 필요하면 바로 열 수 있는 주소로 안내한다.
- 기능 수정 요청이 오면 → 고치고 → 타입 검사와 빌드 → **커밋하고 푸시까지** 하는 흐름을 원한다.
- 유료 서비스는 피하고 싶어 한다.
- API 키 같은 비밀값은 채팅에 붙여넣지 말고 Vercel에만 넣게 안내한다.

## 다음에 해볼 만한 것 (제안만 했고 아직 안 함)
- 게스트 기능 실제 확인: 게스트로 시작 → 팀 만들기 → 내 정보에서 이메일 등록(정식 전환)까지 사용자 테스트 필요
- 오래된 게스트 계정 정리 기능
- "모임 아님" 이름 바꾸기(기타 일정/마감·기타/모이지 않음 중 사용자 선택 대기)
- 내 팀 목록 팀 카드에 "새 공지 N" 표시
- 시간표·휴강에서 이번 주/다음 주 더 크게, 일요일엔 다음 주 기본
- 가입 없이 시간투표 참여(마케팅 관점 추천), 카톡 공유 미리보기(OG 태그), 개인정보처리방침 페이지
- 팀 채팅, 회의록 "할 일"을 할 일 탭으로 등록, 휴강 여러 주 한꺼번에·메모, 푸시 알림
