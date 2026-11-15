import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';
import type { TimetableEntry } from '@/lib/types';

export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
export const WEEKDAYS_ONLY = [1, 2, 3, 4, 5];
export const FULL_WEEK = [1, 2, 3, 4, 5, 6, 0];

export const ENTRY_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#14B8A6'];

const HOUR_H = 52;

export function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** 시간표에 표시할 시간 범위 (기본 9~18시, 일정에 맞춰 확장) */
export function hourRange(starts: number[], ends: number[]): [number, number] {
  const minStart = starts.length ? Math.min(...starts) : 9 * 60;
  const maxEnd = ends.length ? Math.max(...ends) : 18 * 60;
  return [Math.min(9, Math.floor(minStart / 60)), Math.max(18, Math.ceil(maxEnd / 60))];
}

type BlocksProps = {
  mode: 'blocks';
  days: number[];
  entries: TimetableEntry[];
  onPressEntry?: (e: TimetableEntry) => void;
  onPressEmpty?: (day: number, hour: number) => void;
};

type HeatProps = {
  mode: 'heat';
  days: number[];
  /** `${day}|${slot}` (slot = 30분 단위 index) → 바쁜 사람 수 */
  busy: Map<string, number>;
  total: number;
  range: [number, number];
  selected?: string | null;
  onPressSlot?: (day: number, slot: number) => void;
};

export function TimetableGrid(props: BlocksProps | HeatProps) {
  const [startHour, endHour] =
    props.mode === 'blocks'
      ? hourRange(
          props.entries.map((e) => e.start_min),
          props.entries.map((e) => e.end_min),
        )
      : props.range;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const height = hours.length * HOUR_H;

  return (
    <View>
      {/* 요일 헤더 */}
      <View style={s.headerRow}>
        <View style={s.timeCol} />
        {props.days.map((d) => (
          <Text
            key={d}
            style={[s.dayHeader, d === 0 && { color: colors.sunday }, d === 6 && { color: colors.saturday }]}
          >
            {DAY_LABELS[d]}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row' }}>
        {/* 시간 라벨 */}
        <View style={[s.timeCol, { height }]}>
          {hours.map((h) => (
            <Text key={h} style={[s.hourLabel, { top: (h - startHour) * HOUR_H - 6 }]}>
              {h}
            </Text>
          ))}
        </View>

        {props.days.map((d) => (
          <View key={d} style={[s.dayCol, { height }]}>
            {/* 시간 격자 */}
            {hours.map((h) => (
              <View key={h} style={[s.hourLine, { top: (h - startHour) * HOUR_H }]} />
            ))}

            {props.mode === 'blocks' ? (
              <>
                {props.onPressEmpty &&
                  hours.map((h) => (
                    <Pressable
                      key={`e${h}`}
                      onPress={() => props.onPressEmpty!(d, h)}
                      style={[s.emptyCell, { top: (h - startHour) * HOUR_H }]}
                      accessibilityLabel={`${DAY_LABELS[d]}요일 ${h}시에 추가`}
                    />
                  ))}
                {props.entries
                  .filter((e) => e.day_of_week === d)
                  .map((e) => {
                    const top = ((e.start_min - startHour * 60) / 60) * HOUR_H;
                    const h = ((e.end_min - e.start_min) / 60) * HOUR_H;
                    const bg = e.color || ENTRY_COLORS[0];
                    return (
                      <Pressable
                        key={e.id}
                        onPress={() => props.onPressEntry?.(e)}
                        style={[s.block, { top, height: Math.max(h - 2, 18), backgroundColor: bg }]}
                      >
                        <Text style={s.blockTitle} numberOfLines={h > 40 ? 2 : 1}>
                          {e.title}
                        </Text>
                        {e.location && h > 50 ? (
                          <Text style={s.blockSub} numberOfLines={1}>
                            {e.location}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
              </>
            ) : (
              Array.from({ length: hours.length * 2 }, (_, i) => {
                const slot = startHour * 2 + i;
                const key = `${d}|${slot}`;
                const count = props.busy.get(key) ?? 0;
                const ratio = props.total ? count / props.total : 0;
                const selected = props.selected === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => props.onPressSlot?.(d, slot)}
                    style={[
                      s.heatCell,
                      {
                        top: i * (HOUR_H / 2),
                        backgroundColor: count === 0 ? 'rgba(16,185,129,0.12)' : `rgba(239,68,68,${0.15 + 0.7 * ratio})`,
                      },
                      selected && { borderWidth: 2, borderColor: colors.text },
                    ]}
                  />
                );
              })
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 4 },
  timeCol: { width: 24 },
  dayHeader: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.text },
  hourLabel: { position: 'absolute', right: 4, fontSize: 10, color: colors.textMuted },
  dayCol: { flex: 1, position: 'relative', borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  hourLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  emptyCell: { position: 'absolute', left: 0, right: 0, height: HOUR_H },
  block: { position: 'absolute', left: 2, right: 2, borderRadius: 6, padding: 4, overflow: 'hidden' },
  blockTitle: { color: '#fff', fontSize: 11, fontWeight: '700' },
  blockSub: { color: 'rgba(255,255,255,0.85)', fontSize: 10, marginTop: 2 },
  heatCell: { position: 'absolute', left: 1, right: 1, height: HOUR_H / 2 - 1, borderRadius: 3 },
});
