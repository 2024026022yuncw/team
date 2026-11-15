-- =====================================================================
-- 003: 휴강(특정 날짜만 수업 빠짐) + 그 주에만 있는 개인 일정
-- 002 를 먼저 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- =====================================================================

-- 휴강: 반복 일정(timetable_entries)의 특정 날짜를 빼는 기록
create table if not exists public.timetable_exceptions (
  entry_id uuid not null references public.timetable_entries(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exception_date date not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, exception_date)
);
create index if not exists timetable_exceptions_user_idx on public.timetable_exceptions (user_id, exception_date);

-- 한 번만 있는 개인 일정 (예: 휴강 시간에 병원 예약)
create table if not exists public.personal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_date date not null,
  start_min int not null check (start_min between 0 and 1439),
  end_min int not null check (end_min between 1 and 1440),
  title text not null check (char_length(title) between 1 and 50),
  location text not null default '',
  color text not null default '',
  created_at timestamptz not null default now(),
  check (end_min > start_min)
);
create index if not exists personal_events_user_date_idx on public.personal_events (user_id, event_date);

alter table public.timetable_exceptions enable row level security;
alter table public.personal_events enable row level security;

-- 휴강: 본인 + 같은 팀원 조회, 본인 수업에만 추가/삭제
drop policy if exists "exceptions select" on public.timetable_exceptions;
create policy "exceptions select" on public.timetable_exceptions
  for select to authenticated using (user_id = auth.uid() or public.shares_team(user_id));
drop policy if exists "exceptions insert own" on public.timetable_exceptions;
create policy "exceptions insert own" on public.timetable_exceptions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.timetable_entries e where e.id = entry_id and e.user_id = auth.uid())
  );
drop policy if exists "exceptions delete own" on public.timetable_exceptions;
create policy "exceptions delete own" on public.timetable_exceptions
  for delete to authenticated using (user_id = auth.uid());

-- 개인 일정: 본인 + 같은 팀원 조회(겹쳐보기용), 본인만 수정
drop policy if exists "personal select" on public.personal_events;
create policy "personal select" on public.personal_events
  for select to authenticated using (user_id = auth.uid() or public.shares_team(user_id));
drop policy if exists "personal insert own" on public.personal_events;
create policy "personal insert own" on public.personal_events
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "personal update own" on public.personal_events;
create policy "personal update own" on public.personal_events
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "personal delete own" on public.personal_events;
create policy "personal delete own" on public.personal_events
  for delete to authenticated using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['timetable_exceptions', 'personal_events'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
