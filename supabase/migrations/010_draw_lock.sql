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
