import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { TeamIcon } from '@/components/CoursePicker';
import { Button, Card, EmptyState, Loading, styles } from '@/components/ui';
import { listMyTeams } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { colors } from '@/lib/theme';
import type { Team } from '@/lib/types';

export default function TeamsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { data: teams, loading, reload } = useAsync<Team[]>(listMyTeams, [], []);

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
