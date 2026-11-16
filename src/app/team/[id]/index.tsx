import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CalendarTab } from '@/components/team/CalendarTab';
import { MembersTab } from '@/components/team/MembersTab';
import { NoticesTab } from '@/components/team/NoticesTab';
import { PollsTab } from '@/components/team/PollsTab';
import { TasksTab } from '@/components/team/TasksTab';
import { Loading, Segmented, styles } from '@/components/ui';
import { countUnreadPosts } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { useAsync, useRealtime } from '@/lib/hooks';
import { useTeam } from '@/lib/team-context';

type Tab = 'notices' | 'calendar' | 'polls' | 'tasks' | 'members';

const TABS: { value: Tab; label: string }[] = [
  { value: 'notices', label: '공지' },
  { value: 'calendar', label: '캘린더' },
  { value: 'polls', label: '투표' },
  { value: 'tasks', label: '할 일' },
  { value: 'members', label: '멤버' },
];

export default function TeamScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const { teamId, team, loading } = useTeam();
  const userId = useUserId();
  const [tab, setTab] = useState<Tab>(params.tab && TABS.some((t) => t.value === params.tab) ? params.tab : 'calendar');

  // 안 읽은 공지 수: 글을 읽고 돌아오면(화면 포커스) 다시 계산, 새 글·읽음은 실시간 반영
  const { data: unread, reload: reloadUnread } = useAsync<number>(
    () => countUnreadPosts(teamId, userId),
    [teamId, userId],
    0,
  );
  useRealtime(
    `unread-${teamId}`,
    [
      { table: 'team_posts', filter: `team_id=eq.${teamId}` },
      { table: 'post_reads', filter: `user_id=eq.${userId}` },
    ],
    reloadUnread,
  );
  const tabs = TABS.map((t) => (t.value === 'notices' ? { ...t, badge: unread } : t));

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: team?.name ?? '' }} />
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <Segmented options={tabs} value={tab} onChange={setTab} />
      </View>
      {loading ? (
        <Loading />
      ) : (
        <View style={{ flex: 1 }}>
          {tab === 'notices' && <NoticesTab />}
          {tab === 'calendar' && <CalendarTab />}
          {tab === 'polls' && <PollsTab />}
          {tab === 'tasks' && <TasksTab />}
          {tab === 'members' && <MembersTab />}
        </View>
      )}
    </View>
  );
}
