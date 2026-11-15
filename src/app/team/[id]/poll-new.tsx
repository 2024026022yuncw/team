import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { MonthCalendar } from '@/components/MonthCalendar';
import { NumberStepper } from '@/components/Pickers';
import { Button, Card, Chip, Field, Input, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { createPoll } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { formatHour, formatShortDay } from '@/lib/date';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';

const MAX_DATES = 14;

export default function NewPollScreen() {
  const router = useRouter();
  const userId = useUserId();
  const { teamId } = useTeam();
  const [title, setTitle] = useState('');
  const [month, setMonth] = useState(() => new Date());
  const [dates, setDates] = useState<string[]>([]);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(22);
  const [busy, setBusy] = useState(false);

  function toggle(key: string) {
    setDates((prev) => {
      if (prev.includes(key)) return prev.filter((d) => d !== key);
      if (prev.length >= MAX_DATES) {
        Alert.alert('최대 14일', `후보 날짜는 최대 ${MAX_DATES}일까지 고를 수 있어요.`);
        return prev;
      }
      return [...prev, key].sort();
    });
  }

  async function submit() {
    if (!title.trim() || dates.length === 0) return;
    setBusy(true);
    try {
      const poll = await createPoll(teamId, userId, {
        title: title.trim(),
        dates,
        start_hour: startHour,
        end_hour: endHour,
      });
      router.replace({ pathname: '/team/[id]/poll/[pollId]', params: { id: teamId, pollId: poll.id } });
    } catch (e) {
      Alert.alert('투표 생성 실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Field label="투표 제목">
        <Input value={title} onChangeText={setTitle} placeholder="예: 2차 회의 언제 할까요?" maxLength={100} />
      </Field>

      <Text style={[styles.sub, { fontWeight: '600', marginBottom: 6 }]}>
        후보 날짜 ({dates.length}/{MAX_DATES}) — 달력에서 여러 날을 눌러 선택
      </Text>
      <Card>
        <MonthCalendar month={month} onMonthChange={setMonth} selected={dates} onSelect={toggle} disablePast />
      </Card>
      {dates.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {dates.map((d) => (
            <Chip key={d} label={`${formatShortDay(d)} ✕`} active onPress={() => toggle(d)} />
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="시작 시간">
            <NumberStepper
              value={startHour}
              min={0}
              max={endHour - 1}
              onChange={setStartHour}
              format={formatHour}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="종료 시간">
            <NumberStepper value={endHour} min={startHour + 1} max={24} onChange={setEndHour} format={formatHour} />
          </Field>
        </View>
      </View>

      <Button
        title="투표 만들기"
        onPress={submit}
        loading={busy}
        disabled={!title.trim() || dates.length === 0}
      />
    </ScrollView>
  );
}
