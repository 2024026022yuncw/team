import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { TeamIcon } from '@/components/CoursePicker';
import { Button, Card, EmptyState, Loading, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { acceptTeamInvite, declineTeamInvite, listMyTeamInvites, listMyTeams } from '@/lib/api';
import { useAuth, useUserId } from '@/lib/auth';
import { useAsync, useRealtime } from '@/lib/hooks';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Team, TeamInvite } from '@/lib/types';

export default function TeamsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const userId = useUserId();
  const { data: teams, loading, reload } = useAsync<Team[]>(listMyTeams, [], []);
  const { data: invites, setData: setInvites, reload: reloadInvites } = useAsync<TeamInvite[]>(listMyTeamInvites, [], []);
  useRealtime(`my-invites-${userId}`, [{ table: 'team_invites', filter: `invitee=eq.${userId}` }], reloadInvites);

  async function acceptInvite(inv: TeamInvite) {
    setInvites((prev) => prev.filter((i) => i.id !== inv.id));
    try {
      const teamId = await acceptTeamInvite(inv.id);
      reload();
      router.push({ pathname: '/team/[id]', params: { id: teamId } });
    } catch (e) {
      Alert.alert('수락 실패', errorMessage(e));
      reloadInvites();
    }
  }

  function declineInvite(inv: TeamInvite) {
    Alert.alert('초대 거절', `${inv.team_name} 팀 초대를 거절할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '거절',
        style: 'destructive',
        onPress: async () => {
          setInvites((prev) => prev.filter((i) => i.id !== inv.id));
          try {
            await declineTeamInvite(inv.id);
          } catch (e) {
            Alert.alert('실패', errorMessage(e));
            reloadInvites();
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={teams}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>
              안녕하세요, {profile?.display_name || '팀원'}님 👋
            </Text>
            <Text style={[styles.sub, { marginTop: 4 }]}>참여 중인 팀을 선택하세요.</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Button
                title="팀 만들기"
                icon="add-circle-outline"
                onPress={() => router.push('/team/create')}
                style={{ flex: 1 }}
              />
              <Button
                title="코드로 참여"
                icon="enter-outline"
                variant="secondary"
                onPress={() => router.push('/team/join')}
                style={{ flex: 1 }}
              />
            </View>

            {/* 친구가 보낸 팀 초대 */}
            {invites.map((inv) => (
              <Card key={inv.id} style={{ marginTop: 12, borderColor: colors.primary, borderWidth: 1.5 }}>
                <Text style={{ color: colors.text, fontSize: 15 }}>
                  💌 <Text style={{ fontWeight: '700' }}>{inv.inviter_name || '친구'}</Text>님이{' '}
                  <Text style={{ fontWeight: '700' }}>{inv.team_name}</Text>
                  {inv.course_name ? <Text style={styles.muted}> (📚 {inv.course_name})</Text> : null} 팀에 초대했어요
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Button title="수락" small onPress={() => acceptInvite(inv)} style={{ flex: 1 }} />
                  <Button title="거절" small variant="secondary" onPress={() => declineInvite(inv)} style={{ flex: 1 }} />
                </View>
              </Card>
            ))}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : (
            <EmptyState icon="people-outline" title="아직 참여한 팀이 없어요" hint="팀을 만들거나 초대 코드로 참여해보세요." />
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push({ pathname: '/team/[id]', params: { id: item.id } })}>
            <View style={styles.row}>
              <TeamIcon team={item} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.course_name ? (
                  <Text style={[styles.sub, { color: colors.primary, fontWeight: '600' }]} numberOfLines={1}>
                    📚 {item.course_name}
                  </Text>
                ) : null}
                {item.description ? (
                  <Text style={styles.sub} numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}
