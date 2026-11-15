import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Avatar, Button, Card, Field, Input, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { deleteMyAccount, updateDisplayName } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setName(profile?.display_name ?? ''), [profile?.display_name]);

  async function save() {
    if (!session || !name.trim()) return;
    setBusy(true);
    try {
      await updateDisplayName(session.user.id, name.trim());
      await refreshProfile();
      Alert.alert('저장 완료', '이름이 변경되었어요.');
    } catch (e) {
      Alert.alert('실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function withdraw() {
    Alert.alert(
      '회원탈퇴',
      '정말 탈퇴할까요?\n\n• 다이어리, 시간표, 투표 기록이 모두 삭제돼요.\n• 내가 팀장인 팀은 가장 먼저 들어온 팀원에게 넘어가요. (혼자인 팀은 삭제)\n• 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteMyAccount();
              await supabase.auth.signOut({ scope: 'local' });
              Alert.alert('탈퇴 완료', '그동안 이용해주셔서 감사합니다.');
            } catch (e) {
              Alert.alert('탈퇴 실패', errorMessage(e));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  function logout() {
    Alert.alert('로그아웃', '로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
        <Avatar id={session?.user.id} name={profile?.display_name ?? ''} size={72} />
        <Text style={[styles.title, { marginTop: 12 }]}>{profile?.display_name}</Text>
        <Text style={styles.sub}>{session?.user.email}</Text>
      </Card>

      <Card>
        <Field label="표시 이름 (팀원에게 보여요)">
          <Input value={name} onChangeText={setName} maxLength={20} />
        </Field>
        <Button
          title="저장"
          onPress={save}
          loading={busy}
          disabled={!name.trim() || name.trim() === profile?.display_name}
        />
      </Card>

      <View style={{ marginTop: 8 }}>
        <Button title="로그아웃" variant="secondary" icon="log-out-outline" onPress={logout} />
      </View>

      <View style={{ marginTop: 32, alignItems: 'center' }}>
        <Button title="회원탈퇴" variant="ghost" onPress={withdraw} loading={deleting} style={{ height: 40 }} />
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          탈퇴하면 다이어리·시간표·투표 기록이 모두 삭제되고 되돌릴 수 없어요.
        </Text>
      </View>
    </ScrollView>
  );
}
