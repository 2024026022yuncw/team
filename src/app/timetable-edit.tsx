import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TimeStepper } from '@/components/Pickers';
import { DAY_LABELS, ENTRY_COLORS, FULL_WEEK } from '@/components/TimetableGrid';
import { Button, Chip, Field, Input, Loading, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import {
  createTimetableEntries,
  deleteTimetableEntry,
  getTimetableEntry,
  updateTimetableEntry,
} from '@/lib/api';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function TimetableEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ entryId?: string; day?: string; start?: string }>();
  const isEdit = Boolean(params.entryId);

  const initialStart = params.start ? Number(params.start) : 9 * 60;
  const [loading, setLoading] = useState(isEdit);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [days, setDays] = useState<number[]>(params.day ? [Number(params.day)] : []);
  const [startMin, setStartMin] = useState(initialStart);
  const [endMin, setEndMin] = useState(Math.min(initialStart + 90, 1439));
  const [color, setColor] = useState(ENTRY_COLORS[Math.floor(Math.random() * ENTRY_COLORS.length)]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!params.entryId) return;
    getTimetableEntry(params.entryId)
      .then((e) => {
        if (!e) return;
        setTitle(e.title);
        setLocation(e.location);
        setDays([e.day_of_week]);
        setStartMin(e.start_min);
        setEndMin(e.end_min);
        if (e.color) setColor(e.color);
      })
      .catch((e) => Alert.alert('불러오기 실패', errorMessage(e)))
      .finally(() => setLoading(false));
  }, [params.entryId]);

  function toggleDay(d: number) {
    if (isEdit) {
      setDays([d]); // 수정 시에는 요일 하나만
      return;
    }
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function save() {
    if (!title.trim() || days.length === 0) return;
    if (endMin <= startMin) {
      Alert.alert('시간 확인', '끝나는 시간이 시작 시간보다 늦어야 해요.');
      return;
    }
    const base = { start_min: startMin, end_min: endMin, title: title.trim(), location: location.trim(), color };
    setBusy(true);
    try {
      if (params.entryId) await updateTimetableEntry(params.entryId, { ...base, day_of_week: days[0] });
      else await createTimetableEntries(days.map((d) => ({ ...base, day_of_week: d })));
      router.back();
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!params.entryId) return;
    const id = params.entryId;
    Alert.alert('시간표 삭제', '이 일정을 시간표에서 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTimetableEntry(id);
            router.back();
          } catch (e) {
            Alert.alert('삭제 실패', errorMessage(e));
          }
        },
      },
    ]);
  }

  if (loading) return <Loading />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isEdit ? '시간표 수정' : '시간표 추가' }} />
      <Field label="이름">
        <Input value={title} onChangeText={setTitle} placeholder="예: 자료구조, 카페 알바" maxLength={50} />
      </Field>

      <Field label={isEdit ? '요일' : '요일 (여러 개 선택 가능)'}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {FULL_WEEK.map((d) => (
            <Chip key={d} label={DAY_LABELS[d]} active={days.includes(d)} onPress={() => toggleDay(d)} />
          ))}
        </View>
      </Field>

      <Field label="시작">
        <TimeStepper
          minutes={startMin}
          onChange={(m) => {
            const dur = endMin - startMin;
            setStartMin(m);
            setEndMin(Math.min(m + Math.max(dur, 30), 1439));
          }}
        />
      </Field>
      <Field label="끝">
        <TimeStepper minutes={endMin} onChange={setEndMin} />
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
        title={isEdit ? '수정 완료' : days.length > 1 ? `${days.length}개 요일에 추가` : '추가'}
        onPress={save}
        loading={busy}
        disabled={!title.trim() || days.length === 0}
      />
      {isEdit && <Button title="삭제" variant="danger" onPress={remove} style={{ marginTop: 12 }} />}
      <Text style={[styles.muted, { textAlign: 'center', marginTop: 12 }]}>
        시간표는 같은 팀원에게만 보여요.
      </Text>
    </ScrollView>
  );
}
