import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/Pickers';
import { Button, Chip, Field, Input, Loading, Segmented, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { createPost, getPost, updatePost } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { formatDay, todayKey } from '@/lib/date';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';
import type { PostKind } from '@/lib/types';

/** 회의록 기본 양식 (참석자는 팀원 이름으로 미리 채움) */
function minutesTemplate(attendees: string[]) {
  return `■ 참석자
${attendees.join(', ')}

■ 안건
1.
2.

■ 논의 내용
-

■ 결정 사항
-

■ 할 일 (담당자 / 마감)
-

■ 다음 회의
- `;
}

export default function PostEditScreen() {
  const router = useRouter();
  const userId = useUserId();
  const { teamId, members, nameOf } = useTeam();
  const { postId, kind: kindParam } = useLocalSearchParams<{ postId?: string; kind?: PostKind }>();
  const isEdit = Boolean(postId);

  const [loading, setLoading] = useState(isEdit);
  const [kind, setKind] = useState<PostKind>(kindParam === 'minutes' ? 'minutes' : 'notice');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [meetingDate, setMeetingDate] = useState<string | null>(todayKey());
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!postId) return;
    getPost(postId)
      .then((p) => {
        if (!p) return;
        setKind(p.kind);
        setTitle(p.title);
        setContent(p.content);
        setMeetingDate(p.meeting_date);
        setPinned(p.pinned);
      })
      .catch((e) => Alert.alert('불러오기 실패', errorMessage(e)))
      .finally(() => setLoading(false));
  }, [postId]);

  function changeKind(k: PostKind) {
    setKind(k);
    // 회의록으로 바꿨는데 비어 있으면 양식과 제목을 채워 줌
    if (k === 'minutes' && !content.trim()) setContent(minutesTemplate(members.map((m) => nameOf(m.user_id))));
    if (k === 'minutes' && !title.trim() && meetingDate) setTitle(`${formatDay(meetingDate)} 회의록`);
  }

  function insertTemplate() {
    const tpl = minutesTemplate(members.map((m) => nameOf(m.user_id)));
    if (!content.trim()) {
      setContent(tpl);
      return;
    }
    Alert.alert('양식 넣기', '지금 내용 아래에 회의록 양식을 붙일까요?', [
      { text: '취소', style: 'cancel' },
      { text: '붙이기', onPress: () => setContent((c) => `${c}\n\n${tpl}`) },
    ]);
  }

  async function save() {
    if (!title.trim()) return;
    const input = {
      kind,
      title: title.trim(),
      content: content.trimEnd(),
      meeting_date: kind === 'minutes' ? meetingDate : null,
      pinned,
    };
    setBusy(true);
    try {
      if (postId) {
        await updatePost(postId, input);
        router.back();
      } else {
        const post = await createPost(teamId, userId, input);
        router.replace({ pathname: '/team/[id]/post/[postId]', params: { id: teamId, postId: post.id } });
      }
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isEdit ? '글 수정' : '새 글' }} />

      <View style={{ marginBottom: 16 }}>
        <Segmented
          options={[
            { value: 'notice', label: '📢 공지' },
            { value: 'minutes', label: '📝 회의록' },
          ]}
          value={kind}
          onChange={changeKind}
        />
      </View>

      {kind === 'minutes' && (
        <Field label="회의 날짜">
          <DateField
            value={meetingDate}
            onChange={(k) => {
              // 제목이 자동 제목 그대로면 날짜에 맞춰 바꿔 줌
              if (meetingDate && title === `${formatDay(meetingDate)} 회의록` && k) setTitle(`${formatDay(k)} 회의록`);
              setMeetingDate(k);
            }}
            allowClear
          />
        </Field>
      )}

      <Field label="제목">
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder={kind === 'notice' ? '예: 수요일 3시 회의 장소 변경' : '예: 11월 16일 회의록'}
          maxLength={100}
        />
      </Field>

      <Field label="내용">
        {kind === 'minutes' && (
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            <Chip label="📋 회의록 양식 넣기" onPress={insertTemplate} />
          </View>
        )}
        <Input
          value={content}
          onChangeText={setContent}
          placeholder={kind === 'notice' ? '팀원들에게 알릴 내용을 적어주세요.' : '회의 내용을 기록하세요.'}
          multiline
          maxLength={20000}
          style={{ minHeight: 260 }}
        />
      </Field>

      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <Chip label={pinned ? '📌 상단 고정됨' : '📌 상단에 고정'} active={pinned} onPress={() => setPinned((v) => !v)} />
      </View>

      <Button title={isEdit ? '수정 완료' : '올리기'} onPress={save} loading={busy} disabled={!title.trim()} />
      <Text style={[styles.muted, { textAlign: 'center', marginTop: 12 }]}>
        올린 글은 팀원 모두가 볼 수 있고, 누가 읽었는지 확인할 수 있어요.
      </Text>
    </ScrollView>
  );
}
