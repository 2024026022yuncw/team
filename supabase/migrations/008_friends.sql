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
