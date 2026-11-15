import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DateField, TimeStepper } from '@/components/Pickers';
import { DAY_LABELS, ENTRY_COLORS, FULL_WEEK } from '@/components/TimetableGrid';
import { Button, Chip, Field, Input, Loading, Segmented, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import {
  createPersonalEvent,
  createTimetableEntries,
  deletePersonalEvent,
  deleteTimetableEntry,
  getPersonalEvent,
  getTimetableEntry,
  updatePersonalEvent,
  updateTimetableEntry,
} from '@/lib/api';
import { todayKey } from '@/lib/date';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Kind = 'weekly' | 'once';

export default function TimetableEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    kind?: Kind;
    entryId?: string;
    personalId?: string;
    day?: string;
    date?: string;
    start?: string;
    end?: string;
  }>();
  const editingId = params.entryId ?? params.personalId;
  const isEdit = Boolean(editingId);

  const initialStart = params.start ? Number(params.start) : 9 * 60;
  const [kind, setKind] = useState<Kind>(params.personalId || params.kind === 'once' ? 'once' : 'weekly');
  const [loading, setLoading] = useState(isEdit);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [days, setDays] = useState<number[]>(params.day ? [Number(params.day)] : []);
  const [date, setDate] = useState<string>(params.date ?? todayKey());
  const [startMin, setStartMin] = useState(initialStart);
  const [endMin, setEndMin] = useState(params.end ? Number(params.end) : Math.min(initialStart + 90, 1440));
  const [color, setColor] = useState(ENTRY_COLORS[Math.floor(Math.random() * ENTRY_COLORS.length)]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = params.entryId
      ? getTimetableEntry(params.entryId).then((e) => {
          if (!e) return;
          setDays([e.day_of_week]);
          return e;
        })
      : params.personalId
        ? getPersonalEvent(params.personalId).then((p) => {
            if (!p) return;
            setDate(p.event_date);
            return p;
          })
        : null;
    if (!load) return;
    load
      .then((item) => {
        if (!item) return;
        setTitle(item.title);
        setLocation(item.location);
        setStartMin(item.start_min);
        setEndMin(item.end_min);
        if (item.color) setColor(item.color);
      })
      .catch((e) => Alert.alert('불러오기 실패', errorMessage(e)))
      .finally(() => setLoading(false));
  }, [params.entryId, params.personalId]);

  function toggleDay(d: number) {
    if (isEdit) {
      setDays([d]); // 수정 시에는 요일 하나만
      return;
    }
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function changeStart(m: number) {
    const dur = Math.max(endMin - startMin, 10);
    setStartMin(m);
    setEndMin(Math.min(m + dur, 1440));
  }

  const canSave = title.trim().length > 0 && (kind === 'once' || days.length > 0);

  async function save() {
    if (!canSave) return;
    if (endMin <= startMin) {
      Alert.alert('시간 확인', '끝나는 시간이 시작 시간보다 늦어야 해요.');
      return;
    }
    const base = { start_min: startMin, end_min: endMin, title: title.trim(), location: location.trim(), color };
    setBusy(true);
    try {
      if (kind === 'weekly') {
        if (params.entryId) await updateTimetableEntry(params.entryId, { ...base, day_of_week: days[0] });
        else await createTimetableEntries(days.map((d) => ({ ...base, day_of_week: d })));
      } else if (params.personalId) {
        await updatePersonalEvent(params.personalId, { ...base, event_date: date });
      } else {
        await createPersonalEvent({ ...base, event_date: date });
      }
      router.back();
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    const label = kind === 'weekly' ? '이 수업을 시간표에서 삭제할까요? (매주 일정 전체)' : '이 개인 일정을 삭제할까요?';
    Alert.alert('삭제', label, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            if (params.entryId) await deleteTimetableEntry(params.entryId);
            else if (params.personalId) await deletePersonalEvent(params.personalId);
            router.back();
          } catch (e) {
            Alert.alert('삭제 실패', errorMessage(e));
          }
        },
      },
    ]);
  }

  if (loading) return <Loading />;

  const screenTitle = isEdit
    ? kind === 'weekly'
      ? '수업 수정'
      : '개인 일정 수정'
    : kind === 'weekly'
      ? '반복 일정 추가'
      : '개인 일정 추가';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: screenTitle }} />

      {!isEdit && (
        <View style={{ marginBottom: 16 }}>
          <Segmented
            options={[
              { value: 'weekly', label: '매주 반복' },
              { value: 'once', label: '하루만 (개인 일정)' },
            ]}
            value={kind}
            onChange={setKind}
          />
        </View>
      )}

      <Field label="이름">
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder={kind === 'weekly' ? '예: 자료구조, 카페 알바' : '예: 병원 예약, 스터디'}
          maxLength={50}
        />
      </Field>

      {kind === 'weekly' ? (
        <Field label={isEdit ? '요일' : '요일 (여러 개 선택 가능)'}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {FULL_WEEK.map((d) => (
              <Chip key={d} label={DAY_LABELS[d]} active={days.includes(d)} onPress={() => toggleDay(d)} />
            ))}
          </View>
        </Field>
      ) : (
        <Field label="날짜">
          <DateField value={date} onChange={(k) => k && setDate(k)} />
        </Field>
      )}

      <Field label="시작 (예: 9:30, 1345)">
        <TimeStepper minutes={startMin} onChange={changeStart} max={1435} />
      </Field>
      <Field label="끝">
        <TimeStepper minutes={endMin} onChange={setEndMin} max={1440} />
      </Field>

      <Field label="장소 (선택)">
        <Input value={location} onChangeText={setLocation} placeholder="예: 공학관 301" maxLength={50} />
      </Field>

      <Field label="색상">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {ENTRY_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              accessibilityLabel={`색상 ${c}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: c,
                borderWidth: color === c ? 3 : 0,
                borderColor: colors.text,
              }}
            />
          ))}
        </View>
      </Field>

      <Button
        title={isEdit ? '수정 완료' : kind === 'weekly' && days.length > 1 ? `${days.length}개 요일에 추가` : '추가'}
        onPress={save}
        loading={busy}
        disabled={!canSave}
      />
      {isEdit && <Button title="삭제" variant="danger" onPress={remove} style={{ marginTop: 12 }} />}
      <Text style={[styles.muted, { textAlign: 'center', marginTop: 12 }]}>
        {kind === 'weekly'
          ? '특정 주만 빠지는 경우는 시간표에서 수업을 눌러 휴강으로 표시하세요.'
          : '개인 일정은 그 날짜에만 표시되고, 팀원 겹쳐보기에는 "개인 일정"으로만 보여요.'}
      </Text>
    </ScrollView>
  );
}
