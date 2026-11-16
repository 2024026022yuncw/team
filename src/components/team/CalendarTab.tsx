import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { MonthCalendar } from '@/components/MonthCalendar';
import { formatMin } from '@/components/TimetableGrid';
import { Card, Chip, EmptyState, Fab, SectionTitle, styles } from '@/components/ui';
import { listEvents, listPersonalEvents } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { addDays, fromDateKey, formatDay, formatTime, monthGrid, startOfWeek, toDateKey, todayKey } from '@/lib/date';
import { EMPTY_WEEK, exceptionKey, exceptionSet, loadWeek, type WeekData } from '@/lib/schedule';
import { useAsync, useRealtime } from '@/lib/hooks';
import { isUrl, meetingSummary } from '@/lib/meeting';
import { useTeam } from '@/lib/team-context';
import { colorFor, colors } from '@/lib/theme';
import type { PersonalEvent, TeamEvent } from '@/lib/types';

const SHOW_MINE_KEY = 'calendar.showMine';

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

/** 팀 캘린더의 "내 일정" 한 줄 (본인 데이터만, RLS 로 남의 것은 조회 불가) */
type MyItem = { key: string; kind: 'class' | 'personal'; start: number; end: number; title: string; sub: string; id: string };

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

export function CalendarTab() {
  const router = useRouter();
  const { teamId, nameOf } = useTeam();
  const userId = useUserId();
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(todayKey());
  const [showMine, setShowMine] = useState(loadShowMine);
  const [addSheet, setAddSheet] = useState(false);

  const grid = monthGrid(month);
  const from = grid[0];
  const to = addDays(grid[grid.length - 1], 1);

  const { data: events, reload } = useAsync<TeamEvent[]>(
    () => listEvents(teamId, from, to),
    [teamId, from.getTime()],
    [],
  );
  useRealtime(`events-${teamId}`, [{ table: 'events', filter: `team_id=eq.${teamId}` }], reload);

  // 내 시간표·휴강·개인 일정 (선택한 날짜가 속한 주)
  const selectedWeek = startOfWeek(fromDateKey(selected));
  const { data: myWeek } = useAsync<WeekData>(
    () => (showMine ? loadWeek([userId], selectedWeek) : Promise.resolve(EMPTY_WEEK)),
    [userId, selectedWeek.getTime(), showMine],
    EMPTY_WEEK,
  );
  // 달력 회색 점: 이번 달 화면에 보이는 내 개인 일정
  const { data: myPersonal } = useAsync<PersonalEvent[]>(
    () => (showMine ? listPersonalEvents([userId], toDateKey(from), toDateKey(grid[grid.length - 1])) : Promise.resolve([])),
    [userId, from.getTime(), showMine],
    [],
  );

  const myItems: MyItem[] = useMemo(() => {
    if (!showMine) return [];
    const weekday = fromDateKey(selected).getDay();
    const cancelled = exceptionSet(myWeek);
    const classes = myWeek.entries
      .filter((e) => e.day_of_week === weekday && !cancelled.has(exceptionKey(e.id, selected)))
      .map((e) => ({ key: `c-${e.id}`, kind: 'class' as const, start: e.start_min, end: e.end_min, title: e.title, sub: e.location, id: e.id }));
    const personal = myWeek.personal
      .filter((p) => p.event_date === selected)
      .map((p) => ({ key: `p-${p.id}`, kind: 'personal' as const, start: p.start_min, end: p.end_min, title: p.title, sub: p.location, id: p.id }));
    return [...classes, ...personal].sort((a, b) => a.start - b.start);
  }, [showMine, myWeek, selected]);

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

  const openNew = useCallback(
    () => router.push({ pathname: '/team/[id]/event', params: { id: teamId, date: selected } }),
    [router, teamId, selected],
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={setSelected}
            dots={dots}
          />
        </Card>

        <SectionTitle>{formatDay(selected)}</SectionTitle>
        {dayEvents.length === 0 ? (
          <EmptyState icon="calendar-clear-outline" title="팀 일정이 없어요" hint="+ 버튼으로 팀 일정이나 내 개인 일정을 추가하세요." />
        ) : (
          dayEvents.map((e) => (
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
          ))
        )}

        {/* 내 일정: 본인만 보임 */}
        <SectionTitle
          right={
            <Chip
              label={showMine ? '내 일정 표시 중' : '내 일정 숨김'}
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
          🔒 내 일정
        </SectionTitle>
        {showMine && (
          <>
            <Text style={[styles.muted, { marginBottom: 8 }]}>내 시간표와 개인 일정은 나만 볼 수 있어요. 팀원에게는 보이지 않아요.</Text>
            {myItems.length === 0 ? (
              <Text style={styles.sub}>이 날은 수업이나 개인 일정이 없어요.</Text>
            ) : (
              <Card style={{ paddingVertical: 6 }}>
                {myItems.map((m) => (
                  <Pressable
                    key={m.key}
                    onPress={() =>
                      router.push({
                        pathname: '/timetable-edit',
                        params: m.kind === 'class' ? { entryId: m.id } : { kind: 'once', personalId: m.id },
                      })
                    }
                    style={[styles.row, { gap: 10, paddingVertical: 8 }]}
                  >
                    <Text style={{ fontSize: 16 }}>{m.kind === 'class' ? '📚' : '🗓️'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                        {m.title}
                      </Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {m.kind === 'class' ? '수업' : '개인 일정'} · {formatMin(m.start)}~{formatMin(m.end)}
                        {m.sub ? ` · ${m.sub}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
      <Fab onPress={() => setAddSheet(true)} />
      <ActionSheet
        visible={addSheet}
        title="무엇을 추가할까요?"
        subtitle={formatDay(selected)}
        actions={[
          { label: '팀 일정 (팀원 모두에게 보여요)', icon: 'people-outline', onPress: openNew },
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
