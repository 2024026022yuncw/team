import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { DAY_LABELS, formatMin, FULL_WEEK, hourRange, TimetableGrid, WEEKDAYS_ONLY } from '@/components/TimetableGrid';
import { Avatar, Card, Chip, SectionTitle, styles } from '@/components/ui';
import { listTimetable } from '@/lib/api';
import { useAsync, useRealtime } from '@/lib/hooks';
import { useTeam } from '@/lib/team-context';
import { colorFor, colors } from '@/lib/theme';
import type { TimetableEntry } from '@/lib/types';

export default function TeamTimetableScreen() {
  const { teamId, members, nameOf } = useTeam();
  const memberIds = members.map((m) => m.user_id);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: entries, reload } = useAsync<TimetableEntry[]>(
    () => listTimetable(memberIds),
    [memberIds.join(',')],
    [],
  );
  useRealtime(`team-timetable-${teamId}`, [{ table: 'timetable_entries' }], reload);

  const included = memberIds.filter((id) => !excluded.includes(id));
  const visible = entries.filter((e) => included.includes(e.user_id));
  const hasWeekend = visible.some((e) => e.day_of_week === 0 || e.day_of_week === 6);
  const days = hasWeekend ? FULL_WEEK : WEEKDAYS_ONLY;
  const range = hourRange(
    visible.map((e) => e.start_min),
    visible.map((e) => e.end_min),
  );

  // 30분 칸마다 바쁜 사람 목록
  const busyUsers = useMemo(() => {
    const map = new Map<string, Map<string, TimetableEntry>>();
    for (const e of visible) {
      for (let slot = Math.floor(e.start_min / 30); slot * 30 < e.end_min; slot++) {
        const key = `${e.day_of_week}|${slot}`;
        if (!map.has(key)) map.set(key, new Map());
        map.get(key)!.set(e.user_id, e);
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={[styles.sub, { marginBottom: 8 }]}>
        팀원들의 시간표를 겹쳐 보여줘요. <Text style={{ color: colors.success, fontWeight: '700' }}>초록</Text>은 모두
        비는 시간, <Text style={{ color: colors.danger, fontWeight: '700' }}>빨강</Text>은 진할수록 바쁜 사람이 많아요.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {members.map((m) => {
          const on = !excluded.includes(m.user_id);
          const count = entries.filter((e) => e.user_id === m.user_id).length;
          return (
            <Chip
              key={m.user_id}
              label={`${nameOf(m.user_id)}${count === 0 ? ' (미등록)' : ''}`}
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
            {DAY_LABELS[selDay]}요일 {formatMin(selSlot * 30)}~{formatMin(selSlot * 30 + 30)}
          </Text>
          <View style={{ marginTop: 8, gap: 6 }}>
            {included.map((id) => {
              const entry = selectedBusy?.get(id);
              return (
                <View key={id} style={[styles.row, { gap: 8 }]}>
                  <Avatar id={id} name={nameOf(id)} size={24} />
                  <Text style={{ flex: 1, color: colors.text }}>{nameOf(id)}</Text>
                  <Text style={{ color: entry ? colors.danger : colors.success, fontWeight: '600' }}>
                    {entry ? entry.title : '가능'}
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
              <Text style={{ fontWeight: '700' }}>{DAY_LABELS[b.day]}</Text> {formatMin(b.start)} ~ {formatMin(b.end)}
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
