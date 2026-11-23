import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading, styles } from '@/components/ui';
import { addingAccountFrom, finishAddingAccount } from '@/lib/accounts';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors } from '@/lib/theme';

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  // 로그인 전에 열었던 주소(예: 초대 링크)를 기억했다가 로그인 후 이동
  const pendingPath = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) {
      if (pathname && pathname !== '/') {
        const query = new URLSearchParams(
          Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' && !pathname.includes(v) ? [[k, v]] : [])),
        ).toString();
        pendingPath.current = query ? `${pathname}?${query}` : pathname;
      }
      router.replace('/login');
    } else if (session && inAuth) {
      // "다른 계정 추가" 중이면 다른 사용자로 로그인할 때까지 로그인 화면에 머묾
      if (addingAccountFrom() === session.user.id) return;
      finishAddingAccount();
      router.replace('/');
      const next = pendingPath.current;
      pendingPath.current = null;
      if (next) setTimeout(() => router.push(next as never), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={[styles.screen, { justifyContent: 'center' }]}>
        <Loading />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="team/create" options={{ title: '새 팀 만들기', presentation: 'modal' }} />
      <Stack.Screen name="team/join" options={{ title: '초대 코드로 참여', presentation: 'modal' }} />
      <Stack.Screen name="team/friend-teams" options={{ title: '💛 친구 팀에 참여', presentation: 'modal' }} />
      <Stack.Screen name="team/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="timetable-edit" options={{ title: '시간표', presentation: 'modal' }} />
      <Stack.Screen name="timetable-import" options={{ title: '이미지로 불러오기' }} />
      <Stack.Screen name="assistant" options={{ title: '🤖 AI 비서' }} />
    </Stack>
  );
}

function SetupNeeded() {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Supabase 설정이 필요해요</Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textSub }}>
        프로젝트 루트에 .env.local 파일을 만들고 아래 두 값을 넣은 뒤 개발 서버를 다시 시작하세요.{'\n\n'}
        EXPO_PUBLIC_SUPABASE_URL=...{'\n'}
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...{'\n\n'}
        자세한 방법은 README.md 를 참고하세요.
      </Text>
    </ScrollView>
  );
}

const webFrame = {
  flex: 1,
  width: '100%',
  maxWidth: 520,
  alignSelf: 'center',
  backgroundColor: colors.bg,
  borderLeftWidth: 1,
  borderRightWidth: 1,
  borderColor: colors.border,
} as const;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* PC 브라우저에서는 모바일 폭으로 가운데 정렬 */}
      <View style={Platform.OS === 'web' ? webFrame : { flex: 1 }}>
        {isSupabaseConfigured ? (
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        ) : (
          <SetupNeeded />
        )}
      </View>
    </SafeAreaProvider>
  );
}
