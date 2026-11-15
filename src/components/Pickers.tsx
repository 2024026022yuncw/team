import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { fromDateKey, formatDay } from '@/lib/date';
import { colors, radius } from '@/lib/theme';
import { MonthCalendar } from './MonthCalendar';
import { Button } from './ui';

/** 날짜 선택 필드: 누르면 달력 모달이 열립니다. */
export function DateField({
  value,
  onChange,
  placeholder = '날짜 선택',
  allowClear,
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value ? fromDateKey(value) : new Date()));

  return (
    <>
      <Pressable style={s.field} onPress={() => setOpen(true)}>
        <Ionicons name="calendar-outline" size={18} color={colors.textSub} />
        <Text style={[s.fieldText, !value && { color: colors.textMuted }]}>{value ? formatDay(value) : placeholder}</Text>
        {allowClear && value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={10} accessibilityLabel="날짜 지우기">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <MonthCalendar
              month={month}
              onMonthChange={setMonth}
              selected={value ?? ''}
              onSelect={(k) => {
                onChange(k);
                setOpen(false);
              }}
            />
            <Button title="닫기" variant="secondary" onPress={() => setOpen(false)} style={{ marginTop: 12 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** 시간 선택: 분 단위 값(0~1439)을 30분 간격으로 조절 */
export function TimeStepper({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const step = (delta: number) => onChange((minutes + delta + 1440) % 1440);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;

  return (
    <View style={s.stepper}>
      <Pressable onPress={() => step(-60)} style={s.stepBtn} accessibilityLabel="1시간 전">
        <Ionicons name="play-back" size={16} color={colors.primary} />
      </Pressable>
      <Pressable onPress={() => step(-30)} style={s.stepBtn} accessibilityLabel="30분 전">
        <Ionicons name="remove" size={20} color={colors.primary} />
      </Pressable>
      <Text style={s.timeText}>
        {ampm} {h12}:{String(m).padStart(2, '0')}
      </Text>
      <Pressable onPress={() => step(30)} style={s.stepBtn} accessibilityLabel="30분 후">
        <Ionicons name="add" size={20} color={colors.primary} />
      </Pressable>
      <Pressable onPress={() => step(60)} style={s.stepBtn} accessibilityLabel="1시간 후">
        <Ionicons name="play-forward" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

/** 정수 스테퍼 (투표 시간 범위 등) */
export function NumberStepper({
  value,
  min,
  max,
  onChange,
  format = String,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <View style={s.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={s.stepBtn} disabled={value <= min}>
        <Ionicons name="remove" size={20} color={value <= min ? colors.textMuted : colors.primary} />
      </Pressable>
      <Text style={s.timeText}>{format(value)}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={s.stepBtn} disabled={value >= max}>
        <Ionicons name="add" size={20} color={value >= max ? colors.textMuted : colors.primary} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 13,
    backgroundColor: colors.card,
  },
  fieldText: { flex: 1, fontSize: 16, color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: 4,
  },
  stepBtn: { padding: 10 },
  timeText: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text },
});
