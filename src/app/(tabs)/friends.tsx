import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { Avatar, Button, Card, EmptyState, Input, SectionTitle, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import {
  acceptFriendRequest,
  listFriendships,
  listMyTeammates,
  myFriendCode,
  removeFriendship,
  sendFriendRequest,
} from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { useAsync, useRealtime } from '@/lib/hooks';
import { errorMessage } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { FriendItem } from '@/lib/types';

const RESULT_MESSAGE: Record<string, string> = {
  requested: '친구 요청을 보냈어요. 상대가 수락하면 친구가 돼요.',
  accepted: '상대도 요청을 보냈었어요. 바로 친구가 됐어요! 🎉',
  already_requested: '이미 요청을 보냈어요. 수락을 기다려 주세요.',
  already_friends: '이미 친구예요.',
};

export default function FriendsScreen() {
  const userId = useUserId();
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);

  const { data: myCode } = useAsync<string>(myFriendCode, [], '');
  const { data: items, setData, reload } = useAsync<FriendItem[]>(() => listFriendships(userId), [userId], []);
  useRealtime(`friends-${userId}`, [{ table: 'friendships' }], reload);

  const { data: teammates } = useAsync(() => listMyTeammates(userId), [userId], []);
  const relation = new Map(items.map((i) => [i.otherId, i]));
  // 아직 아무 관계도 없는 같은 팀원 (받은/보낸 요청은 각자 섹션에 따로 나옴)
  const suggestions = teammates.filter((t) => !relation.has(t.userId));

  async function requestTeammate(t: { userId: string; name: string }) {
    try {
      const result = await sendFriendRequest({ userId: t.userId });
      Alert.alert('친구 요청', result === 'accepted' ? `${t.name} 님과 친구가 됐어요! 🎉` : RESULT_MESSAGE[result] ?? '완료했어요.');
      reload();
    } catch (e) {
      Alert.alert('실패', errorMessage(e));
    }
  }

  const received = items.filter((i) => i.status === 'pending' && i.direction === 'received');
  const sent = items.filter((i) => i.status === 'pending' && i.direction === 'sent');
  const friends = items.filter((i) => i.status === 'accepted').sort((a, b) => a.otherName.localeCompare(b.otherName, 'ko'));

  async function add() {
    const c = code.trim().toUpperCase();
    if (c.length < 6) return;
    if (c === myCode) {
      Alert.alert('내 코드예요', '친구의 코드를 입력해주세요.');
      return;
    }
    setSending(true);
    try {
      const result = await sendFriendRequest({ code: c });
      setCode('');
      Alert.alert('친구 추가', RESULT_MESSAGE[result] ?? '완료했어요.');
      reload();
    } catch (e) {
      Alert.alert('실패', errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function copyCode() {
    await Clipboard.setStringAsync(myCode);
    Alert.alert('복사 완료', `내 친구 코드 ${myCode} 를 복사했어요.`);
  }

  async function shareCode() {
    const message = `[팀플모임] 친구 추가해줘! 친구 탭에서 내 코드를 입력하면 돼요.\n\n친구 코드: ${myCode}`;
    if (Platform.OS !== 'web') {
      Share.share({ message });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        // 취소 등 → 복사로 대체
      }
    }
    await Clipboard.setStringAsync(message);
    Alert.alert('복사 완료', '카톡 등에 붙여넣어 보내세요.');
  }

  async function accept(item: FriendItem) {
    setData((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'accepted' } : i)));
    try {
      await acceptFriendRequest(item.id);
    } catch (e) {
      Alert.alert('실패', errorMessage(e));
      reload();
    }
  }

  function remove(item: FriendItem, label: string, confirm?: string) {
    const run = async () => {
      setData((prev) => prev.filter((i) => i.id !== item.id));
      try {
        await removeFriendship(item.id);
      } catch (e) {
        Alert.alert('실패', errorMessage(e));
        reload();
      }
    };
    if (!confirm) {
      run();
      return;
    }
    Alert.alert(label, confirm, [
      { text: '취소', style: 'cancel' },
      { text: label, style: 'destructive', onPress: run },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* 내 친구 코드 */}
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Text style={[styles.sub, { color: colors.primary, fontWeight: '600' }]}>내 친구 코드</Text>
        <Text style={{ fontSize: 32, fontWeight: '800', letterSpacing: 6, color: colors.primary, marginVertical: 8 }}>
          {myCode || '······'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="복사" icon="copy-outline" variant="secondary" small onPress={copyCode} disabled={!myCode} style={{ flex: 1 }} />
          <Button title="코드 공유" icon="share-social-outline" small onPress={shareCode} disabled={!myCode} style={{ flex: 1 }} />
        </View>
      </Card>

      {/* 코드로 친구 추가 */}
      <Card>
        <Text style={[styles.title, { marginBottom: 8 }]}>친구 코드로 추가</Text>
        <View style={[styles.row, { gap: 8 }]}>
          <Input
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ABC123"
            autoCapitalize="characters"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={add}
            style={{ flex: 1, letterSpacing: 4, fontWeight: '700' }}
          />
          <Button title="요청" onPress={add} loading={sending} disabled={code.length < 6} style={{ height: 50 }} />
        </View>
        <Text style={[styles.muted, { marginTop: 8 }]}>같은 팀원은 아래 "같은 팀원" 목록에서 코드 없이 바로 요청할 수 있어요.</Text>
      </Card>

      {received.length > 0 && (
        <>
          <SectionTitle>받은 요청 {received.length}</SectionTitle>
          {received.map((i) => (
            <Card key={i.id} style={{ paddingVertical: 12 }}>
              <View style={[styles.row, { gap: 12 }]}>
                <Avatar id={i.otherId} name={i.otherName} size={40} />
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text }}>{i.otherName}</Text>
                <Button title="수락" small onPress={() => accept(i)} />
                <Button title="거절" small variant="secondary" onPress={() => remove(i, '거절')} />
              </View>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>친구 {friends.length}</SectionTitle>
      {friends.length === 0 ? (
        <EmptyState icon="people-circle-outline" title="아직 친구가 없어요" hint="내 코드를 공유하거나 친구 코드를 입력해보세요." />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {friends.map((i) => (
            <View key={i.id} style={[styles.row, { gap: 12, paddingVertical: 10 }]}>
              <Avatar id={i.otherId} name={i.otherName} size={36} />
              <Text style={{ flex: 1, fontSize: 16, color: colors.text }}>{i.otherName}</Text>
              <Pressable
                onPress={() => remove(i, '친구 끊기', `${i.otherName} 님과 친구를 끊을까요?`)}
                hitSlop={10}
                accessibilityLabel={`${i.otherName} 친구 끊기`}
              >
                <Ionicons name="person-remove-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {suggestions.length > 0 && (
        <>
          <SectionTitle>같은 팀원 {suggestions.length}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {suggestions.map((t) => (
              <View key={t.userId} style={[styles.row, { gap: 12, paddingVertical: 10 }]}>
                <Avatar id={t.userId} name={t.name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, color: colors.text }}>{t.name}</Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {t.teamNames.join(', ')}
                  </Text>
                </View>
                <Button
                  title="+친구"
                  small
                  variant="secondary"
                  onPress={() => requestTeammate(t)}
                />
              </View>
            ))}
          </Card>
        </>
      )}

      {sent.length > 0 && (
        <>
          <SectionTitle>보낸 요청 {sent.length}</SectionTitle>
          <Card style={{ paddingVertical: 4 }}>
            {sent.map((i) => (
              <View key={i.id} style={[styles.row, { gap: 12, paddingVertical: 10 }]}>
                <Avatar id={i.otherId} name={i.otherName} size={32} />
                <Text style={{ flex: 1, color: colors.text }}>
                  {i.otherName} <Text style={styles.muted}>· 수락 대기 중</Text>
                </Text>
                <Button title="취소" small variant="ghost" onPress={() => remove(i, '요청 취소')} />
              </View>
            ))}
          </Card>
        </>
      )}

      <Text style={[styles.muted, { marginTop: 16, textAlign: 'center' }]}>
        친구에게는 이름만 보여요. 친구는 팀 → 멤버 탭에서 팀에 초대할 수 있어요.
      </Text>
    </ScrollView>
  );
}
