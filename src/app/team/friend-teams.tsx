import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { TeamIcon } from '@/components/CoursePicker';
import { Button, Card, EmptyState, Loading, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { joinFriendTeam, listFriendTeams, type FriendTeam } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function FriendTeamsScreen() {
  const router = useRouter();
  const { data: teams, loading, reload } = useAsync<FriendTeam[]>(listFriendTeams, [], []);
  const [joining, setJoining] = useState<string | null>(null);

  function join(t: FriendTeam) {
    Alert.alert('팀 참여', `"${t.team_name}" 팀에 참여할까요?\n(팀 친구: ${t.friend_names.join(', ')})`, [
      { text: '취소', style: 'cancel' },
      {
        text: '참여',
        onPress: async () => {
          setJoining(t.team_id);
          try {
            await joinFriendTeam(t.team_id);
            router.dismiss();
            router.push({ pathname: '/team/[id]', params: { id: t.team_id } });
          } catch (e) {
            Alert.alert('참여 실패', errorMessage(e));
            reload();
          } finally {
            setJoining(null);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={[styles.sub, { marginBottom: 12 }]}>
        내 친구가 속한 팀이에요. 초대 없이 바로 참여할 수 있어요. (팀장이 공개를 끈 팀은 보이지 않아요)
      </Text>

      {loading ? (
        <Loading />
      ) : teams.length === 0 ? (
        <EmptyState
          icon="people-circle-outline"
          title="참여할 수 있는 친구 팀이 없어요"
          hint="친구 탭에서 친구를 추가하면, 친구가 속한 팀이 여기에 나와요."
        />
      ) : (
        teams.map((t) => (
          <Card key={t.team_id}>
            <View style={styles.row}>
              <TeamIcon team={{ id: t.team_id, name: t.team_name, course_name: t.course_name, course_short: t.course_short }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {t.team_name}
                </Text>
                {t.course_name ? (
                  <Text style={[styles.sub, { color: colors.primary, fontWeight: '600' }]} numberOfLines={1}>
                    📚 {t.course_name}
                  </Text>
                ) : null}
                <Text style={styles.muted} numberOfLines={1}>
                  {t.member_count}명 · 💛 {t.friend_names.join(', ')}
                </Text>
              </View>
              <Button title="참여" small onPress={() => join(t)} loading={joining === t.team_id} />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}
