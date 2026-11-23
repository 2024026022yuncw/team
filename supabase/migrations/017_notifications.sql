-- =====================================================================
-- 017: 알림함 (팀·친구·초대 등 모든 알림)
-- 016 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
--  - 각 테이블에 트리거를 달아, 무슨 일이 생기면 관련된 사람들에게 알림 행을 자동으로 넣음
--  - 내가 한 일은 나에게 알리지 않음 (auth.uid() 제외)
--  - 시간 표시는 한국 시간 기준
-- =====================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,   -- 받는 사람
  team_id uuid references public.teams(id) on delete cascade,
  type text not null,                                                   -- event, post, poll, task, draw, member, friend, invite
  title text not null,
  body text not null default '',
  link text not null default '',                                        -- 누르면 이동할 앱 경로
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "notifications own select" on public.notifications;
create policy "notifications own select" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "notifications own update" on public.notifications;
create policy "notifications own update" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications own delete" on public.notifications;
create policy "notifications own delete" on public.notifications
  for delete to authenticated using (user_id = auth.uid());
-- 추가는 아래 트리거 함수(security definer)로만

-- ---------------------------------------------------------------- 공통 도우미
create or replace function public.notify_team(
  p_team_id uuid, p_type text, p_title text, p_body text, p_link text
) returns void
language sql
security definer set search_path = public
as $$
  insert into public.notifications (user_id, team_id, type, title, body, link, actor_id)
  select m.user_id, p_team_id, p_type, p_title, coalesce(p_body, ''), coalesce(p_link, ''), auth.uid()
  from public.team_members m
  where m.team_id = p_team_id and m.user_id is distinct from auth.uid();
$$;

create or replace function public.notify_user(
  p_user_id uuid, p_team_id uuid, p_type text, p_title text, p_body text, p_link text
) returns void
language sql
security definer set search_path = public
as $$
  insert into public.notifications (user_id, team_id, type, title, body, link, actor_id)
  select p_user_id, p_team_id, p_type, p_title, coalesce(p_body, ''), coalesce(p_link, ''), auth.uid()
  where p_user_id is not null and p_user_id is distinct from auth.uid();
$$;

create or replace function public.team_label(p_team_id uuid) returns text
language sql security definer set search_path = public stable as $$
  select coalesce((select name from public.teams where id = p_team_id), '팀');
$$;

create or replace function public.actor_name() returns text
language sql security definer set search_path = public stable as $$
  select coalesce((select display_name from public.profiles where id = auth.uid()), '팀원');
$$;

create or replace function public.kst(p_ts timestamptz) returns text
language sql stable as $$
  select to_char(p_ts at time zone 'Asia/Seoul', 'FMMM/FMDD HH24:MI');
$$;

-- ---------------------------------------------------------------- 팀 일정
create or replace function public.trg_notify_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_team(new.team_id, 'event',
      '📅 ' || public.team_label(new.team_id) || ' 새 일정',
      new.title || ' · ' || public.kst(new.starts_at),
      '/team/' || new.team_id || '/event?eventId=' || new.id);
  elsif new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
    perform public.notify_team(new.team_id, 'event',
      '📅 ' || public.team_label(new.team_id) || ' 일정 변경',
      new.title || ' · ' || public.kst(old.starts_at) || ' → ' || public.kst(new.starts_at),
      '/team/' || new.team_id || '/event?eventId=' || new.id);
  end if;
  return new;
end; $$;
drop trigger if exists notify_event on public.events;
create trigger notify_event after insert or update on public.events
  for each row execute function public.trg_notify_event();

-- ---------------------------------------------------------------- 공지 / 회의록
create or replace function public.trg_notify_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_team(new.team_id, 'post',
    case when new.kind = 'minutes' then '📝 ' else '📢 ' end || public.team_label(new.team_id)
      || case when new.kind = 'minutes' then ' 새 회의록' else ' 새 공지' end,
    new.title,
    '/team/' || new.team_id || '/post/' || new.id);
  return new;
end; $$;
drop trigger if exists notify_post on public.team_posts;
create trigger notify_post after insert on public.team_posts
  for each row execute function public.trg_notify_post();

-- ---------------------------------------------------------------- 시간 투표
create or replace function public.trg_notify_poll() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_team(new.team_id, 'poll',
    '🗳️ ' || public.team_label(new.team_id) || ' 시간 투표',
    new.title || ' — 가능한 시간을 표시해 주세요',
    '/team/' || new.team_id || '/poll/' || new.id);
  return new;
end; $$;
drop trigger if exists notify_poll on public.polls;
create trigger notify_poll after insert on public.polls
  for each row execute function public.trg_notify_poll();

-- ---------------------------------------------------------------- 할 일 배정
create or replace function public.trg_notify_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify_user(new.assignee_id, new.team_id, 'task',
      '✅ ' || public.team_label(new.team_id) || ' 할 일 배정',
      new.title || coalesce(' · 마감 ' || to_char(new.due_date, 'FMMM/FMDD'), ''),
      '/team/' || new.team_id || '/task?taskId=' || new.id);
  end if;
  return new;
end; $$;
drop trigger if exists notify_task on public.tasks;
create trigger notify_task after insert or update on public.tasks
  for each row execute function public.trg_notify_task();

-- ---------------------------------------------------------------- 뽑기 결과
create or replace function public.trg_notify_draw() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, team_id, type, title, body, link, actor_id)
  select u, new.team_id, 'draw',
    '🎲 ' || public.team_label(new.team_id) || ' ' || new.title || ' 뽑기',
    '결과: ' || (select string_agg(coalesce(p.display_name, '팀원'), ', ') from public.profiles p where p.id = any(new.winners)),
    '/team/' || new.team_id || '/draw',
    auth.uid()
  from unnest(new.participants) as u
  where u is distinct from auth.uid();
  return new;
end; $$;
drop trigger if exists notify_draw on public.team_draws;
create trigger notify_draw after insert on public.team_draws
  for each row execute function public.trg_notify_draw();

-- ---------------------------------------------------------------- 팀원 합류
create or replace function public.trg_notify_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'owner' then return new; end if;  -- 팀 생성 시 방장 본인은 제외
  insert into public.notifications (user_id, team_id, type, title, body, link, actor_id)
  select m.user_id, new.team_id, 'member',
    '👋 ' || public.team_label(new.team_id) || ' 새 팀원',
    coalesce((select display_name from public.profiles where id = new.user_id), '새 팀원') || '님이 팀에 들어왔어요',
    '/team/' || new.team_id || '?tab=members',
    new.user_id
  from public.team_members m
  where m.team_id = new.team_id and m.user_id <> new.user_id;
  return new;
end; $$;
drop trigger if exists notify_member on public.team_members;
create trigger notify_member after insert on public.team_members
  for each row execute function public.trg_notify_member();

-- ---------------------------------------------------------------- 친구
create or replace function public.trg_notify_friend() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify_user(new.addressee, null, 'friend', '💛 친구 요청',
      public.actor_name() || '님이 친구 요청을 보냈어요', '/friends');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    perform public.notify_user(new.requester, null, 'friend', '💛 친구가 됐어요',
      public.actor_name() || '님이 친구 요청을 수락했어요', '/friends');
  end if;
  return new;
end; $$;
drop trigger if exists notify_friend on public.friendships;
create trigger notify_friend after insert or update on public.friendships
  for each row execute function public.trg_notify_friend();

-- ---------------------------------------------------------------- 팀 초대
create or replace function public.trg_notify_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_user(new.invitee, null, 'invite', '💌 팀 초대',
    public.actor_name() || '님이 ' || public.team_label(new.team_id) || ' 팀에 초대했어요', '/');
  return new;
end; $$;
drop trigger if exists notify_invite on public.team_invites;
create trigger notify_invite after insert on public.team_invites
  for each row execute function public.trg_notify_invite();

-- 도우미 함수는 앱에서 직접 부르지 못하게
do $$
declare f text;
begin
  foreach f in array array[
    'notify_team(uuid, text, text, text, text)',
    'notify_user(uuid, uuid, text, text, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
