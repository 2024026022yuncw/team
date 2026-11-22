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
