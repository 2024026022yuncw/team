import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { Button, Field, Input, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { joinTeam } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';

export default function JoinTeamScreen() {
  const router = useRouter();
  // 초대 링크(/team/join?code=XXXXXX)로 들어오면 코드가 미리 채워짐
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (code.trim().length < 6) return;
    setBusy(true);
    try {
      const team = await joinTeam(code.trim());
      router.dismiss();
      router.push({ pathname: '/team/[id]', params: { id: team.id } });
    } catch (e) {
      Alert.alert('참여 실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.sub, { marginBottom: 16 }]}>팀장에게 받은 6자리 초대 코드를 입력하세요.</Text>
      <Field label="초대 코드">
        <Input
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="ABC123"
          autoCapitalize="characters"
          maxLength={6}
          autoFocus
          style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: '700' }}
        />
      </Field>
      <Button title="참여하기" onPress={submit} loading={busy} disabled={code.length < 6} />
    </ScrollView>
  );
}
