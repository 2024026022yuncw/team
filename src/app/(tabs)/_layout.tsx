import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { colors } from '@/lib/theme';

/** 모든 하단 탭 화면 오른쪽 위에 항상 보이는 AI 비서 버튼 */
function AssistantButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/assistant')}
      accessibilityLabel="AI 비서 열기"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        marginRight: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: 15 }}>🤖</Text>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>AI 비서</Text>
    </Pressable>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => <AssistantButton />,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '내 팀',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="timetable"
        options={{
          title: '시간표',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          title: '다이어리',
          tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: '친구',
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color as string} />,
        }}
      />
    </Tabs>
  );
}
