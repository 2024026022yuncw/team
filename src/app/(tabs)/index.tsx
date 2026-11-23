import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { TeamIcon } from '@/components/CoursePicker';
import { NotificationRow } from '@/components/NotificationList';
import { Button, Card, EmptyState, Loading, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { acceptTeamInvite, declineTeamInvite, listMyTeamInvites, listMyTeamsWithPrefs } from '@/lib/api';
import { useAuth, useUserId } from '@/lib/auth';
import { useAsync, useRealtime } from '@/lib/hooks';
import { useNotifications } from '@/lib/notifications';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Team, TeamInvite } from '@/lib/types';

export default function TeamsScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const userId = useUserId();
  const { items: notes, unread } = useNotifications();
  const unreadNotes = notes.filter((n) => !n.read_at);
  const { data: teams, loading, reload } = useAsync<Team[]>(listMyTeamsWithPrefs, [], []);
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
            {session?.user.is_anonymous ? (
              <Pressable onPress={() => router.push('/profile')} style={{ marginTop: 10, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10 }}>
                <Text style={{ color: '#92400E', fontSize: 13, lineHeight: 19 }}>
                  👀 게스트로 둘러보는 중이에요. 이 기기에서만 유지돼요.{' '}
                  <Text style={{ fontWeight: '700', textDecorationLine: 'underline' }}>이메일 등록하고 계속 쓰기 →</Text>
                </Text>
              </Pressable>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
              <Button
                title="팀 만들기"
                onPress={() => router.push('/team/create')}
                style={{ flex: 1 }}
              />
              <Button
                title="코드로 참여"
                variant="secondary"
                onPress={() => router.push('/team/join')}
                style={{ flex: 1 }}
              />
              <Button
                title="💛 친구 팀"
                variant="secondary"
                onPress={() => router.push('/team/friend-teams')}
                style={{ flex: 1 }}
              />
            </View>

            {/* 최근 안 읽은 알림 */}
            {unreadNotes.length > 0 && (
              <Card style={{ marginTop: 16, paddingVertical: 6, paddingHorizontal: 6 }}>
                <View style={[styles.row, { justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 6 }]}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>🔔 새 알림 {unread}</Text>
                  <Pressable onPress={() => router.push('/notifications')} hitSlop={8}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>전체 보기</Text>
                  </Pressable>
                </View>
                {unreadNotes.slice(0, 3).map((n) => (
                  <NotificationRow key={n.id} n={n} />
                ))}
              </Card>
            )}

            {/* AI 비서 */}
            <Card
              onPress={() => router.push('/assistant')}
              style={{ marginTop: 16, backgroundColor: colors.primary, borderColor: colors.primary, paddingVertical: 18 }}
            >
              <View style={[styles.row, { gap: 12 }]}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 28 }}>🤖</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: '#fff', fontSize: 17 }}>AI 비서에게 물어보세요</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>내 일정·할 일·공지를 보고 바로 답해줘요</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </View>
              {/* 누르면 바로 질문 */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {['오늘 일정 알려줘', '이번 주 마감 할 일은?', '안 읽은 공지 요약해줘'].map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => router.push({ pathname: '/assistant', params: { q } })}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.2)',
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    })}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>💬 {q}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>

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
