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


-- =====================================================================
-- 007: 팀에 수업(과목) 표시
-- 006 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- 팀장은 기존 "teams update owner" 정책으로 수정 가능
-- =====================================================================

alter table public.teams add column if not exists course_name text not null default ''
  check (char_length(course_name) <= 50);


-- =====================================================================
-- 008: 친구 + 친구를 팀에 초대
-- 007 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- 요청·수락·초대는 모두 RPC(security definer)로만 처리해 규칙을 서버에서 강제
-- =====================================================================

-- 1) 친구 코드 (사람마다 6자리, 처음 요청할 때 만들어짐)
alter table public.profiles add column if not exists friend_code text unique;

create or replace function public.my_friend_code()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select friend_code into v_code from public.profiles where id = auth.uid();
  if v_code is null then
    loop
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists (select 1 from public.profiles where friend_code = v_code);
    end loop;
    update public.profiles set friend_code = v_code where id = auth.uid();
  end if;
  return v_code;
end;
$$;

-- 2) 친구 관계 (요청 → 수락)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
-- 같은 두 사람 사이에는 하나만 (방향 무관)
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;
drop policy if exists "friendships select own" on public.friendships;
create policy "friendships select own" on public.friendships
  for select to authenticated using (requester = auth.uid() or addressee = auth.uid());
-- 친구 끊기 / 요청 취소·거절: 둘 중 누구나 삭제
drop policy if exists "friendships delete own" on public.friendships;
create policy "friendships delete own" on public.friendships
  for delete to authenticated using (requester = auth.uid() or addressee = auth.uid());

-- 친구 요청: 친구 코드 또는 (같은 팀원이면) 사용자 id 로
create or replace function public.send_friend_request(p_code text default null, p_user uuid default null)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_existing public.friendships;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  if p_code is not null then
    select id into v_target from public.profiles where friend_code = upper(trim(p_code));
    if v_target is null then raise exception '친구 코드가 올바르지 않아요'; end if;
  elsif p_user is not null then
    -- 코드 없이 보내는 건 같은 팀원에게만
    if not exists (
      select 1 from public.team_members a join public.team_members b on a.team_id = b.team_id
      where a.user_id = v_me and b.user_id = p_user
    ) then
      raise exception '같은 팀원에게만 바로 요청할 수 있어요';
    end if;
    v_target := p_user;
  else
    raise exception '친구 코드가 필요해요';
  end if;

  if v_target = v_me then raise exception '나 자신은 친구로 추가할 수 없어요'; end if;

  select * into v_existing from public.friendships
  where least(requester, addressee) = least(v_me, v_target)
    and greatest(requester, addressee) = greatest(v_me, v_target);

  if v_existing.id is not null then
    if v_existing.status = 'accepted' then return 'already_friends'; end if;
    -- 상대가 먼저 보낸 요청이 있으면 바로 친구가 됨
    if v_existing.addressee = v_me then
      update public.friendships set status = 'accepted' where id = v_existing.id;
      return 'accepted';
    end if;
    return 'already_requested';
  end if;

  insert into public.friendships (requester, addressee) values (v_me, v_target);
  return 'requested';
end;
$$;

-- 받은 요청 수락
create or replace function public.accept_friend_request(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.friendships set status = 'accepted'
  where id = p_id and addressee = auth.uid() and status = 'pending';
  if not found then raise exception '요청을 찾을 수 없어요'; end if;
end;
$$;

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and least(requester, addressee) = least(p_a, p_b)
      and greatest(requester, addressee) = greatest(p_a, p_b)
  );
$$;

-- 3) 팀 초대 (친구에게만, 받은 사람이 수락해야 팀원이 됨)
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  inviter uuid not null references auth.users(id) on delete cascade,
  invitee uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, invitee)
);

alter table public.team_invites enable row level security;
-- 받은 사람과 그 팀의 멤버가 볼 수 있음
drop policy if exists "invites select" on public.team_invites;
create policy "invites select" on public.team_invites
  for select to authenticated using (invitee = auth.uid() or public.is_team_member(team_id));
-- 거절(받은 사람) / 취소(보낸 사람·팀장)
drop policy if exists "invites delete" on public.team_invites;
create policy "invites delete" on public.team_invites
  for delete to authenticated
  using (invitee = auth.uid() or inviter = auth.uid() or public.is_team_owner(team_id));

create or replace function public.invite_friend_to_team(p_team_id uuid, p_friend uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_team_member(p_team_id) then raise exception '팀 멤버만 초대할 수 있어요'; end if;
  if not public.are_friends(auth.uid(), p_friend) then raise exception '친구만 초대할 수 있어요'; end if;
  if exists (select 1 from public.team_members where team_id = p_team_id and user_id = p_friend) then
    raise exception '이미 팀원이에요';
  end if;
  insert into public.team_invites (team_id, inviter, invitee)
  values (p_team_id, auth.uid(), p_friend)
  on conflict (team_id, invitee) do nothing;
end;
$$;

create or replace function public.accept_team_invite(p_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_team uuid;
begin
  delete from public.team_invites where id = p_id and invitee = auth.uid() returning team_id into v_team;
  if v_team is null then raise exception '초대를 찾을 수 없어요'; end if;
  insert into public.team_members (team_id, user_id, role)
  values (v_team, auth.uid(), 'member')
  on conflict (team_id, user_id) do nothing;
  return v_team;
end;
$$;

-- 초대받은 사람은 아직 팀원이 아니라 팀 이름을 직접 못 보므로, 받은 초대 목록을 함수로 제공
create or replace function public.my_team_invites()
returns table (id uuid, team_id uuid, team_name text, course_name text, inviter_name text, created_at timestamptz)
language sql
security definer set search_path = public
stable
as $$
  select i.id, i.team_id, t.name, t.course_name, coalesce(p.display_name, ''), i.created_at
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  left join public.profiles p on p.id = i.inviter
  where i.invitee = auth.uid()
  order by i.created_at desc;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'my_friend_code()', 'send_friend_request(text, uuid)', 'accept_friend_request(uuid)',
    'invite_friend_to_team(uuid, uuid)', 'accept_team_invite(uuid)', 'my_team_invites()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['friendships', 'team_invites'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- =====================================================================
-- 009: 발표자(역할) 랜덤 뽑기 — 팀별, 결과는 서버에서 정하고 기록
-- 008 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- =====================================================================

create table if not exists public.team_draws (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 30),   -- 예: 발표자
  participants uuid[] not null,
  winners uuid[] not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists team_draws_team_idx on public.team_draws (team_id, created_at desc);

alter table public.team_draws enable row level security;
drop policy if exists "draws select" on public.team_draws;
create policy "draws select" on public.team_draws
  for select to authenticated using (public.is_team_member(team_id));
-- 기록 삭제: 뽑은 사람 또는 팀장 (추가는 아래 함수로만)
drop policy if exists "draws delete" on public.team_draws;
create policy "draws delete" on public.team_draws
  for delete to authenticated using (created_by = auth.uid() or public.is_team_owner(team_id));

-- 뽑기: 참가자 중 p_count 명을 서버에서 무작위로 고르고 기록
create or replace function public.run_team_draw(p_team_id uuid, p_title text, p_participants uuid[], p_count int)
returns public.team_draws
language plpgsql
security definer set search_path = public
as $$
declare
  v_people uuid[];
  v_winners uuid[];
  v_row public.team_draws;
begin
  if not public.is_team_member(p_team_id) then raise exception '팀 멤버만 뽑을 수 있어요'; end if;

  -- 실제 팀원만, 중복 제거
  select array_agg(distinct m.user_id) into v_people
  from public.team_members m
  where m.team_id = p_team_id and m.user_id = any(p_participants);

  if v_people is null or cardinality(v_people) = 0 then raise exception '참가자를 골라주세요'; end if;
  if p_count < 1 or p_count > cardinality(v_people) then
    raise exception '뽑을 인원은 1명 이상, 참가자 수 이하로 정해주세요';
  end if;

  select array_agg(u) into v_winners
  from (select unnest(v_people) as u order by random() limit p_count) s;

  insert into public.team_draws (team_id, title, participants, winners, created_by)
  values (p_team_id, coalesce(nullif(trim(p_title), ''), '발표자'), v_people, v_winners, auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.run_team_draw(uuid, text, uuid[], int) from public, anon;
grant execute on function public.run_team_draw(uuid, text, uuid[], int) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_draws'
  ) then
    alter publication supabase_realtime add table public.team_draws;
  end if;
end $$;


-- =====================================================================
-- 010: 랜덤 뽑기 동시 실행 방지
-- 009 를 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
--  - 같은 팀의 뽑기는 서버에서 한 번에 하나씩만 처리 (advisory lock)
--  - 팀에서 15초 안에 이미 뽑았으면 새 뽑기를 거절 → 앱은 방금 결과를 보여줌
-- =====================================================================

create or replace function public.run_team_draw(p_team_id uuid, p_title text, p_participants uuid[], p_count int)
returns public.team_draws
language plpgsql
security definer set search_path = public
as $$
declare
  v_people uuid[];
  v_winners uuid[];
  v_row public.team_draws;
  v_recent public.team_draws;
begin
  if not public.is_team_member(p_team_id) then raise exception '팀 멤버만 뽑을 수 있어요'; end if;

  -- 같은 팀의 동시 요청은 여기서 줄을 섬 (트랜잭션이 끝나면 자동 해제)
  perform pg_advisory_xact_lock(hashtext('team_draw:' || p_team_id::text));

  -- 방금 다른 뽑기가 끝났으면 거절 (앞 사람의 결과가 기준)
  select * into v_recent from public.team_draws
  where team_id = p_team_id and created_at > now() - interval '15 seconds'
  order by created_at desc
  limit 1;
  if v_recent.id is not null then
    raise exception 'DRAW_TOO_SOON: 방금 % 님이 뽑았어요. 결과를 확인해주세요.',
      coalesce((select display_name from public.profiles where id = v_recent.created_by), '다른 팀원');
  end if;

  -- 실제 팀원만, 중복 제거
  select array_agg(distinct m.user_id) into v_people
  from public.team_members m
  where m.team_id = p_team_id and m.user_id = any(p_participants);

  if v_people is null or cardinality(v_people) = 0 then raise exception '참가자를 골라주세요'; end if;
  if p_count < 1 or p_count > cardinality(v_people) then
    raise exception '뽑을 인원은 1명 이상, 참가자 수 이하로 정해주세요';
  end if;

  select array_agg(u) into v_winners
  from (select unnest(v_people) as u order by random() limit p_count) s;

  insert into public.team_draws (team_id, title, participants, winners, created_by)
  values (p_team_id, coalesce(nullif(trim(p_title), ''), '발표자'), v_people, v_winners, auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.run_team_draw(uuid, text, uuid[], int) from public, anon;
grant execute on function public.run_team_draw(uuid, text, uuid[], int) to authenticated;


-- =====================================================================
-- 011: 팀 아이콘에 보일 과목 약칭 (예: 경영과 정보기술 → 경정)
-- 010 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- 비어 있으면 앱이 과목명에서 자동으로 만들어 보여줌. 팀장이 수정 가능(기존 정책)
-- =====================================================================

alter table public.teams add column if not exists course_short text not null default ''
  check (char_length(course_short) <= 4);


-- =====================================================================
-- 012: 팀원 누구나 팀의 수업·아이콘 약칭을 바꿀 수 있게
-- 011 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- 팀 이름·설명 변경과 팀 삭제는 지금처럼 팀장만 (teams 테이블 정책은 그대로)
-- =====================================================================

create or replace function public.set_team_course(p_team_id uuid, p_course_name text, p_course_short text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_course_name, '')), 50);
  v_short text := left(regexp_replace(coalesce(p_course_short, ''), '\s', '', 'g'), 4);
begin
  if not public.is_team_member(p_team_id) then
    raise exception '팀 멤버만 수업을 바꿀 수 있어요';
  end if;
  update public.teams
  set course_name = v_name,
      course_short = case when v_name = '' then '' else v_short end
  where id = p_team_id;
end;
$$;

revoke all on function public.set_team_course(uuid, text, text) from public, anon;
grant execute on function public.set_team_course(uuid, text, text) to authenticated;


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


-- =====================================================================
-- 014: 친구가 속한 팀에 초대 없이 참여
-- 013 까지(008 친구 포함) 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
--  - 팀장이 끌 수 있음: teams.allow_friend_join (기본 켜짐)
-- =====================================================================

alter table public.teams add column if not exists allow_friend_join boolean not null default true;

-- 내 친구가 속해 있고, 나는 아직 안 들어간, 공개된 팀 목록
create or replace function public.list_friend_teams()
returns table (
  team_id uuid,
  team_name text,
  course_name text,
  course_short text,
  member_count int,
  friend_names text[]
)
language sql
security definer set search_path = public
stable
as $$
  with my_friends as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as friend_id
    from public.friendships f
    where f.status = 'accepted' and (f.requester = auth.uid() or f.addressee = auth.uid())
  )
  select
    t.id,
    t.name,
    t.course_name,
    t.course_short,
    (select count(*)::int from public.team_members x where x.team_id = t.id),
    array_agg(distinct coalesce(p.display_name, '친구') order by coalesce(p.display_name, '친구'))
  from public.teams t
  join public.team_members m on m.team_id = t.id
  join my_friends mf on mf.friend_id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where t.allow_friend_join
    and not exists (select 1 from public.team_members me where me.team_id = t.id and me.user_id = auth.uid())
  group by t.id, t.name, t.course_name, t.course_short
  order by t.name;
$$;

-- 친구 팀 참여 (서버에서 다시 확인: 공개 팀 + 친구가 실제로 팀원)
create or replace function public.join_friend_team(p_team_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.teams where id = p_team_id and allow_friend_join) then
    raise exception '이 팀은 친구 참여를 받지 않아요. 초대나 초대 코드로 참여해주세요.';
  end if;
  if not exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id and public.are_friends(auth.uid(), m.user_id)
  ) then
    raise exception '친구가 속한 팀에만 참여할 수 있어요';
  end if;
  insert into public.team_members (team_id, user_id, role)
  values (p_team_id, auth.uid(), 'member')
  on conflict (team_id, user_id) do nothing;
  -- 받은 초대가 있었다면 정리
  delete from public.team_invites where team_id = p_team_id and invitee = auth.uid();
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['list_friend_teams()', 'join_friend_team(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;


-- =====================================================================
-- 015: 팀원마다 "내 친구에게 이 팀 보이기" 설정
-- 014 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
--  친구 팀 목록에 나오는 조건: 팀장이 공개(teams.allow_friend_join) AND 그 친구가 보이기 켬
-- =====================================================================

alter table public.team_members add column if not exists share_with_friends boolean not null default true;

-- 본인 설정은 본인만 바꿀 수 있게 (기존 역할 보호 트리거에 규칙 추가)
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
  if new.share_with_friends is distinct from old.share_with_friends and old.user_id <> auth.uid() then
    raise exception '친구 공개 설정은 본인만 바꿀 수 있어요';
  end if;
  return new;
end;
$$;

-- 친구 팀 목록: "보이기"를 켠 친구가 있는 팀만
create or replace function public.list_friend_teams()
returns table (
  team_id uuid,
  team_name text,
  course_name text,
  course_short text,
  member_count int,
  friend_names text[]
)
language sql
security definer set search_path = public
stable
as $$
  with my_friends as (
    select case when f.requester = auth.uid() then f.addressee else f.requester end as friend_id
    from public.friendships f
    where f.status = 'accepted' and (f.requester = auth.uid() or f.addressee = auth.uid())
  )
  select
    t.id,
    t.name,
    t.course_name,
    t.course_short,
    (select count(*)::int from public.team_members x where x.team_id = t.id),
    array_agg(distinct coalesce(p.display_name, '친구') order by coalesce(p.display_name, '친구'))
  from public.teams t
  join public.team_members m on m.team_id = t.id and m.share_with_friends
  join my_friends mf on mf.friend_id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where t.allow_friend_join
    and not exists (select 1 from public.team_members me where me.team_id = t.id and me.user_id = auth.uid())
  group by t.id, t.name, t.course_name, t.course_short
  order by t.name;
$$;

create or replace function public.join_friend_team(p_team_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.teams where id = p_team_id and allow_friend_join) then
    raise exception '이 팀은 친구 참여를 받지 않아요. 초대나 초대 코드로 참여해주세요.';
  end if;
  if not exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id and m.share_with_friends and public.are_friends(auth.uid(), m.user_id)
  ) then
    raise exception '친구가 이 팀을 공개하지 않았어요. 초대나 초대 코드로 참여해주세요.';
  end if;
  insert into public.team_members (team_id, user_id, role)
  values (p_team_id, auth.uid(), 'member')
  on conflict (team_id, user_id) do nothing;
  delete from public.team_invites where team_id = p_team_id and invitee = auth.uid();
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['list_friend_teams()', 'join_friend_team(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
