import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { Button, Field, Input, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { createTeam } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';

export default function CreateTeamScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const team = await createTeam(name.trim(), description.trim());
      router.dismiss();
      router.push({ pathname: '/team/[id]', params: { id: team.id, tab: 'members' } });
    } catch (e) {
      Alert.alert('팀 생성 실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Field label="팀 이름">
        <Input value={name} onChangeText={setName} placeholder="예: 캡스톤디자인 3조" maxLength={50} autoFocus />
      </Field>
      <Field label="설명 (선택)">
        <Input
          value={description}
          onChangeText={setDescription}
          placeholder="예: 화요일 3시 정기 회의"
          multiline
          maxLength={200}
        />
      </Field>
      <Button title="만들기" onPress={submit} loading={busy} disabled={!name.trim()} />
    </ScrollView>
  );
}
