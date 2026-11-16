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


-- =====================================================================
-- 004: 시간표 사생활 보호
-- 팀원은 내 과목명·강의실·개인 일정 제목을 볼 수 없고, "바쁜 시간대"만 볼 수 있게 함
-- 003 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- =====================================================================

-- 1) 시간표 관련 테이블은 본인만 직접 조회 가능
drop policy if exists "timetable select" on public.timetable_entries;
create policy "timetable select" on public.timetable_entries
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "exceptions select" on public.timetable_exceptions;
create policy "exceptions select" on public.timetable_exceptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "personal select" on public.personal_events;
create policy "personal select" on public.personal_events
  for select to authenticated using (user_id = auth.uid());

-- 2) 팀원 겹쳐보기용: 기간 안의 "바쁜 시간"만 반환 (제목·장소 없음)
--    반복 수업은 날짜별로 펼치고, 휴강한 날짜는 제외, 개인 일정은 포함
-- 팀 멤버가 아니거나 기간이 31일을 넘으면 빈 결과
create or replace function public.team_busy_times(p_team_id uuid, p_from date, p_to date)
returns table (user_id uuid, busy_date date, start_min int, end_min int, kind text)
language sql
security definer set search_path = public
stable
as $$
  select e.user_id, d.day::date, e.start_min, e.end_min, 'class'::text
  from public.team_members m
  join public.timetable_entries e on e.user_id = m.user_id
  cross join generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as d(day)
  where m.team_id = p_team_id
    and public.is_team_member(p_team_id)
    and p_to >= p_from and p_to - p_from <= 31
    and extract(dow from d.day)::int = e.day_of_week
    and not exists (
      select 1 from public.timetable_exceptions x
      where x.entry_id = e.id and x.exception_date = d.day::date
    )
  union all
  select p.user_id, p.event_date, p.start_min, p.end_min, 'personal'::text
  from public.team_members m
  join public.personal_events p on p.user_id = m.user_id
  where m.team_id = p_team_id
    and public.is_team_member(p_team_id)
    and p_to >= p_from and p_to - p_from <= 31
    and p.event_date between p_from and p_to;
$$;

revoke all on function public.team_busy_times(uuid, date, date) from public, anon;
grant execute on function public.team_busy_times(uuid, date, date) to authenticated;


-- =====================================================================
-- 005: 팀 게시판 (공지 / 회의록) + 읽음 확인
-- 004 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- =====================================================================

create table if not exists public.team_posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null default 'notice' check (kind in ('notice', 'minutes')),  -- 공지 / 회의록
  title text not null check (char_length(title) between 1 and 100),
  content text not null default '' check (char_length(content) <= 20000),
  meeting_date date,                       -- 회의록일 때 회의 날짜
  pinned boolean not null default false,   -- 상단 고정
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_posts_team_idx on public.team_posts (team_id, pinned desc, created_at desc);

-- 읽음 확인
create table if not exists public.post_reads (
  post_id uuid not null references public.team_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.team_posts enable row level security;
alter table public.post_reads enable row level security;

-- 글: 팀원은 조회·작성, 수정·삭제는 글쓴이 또는 팀장
drop policy if exists "posts select" on public.team_posts;
create policy "posts select" on public.team_posts
  for select to authenticated using (public.is_team_member(team_id));
drop policy if exists "posts insert" on public.team_posts;
create policy "posts insert" on public.team_posts
  for insert to authenticated
  with check (public.is_team_member(team_id) and created_by = auth.uid());
drop policy if exists "posts update" on public.team_posts;
create policy "posts update" on public.team_posts
  for update to authenticated
  using (created_by = auth.uid() or public.is_team_owner(team_id))
  with check (public.is_team_member(team_id));
drop policy if exists "posts delete" on public.team_posts;
create policy "posts delete" on public.team_posts
  for delete to authenticated
  using (created_by = auth.uid() or public.is_team_owner(team_id));

-- 글쓴이·팀 이동은 막기
create or replace function public.protect_post_owner()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by or new.team_id <> old.team_id then
    raise exception '글쓴이와 팀은 변경할 수 없습니다';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists protect_post_owner on public.team_posts;
create trigger protect_post_owner before update on public.team_posts
  for each row execute function public.protect_post_owner();

-- 읽음: 같은 팀이면 조회, 본인 읽음만 기록
drop policy if exists "reads select" on public.post_reads;
create policy "reads select" on public.post_reads
  for select to authenticated
  using (exists (select 1 from public.team_posts p where p.id = post_id and public.is_team_member(p.team_id)));
drop policy if exists "reads insert own" on public.post_reads;
create policy "reads insert own" on public.post_reads
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.team_posts p where p.id = post_id and public.is_team_member(p.team_id))
  );

do $$
declare t text;
begin
  foreach t in array array['team_posts', 'post_reads'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- =====================================================================
-- 006: 모임 방식(온라인/오프라인) + 공지와 일정 연결
-- 005 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- =====================================================================

-- 일정: 모임 방식 / 온라인 플랫폼 / 링크(또는 방 이름)
--   meeting_type: 'offline'(오프라인, 장소는 기존 location 칸), 'online', null(모임 아님: 마감 등)
alter table public.events add column if not exists meeting_type text
  check (meeting_type in ('offline', 'online'));
alter table public.events add column if not exists online_platform text not null default ''
  check (char_length(online_platform) <= 30);
alter table public.events add column if not exists meeting_link text not null default ''
  check (char_length(meeting_link) <= 500);

-- 공지 ↔ 일정 연결 (일정이 지워져도 공지는 남음)
alter table public.team_posts add column if not exists event_id uuid
  references public.events(id) on delete set null;
