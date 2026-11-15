import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CalendarTab } from '@/components/team/CalendarTab';
import { MembersTab } from '@/components/team/MembersTab';
import { PollsTab } from '@/components/team/PollsTab';
import { TasksTab } from '@/components/team/TasksTab';
import { Loading, Segmented, styles } from '@/components/ui';
import { useTeam } from '@/lib/team-context';

type Tab = 'calendar' | 'polls' | 'tasks' | 'members';

const TABS: { value: Tab; label: string }[] = [
  { value: 'calendar', label: '캘린더' },
  { value: 'polls', label: '시간투표' },
  { value: 'tasks', label: '할 일' },
  { value: 'members', label: '멤버' },
];

export default function TeamScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const { team, loading } = useTeam();
  const [tab, setTab] = useState<Tab>(params.tab && TABS.some((t) => t.value === params.tab) ? params.tab : 'calendar');

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: team?.name ?? '' }} />
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </View>
      {loading ? (
        <Loading />
      ) : (
        <View style={{ flex: 1 }}>
          {tab === 'calendar' && <CalendarTab />}
          {tab === 'polls' && <PollsTab />}
          {tab === 'tasks' && <TasksTab />}
          {tab === 'members' && <MembersTab />}
        </View>
      )}
    </View>
  );
}
