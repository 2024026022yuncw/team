import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { MonthCalendar } from '@/components/MonthCalendar';
import { DayTimeline, type FreeWindow, type TimelineBlock } from '@/components/team/DayTimeline';
import { Card, Chip, Fab, SectionTitle, styles } from '@/components/ui';
import { listEvents, listPersonalEvents } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { addDays, fromDateKey, formatDay, formatTime, minutesOfDay, monthGrid, startOfWeek, toDateKey, todayKey } from '@/lib/date';
import { findFreeWindows, type Interval } from '@/lib/freetime';
import { useAsync, useRealtime } from '@/lib/hooks';
import { isUrl, meetingSummary } from '@/lib/meeting';
import {
  EMPTY_WEEK,
  exceptionKey,
  exceptionSet,
  listTeamBusyTimes,
  loadWeek,
  type BusyInterval,
  type WeekData,
} from '@/lib/schedule';
import { useTeam } from '@/lib/team-context';
import { colorFor, colors } from '@/lib/theme';
import type { PersonalEvent, TeamEvent } from '@/lib/types';

const SHOW_MINE_KEY = 'calendar.showMine';
const DAY_FROM = 9 * 60; // 모임 가능 시간 계산 범위 09:00 ~ 22:00
const DAY_TO = 22 * 60;

function loadShowMine(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHOW_MINE_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveShowMine(v: boolean) {
  try {
    globalThis.localStorage?.setItem(SHOW_MINE_KEY, v ? '1' : '0');
  } catch {
    // 저장 실패는 무시
  }
}

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

/** 일정이 걸쳐 있는 모든 날짜 key */
function eventDays(e: TeamEvent): string[] {
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  const keys: string[] = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end; d = addDays(d, 1)) {
    keys.push(toDateKey(d));
    if (keys.length > 60) break;
  }
  return keys;
}

/** 팀 일정이 그 날짜에서 차지하는 구간(분) */
function eventSpanOn(e: TeamEvent, dateKey: string): Interval {
  const s = new Date(e.starts_at);
  const en = new Date(e.ends_at);
  return {
    start: toDateKey(s) === dateKey ? minutesOfDay(s) : 0,
    end: toDateKey(en) === dateKey ? minutesOfDay(en) : 1440,
  };
}

export function CalendarTab() {
  const router = useRouter();
  const { teamId, members, nameOf } = useTeam();
  const userId = useUserId();
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(todayKey());
  const [showMine, setShowMine] = useState(loadShowMine);
  const [addSheet, setAddSheet] = useState(false);

  const grid = monthGrid(month);
  const from = grid[0];
  const to = addDays(grid[grid.length - 1], 1);
  const selectedWeek = startOfWeek(fromDateKey(selected));

  // 팀 일정
  const { data: events, reload } = useAsync<TeamEvent[]>(() => listEvents(teamId, from, to), [teamId, from.getTime()], []);
  useRealtime(`events-${teamId}`, [{ table: 'events', filter: `team_id=eq.${teamId}` }], reload);

  // 팀원 전체의 바쁜 시간(제목 없음) → 모임 가능 시간 계산용
  const { data: teamBusy } = useAsync<BusyInterval[]>(
    () => listTeamBusyTimes(teamId, selectedWeek),
    [teamId, selectedWeek.getTime()],
    [],
  );

  // 내 시간표·휴강·개인 일정 (본인 데이터만, 나만 보임)
  const { data: myWeek } = useAsync<WeekData>(
    () => (showMine ? loadWeek([userId], selectedWeek) : Promise.resolve(EMPTY_WEEK)),
    [userId, selectedWeek.getTime(), showMine],
    EMPTY_WEEK,
  );
  const { data: myPersonal } = useAsync<PersonalEvent[]>(
    () => (showMine ? listPersonalEvents([userId], toDateKey(from), toDateKey(grid[grid.length - 1])) : Promise.resolve([])),
    [userId, from.getTime(), showMine],
    [],
  );

  const { dots, byDay } = useMemo(() => {
    const dots: Record<string, string[]> = {};
    const byDay: Record<string, TeamEvent[]> = {};
    for (const e of events) {
      for (const k of eventDays(e)) {
        (dots[k] ??= []).push(colorFor(e.created_by));
        (byDay[k] ??= []).push(e);
      }
    }
    for (const p of myPersonal) (dots[p.event_date] ??= []).push(colors.textMuted);
    return { dots, byDay };
  }, [events, myPersonal]);

  const dayEvents = byDay[selected] ?? [];
  const weekday = fromDateKey(selected).getDay();
  const isToday = selected === todayKey();
  const isPast = selected < todayKey();

  // 모임 가능 시간
  const freeWindows: FreeWindow[] = useMemo(() => {
    if (isPast) return [];
    const busyByUser = new Map<string, Interval[]>();
    for (const b of teamBusy) {
      if (b.day !== weekday) continue;
      busyByUser.set(b.userId, [...(busyByUser.get(b.userId) ?? []), { start: b.start, end: b.end }]);
    }
    const shared = dayEvents.map((e) => eventSpanOn(e, selected));
    // 오늘이면 지금 이후만 (30분 단위로 올림)
    const now = new Date();
    const start = isToday ? Math.max(DAY_FROM, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30) : DAY_FROM;
    const ids = members.map((m) => m.user_id);
    return findFreeWindows(ids, busyByUser, shared, start, DAY_TO).map((w) => ({
      start: w.start,
      end: w.end,
      full: w.full,
      label: w.full ? `전원 가능 (${ids.length}명)` : `${nameOf(w.excluded)} 빼고`,
    }));
  }, [teamBusy, weekday, dayEvents, selected, isToday, isPast, members, nameOf]);

  // 타임라인 블록
  const teamBlocks: TimelineBlock[] = dayEvents.map((e) => ({
    key: e.id,
    ...eventSpanOn(e, selected),
    title: e.title,
    color: colorFor(e.created_by),
    onPress: () => router.push({ pathname: '/team/[id]/event', params: { id: teamId, eventId: e.id } }),
  }));
  const myBlocks: TimelineBlock[] | null = useMemo(() => {
    if (!showMine) return null;
    const cancelled = exceptionSet(myWeek);
    const classes = myWeek.entries
      .filter((e) => e.day_of_week === weekday && !cancelled.has(exceptionKey(e.id, selected)))
      .map((e) => ({
        key: `c-${e.id}`,
        start: e.start_min,
        end: e.end_min,
        title: e.title,
        sub: e.location,
        color: e.color || colors.primary,
        onPress: () => router.push({ pathname: '/timetable-edit', params: { entryId: e.id } }),
      }));
    const personal = myWeek.personal
      .filter((p) => p.event_date === selected)
      .map((p) => ({
        key: `p-${p.id}`,
        start: p.start_min,
        end: p.end_min,
        title: `🗓️ ${p.title}`,
        sub: p.location,
        color: p.color || colors.textMuted,
        onPress: () => router.push({ pathname: '/timetable-edit', params: { kind: 'once', personalId: p.id } }),
      }));
    return [...classes, ...personal];
  }, [showMine, myWeek, weekday, selected, router]);

  // 타임라인 시간 범위: 기본 9~22시, 일정에 맞춰 확장
  const allBlocks: Interval[] = [...teamBlocks, ...(myBlocks ?? []), ...freeWindows];
  const range: [number, number] = [
    Math.min(9, ...allBlocks.map((b) => Math.floor(b.start / 60))),
    Math.min(24, Math.max(22, ...allBlocks.map((b) => Math.ceil(b.end / 60)))),
  ];

  function createMeetingAt(w: FreeWindow) {
    // 가능 시간이 길면 앞에서부터 1시간짜리로 제안
    const end = Math.min(w.end, w.start + 60, 23 * 60 + 55);
    router.push({ pathname: '/team/[id]/event', params: { id: teamId, date: selected, start: String(w.start), end: String(end) } });
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <MonthCalendar month={month} onMonthChange={setMonth} selected={selected} onSelect={setSelected} dots={dots} />
        </Card>

        <SectionTitle
          right={
            <Chip
              label={showMine ? '🔒 내 일정 표시' : '🔒 내 일정 숨김'}
              active={showMine}
              onPress={() =>
                setShowMine((v) => {
                  saveShowMine(!v);
                  return !v;
                })
              }
            />
          }
        >
          {formatDay(selected)}
        </SectionTitle>

        {/* 모임 가능 시간 요약 */}
        {isPast ? (
          <Text style={[styles.muted, { marginBottom: 8 }]}>지난 날짜예요.</Text>
        ) : freeWindows.length === 0 ? (
          <Text style={[styles.sub, { marginBottom: 8 }]}>😥 이 날은 팀원이 함께 비는 시간이 없어요 (9시~22시).</Text>
        ) : (
          <Text style={[styles.sub, { marginBottom: 8 }]}>
            ✅ {freeWindows[0].full ? '모두 가능' : `${freeWindows[0].label} 가능`}:{' '}
            <Text style={{ fontWeight: '700', color: '#047857' }}>
              {freeWindows.map((w) => `${hhmm(w.start)}~${hhmm(w.end)}`).join(', ')}
            </Text>
          </Text>
        )}

        <Card style={{ paddingHorizontal: 6 }}>
          <DayTimeline range={range} free={freeWindows} team={teamBlocks} mine={myBlocks} onPressFree={createMeetingAt} />
        </Card>
        <Text style={[styles.muted, { marginBottom: 8 }]}>
          초록 칸을 누르면 그 시간으로 모임을 만들 수 있어요. 모임 가능 시간은 팀원들의 시간표·개인 일정(휴강 반영)으로
          계산하고, 과목명 등은 공개되지 않아요. 🔒 내 일정은 나만 보여요.
        </Text>

        {/* 팀 일정 상세 (링크 등) */}
        {dayEvents.length > 0 && <SectionTitle>👥 팀 일정</SectionTitle>}
        {dayEvents.map((e) => (
          <Card
            key={e.id}
            onPress={() => router.push({ pathname: '/team/[id]/event', params: { id: teamId, eventId: e.id } })}
            style={{ borderLeftWidth: 4, borderLeftColor: colorFor(e.created_by) }}
          >
            <Text style={styles.title}>{e.title}</Text>
            <View style={[styles.row, { marginTop: 6, gap: 4 }]}>
              <Ionicons name="time-outline" size={14} color={colors.textSub} />
              <Text style={styles.sub}>
                {toDateKey(new Date(e.starts_at)) === toDateKey(new Date(e.ends_at))
                  ? `${formatTime(e.starts_at)} ~ ${formatTime(e.ends_at)}`
                  : `${formatDay(toDateKey(new Date(e.starts_at)))} ${formatTime(e.starts_at)} ~ ${formatDay(
                      toDateKey(new Date(e.ends_at)),
                    )} ${formatTime(e.ends_at)}`}
              </Text>
            </View>
            {meetingSummary(e) ? <Text style={[styles.sub, { marginTop: 4 }]}>{meetingSummary(e)}</Text> : null}
            {e.meeting_type === 'online' && e.meeting_link ? (
              isUrl(e.meeting_link) ? (
                <Pressable onPress={() => Linking.openURL(e.meeting_link)} hitSlop={6} style={{ marginTop: 4 }}>
                  <Text style={{ color: colors.primary, fontWeight: '600' }} numberOfLines={1}>
                    🔗 접속하기
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.muted, { marginTop: 4 }]} numberOfLines={1}>
                  🔗 {e.meeting_link}
                </Text>
              )
            ) : null}
            <Text style={[styles.muted, { marginTop: 6 }]}>등록: {nameOf(e.created_by)}</Text>
          </Card>
        ))}
      </ScrollView>

      <Fab onPress={() => setAddSheet(true)} />
      <ActionSheet
        visible={addSheet}
        title="무엇을 추가할까요?"
        subtitle={formatDay(selected)}
        actions={[
          {
            label: '팀 일정 (팀원 모두에게 보여요)',
            icon: 'people-outline',
            onPress: () => router.push({ pathname: '/team/[id]/event', params: { id: teamId, date: selected } }),
          },
          {
            label: '내 개인 일정 (나만 보여요)',
            icon: 'lock-closed-outline',
            onPress: () => router.push({ pathname: '/timetable-edit', params: { kind: 'once', date: selected } }),
          },
        ]}
        onClose={() => setAddSheet(false)}
      />
    </View>
  );
}
