import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addMonths, formatMonth, monthGrid, toDateKey, todayKey, WEEKDAYS } from '@/lib/date';
import { colors } from '@/lib/theme';

type Props = {
  month: Date;
  onMonthChange: (m: Date) => void;
  /** 선택된 날짜(단일) 또는 날짜들(다중) */
  selected: string | string[];
  onSelect: (key: string) => void;
  /** 날짜별 점 색상 목록 (최대 3개 표시) */
  dots?: Record<string, string[]>;
  /** 오늘 이전 날짜 선택 불가 */
  disablePast?: boolean;
};

export function MonthCalendar({ month, onMonthChange, selected, onSelect, dots, disablePast }: Props) {
  const days = monthGrid(month);
  const today = todayKey();
  const selectedSet = new Set(Array.isArray(selected) ? selected : [selected]);

  return (
    <View>
      <View style={s.header}>
        <Pressable onPress={() => onMonthChange(addMonths(month, -1))} hitSlop={12} accessibilityLabel="이전 달">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.monthText}>{formatMonth(month)}</Text>
        <Pressable onPress={() => onMonthChange(addMonths(month, 1))} hitSlop={12} accessibilityLabel="다음 달">
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={s.week}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={w}
            style={[s.weekday, i === 0 && { color: colors.sunday }, i === 6 && { color: colors.saturday }]}
          >
            {w}
          </Text>
        ))}
      </View>

      <View style={s.grid}>
        {days.map((d) => {
          const key = toDateKey(d);
          const inMonth = d.getMonth() === month.getMonth();
          const isSelected = selectedSet.has(key);
          const isToday = key === today;
          const disabled = disablePast && key < today;
          const dayColors = dots?.[key] ?? [];
          const dow = d.getDay();
          return (
            <Pressable
              key={key}
              style={s.cell}
              onPress={() => !disabled && onSelect(key)}
              disabled={disabled}
              accessibilityLabel={key}
              accessibilityState={{ selected: isSelected, disabled }}
            >
              <View style={[s.dayCircle, isSelected && s.selected, !isSelected && isToday && s.today]}>
                <Text
                  style={[
                    s.dayText,
                    dow === 0 && { color: colors.sunday },
                    dow === 6 && { color: colors.saturday },
                    !inMonth && { opacity: 0.3 },
                    disabled && { opacity: 0.25 },
                    isSelected && { color: '#fff', fontWeight: '700' },
                  ]}
                >
                  {d.getDate()}
                </Text>
              </View>
              <View style={s.dots}>
                {dayColors.slice(0, 3).map((c, i) => (
                  <View key={i} style={[s.dot, { backgroundColor: c }]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  monthText: { fontSize: 17, fontWeight: '700', color: colors.text },
  week: { flexDirection: 'row', marginTop: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.textSub, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.primary },
  today: { borderWidth: 1.5, borderColor: colors.primary },
  dayText: { fontSize: 15, color: colors.text },
  dots: { flexDirection: 'row', height: 6, gap: 2, marginTop: 1 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
