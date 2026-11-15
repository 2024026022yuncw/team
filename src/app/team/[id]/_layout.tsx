import { Stack, useLocalSearchParams } from 'expo-router';

import { TeamProvider } from '@/lib/team-context';
import { colors } from '@/lib/theme';

export default function TeamLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <TeamProvider teamId={id}>
      <Stack
        screenOptions={{
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: '' }} />
        <Stack.Screen name="event" options={{ title: '일정', presentation: 'modal' }} />
        <Stack.Screen name="poll-new" options={{ title: '시간 투표 만들기', presentation: 'modal' }} />
        <Stack.Screen name="poll/[pollId]" options={{ title: '가능 시간 투표' }} />
        <Stack.Screen name="task" options={{ title: '할 일', presentation: 'modal' }} />
      </Stack>
    </TeamProvider>
  );
}
