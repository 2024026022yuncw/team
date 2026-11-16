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
