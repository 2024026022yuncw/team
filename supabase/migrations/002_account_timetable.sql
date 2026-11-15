-- =====================================================================
-- 002: 회원탈퇴 + 시간표
-- Supabase Dashboard > SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 팀장 권한 이전을 위해 role 보호 트리거에 예외 허용
-- ---------------------------------------------------------------------
create or replace function public.protect_member_role()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.allow_role_change', true), '') = 'on' then
    return new;
  end if;
  if new.role <> old.role or new.user_id <> old.user_id or new.team_id <> old.team_id then
    raise exception 'role, user_id, team_id 는 변경할 수 없습니다';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) 회원탈퇴: 내가 팀장인 팀은 다른 멤버에게 넘기고(없으면 팀 삭제) 계정 삭제
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_team record;
  v_next uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  perform set_config('app.allow_role_change', 'on', true);

  for v_team in select id from public.teams where owner_id = v_uid loop
    select user_id into v_next
    from public.team_members
    where team_id = v_team.id and user_id <> v_uid
    order by joined_at
    limit 1;

    if v_next is null then
      delete from public.teams where id = v_team.id;
    else
      update public.teams set owner_id = v_next where id = v_team.id;
      update public.team_members set role = 'owner' where team_id = v_team.id and user_id = v_next;
    end if;
  end loop;

  -- auth.users 삭제 → profiles, team_members, diary, poll_votes, timetable 은 cascade 로 함께 삭제
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
-- 3) 시간표 (매주 반복되는 개인 일정 — 같은 팀원은 조회 가능)
-- ---------------------------------------------------------------------
create table if not exists public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),   -- 0=일 1=월 ... 6=토
  start_min int not null check (start_min between 0 and 1439),     -- 자정부터 분
  end_min int not null check (end_min between 1 and 1440),
  title text not null check (char_length(title) between 1 and 50),
  location text not null default '',
  color text not null default '',
  created_at timestamptz not null default now(),
  check (end_min > start_min)
);
create index if not exists timetable_user_idx on public.timetable_entries (user_id, day_of_week);

-- 나와 같은 팀에 속한 사용자인지
create or replace function public.shares_team(p_user uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.team_members a
    join public.team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

alter table public.timetable_entries enable row level security;

drop policy if exists "timetable select" on public.timetable_entries;
create policy "timetable select" on public.timetable_entries
  for select to authenticated using (user_id = auth.uid() or public.shares_team(user_id));
drop policy if exists "timetable insert own" on public.timetable_entries;
create policy "timetable insert own" on public.timetable_entries
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "timetable update own" on public.timetable_entries;
create policy "timetable update own" on public.timetable_entries
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "timetable delete own" on public.timetable_entries;
create policy "timetable delete own" on public.timetable_entries
  for delete to authenticated using (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'timetable_entries'
  ) then
    alter publication supabase_realtime add table public.timetable_entries;
  end if;
end $$;
