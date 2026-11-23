import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Avatar, Card, styles } from '@/components/ui';
import {
  listSavedAccounts,
  prepareAddAccount,
  removeSavedAccount,
  subscribeAccounts,
  switchToAccount,
  type SavedAccount,
} from '@/lib/accounts';
import { Alert } from '@/lib/alert';
import { colors } from '@/lib/theme';

export function useSavedAccounts() {
  const [accounts, setAccounts] = useState<SavedAccount[]>(() => listSavedAccounts());
  useEffect(() => subscribeAccounts(() => setAccounts(listSavedAccounts())), []);
  return accounts;
}

/**
 * 저장된 계정 목록 + 전환/지우기/추가.
 * currentUserId 가 없으면(로그인 화면) "저장된 계정으로 로그인" 용도로 씀
 */
export function AccountSwitcher({ currentUserId }: { currentUserId?: string }) {
  const router = useRouter();
  const accounts = useSavedAccounts();
  const [switching, setSwitching] = useState<string | null>(null);

  async function switchTo(a: SavedAccount) {
    setSwitching(a.userId);
    try {
      await switchToAccount(a.userId);
      router.replace('/'); // 이전 계정 화면이 남지 않게 처음으로
    } catch (e) {
      Alert.alert('전환 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(null);
    }
  }

  function remove(a: SavedAccount) {
    Alert.alert(
      '이 기기에서 계정 지우기',
      a.isGuest
        ? `${a.name}(게스트)을 지우면 다시 들어올 수 없어요. 계속 쓰려면 먼저 그 계정에서 이메일을 등록하세요.\n\n그래도 지울까요?`
        : `${a.email ?? a.name} 계정을 이 기기의 목록에서 지울까요? (계정과 데이터는 그대로예요. 다음에 이메일로 다시 로그인하면 돼요)`,
      [
        { text: '취소', style: 'cancel' },
        { text: '지우기', style: 'destructive', onPress: () => removeSavedAccount(a.userId) },
      ],
    );
  }

  async function addAccount() {
    await prepareAddAccount(); // 지금 계정은 저장해 두고 로그인 화면으로
  }

  const others = accounts.filter((a) => a.userId !== currentUserId);
  if (!currentUserId && others.length === 0) return null;

  return (
    <Card style={{ paddingVertical: 6 }}>
      <Text style={[styles.title, { fontSize: 16, marginTop: 6, marginBottom: 2 }]}>
        {currentUserId ? '계정 전환' : '저장된 계정으로 로그인'}
      </Text>
      <Text style={[styles.muted, { marginBottom: 4 }]}>이 기기에 저장된 계정이에요. 눌러서 바로 바꿀 수 있어요.</Text>

      {accounts.map((a) => {
        const current = a.userId === currentUserId;
        return (
          <View key={a.userId} style={[styles.row, { gap: 10, paddingVertical: 8 }]}>
            <Pressable
              onPress={() => !current && switchTo(a)}
              disabled={current || switching !== null}
              style={[styles.row, { gap: 10, flex: 1 }]}
              accessibilityLabel={current ? `${a.name} 지금 계정` : `${a.name} 계정으로 전환`}
            >
              <Avatar id={a.userId} name={a.name} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: current ? '700' : '500' }} numberOfLines={1}>
                  {a.name}
                  {a.isGuest ? <Text style={styles.muted}> · 게스트</Text> : null}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {a.isGuest ? '이 기기에서만 유지' : a.email}
                </Text>
              </View>
              {current ? (
                <View style={[styles.row, { gap: 4 }]}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={{ color: colors.success, fontSize: 13, fontWeight: '600' }}>사용 중</Text>
                </View>
              ) : switching === a.userId ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={{ color: colors.primary, fontWeight: '700' }}>전환</Text>
              )}
            </Pressable>
            {!current && (
              <Pressable onPress={() => remove(a)} hitSlop={10} accessibilityLabel={`${a.name} 이 기기에서 지우기`}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        );
      })}

      {currentUserId && (
        <Pressable onPress={addAccount} style={[styles.row, { gap: 10, paddingVertical: 10 }]}>
          <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={18} color={colors.textSub} />
          </View>
          <Text style={{ color: colors.text, fontWeight: '600' }}>다른 계정 추가</Text>
        </Pressable>
      )}
    </Card>
  );
}
