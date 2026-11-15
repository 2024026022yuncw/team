import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { formatMin, FULL_WEEK, TimetableGrid, WEEKDAYS_ONLY, type GridBlock } from '@/components/TimetableGrid';
import { Button, Card, Chip, Fab, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { addException, removeException } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { addDays, dateOfWeekday, formatShortDay, startOfWeek, toDateKey } from '@/lib/date';
import { useAsync } from '@/lib/hooks';
import { EMPTY_WEEK, exceptionKey, exceptionSet, loadWeek, weekdayOf, type WeekData } from '@/lib/schedule';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Sheet = { title: string; subtitle?: string; actions: SheetAction[] } | null;

const SHOW_LOCATION_KEY = 'timetable.showLocation';

/** 기기에 저장된 "강의실 표시" 설정 (저장소를 못 쓰는 환경이면 기본값) */
function loadShowLocation(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHOW_LOCATION_KEY) === '1';
  } catch {
    return false;
  }
}

function saveShowLocation(v: boolean) {
  try {
    globalThis.localStorage?.setItem(SHOW_LOCATION_KEY, v ? '1' : '0');
  } catch {
    // 저장 실패는 무시 (이번 화면에서만 적용)
  }
}

export default function TimetableScreen() {
  const router = useRouter();
  const userId = useUserId();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [showWeekend, setShowWeekend] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showLocation, setShowLocation] = useState(loadShowLocation);

  const { data, setData, reload } = useAsync<WeekData>(
    () => loadWeek([userId], weekStart),
    [userId, weekStart.getTime()],
    EMPTY_WEEK,
  );

  const isThisWeek = toDateKey(weekStart) === toDateKey(startOfWeek(new Date()));
  const cancelled = exceptionSet(data);

  const hasWeekend =
    data.entries.some((e) => e.day_of_week === 0 || e.day_of_week === 6) ||
    data.personal.some((p) => [0, 6].includes(weekdayOf(p.event_date)));
  const days = showWeekend || hasWeekend ? FULL_WEEK : WEEKDAYS_ONLY;

  const dayDates = useMemo(() => {
    const map: Record<number, string> = {};
    FULL_WEEK.forEach((d) => {
      const key = dateOfWeekday(weekStart, d);
      map[d] = `${Number(key.slice(5, 7))}/${Number(key.slice(8))}`;
    });
    return map;
  }, [weekStart]);

  const blocks: GridBlock[] = [
    ...data.entries.map((e) => ({
      key: `c-${e.id}`,
      day: e.day_of_week,
      start: e.start_min,
      end: e.end_min,
      title: e.title,
      sub: e.location,
      color: e.color,
      variant: cancelled.has(exceptionKey(e.id, dateOfWeekday(weekStart, e.day_of_week))) ? ('cancelled' as const) : ('normal' as const),
    })),
    ...data.personal.map((p) => ({
      key: `p-${p.id}`,
      day: weekdayOf(p.event_date),
      start: p.start_min,
      end: p.end_min,
      title: p.title,
      sub: p.location,
      color: p.color || colors.primary,
      variant: 'personal' as const,
    })),
  ];

  async function toggleCancel(entryId: string, date: string, isCancelled: boolean) {
    // 낙관적 업데이트
    setData((prev) => ({
      ...prev,
      exceptions: isCancelled
        ? prev.exceptions.filter((x) => !(x.entry_id === entryId && x.exception_date === date))
        : [...prev.exceptions, { entry_id: entryId, user_id: userId, exception_date: date }],
    }));
    try {
      if (isCancelled) await removeException(entryId, date);
      else await addException(entryId, date);
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
      reload();
    }
  }

  function addPersonal(date: string, start?: number, end?: number) {
    router.push({
      pathname: '/timetable-edit',
      params: { kind: 'once', date, ...(start !== undefined ? { start: String(start) } : {}), ...(end !== undefined ? { end: String(end) } : {}) },
    });
  }

  function onPressBlock(b: GridBlock) {
    if (b.variant === 'personal') {
      router.push({ pathname: '/timetable-edit', params: { kind: 'once', personalId: b.key.slice(2) } });
      return;
    }
    const entryId = b.key.slice(2);
    const date = dateOfWeekday(weekStart, b.day);
    const isCancelled = b.variant === 'cancelled';
    setSheet({
      title: b.title,
      subtitle: `${formatShortDay(date)} ${formatMin(b.start)}~${formatMin(b.end)}${b.sub ? ` · ${b.sub}` : ''}${isCancelled ? ' · 휴강' : ''}`,
      actions: isCancelled
        ? [
            { label: '휴강 취소 (수업 있음)', icon: 'refresh', onPress: () => toggleCancel(entryId, date, true) },
            { label: '이 시간에 개인 일정 추가', icon: 'add-circle-outline', onPress: () => addPersonal(date, b.start, b.end) },
            { label: '수업 정보 수정 (매주)', icon: 'create-outline', onPress: () => router.push({ pathname: '/timetable-edit', params: { entryId } }) },
          ]
        : [
            { label: `${formatShortDay(date)} 휴강으로 표시`, icon: 'close-circle-outline', destructive: true, onPress: () => toggleCancel(entryId, date, false) },
            { label: '수업 정보 수정 (매주)', icon: 'create-outline', onPress: () => router.push({ pathname: '/timetable-edit', params: { entryId } }) },
          ],
    });
  }

  function openAddSheet(day?: number, hour?: number) {
    const date = day !== undefined ? dateOfWeekday(weekStart, day) : undefined;
    const start = hour !== undefined ? hour * 60 : undefined;
    setSheet({
      title: '무엇을 추가할까요?',
      subtitle: date ? `${formatShortDay(date)}${hour !== undefined ? ` ${hour}:00` : ''}` : undefined,
      actions: [
        {
          label: '매주 반복 일정 (수업·알바)',
          icon: 'repeat',
          onPress: () =>
            router.push({
              pathname: '/timetable-edit',
              params: { ...(day !== undefined ? { day: String(day) } : {}), ...(start !== undefined ? { start: String(start) } : {}) },
            }),
        },
        {
          label: date ? `${formatShortDay(date)}만 개인 일정` : '하루만 있는 개인 일정',
          icon: 'calendar-outline',
          onPress: () => addPersonal(date ?? toDateKey(new Date()), start, start !== undefined ? start + 60 : undefined),
        },
      ],
    });
  }

  const cancelledThisWeek = data.exceptions.length;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {/* 주 이동 */}
        <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
          <Pressable onPress={() => setWeekStart((w) => addDays(w, -7))} hitSlop={12} accessibilityLabel="이전 주">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setWeekStart(startOfWeek(new Date()))} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
              {formatShortDay(toDateKey(weekStart))} ~ {formatShortDay(toDateKey(addDays(weekStart, 6)))}
            </Text>
            <Text style={[styles.muted, { color: isThisWeek ? colors.primary : colors.textMuted }]}>
              {isThisWeek ? '이번 주' : '눌러서 이번 주로'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setWeekStart((w) => addDays(w, 7))} hitSlop={12} accessibilityLabel="다음 주">
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={[styles.row, { flexWrap: 'wrap', justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row' }}>
            <Chip label="주말 포함" active={showWeekend || hasWeekend} onPress={() => setShowWeekend((v) => !v)} />
            <Chip
              label="강의실 표시"
              active={showLocation}
              onPress={() =>
                setShowLocation((v) => {
                  saveShowLocation(!v);
                  return !v;
                })
              }
            />
          </View>
          <Button
            title="이미지로 불러오기"
            icon="image-outline"
            variant="secondary"
            small
            onPress={() => router.push('/timetable-import')}
            style={{ marginBottom: 8 }}
          />
        </View>

        <Card style={{ paddingHorizontal: 8 }}>
          <TimetableGrid
            mode="blocks"
            days={days}
            dayDates={dayDates}
            blocks={blocks}
            showSub={showLocation}
            onPressBlock={onPressBlock}
            onPressEmpty={(day, hour) => openAddSheet(day, hour)}
          />
        </Card>

        <Text style={styles.muted}>
          {data.entries.length === 0
            ? '빈 칸이나 + 버튼으로 추가하거나, 에브리타임 시간표 캡처를 불러오세요.'
            : `수업을 누르면 이번 주만 휴강 처리할 수 있어요.${cancelledThisWeek ? ` (이번 주 휴강 ${cancelledThisWeek}개)` : ''}`}
        </Text>
        <View style={[styles.row, { gap: 12, marginTop: 8 }]}>
          <Legend color={colors.primary} label="수업" />
          <Legend color={colors.border} label="휴강" muted />
          <Legend color={colors.primary} label="개인 일정" dashed />
        </View>
      </ScrollView>

      <Fab onPress={() => openAddSheet()} />
      <ActionSheet
        visible={sheet !== null}
        title={sheet?.title}
        subtitle={sheet?.subtitle}
        actions={sheet?.actions ?? []}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

function Legend({ color, label, dashed, muted }: { color: string; label: string; dashed?: boolean; muted?: boolean }) {
  return (
    <View style={[styles.row, { gap: 4 }]}>
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          backgroundColor: dashed ? 'transparent' : muted ? '#F3F4F6' : color,
          borderWidth: dashed || muted ? 1.5 : 0,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: color,
        }}
      />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}
