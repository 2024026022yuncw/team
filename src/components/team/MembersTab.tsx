import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { Avatar, Button, Card, Chip, Input, SectionTitle, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { deleteTeam, removeMember, updateRoleTitle } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';
import { colors, radius } from '@/lib/theme';
import type { TeamMember } from '@/lib/types';

const ROLE_PRESETS = ['팀장', '발표', '자료조사', 'PPT', '보고서', '개발', '디자인', '회의록'];

export function MembersTab() {
  const router = useRouter();
  const userId = useUserId();
  const { team, members, nameOf, isOwner, reload } = useTeam();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [roleText, setRoleText] = useState('');

  if (!team) return null;

  async function copyCode() {
    await Clipboard.setStringAsync(team!.invite_code);
    Alert.alert('복사 완료', `초대 코드 ${team!.invite_code} 를 복사했어요.`);
  }

  async function shareInvite() {
    const link =
      Platform.OS === 'web'
        ? `${window.location.origin}/team/join?code=${team!.invite_code}`
        : `teammeetup://team/join?code=${team!.invite_code}`;
    const message = `[팀플모임] "${team!.name}" 팀에 초대합니다!\n아래 링크를 열거나, '코드로 참여'에 초대 코드를 입력하세요.\n\n초대 코드: ${team!.invite_code}\n바로 참여: ${link}`;

    if (Platform.OS !== 'web') {
      Share.share({ message });
      return;
    }
    // 웹: 휴대폰 브라우저는 공유 시트, PC 는 클립보드 복사
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        // 사용자가 취소한 경우 등 → 복사로 대체
      }
    }
    await Clipboard.setStringAsync(message);
    Alert.alert('초대 메시지 복사 완료', '카톡 등에 붙여넣어 팀원에게 보내세요.');
  }

  function openRole(m: TeamMember) {
    setEditing(m);
    setRoleText(m.role_title);
  }

  async function saveRole() {
    if (!editing) return;
    try {
      await updateRoleTitle(editing.team_id, editing.user_id, roleText.trim());
      setEditing(null);
      reload();
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    }
  }

  function kick(m: TeamMember) {
    Alert.alert('멤버 내보내기', `${nameOf(m.user_id)} 님을 팀에서 내보낼까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '내보내기',
        style: 'destructive',
        onPress: () => removeMember(m.team_id, m.user_id).then(reload).catch((e) => Alert.alert('실패', errorMessage(e))),
      },
    ]);
  }

  function leave() {
    if (isOwner) {
      Alert.alert('팀 삭제', '팀장이 나가면 팀이 삭제돼요. 일정·투표·할 일이 모두 사라집니다. 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '팀 삭제',
          style: 'destructive',
          onPress: () =>
            deleteTeam(team!.id)
              .then(() => router.dismissTo('/'))
              .catch((e) => Alert.alert('실패', errorMessage(e))),
        },
      ]);
    } else {
      Alert.alert('팀 나가기', '이 팀에서 나갈까요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '나가기',
          style: 'destructive',
          onPress: () =>
            removeMember(team!.id, userId)
              .then(() => router.dismissTo('/'))
              .catch((e) => Alert.alert('실패', errorMessage(e))),
        },
      ]);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Text style={[styles.sub, { color: colors.primary, fontWeight: '600' }]}>초대 코드</Text>
        <Text style={{ fontSize: 32, fontWeight: '800', letterSpacing: 6, color: colors.primary, marginVertical: 8 }}>
          {team.invite_code}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="복사" icon="copy-outline" variant="secondary" small onPress={copyCode} style={{ flex: 1 }} />
          <Button title="초대 공유" icon="share-social-outline" small onPress={shareInvite} style={{ flex: 1 }} />
        </View>
      </Card>

      {team.description ? <Text style={[styles.sub, { marginBottom: 8 }]}>{team.description}</Text> : null}

      <SectionTitle>멤버 {members.length}명</SectionTitle>
      {members.map((m) => (
        <Card key={m.user_id} style={{ paddingVertical: 12 }}>
          <View style={[styles.row, { gap: 12 }]}>
            <Avatar id={m.user_id} name={nameOf(m.user_id)} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                {nameOf(m.user_id)}
                {m.user_id === userId ? <Text style={styles.muted}> (나)</Text> : null}
                {m.role === 'owner' ? <Text style={{ color: colors.warning }}> 👑</Text> : null}
              </Text>
              <Pressable onPress={() => openRole(m)} hitSlop={6}>
                <Text style={{ color: m.role_title ? colors.primary : colors.textMuted, marginTop: 2 }}>
                  {m.role_title ? `역할: ${m.role_title}` : '+ 역할 지정'}
                </Text>
              </Pressable>
            </View>
            {isOwner && m.user_id !== userId ? (
              <Pressable onPress={() => kick(m)} hitSlop={10} accessibilityLabel="멤버 내보내기">
                <Ionicons name="person-remove-outline" size={20} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}

      <Button
        title={isOwner ? '팀 삭제' : '팀 나가기'}
        variant="danger"
        icon="exit-outline"
        onPress={leave}
        style={{ marginTop: 16 }}
      />

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}
          onPress={() => setEditing(null)}
        >
          <Pressable style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: 20 }} onPress={() => {}}>
            <Text style={[styles.title, { marginBottom: 12 }]}>
              {editing ? nameOf(editing.user_id) : ''} 님의 역할
            </Text>
            <Input value={roleText} onChangeText={setRoleText} placeholder="예: 발표, 자료조사" maxLength={20} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
              {ROLE_PRESETS.map((r) => (
                <Chip key={r} label={r} active={roleText === r} onPress={() => setRoleText(r)} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button title="취소" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
              <Button title="저장" onPress={saveRole} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
