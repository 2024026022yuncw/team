-- =====================================================================
-- 013: 수업은 팀장만 변경 + 나만 보이는 아이콘 약칭
-- 012 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
--  - 012 의 "팀원 누구나 수업 변경" 함수를 없앰 → 수업·팀 기본 약칭은 팀장만 (teams 정책)
--  - 각자 자기 화면에서만 보이는 약칭 (본인만 읽고 쓸 수 있음)
--  아이콘 표시 순서: 내 약칭 → 팀장이 정한 약칭(teams.course_short) → 과목명에서 자동
-- =====================================================================

drop function if exists public.set_team_course(uuid, text, text);

create table if not exists public.user_team_prefs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  course_short text not null default '' check (char_length(course_short) <= 4),
  updated_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

alter table public.user_team_prefs enable row level security;
drop policy if exists "prefs own" on public.user_team_prefs;
create policy "prefs own" on public.user_team_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_team_member(team_id));
