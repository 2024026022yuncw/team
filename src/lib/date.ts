// 날짜 유틸 — 모든 'date key' 는 로컬 시간 기준 'YYYY-MM-DD' 문자열입니다.

const pad = (n: number) => String(n).padStart(2, '0');

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/** 달력 그리드용: 해당 월을 덮는 6주(42일) */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function formatMonth(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

/** 11월 15일 (토) */
export function formatDay(d: Date | string): string {
  const date = typeof d === 'string' ? fromDateKey(d) : d;
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

/** 11/15(토) */
export function formatShortDay(d: Date | string): string {
  const date = typeof d === 'string' ? fromDateKey(d) : d;
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

/** 오후 3:30 */
export function formatTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const h = date.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${pad(date.getMinutes())}`;
}

export function formatHour(h: number): string {
  return `${pad(h)}:00`;
}

/** 마감일까지 남은 날짜 표시 (D-3, D-Day, D+2) */
export function dDay(key: string): string {
  const diff = Math.round((fromDateKey(key).getTime() - fromDateKey(todayKey()).getTime()) / 86400000);
  if (diff === 0) return 'D-Day';
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

/** date key + 분(0~1439) → Date */
export function combine(key: string, minutes: number): Date {
  const d = fromDateKey(key);
  d.setMinutes(minutes);
  return d;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
