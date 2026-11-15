import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { formatMin, FULL_WEEK, TimetableGrid, WEEKDAYS_ONLY, DAY_LABELS } from '@/components/TimetableGrid';
import { Card, Chip, Fab, styles } from '@/components/ui';
import { listTimetable } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import type { TimetableEntry } from '@/lib/types';

export default function TimetableScreen() {
  const router = useRouter();
  const userId = useUserId();
  const { data: entries } = useAsync<TimetableEntry[]>(() => listTimetable([userId]), [userId], []);
  const hasWeekend = entries.some((e) => e.day_of_week === 0 || e.day_of_week === 6);
  const [showWeekend, setShowWeekend] = useState(false);
  const days = showWeekend || hasWeekend ? FULL_WEEK : WEEKDAYS_ONLY;

  const totalMin = entries.reduce((sum, e) => sum + (e.end_min - e.start_min), 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={[styles.sub, { marginBottom: 8 }]}>
          수업·알바처럼 매주 반복되는 일정을 등록하세요. 같은 팀원들이 겹쳐보기로 비는 시간을 찾을 수 있어요.
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <Chip label="주말 포함" active={showWeekend || hasWeekend} onPress={() => setShowWeekend((v) => !v)} />
        </View>

        <Card style={{ paddingHorizontal: 8 }}>
          <TimetableGrid
            mode="blocks"
            days={days}
            entries={entries}
            onPressEntry={(e) => router.push({ pathname: '/timetable-edit', params: { entryId: e.id } })}
            onPressEmpty={(day, hour) =>
              router.push({ pathname: '/timetable-edit', params: { day: String(day), start: String(hour * 60) } })
            }
          />
        </Card>

        {entries.length > 0 ? (
          <Text style={styles.muted}>
            총 {entries.length}개 · 주 {Math.round((totalMin / 60) * 10) / 10}시간 · 빈칸을 누르면 바로 추가돼요.
          </Text>
        ) : (
          <Text style={styles.muted}>빈 칸이나 + 버튼을 눌러 첫 일정을 추가해보세요.</Text>
        )}

        {entries.length > 0 && (
          <Card style={{ marginTop: 12 }}>
            {[...entries]
              .sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7) || a.start_min - b.start_min)
              .map((e) => (
                <Text
                  key={e.id}
                  style={{ paddingVertical: 4, color: '#111827' }}
                  onPress={() => router.push({ pathname: '/timetable-edit', params: { entryId: e.id } })}
                >
                  <Text style={{ fontWeight: '700' }}>{DAY_LABELS[e.day_of_week]}</Text> {formatMin(e.start_min)}~
                  {formatMin(e.end_min)} · {e.title}
                  {e.location ? <Text style={styles.muted}> ({e.location})</Text> : null}
                </Text>
              ))}
          </Card>
        )}
      </ScrollView>
      <Fab onPress={() => router.push('/timetable-edit')} />
    </View>
  );
}
