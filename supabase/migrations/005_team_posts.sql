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
