import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { formatMin, FULL_WEEK, hourRange, TimetableGrid, WEEKDAYS_ONLY } from '@/components/TimetableGrid';
import { Avatar, Card, Chip, SectionTitle, styles } from '@/components/ui';
import { addDays, dateOfWeekday, formatShortDay, startOfWeek, toDateKey } from '@/lib/date';
import { useAsync } from '@/lib/hooks';
import { listTeamBusyTimes, type BusyInterval } from '@/lib/schedule';
import { useTeam } from '@/lib/team-context';
import { colorFor, colors } from '@/lib/theme';

export default function TeamTimetableScreen() {
  const { teamId, members, nameOf } = useTeam();
  const memberIds = members.map((m) => m.user_id);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  // 팀원 시간표는 과목명 없이 "바쁜 시간"만 받아옴 (DB 함수 team_busy_times)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { data: intervals, reload } = useAsync<BusyInterval[]>(
    async () => {
      const list = await listTeamBusyTimes(teamId, weekStart);
      setUpdatedAt(new Date());
      return list;
    },
    [teamId, weekStart.getTime()],
    [],
  );
  // 사생활 보호로 팀원 변경은 실시간 알림을 받을 수 없어서, 화면을 보는 동안 15초마다 새로고침
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(reload, 15_000);
      return () => clearInterval(timer);
    }, [reload]),
  );

  const included = memberIds.filter((id) => !excluded.includes(id));
  const visible = intervals.filter((e) => included.includes(e.userId));
  const hasWeekend = visible.some((e) => e.day === 0 || e.day === 6);
  const days = hasWeekend ? FULL_WEEK : WEEKDAYS_ONLY;
  const range = hourRange(
    visible.map((e) => e.start),
    visible.map((e) => e.end),
  );

  // 30분 칸마다 바쁜 사람 목록
  const busyUsers = useMemo(() => {
    const map = new Map<string, Map<string, BusyInterval>>();
    for (const e of visible) {
      for (let slot = Math.floor(e.start / 30); slot * 30 < e.end; slot++) {
        const key = `${e.day}|${slot}`;
        if (!map.has(key)) map.set(key, new Map());
        // 같은 칸에 수업과 개인 일정이 겹치면 개인 일정으로 표시
        const prev = map.get(key)!.get(e.userId);
        if (!prev || e.kind === 'personal') map.get(key)!.set(e.userId, e);
      }
    }
    return map;
  }, [visible]);

  const busyCount = useMemo(() => {
    const m = new Map<string, number>();
    busyUsers.forEach((users, key) => m.set(key, users.size));
    return m;
  }, [busyUsers]);

  // 모두 비는 시간 (1시간 이상, 표시 범위 안)
  const freeBlocks = useMemo(() => {
    const list: { day: number; start: number; end: number }[] = [];
    for (const d of days) {
      let runStart: number | null = null;
      for (let slot = range[0] * 2; slot <= range[1] * 2; slot++) {
        const free = slot < range[1] * 2 && !busyCount.get(`${d}|${slot}`);
        if (free && runStart === null) runStart = slot;
        if (!free && runStart !== null) {
          if (slot - runStart >= 2) list.push({ day: d, start: runStart * 30, end: slot * 30 });
          runStart = null;
        }
      }
    }
    return list;
  }, [days, range, busyCount]);

  const selectedBusy = selected ? busyUsers.get(selected) : undefined;
  const [selDay, selSlot] = selected ? selected.split('|').map(Number) : [0, 0];

  const dayDates: Record<number, string> = {};
  FULL_WEEK.forEach((d) => {
    const key = dateOfWeekday(weekStart, d);
    dayDates[d] = `${Number(key.slice(5, 7))}/${Number(key.slice(8))}`;
  });
  const isThisWeek = toDateKey(weekStart) === toDateKey(startOfWeek(new Date()));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
        <Pressable onPress={() => { setWeekStart((w) => addDays(w, -7)); setSelected(null); }} hitSlop={12} accessibilityLabel="이전 주">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => { setWeekStart(startOfWeek(new Date())); setSelected(null); }} style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
            {formatShortDay(toDateKey(weekStart))} ~ {formatShortDay(toDateKey(addDays(weekStart, 6)))}
          </Text>
          <Text style={[styles.muted, { color: isThisWeek ? colors.primary : colors.textMuted }]}>
            {isThisWeek ? '이번 주' : '눌러서 이번 주로'}
          </Text>
        </Pressable>
        <Pressable onPress={() => { setWeekStart((w) => addDays(w, 7)); setSelected(null); }} hitSlop={12} accessibilityLabel="다음 주">
          <Ionicons name="chevron-forward" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
        <Text style={styles.muted}>
          {updatedAt
            ? `${updatedAt.getHours()}:${String(updatedAt.getMinutes()).padStart(2, '0')}:${String(updatedAt.getSeconds()).padStart(2, '0')} 기준 · 15초마다 자동 새로고침`
            : '불러오는 중…'}
        </Text>
        <Pressable onPress={reload} hitSlop={10} style={[styles.row, { gap: 4 }]} accessibilityLabel="새로고침">
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600' }}>새로고침</Text>
        </Pressable>
      </View>
      <Text style={[styles.sub, { marginBottom: 8 }]}>
        팀원들의 바쁜 시간을 겹쳐 보여줘요(휴강·개인 일정 반영). 과목명·강의실은 팀원에게 공개되지 않아요. <Text style={{ color: colors.success, fontWeight: '700' }}>초록</Text>은 모두
        비는 시간, <Text style={{ color: colors.danger, fontWeight: '700' }}>빨강</Text>은 진할수록 바쁜 사람이 많아요.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {members.map((m) => {
          const on = !excluded.includes(m.user_id);
          const count = intervals.filter((e) => e.userId === m.user_id).length;
          return (
            <Chip
              key={m.user_id}
              label={`${nameOf(m.user_id)}${count === 0 ? ' (이번 주 일정 없음)' : ''}`}
              active={on}
              color={colorFor(m.user_id)}
              onPress={() =>
                setExcluded((prev) => (on ? [...prev, m.user_id] : prev.filter((x) => x !== m.user_id)))
              }
            />
          );
        })}
      </View>

      <Card style={{ paddingHorizontal: 8 }}>
        <TimetableGrid
          mode="heat"
          days={days}
          dayDates={dayDates}
          busy={busyCount}
          total={included.length}
          range={range}
          selected={selected}
          onPressSlot={(d, slot) => setSelected(`${d}|${slot}`)}
        />
      </Card>

      {selected && (
        <Card>
          <Text style={styles.title}>
            {formatShortDay(dateOfWeekday(weekStart, selDay))} {formatMin(selSlot * 30)}~{formatMin(selSlot * 30 + 30)}
          </Text>
          <View style={{ marginTop: 8, gap: 6 }}>
            {included.map((id) => {
              const entry = selectedBusy?.get(id);
              return (
                <View key={id} style={[styles.row, { gap: 8 }]}>
                  <Avatar id={id} name={nameOf(id)} size={24} />
                  <Text style={{ flex: 1, color: colors.text }}>{nameOf(id)}</Text>
                  <Text style={{ color: entry ? colors.danger : colors.success, fontWeight: '600' }}>
                    {entry ? (entry.kind === 'personal' ? '개인 일정' : '수업 있음') : '가능'}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      )}

      <SectionTitle>모두 비는 시간 (1시간 이상)</SectionTitle>
      {included.length === 0 ? (
        <Text style={styles.muted}>표시할 멤버를 선택하세요.</Text>
      ) : freeBlocks.length === 0 ? (
        <Text style={styles.muted}>겹치는 빈 시간이 없어요.</Text>
      ) : (
        <Card>
          {freeBlocks.map((b) => (
            <Text key={`${b.day}-${b.start}`} style={{ paddingVertical: 4, color: colors.text }}>
              <Text style={{ fontWeight: '700' }}>{formatShortDay(dateOfWeekday(weekStart, b.day))}</Text> {formatMin(b.start)} ~ {formatMin(b.end)}
              <Text style={styles.muted}> ({(b.end - b.start) / 60}시간)</Text>
            </Text>
          ))}
        </Card>
      )}
      <Text style={[styles.muted, { marginTop: 8 }]}>
        시간표는 하단 &apos;시간표&apos; 탭에서 각자 등록할 수 있어요.
      </Text>
    </ScrollView>
  );
}
