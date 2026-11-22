import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { CoursePicker, CourseShortField } from '@/components/CoursePicker';
import { Button, Field, Input, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { createTeam, updateTeam } from '@/lib/api';
import { errorMessage } from '@/lib/supabase';

export default function CreateTeamScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [course, setCourse] = useState('');
  const [courseShort, setCourseShort] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const team = await createTeam(name.trim(), description.trim());
      // 팀을 만든 사람이 팀장이라 바로 수업을 지정할 수 있음
      if (course.trim()) {
        try {
          await updateTeam(team.id, { course_name: course.trim(), course_short: courseShort.trim() });
        } catch (e) {
          // 팀은 이미 만들어졌으니 계속 진행 (수업은 멤버 탭에서 다시 지정 가능)
          Alert.alert('수업 지정 실패', `팀은 만들어졌어요. 수업은 멤버 탭에서 다시 지정해주세요.\n(${errorMessage(e)})`);
        }
      }
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
      <Field label="어떤 수업의 팀플인가요? (선택)">
        <CoursePicker value={course} onChange={setCourse} />
        <CourseShortField course={course} value={courseShort} onChange={setCourseShort} />
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
