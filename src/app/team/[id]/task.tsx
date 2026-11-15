import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DateField } from '@/components/Pickers';
import { Button, Chip, Field, Input, Loading, Segmented, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { createTask, deleteTask, getTask, updateTask } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';
import { colorFor } from '@/lib/theme';
import type { TaskStatus } from '@/lib/types';

export default function TaskScreen() {
  const router = useRouter();
  const userId = useUserId();
  const { teamId, members, nameOf } = useTeam();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const isEdit = Boolean(taskId);

  const [loading, setLoading] = useState(isEdit);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    getTask(taskId)
      .then((t) => {
        if (!t) return;
        setTitle(t.title);
        setDescription(t.description);
        setAssignee(t.assignee_id);
        setDueDate(t.due_date);
        setStatus(t.status);
      })
      .catch((e) => Alert.alert('불러오기 실패', errorMessage(e)))
      .finally(() => setLoading(false));
  }, [taskId]);

  async function save() {
    if (!title.trim()) return;
    const input = { title: title.trim(), description: description.trim(), assignee_id: assignee, due_date: dueDate, status };
    setBusy(true);
    try {
      if (taskId) await updateTask(taskId, input);
      else await createTask(teamId, userId, input);
      router.back();
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!taskId) return;
    Alert.alert('할 일 삭제', '이 할 일을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(taskId);
            router.back();
          } catch (e) {
            Alert.alert('삭제 실패', errorMessage(e));
          }
        },
      },
    ]);
  }

  if (loading) return <Loading />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isEdit ? '할 일 수정' : '새 할 일' }} />
      <Field label="할 일">
        <Input value={title} onChangeText={setTitle} placeholder="예: 발표 자료 3~5페이지 작성" maxLength={100} />
      </Field>

      <Field label="담당자">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="미지정" active={assignee === null} onPress={() => setAssignee(null)} />
          {members.map((m) => (
            <Chip
              key={m.user_id}
              label={`${nameOf(m.user_id)}${m.role_title ? ` (${m.role_title})` : ''}`}
              active={assignee === m.user_id}
              color={colorFor(m.user_id)}
              onPress={() => setAssignee(m.user_id)}
            />
          ))}
        </View>
      </Field>

      <Field label="마감일 (선택)">
        <DateField value={dueDate} onChange={setDueDate} placeholder="마감일 없음" allowClear />
      </Field>

      <Field label="상태">
        <Segmented
          options={[
            { value: 'todo', label: '할 일' },
            { value: 'doing', label: '진행 중' },
            { value: 'done', label: '완료' },
          ]}
          value={status}
          onChange={setStatus}
        />
      </Field>

      <Field label="메모 (선택)">
        <Input value={description} onChangeText={setDescription} multiline maxLength={1000} />
      </Field>

      <Button title={isEdit ? '수정 완료' : '추가'} onPress={save} loading={busy} disabled={!title.trim()} />
      {isEdit && <Button title="삭제" variant="danger" onPress={remove} style={{ marginTop: 12 }} />}
    </ScrollView>
  );
}
