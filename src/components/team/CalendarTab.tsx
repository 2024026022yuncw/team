import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { MonthCalendar } from '@/components/MonthCalendar';
import { Card, EmptyState, Fab, SectionTitle, styles } from '@/components/ui';
import { listEvents } from '@/lib/api';
import { addDays, formatDay, formatTime, monthGrid, toDateKey, todayKey } from '@/lib/date';
import { useAsync, useRealtime } from '@/lib/hooks';
import { useTeam } from '@/lib/team-context';
import { colorFor, colors } from '@/lib/theme';
import type { TeamEvent } from '@/lib/types';

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
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(todayKey());

  const grid = monthGrid(month);
  const from = grid[0];
  const to = addDays(grid[grid.length - 1], 1);

  const { data: events, reload } = useAsync<TeamEvent[]>(
    () => listEvents(teamId, from, to),
    [teamId, from.getTime()],
    [],
  );
  useRealtime(`events-${teamId}`, [{ table: 'events', filter: `team_id=eq.${teamId}` }], reload);

  const { dots, byDay } = useMemo(() => {
    const dots: Record<string, string[]> = {};
    const byDay: Record<string, TeamEvent[]> = {};
    for (const e of events) {
      for (const k of eventDays(e)) {
        (dots[k] ??= []).push(colorFor(e.created_by));
        (byDay[k] ??= []).push(e);
      }
    }
    return { dots, byDay };
  }, [events]);

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
          <EmptyState icon="calendar-clear-outline" title="일정이 없어요" hint="+ 버튼으로 팀 일정을 추가하세요." />
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
              {e.location ? (
                <View style={[styles.row, { marginTop: 4, gap: 4 }]}>
                  <Ionicons name="location-outline" size={14} color={colors.textSub} />
                  <Text style={styles.sub}>{e.location}</Text>
                </View>
              ) : null}
              <Text style={[styles.muted, { marginTop: 6 }]}>등록: {nameOf(e.created_by)}</Text>
            </Card>
          ))
        )}
      </ScrollView>
      <Fab onPress={openNew} />
    </View>
  );
}
