import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { fromDateKey, formatDay, parseHHMM, toHHMM } from '@/lib/date';
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

/**
 * 시간 입력: "13:45" 처럼 직접 입력하거나 ± 버튼으로 5분씩 조절.
 * minutes 는 자정부터의 분(0~max).
 */
export function TimeStepper({
  minutes,
  onChange,
  max = 1439,
}: {
  minutes: number;
  onChange: (m: number) => void;
  max?: number;
}) {
  const [text, setText] = useState(toHHMM(minutes));
  const [invalid, setInvalid] = useState(false);

  // 바깥에서 값이 바뀌면 입력칸도 맞춤
  useEffect(() => {
    setText(toHHMM(minutes));
    setInvalid(false);
  }, [minutes]);

  function commit(value: string) {
    // "930" → 9:30, "1345" → 13:45 처럼 콜론 없이 입력해도 인식
    const digits = value.replace(/[^0-9]/g, '');
    const normalized = value.includes(':') ? value : digits.length >= 3 ? `${digits.slice(0, -2)}:${digits.slice(-2)}` : `${digits}:00`;
    const parsed = parseHHMM(normalized);
    if (parsed === null || parsed > max) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(toHHMM(parsed));
    onChange(parsed);
  }

  const step = (delta: number) => onChange(Math.min(max, Math.max(0, minutes + delta)));
  const h = Math.floor(minutes / 60);
  const label = h < 12 ? '오전' : h === 24 ? '자정' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;

  return (
    <View>
      <View style={[s.stepper, invalid && { borderColor: colors.danger }]}>
        <Pressable onPress={() => step(-5)} style={s.stepBtn} accessibilityLabel="5분 전">
          <Ionicons name="remove" size={20} color={colors.primary} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (invalid) setInvalid(false);
          }}
          onBlur={() => commit(text)}
          onSubmitEditing={() => commit(text)}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          maxLength={5}
          selectTextOnFocus
          style={[s.timeText, s.timeInput]}
          accessibilityLabel="시간 입력 (예: 13:45)"
        />
        <Text style={s.ampm}>
          {label} {h12}:{String(minutes % 60).padStart(2, '0')}
        </Text>
        <Pressable onPress={() => step(5)} style={s.stepBtn} accessibilityLabel="5분 후">
          <Ionicons name="add" size={20} color={colors.primary} />
        </Pressable>
      </View>
      {invalid && <Text style={s.error}>00:00 ~ {toHHMM(max)} 형식으로 입력해주세요 (예: 13:45)</Text>}
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
  timeInput: { fontSize: 20, paddingVertical: 10, letterSpacing: 1 },
  ampm: { fontSize: 13, color: colors.textSub, marginRight: 4 },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
});
