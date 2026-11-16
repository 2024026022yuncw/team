import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DateField, TimeStepper } from '@/components/Pickers';
import { Button, Chip, Field, Input, Loading, Segmented, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { createEvent, createPost, deleteEvent, getEvent, updateEvent, type EventInput } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { combine, minutesOfDay, toDateKey, todayKey } from '@/lib/date';
import { noticeFromEvent, platformOf, PLATFORMS } from '@/lib/meeting';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';
import { colors } from '@/lib/theme';

type MeetingChoice = 'offline' | 'online' | 'none';

export default function EventScreen() {
  const router = useRouter();
  const userId = useUserId();
  const { teamId, nameOf } = useTeam();
  const params = useLocalSearchParams<{ eventId?: string; date?: string; title?: string; start?: string; end?: string }>();
  const isEdit = Boolean(params.eventId);
  // 시간 투표에서 "이 시간으로 확정"으로 들어온 경우
  const fromPoll = !isEdit && Boolean(params.title);

  const [loading, setLoading] = useState(isEdit);
  const [title, setTitle] = useState(params.title ?? '');
  const [meeting, setMeeting] = useState<MeetingChoice>('offline');
  const [location, setLocation] = useState('');
  const [platform, setPlatform] = useState<string>('zoom');
  const [link, setLink] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(params.date ?? todayKey());
  const [startMin, setStartMin] = useState(params.start ? Number(params.start) : 14 * 60);
  const [endDate, setEndDate] = useState(params.date ?? todayKey());
  const [endMin, setEndMin] = useState(params.end ? Number(params.end) : 15 * 60);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  // 새 모임은 공지로 올리기 기본 켜짐, 수정할 때는 꺼짐(변경 공지가 필요할 때만 켬)
  const [postNotice, setPostNotice] = useState(!isEdit);
  const [pinNotice, setPinNotice] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!params.eventId) return;
    getEvent(params.eventId)
      .then((e) => {
        if (!e) return;
        const s = new Date(e.starts_at);
        const en = new Date(e.ends_at);
        setTitle(e.title);
        setMeeting(e.meeting_type ?? 'none');
        setLocation(e.location);
        if (e.online_platform) setPlatform(e.online_platform);
        setLink(e.meeting_link);
        setDescription(e.description);
        setStartDate(toDateKey(s));
        setStartMin(minutesOfDay(s));
        setEndDate(toDateKey(en));
        setEndMin(minutesOfDay(en));
        setCreatedBy(e.created_by);
      })
      .catch((e) => Alert.alert('불러오기 실패', errorMessage(e)))
      .finally(() => setLoading(false));
  }, [params.eventId]);

  // 시작 날짜를 바꾸면 종료 날짜가 시작보다 앞서지 않도록 맞춤
  function changeStartDate(k: string | null) {
    if (!k) return;
    setStartDate(k);
    if (endDate < k) setEndDate(k);
  }

  async function save() {
    const starts = combine(startDate, startMin);
    const ends = combine(endDate, endMin);
    if (!title.trim()) return;
    if (ends < starts) {
      Alert.alert('시간 확인', '종료 시간이 시작 시간보다 빨라요.');
      return;
    }
    const input: EventInput = {
      title: title.trim(),
      description: description.trim(),
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      meeting_type: meeting === 'none' ? null : meeting,
      // 온라인이면 장소 대신 플랫폼·링크를 저장
      location: meeting === 'online' ? '' : location.trim(),
      online_platform: meeting === 'online' ? platform : '',
      meeting_link: meeting === 'online' ? link.trim() : '',
    };
    setBusy(true);
    try {
      let eventId = params.eventId;
      if (eventId) await updateEvent(eventId, input);
      else eventId = (await createEvent(teamId, userId, input)).id;

      if (postNotice) {
        const { title: noticeTitle, content } = noticeFromEvent(input, isEdit);
        const post = await createPost(teamId, userId, {
          kind: 'notice',
          title: noticeTitle,
          content,
          meeting_date: null,
          pinned: pinNotice,
          event_id: eventId,
        });
        // 올라간 공지를 바로 보여줌
        router.replace({ pathname: '/team/[id]/post/[postId]', params: { id: teamId, postId: post.id } });
        return;
      }
      router.back();
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!params.eventId) return;
    const id = params.eventId;
    Alert.alert('일정 삭제', '이 일정을 삭제할까요? 팀원 모두에게서 사라져요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEvent(id);
            router.back();
          } catch (e) {
            Alert.alert('삭제 실패', errorMessage(e));
          }
        },
      },
    ]);
  }

  if (loading) return <Loading />;

  const p = platformOf(platform);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isEdit ? '일정 수정' : fromPoll ? '모임 확정' : '새 일정' }} />
      <Field label="제목">
        <Input value={title} onChangeText={setTitle} placeholder="예: 중간 발표 준비 회의" maxLength={100} />
      </Field>

      <Field label="시작">
        <DateField value={startDate} onChange={changeStartDate} />
        <View style={{ height: 8 }} />
        <TimeStepper minutes={startMin} onChange={setStartMin} />
      </Field>
      <Field label="종료">
        <DateField value={endDate} onChange={(k) => k && setEndDate(k)} />
        <View style={{ height: 8 }} />
        <TimeStepper minutes={endMin} onChange={setEndMin} />
      </Field>

      <Field label="모임 방식">
        <Segmented
          options={[
            { value: 'offline', label: '🏫 오프라인' },
            { value: 'online', label: '💻 온라인' },
            { value: 'none', label: '모임 아님' },
          ]}
          value={meeting}
          onChange={setMeeting}
        />
      </Field>

      {meeting === 'offline' && (
        <Field label="모임 장소">
          <Input value={location} onChangeText={setLocation} placeholder="예: 공학관 302호, 중앙도서관 스터디룸 3" maxLength={100} />
        </Field>
      )}

      {meeting === 'online' && (
        <>
          <Field label="온라인 플랫폼">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {PLATFORMS.map((pl) => (
                <Chip
                  key={pl.value}
                  label={`${pl.emoji} ${pl.label}`}
                  active={platform === pl.value}
                  onPress={() => setPlatform(pl.value)}
                />
              ))}
            </View>
          </Field>
          <Field label="링크 / 접속 방법 (선택)">
            <Input
              value={link}
              onChangeText={setLink}
              placeholder={p?.linkHint ?? '접속 방법'}
              autoCapitalize="none"
              maxLength={500}
            />
          </Field>
        </>
      )}

      {meeting === 'none' && (
        <Field label="장소 (선택)">
          <Input value={location} onChangeText={setLocation} placeholder="예: 과제 제출 - 이캠퍼스" maxLength={100} />
        </Field>
      )}

      <Field label="메모 (선택)">
        <Input value={description} onChangeText={setDescription} multiline maxLength={1000} placeholder="준비물, 안건 등" />
      </Field>

      {/* 공지로 올리기 */}
      <Pressable
        onPress={() => setPostNotice((v) => !v)}
        style={[styles.row, { gap: 10, padding: 12, borderRadius: 12, backgroundColor: postNotice ? '#FEF3C7' : '#F3F4F6', marginBottom: 8 }]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: postNotice }}
      >
        <Ionicons name={postNotice ? 'checkbox' : 'square-outline'} size={22} color={postNotice ? '#B45309' : colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: colors.text }}>
            📢 {isEdit ? '변경 내용을 공지로 올리기' : '공지로도 올리기'}
          </Text>
          <Text style={styles.muted}>일시·방식·장소(링크)가 정리된 공지가 팀 공지 탭에 올라가요.</Text>
        </View>
      </Pressable>
      {postNotice && (
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <Chip label={pinNotice ? '📌 공지 상단 고정됨' : '📌 공지 상단에 고정'} active={pinNotice} onPress={() => setPinNotice((v) => !v)} />
        </View>
      )}

      <Button
        title={isEdit ? '수정 완료' : postNotice ? '일정 추가 + 공지 올리기' : '일정 추가'}
        onPress={save}
        loading={busy}
        disabled={!title.trim()}
      />
      {isEdit && (
        <>
          <Text style={[styles.muted, { textAlign: 'center', marginVertical: 12 }]}>
            등록한 사람: {nameOf(createdBy)}
          </Text>
          <Button title="삭제" variant="danger" onPress={remove} />
        </>
      )}
      {!isEdit && (
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 12, color: colors.textMuted }]}>
          추가한 일정은 팀원 모두의 캘린더에 바로 표시돼요.
        </Text>
      )}
    </ScrollView>
  );
}
