-- =====================================================================
-- 007: 팀에 수업(과목) 표시
-- 006 까지 실행한 뒤, SQL Editor 에 붙여넣고 실행하세요. (여러 번 실행해도 안전)
-- 팀장은 기존 "teams update owner" 정책으로 수정 가능
-- =====================================================================

alter table public.teams add column if not exists course_name text not null default ''
  check (char_length(course_name) <= 50);
