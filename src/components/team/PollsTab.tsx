import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Card, EmptyState, Fab, Loading, styles } from '@/components/ui';
import { listPolls } from '@/lib/api';
import { formatHour, formatShortDay } from '@/lib/date';
import { useAsync, useRealtime } from '@/lib/hooks';
import { useTeam } from '@/lib/team-context';
import { colors } from '@/lib/theme';
import type { Poll } from '@/lib/types';

export function PollsTab() {
  const router = useRouter();
  const { teamId, nameOf } = useTeam();
  const { data: polls, loading, reload } = useAsync<Poll[]>(() => listPolls(teamId), [teamId], []);
  useRealtime(`polls-${teamId}`, [{ table: 'polls', filter: `team_id=eq.${teamId}` }], reload);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Loading />
        ) : polls.length === 0 ? (
          <EmptyState
            icon="hand-left-outline"
            title="진행 중인 투표가 없어요"
            hint="후보 날짜를 골라 투표를 만들면, 팀원들이 가능한 시간을 표시하고 가장 많이 겹치는 시간을 찾을 수 있어요."
          />
        ) : (
          polls.map((p) => {
            const sorted = [...p.dates].sort();
            return (
              <Card
                key={p.id}
                onPress={() => router.push({ pathname: '/team/[id]/poll/[pollId]', params: { id: teamId, pollId: p.id } })}
              >
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Text style={[styles.title, { flex: 1 }]} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: p.closed ? '#F3F4F6' : colors.primarySoft,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: p.closed ? colors.textSub : colors.primary }}>
                      {p.closed ? '마감' : '진행 중'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.row, { marginTop: 6, gap: 4 }]}>
                  <Ionicons name="calendar-outline" size={14} color={colors.textSub} />
                  <Text style={styles.sub}>
                    {formatShortDay(sorted[0])}
                    {sorted.length > 1 ? ` ~ ${formatShortDay(sorted[sorted.length - 1])} · ${sorted.length}일` : ''}
                  </Text>
                </View>
                <View style={[styles.row, { marginTop: 4, gap: 4 }]}>
                  <Ionicons name="time-outline" size={14} color={colors.textSub} />
                  <Text style={styles.sub}>
                    {formatHour(p.start_hour)} ~ {formatHour(p.end_hour)}
                  </Text>
                </View>
                <Text style={[styles.muted, { marginTop: 6 }]}>만든 사람: {nameOf(p.created_by)}</Text>
              </Card>
            );
          })
        )}
      </ScrollView>
      <Fab onPress={() => router.push({ pathname: '/team/[id]/poll-new', params: { id: teamId } })} />
    </View>
  );
}
