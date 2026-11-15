# 팀플모임 (team-meetup)

팀 프로젝트용 웹앱입니다(휴대폰 브라우저에 맞춘 화면, Vercel 배포). 팀원끼리 일정을 공유하고, 회의 시간을 투표로 정하고, 할 일과 역할을 나눌 수 있습니다.

- **Expo SDK 58** (React Native) + **Expo Router**
- **Supabase**: 로그인, Postgres DB, RLS, Realtime

## 기능

| 기능 | 설명 |
| --- | --- |
| 팀 생성 / 초대 | 팀을 만들면 6자리 초대 코드가 생성됩니다. 코드를 복사하거나 공유하면, 팀원은 '코드로 참여'에 입력해 들어올 수 있습니다. |
| 공유 캘린더 | 월간 달력에 팀 일정이 표시되고 누구나 등록·수정할 수 있습니다. 등록자별로 색이 다르고, 변경 사항은 실시간으로 반영됩니다. |
| 가능 시간 투표 | 후보 날짜(최대 14일)와 시간대를 정하면, 팀원들이 날짜×시간 표에서 가능한 칸을 탭합니다. 겹치는 인원이 많을수록 칸이 진하게 표시되고, 추천 시간 Top 3 중 하나를 골라 바로 일정으로 확정할 수 있습니다. |
| 할 일 / 역할 분담 | 할 일마다 담당자와 마감일(D-day)을 정하고 상태(할 일 → 진행 중 → 완료)를 바꿀 수 있습니다. 멤버별 역할 이름(발표, 자료조사 등)과 진행률을 볼 수 있습니다. |
| 시간표 | 매주 반복 일정(수업·알바)을 주 단위로 보고, 특정 주만 휴강 처리하거나 그 날만 있는 개인 일정을 추가할 수 있습니다. 에브리타임 캡처를 올리면 AI(Claude)가 자동으로 입력합니다. 팀 화면에서 팀원 시간표를 겹쳐 모두 비는 시간을 찾을 수 있습니다. |
| 다이어리 | 날짜별로 개인 할 일 체크리스트와 기분·메모를 남깁니다(자동 저장, 나만 볼 수 있음). 내게 배정된 팀 과제도 함께 보입니다. |

## 시작하기

### 1. Supabase 프로젝트 준비

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다.
2. **SQL Editor**에 [supabase/schema.sql](supabase/schema.sql) 내용을 전부 붙여넣고 **Run**을 누릅니다. 테이블, RLS 정책, RPC 함수, Realtime 설정이 한 번에 만들어집니다.
3. (개발 중 권장) **Authentication → Sign In / Providers → Email**에서 **Confirm email**을 끄면, 가입하자마자 바로 로그인됩니다.
4. **Project Settings → API**에서 Project URL과 publishable(또는 anon) key를 복사합니다.

> DB를 이미 만든 뒤 기능이 추가된 경우: [supabase/migrations/](supabase/migrations/)의 SQL을 번호 순서대로 SQL Editor에서 실행하세요.

### 2. 환경 변수

`.env`에 Supabase URL과 publishable 키가 들어 있습니다. 테트리스 프로젝트의 `config.js`처럼 **코드와 함께 커밋**하므로 Vercel 환경변수 설정은 필요 없습니다.

> publishable 키는 공개되어도 괜찮은 값이고, 데이터는 RLS로 보호됩니다. **`sb_secret_...`이나 service_role 키는 절대 넣지 마세요.**

**시간표 이미지 인식**을 쓰려면 Vercel → 프로젝트 → **Settings → Environment Variables**에 `ANTHROPIC_API_KEY`(Anthropic Console에서 발급)를 추가하고 다시 배포하세요. 이 키는 서버 함수([api/parse-timetable.ts](api/parse-timetable.ts))에서만 쓰이고 앱에는 들어가지 않습니다.

### 3. 로컬에서 실행

```bash
npm install
npx expo start --web     # 브라우저에서 http://localhost:8081
```

### 4. Vercel 배포

1. 이 폴더를 GitHub 저장소에 푸시합니다.
2. [vercel.com](https://vercel.com)에서 **Add New → Project → Import**로 저장소를 연결합니다.
3. 빌드 설정은 [vercel.json](vercel.json)에 들어 있으니 그대로 **Deploy**를 누르면 됩니다(`npx expo export --platform web` → `dist`).
4. 배포가 끝나면 받은 URL을 팀원에게 공유하세요. 초대 링크는 `https://<배포주소>/team/join?code=XXXXXX` 형태입니다.

### 검사

```bash
npx tsc --noEmit     # 타입 검사
```

> 같은 코드로 모바일 앱도 만들 수 있습니다: `npx expo start` 후 Expo Go로 QR 스캔.

## 폴더 구조

```
src/
  app/                       # Expo Router 화면 (파일 = 라우트)
    _layout.tsx              # 로그인 여부에 따라 화면 전환
    (auth)/login.tsx         # 로그인 / 회원가입
    (tabs)/                  # 하단 탭: 내 팀 · 다이어리 · 내 정보
    team/create.tsx          # 팀 만들기
    team/join.tsx            # 초대 코드로 참여 (/team/join?code=XXXXXX)
    team/[id]/index.tsx      # 팀 홈: 캘린더 / 시간투표 / 할 일 / 멤버
    team/[id]/event.tsx      # 일정 추가·수정
    team/[id]/poll-new.tsx   # 투표 만들기
    team/[id]/poll/[pollId]  # 투표 및 결과
    team/[id]/task.tsx       # 할 일 추가·수정
  components/                # 공통 UI, 달력, 날짜·시간 선택기, 팀 탭 화면
  lib/                       # supabase 클라이언트, API, 인증, 훅, 날짜 유틸
supabase/schema.sql          # DB 스키마 + RLS
```

## 보안 모델

- 모든 테이블에 RLS가 켜져 있습니다.
- 팀 데이터(일정·투표·할 일·멤버)는 **같은 팀 멤버만** 조회하고 수정할 수 있습니다.
- 팀 생성과 초대 코드 참여는 `create_team` / `join_team` RPC(security definer)로만 처리합니다.
- 투표는 본인 표만 추가·삭제할 수 있고, 마감된 투표에는 표를 넣을 수 없습니다.
- 다이어리는 본인만 접근할 수 있습니다.
- 팀장 권한(owner)은 클라이언트에서 바꿀 수 없도록 트리거로 막혀 있습니다.

## 다음에 해볼 만한 것

- 푸시 알림: 마감 임박, 새 일정 등록 시 (`expo-notifications`, development build 필요)
- 일정 반복, 휴대폰 기본 캘린더로 내보내기 (`expo-calendar`)
- 팀 채팅 / 회의록
- EAS Build로 스토어 배포
