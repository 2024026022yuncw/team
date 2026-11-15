import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { DateField, TimeStepper } from '@/components/Pickers';
import { Button, Field, Input, Loading, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { createEvent, deleteEvent, getEvent, updateEvent } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { combine, minutesOfDay, toDateKey, todayKey } from '@/lib/date';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';
import { colors } from '@/lib/theme';

export default function EventScreen() {
  const router = useRouter();
  const userId = useUserId();
  const { teamId, nameOf } = useTeam();
  const params = useLocalSearchParams<{ eventId?: string; date?: string; title?: string; start?: string; end?: string }>();
  const isEdit = Boolean(params.eventId);

  const [loading, setLoading] = useState(isEdit);
  const [title, setTitle] = useState(params.title ?? '');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(params.date ?? todayKey());
  const [startMin, setStartMin] = useState(params.start ? Number(params.start) : 14 * 60);
  const [endDate, setEndDate] = useState(params.date ?? todayKey());
  const [endMin, setEndMin] = useState(params.end ? Number(params.end) : 15 * 60);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!params.eventId) return;
    getEvent(params.eventId)
      .then((e) => {
        if (!e) return;
        const s = new Date(e.starts_at);
        const en = new Date(e.ends_at);
        setTitle(e.title);
        setLocation(e.location);
        setDescription(e.description);
        setStartDate(toDateKey(s));
        setStartMin(minutesOfDay(s));
        setEndDate(toDateKey(en));
        setEndMin(minutesOfDay(en));
        setCreatedBy(e.created_by);
      })
      .catch((e) => Alert.alert('불러오기 실패', errorMessage(e)))
      .finally(() => setLoading(false));
  }, [params.eventId]);

  // 시작 날짜를 바꾸면 종료 날짜가 시작보다 앞서지 않도록 맞춤
  function changeStartDate(k: string | null) {
    if (!k) return;
    setStartDate(k);
    if (endDate < k) setEndDate(k);
  }

  async function save() {
    const starts = combine(startDate, startMin);
    const ends = combine(endDate, endMin);
    if (!title.trim()) return;
    if (ends < starts) {
      Alert.alert('시간 확인', '종료 시간이 시작 시간보다 빨라요.');
      return;
    }
    const input = {
      title: title.trim(),
      location: location.trim(),
      description: description.trim(),
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
    };
    setBusy(true);
    try {
      if (params.eventId) await updateEvent(params.eventId, input);
      else await createEvent(teamId, userId, input);
      router.back();
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!params.eventId) return;
    const id = params.eventId;
    Alert.alert('일정 삭제', '이 일정을 삭제할까요? 팀원 모두에게서 사라져요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEvent(id);
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
      <Stack.Screen options={{ title: isEdit ? '일정 수정' : '새 일정' }} />
      <Field label="제목">
        <Input value={title} onChangeText={setTitle} placeholder="예: 중간 발표 리허설" maxLength={100} />
      </Field>

      <Field label="시작">
        <DateField value={startDate} onChange={changeStartDate} />
        <View style={{ height: 8 }} />
        <TimeStepper minutes={startMin} onChange={setStartMin} />
      </Field>
      <Field label="종료">
        <DateField value={endDate} onChange={(k) => k && setEndDate(k)} />
        <View style={{ height: 8 }} />
        <TimeStepper minutes={endMin} onChange={setEndMin} />
      </Field>

      <Field label="장소 (선택)">
        <Input value={location} onChangeText={setLocation} placeholder="예: 공학관 302호 / Zoom" maxLength={100} />
      </Field>
      <Field label="메모 (선택)">
        <Input value={description} onChangeText={setDescription} multiline maxLength={1000} />
      </Field>

      <Button title={isEdit ? '수정 완료' : '일정 추가'} onPress={save} loading={busy} disabled={!title.trim()} />
      {isEdit && (
        <>
          <Text style={[styles.muted, { textAlign: 'center', marginVertical: 12 }]}>
            등록한 사람: {nameOf(createdBy)}
          </Text>
          <Button title="삭제" variant="danger" onPress={remove} />
        </>
      )}
      {!isEdit && (
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 12, color: colors.textMuted }]}>
          추가한 일정은 팀원 모두의 캘린더에 바로 표시돼요.
        </Text>
      )}
    </ScrollView>
  );
}
