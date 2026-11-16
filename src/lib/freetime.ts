// 하루 중 팀원이 모두(또는 한 명 빼고) 비는 시간 계산
export type Interval = { start: number; end: number };
export type FreeResult = { start: number; end: number; full: boolean; excluded?: string };

/** 겹치는 구간 합치기 */
function merge(list: Interval[]): Interval[] {
  const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** [from, to] 범위에서 busy 를 뺀 빈 구간 (minLen 분 이상) */
function gaps(busy: Interval[], from: number, to: number, minLen: number): Interval[] {
  const out: Interval[] = [];
  let cur = from;
  for (const b of merge(busy)) {
    if (b.end <= cur) continue;
    if (b.start >= to) break;
    if (b.start - cur >= minLen) out.push({ start: cur, end: Math.min(b.start, to) });
    cur = Math.max(cur, b.end);
  }
  if (to - cur >= minLen) out.push({ start: cur, end: to });
  return out;
}

/**
 * @param busyByUser 멤버별 바쁜 구간 (수업·개인 일정, 휴강은 이미 제외된 것)
 * @param shared     모두에게 해당하는 바쁜 구간 (이미 잡힌 팀 일정 등)
 * 전원이 1시간 이상 비는 시간이 있으면 그것만, 없으면 "한 명 빼고" 가장 많이 비는 경우를 반환
 */
export function findFreeWindows(
  memberIds: string[],
  busyByUser: Map<string, Interval[]>,
  shared: Interval[],
  from: number,
  to: number,
): FreeResult[] {
  if (to - from < 30 || memberIds.length === 0) return [];
  const all = memberIds.flatMap((id) => busyByUser.get(id) ?? []);
  const full = gaps([...all, ...shared], from, to, 30).map((g) => ({ ...g, full: true }));
  if (full.some((g) => g.end - g.start >= 60) || memberIds.length < 3) return full;

  // 전원 가능한 1시간이 없으면: 한 명을 빼면 가장 길게 비는 경우
  let best: FreeResult[] = full;
  let bestTotal = full.reduce((s, g) => s + (g.end - g.start), 0);
  for (const skip of memberIds) {
    const others = memberIds.filter((id) => id !== skip).flatMap((id) => busyByUser.get(id) ?? []);
    const windows = gaps([...others, ...shared], from, to, 60);
    const total = windows.reduce((s, g) => s + (g.end - g.start), 0);
    if (total > bestTotal) {
      bestTotal = total;
      best = windows.map((g) => ({ ...g, full: false, excluded: skip }));
    }
  }
  return best;
}
