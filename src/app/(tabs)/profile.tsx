import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Avatar, Button, Card, Field, Input, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { updateDisplayName } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [busy, setBusy] = useState(false);

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
        <Button title="로그아웃" variant="danger" icon="log-out-outline" onPress={logout} />
      </View>
    </ScrollView>
  );
}
