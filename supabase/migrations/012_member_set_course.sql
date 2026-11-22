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
