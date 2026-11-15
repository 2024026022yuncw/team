-- =====================================================================
-- 팀플 모임 앱 (team-meetup) — Supabase schema
-- Supabase Dashboard > SQL Editor 에 전체를 붙여넣고 실행하세요.
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS / OR REPLACE 를 사용합니다.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 프로필 (auth.users 와 1:1)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- 회원가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 팀 / 팀 멤버
-- ---------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 50),
  description text not null default '',
  invite_code text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  role_title text not null default '',          -- 역할 분담 (예: 발표, 자료조사, PPT)
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- RLS 재귀를 피하기 위한 멤버십 확인 함수
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(p_team_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- 팀 생성 (팀 + 방장 멤버십을 한 번에)
create or replace function public.create_team(p_name text, p_description text default '')
returns public.teams
language plpgsql
security definer set search_path = public
as $$
declare
  v_team public.teams;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.teams where invite_code = v_code);
  end loop;

  insert into public.teams (name, description, invite_code, owner_id)
  values (trim(p_name), coalesce(p_description, ''), v_code, auth.uid())
  returning * into v_team;

  insert into public.team_members (team_id, user_id, role)
  values (v_team.id, auth.uid(), 'owner');

  return v_team;
end;
$$;

-- 초대 코드로 팀 참여
create or replace function public.join_team(p_code text)
returns public.teams
language plpgsql
security definer set search_path = public
as $$
declare
  v_team public.teams;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_team from public.teams where invite_code = upper(trim(p_code));
  if v_team.id is null then
    raise exception '초대 코드가 올바르지 않습니다';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (v_team.id, auth.uid(), 'member')
  on conflict (team_id, user_id) do nothing;

  return v_team;
end;
$$;

-- ---------------------------------------------------------------------
-- 공유 캘린더 일정
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index if not exists events_team_starts_idx on public.events (team_id, starts_at);

-- ---------------------------------------------------------------------
-- 가능 시간 투표
-- ---------------------------------------------------------------------
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  dates date[] not null check (cardinality(dates) between 1 and 14),
  start_hour int not null check (start_hour between 0 and 23),
  end_hour int not null check (end_hour between 1 and 24),
  closed boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_hour > start_hour)
);
create index if not exists polls_team_idx on public.polls (team_id, created_at desc);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_date date not null,
  slot_hour int not null check (slot_hour between 0 and 23),
  primary key (poll_id, user_id, slot_date, slot_hour)
);

-- ---------------------------------------------------------------------
-- 할 일 / 역할 분담
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '',
  assignee_id uuid references auth.users(id) on delete set null,
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tasks_team_idx on public.tasks (team_id, status);

-- ---------------------------------------------------------------------
-- 개인 다이어리 (오늘 할 일 + 하루 기록) — 본인만 접근
-- ---------------------------------------------------------------------
create table if not exists public.diary_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  title text not null check (char_length(title) between 1 and 100),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists diary_todos_user_date_idx on public.diary_todos (user_id, entry_date);

create table if not exists public.diary_notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  mood text not null default '',
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles     enable row level security;
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.events       enable row level security;
alter table public.polls        enable row level security;
alter table public.poll_votes   enable row level security;
alter table public.tasks        enable row level security;
alter table public.diary_todos  enable row level security;
alter table public.diary_notes  enable row level security;

-- profiles: 로그인 사용자는 조회 가능, 본인만 수정
drop policy if exists "profiles select" on public.profiles;
create policy "profiles select" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- teams: 멤버만 조회, 방장만 수정/삭제 (생성은 create_team RPC)
drop policy if exists "teams select" on public.teams;
create policy "teams select" on public.teams
  for select to authenticated using (public.is_team_member(id));
drop policy if exists "teams update owner" on public.teams;
create policy "teams update owner" on public.teams
  for update to authenticated using (public.is_team_owner(id));
drop policy if exists "teams delete owner" on public.teams;
create policy "teams delete owner" on public.teams
  for delete to authenticated using (public.is_team_owner(id));

-- team_members: 같은 팀 멤버끼리 조회, 역할(role_title)은 팀원 누구나 수정, 탈퇴는 본인/방장
drop policy if exists "members select" on public.team_members;
create policy "members select" on public.team_members
  for select to authenticated using (public.is_team_member(team_id));
drop policy if exists "members update" on public.team_members;
create policy "members update" on public.team_members
  for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
drop policy if exists "members delete" on public.team_members;
create policy "members delete" on public.team_members
  for delete to authenticated using (user_id = auth.uid() or public.is_team_owner(team_id));

-- 멤버가 role(owner/member)을 바꾸지 못하도록 막는 트리거
create or replace function public.protect_member_role()
returns trigger
language plpgsql
as $$
begin
  if new.role <> old.role or new.user_id <> old.user_id or new.team_id <> old.team_id then
    raise exception 'role, user_id, team_id 는 변경할 수 없습니다';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_member_role on public.team_members;
create trigger protect_member_role before update on public.team_members
  for each row execute function public.protect_member_role();

-- events / polls / tasks: 팀 멤버는 모두 조회·작성·수정·삭제 가능
do $$
declare t text;
begin
  foreach t in array array['events', 'polls', 'tasks'] loop
    execute format('drop policy if exists "%1$s team access" on public.%1$I', t);
    execute format(
      'create policy "%1$s team access" on public.%1$I for all to authenticated
         using (public.is_team_member(team_id)) with check (public.is_team_member(team_id))', t);
  end loop;
end $$;

-- poll_votes: 같은 팀이면 조회, 본인 표만 추가/삭제
drop policy if exists "votes select" on public.poll_votes;
create policy "votes select" on public.poll_votes
  for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and public.is_team_member(p.team_id)));
drop policy if exists "votes insert own" on public.poll_votes;
create policy "votes insert own" on public.poll_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.polls p where p.id = poll_id and not p.closed and public.is_team_member(p.team_id))
  );
drop policy if exists "votes delete own" on public.poll_votes;
create policy "votes delete own" on public.poll_votes
  for delete to authenticated using (user_id = auth.uid());

-- diary: 본인만
drop policy if exists "diary todos own" on public.diary_todos;
create policy "diary todos own" on public.diary_todos
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "diary notes own" on public.diary_notes;
create policy "diary notes own" on public.diary_notes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- Realtime: 팀원 변경 사항을 실시간으로 받기
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['events', 'polls', 'poll_votes', 'tasks', 'team_members'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
