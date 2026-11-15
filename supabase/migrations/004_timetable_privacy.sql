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
