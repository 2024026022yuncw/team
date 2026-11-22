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
