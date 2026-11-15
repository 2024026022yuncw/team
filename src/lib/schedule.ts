// 한 주 단위 시간표 계산: 반복 일정 - 휴강 + 개인 일정
import { listExceptions, listPersonalEvents, listTimetable } from './api';
import { supabase } from './supabase';
import { addDays, dateOfWeekday, toDateKey } from './date';
import type { PersonalEvent, TimetableEntry, TimetableException } from './types';

export type WeekData = {
  entries: TimetableEntry[];
  exceptions: TimetableException[];
  personal: PersonalEvent[];
};

export const EMPTY_WEEK: WeekData = { entries: [], exceptions: [], personal: [] };

export async function loadWeek(userIds: string[], weekStart: Date): Promise<WeekData> {
  const from = toDateKey(weekStart);
  const to = toDateKey(addDays(weekStart, 6));
  const [entries, exceptions, personal] = await Promise.all([
    listTimetable(userIds),
    listExceptions(userIds, from, to),
    listPersonalEvents(userIds, from, to),
  ]);
  return { entries, exceptions, personal };
}

export function exceptionKey(entryId: string, date: string) {
  return `${entryId}|${date}`;
}

export function exceptionSet(data: WeekData): Set<string> {
  return new Set(data.exceptions.map((x) => exceptionKey(x.entry_id, x.exception_date)));
}

/** 요일(0=일~6=토) */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export type BusyInterval = {
  userId: string;
  day: number;
  start: number;
  end: number;
  title: string;
  kind: 'class' | 'personal';
};

/** 그 주에 실제로 바쁜 시간 (휴강 제외, 개인 일정 포함) */
export function busyIntervals(data: WeekData, weekStart: Date): BusyInterval[] {
  const cancelled = exceptionSet(data);
  const list: BusyInterval[] = [];
  for (const e of data.entries) {
    const date = dateOfWeekday(weekStart, e.day_of_week);
    if (cancelled.has(exceptionKey(e.id, date))) continue;
    list.push({ userId: e.user_id, day: e.day_of_week, start: e.start_min, end: e.end_min, title: e.title, kind: 'class' });
  }
  for (const p of data.personal) {
    list.push({ userId: p.user_id, day: weekdayOf(p.event_date), start: p.start_min, end: p.end_min, title: p.title, kind: 'personal' });
  }
  return list;
}

/** 팀원 겹쳐보기: 과목명 없이 그 주의 바쁜 시간만 (DB 함수 team_busy_times) */
export async function listTeamBusyTimes(teamId: string, weekStart: Date): Promise<BusyInterval[]> {
  const { data, error } = await supabase.rpc('team_busy_times', {
    p_team_id: teamId,
    p_from: toDateKey(weekStart),
    p_to: toDateKey(addDays(weekStart, 6)),
  });
  if (error) throw error;
  return ((data ?? []) as { user_id: string; busy_date: string; start_min: number; end_min: number; kind: string }[]).map(
    (r) => ({
      userId: r.user_id,
      day: weekdayOf(r.busy_date),
      start: r.start_min,
      end: r.end_min,
      title: '',
      kind: r.kind === 'personal' ? 'personal' : 'class',
    }),
  );
}
