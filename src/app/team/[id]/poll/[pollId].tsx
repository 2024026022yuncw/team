import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, Loading, Segmented, SectionTitle, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { addVote, deletePoll, getPoll, listVotes, removeVote, setPollClosed } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { formatHour, formatShortDay } from '@/lib/date';
import { useAsync, useRealtime } from '@/lib/hooks';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';
import { colors } from '@/lib/theme';
import type { Poll, PollVote } from '@/lib/types';

const slotKey = (date: string, hour: number) => `${date}|${hour}`;

type Block = { date: string; start: number; end: number; voters: string[] };

/** 같은 사람들이 연속으로 가능한 시간을 묶어 추천 블록 생성 */
function bestBlocks(poll: Poll, votersBySlot: Map<string, string[]>): Block[] {
  const blocks: Block[] = [];
  for (const date of [...poll.dates].sort()) {
    let cur: Block | null = null;
    for (let h = poll.start_hour; h < poll.end_hour; h++) {
      const voters = votersBySlot.get(slotKey(date, h)) ?? [];
      const sig = [...voters].sort().join(',');
      if (cur && voters.length > 0 && [...cur.voters].sort().join(',') === sig) {
        cur.end = h + 1;
      } else {
        if (cur) blocks.push(cur);
        cur = voters.length > 0 ? { date, start: h, end: h + 1, voters } : null;
      }
    }
    if (cur) blocks.push(cur);
  }
  return blocks
    .sort((a, b) => b.voters.length - a.voters.length || b.end - b.start - (a.end - a.start))
    .slice(0, 3);
}

export default function PollScreen() {
  const router = useRouter();
  const userId = useUserId();
  const { teamId, members, nameOf, isOwner } = useTeam();
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  const [mode, setMode] = useState<'mine' | 'result'>('mine');
  const [inspect, setInspect] = useState<string | null>(null);

  const { data, setData, loading, reload } = useAsync<{ poll: Poll | null; votes: PollVote[] }>(
    async () => {
      const [poll, votes] = await Promise.all([getPoll(pollId), listVotes(pollId)]);
      return { poll, votes };
    },
    [pollId],
    { poll: null, votes: [] },
  );
  // DELETE 이벤트는 필터가 적용되지 않으므로 poll_votes 는 필터 없이 구독 후 재조회
  useRealtime(`poll-${pollId}`, [{ table: 'poll_votes' }, { table: 'polls', filter: `id=eq.${pollId}` }], reload);

  const { poll, votes } = data;

  const { votersBySlot, mine, voterCount } = useMemo(() => {
    const votersBySlot = new Map<string, string[]>();
    const mine = new Set<string>();
    const voterIds = new Set<string>();
    for (const v of votes) {
      const k = slotKey(v.slot_date, v.slot_hour);
      votersBySlot.set(k, [...(votersBySlot.get(k) ?? []), v.user_id]);
      voterIds.add(v.user_id);
      if (v.user_id === userId) mine.add(k);
    }
    return { votersBySlot, mine, voterCount: voterIds.size };
  }, [votes, userId]);

  const toggle = useCallback(
    async (date: string, hour: number) => {
      if (!poll || poll.closed) return;
      const k = slotKey(date, hour);
      const had = mine.has(k);
      // 낙관적 업데이트
      setData((prev) => ({
        ...prev,
        votes: had
          ? prev.votes.filter((v) => !(v.user_id === userId && v.slot_date === date && v.slot_hour === hour))
          : [...prev.votes, { poll_id: pollId, user_id: userId, slot_date: date, slot_hour: hour }],
      }));
      try {
        if (had) await removeVote(pollId, userId, date, hour);
        else await addVote(pollId, userId, date, hour);
      } catch (e) {
        Alert.alert('저장 실패', errorMessage(e));
        reload();
      }
    },
    [poll, mine, pollId, userId, setData, reload],
  );

  if (loading) return <Loading />;
  if (!poll) return <Text style={{ padding: 24 }}>투표를 찾을 수 없어요.</Text>;

  const dates = [...poll.dates].sort();
  const hours = Array.from({ length: poll.end_hour - poll.start_hour }, (_, i) => poll.start_hour + i);
  const total = Math.max(members.length, 1);
  const blocks = bestBlocks(poll, votersBySlot);
  const canManage = isOwner || poll.created_by === userId;
  const inspectVoters = inspect ? (votersBySlot.get(inspect) ?? []) : [];

  function confirmAsEvent(b: Block) {
    const end = Math.min(b.end * 60, 23 * 60 + 30);
    router.push({
      pathname: '/team/[id]/event',
      params: { id: teamId, title: poll!.title, date: b.date, start: String(b.start * 60), end: String(end) },
    });
  }

  function manage() {
    Alert.alert('투표 관리', undefined, [
      {
        text: poll!.closed ? '투표 다시 열기' : '투표 마감하기',
        onPress: () => setPollClosed(poll!.id, !poll!.closed).then(reload).catch((e) => Alert.alert('실패', errorMessage(e))),
      },
      {
        text: '투표 삭제',
        style: 'destructive',
        onPress: () =>
          deletePoll(poll!.id)
            .then(() => router.back())
            .catch((e) => Alert.alert('실패', errorMessage(e))),
      },
      { text: '취소', style: 'cancel' },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: poll.title,
          headerRight: canManage
            ? () => (
                <Pressable onPress={manage} hitSlop={12} accessibilityLabel="투표 관리">
                  <Ionicons name="ellipsis-horizontal-circle" size={26} color={colors.text} />
                </Pressable>
              )
            : undefined,
        }}
      />

      <Text style={[styles.sub, { marginBottom: 12 }]}>
        {poll.closed ? '마감된 투표예요. ' : ''}참여 {voterCount}/{members.length}명
      </Text>

      <Segmented
        options={[
          { value: 'mine', label: '내 가능 시간 선택' },
          { value: 'result', label: '결과 보기' },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setInspect(null);
        }}
      />
      <Text style={[styles.muted, { marginTop: 8, marginBottom: 8 }]}>
        {mode === 'mine'
          ? poll.closed
            ? '마감되어 더 이상 수정할 수 없어요.'
            : '가능한 시간 칸을 눌러 선택/해제하세요. 자동 저장돼요.'
          : '칸을 누르면 그 시간에 가능한 사람을 볼 수 있어요. 진할수록 많이 겹쳐요.'}
      </Text>

      <Card style={{ padding: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={s.row}>
              <View style={s.hourLabel} />
              {dates.map((d) => (
                <Text key={d} style={s.dateLabel}>
                  {formatShortDay(d)}
                </Text>
              ))}
            </View>
            {hours.map((h) => (
              <View key={h} style={s.row}>
                <Text style={s.hourLabel}>{formatHour(h)}</Text>
                {dates.map((d) => {
                  const k = slotKey(d, h);
                  const count = votersBySlot.get(k)?.length ?? 0;
                  const isMine = mine.has(k);
                  let bg = '#F3F4F6';
                  if (mode === 'mine') {
                    bg = isMine ? colors.primary : '#F3F4F6';
                  } else if (count > 0) {
                    bg = `rgba(79,70,229,${0.15 + 0.85 * (count / total)})`;
                  }
                  const selected = mode === 'result' && inspect === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => (mode === 'mine' ? toggle(d, h) : setInspect(k))}
                      style={[s.cell, { backgroundColor: bg }, selected && s.cellSelected]}
                      accessibilityLabel={`${d} ${h}시 ${count}명`}
                    >
                      {mode === 'result' && count > 0 ? (
                        <Text style={{ fontSize: 12, fontWeight: '700', color: count / total > 0.5 ? '#fff' : colors.text }}>
                          {count}
                        </Text>
                      ) : mode === 'mine' && isMine ? (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>

      {mode === 'result' && inspect && (
        <Card>
          <Text style={styles.title}>
            {formatShortDay(inspect.split('|')[0])} {formatHour(Number(inspect.split('|')[1]))} · {inspectVoters.length}명 가능
          </Text>
          <View style={{ marginTop: 8, gap: 6 }}>
            {members.map((m) => {
              const ok = inspectVoters.includes(m.user_id);
              return (
                <View key={m.user_id} style={[styles.row, { gap: 8, opacity: ok ? 1 : 0.4 }]}>
                  <Avatar id={m.user_id} name={nameOf(m.user_id)} size={24} />
                  <Text style={{ flex: 1, color: colors.text }}>{nameOf(m.user_id)}</Text>
                  <Ionicons name={ok ? 'checkmark-circle' : 'close-circle-outline'} size={18} color={ok ? colors.success : colors.textMuted} />
                </View>
              );
            })}
          </View>
        </Card>
      )}

      <SectionTitle>추천 시간</SectionTitle>
      {blocks.length === 0 ? (
        <Text style={styles.muted}>아직 투표한 사람이 없어요.</Text>
      ) : (
        blocks.map((b, i) => (
          <Card key={`${b.date}-${b.start}`}>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : '🥉 '}
                  {formatShortDay(b.date)} {formatHour(b.start)}~{formatHour(b.end)}
                </Text>
                <Text style={[styles.sub, { marginTop: 4 }]}>
                  {b.voters.length}/{members.length}명 가능 · {b.voters.map((v) => nameOf(v)).join(', ')}
                </Text>
              </View>
            </View>
            <Button
              title="이 시간으로 일정 확정"
              icon="calendar"
              small
              variant="secondary"
              onPress={() => confirmAsEvent(b)}
              style={{ marginTop: 10 }}
            />
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  hourLabel: { width: 48, fontSize: 11, color: colors.textSub, textAlign: 'right', paddingRight: 6 },
  dateLabel: { width: 56, fontSize: 11, fontWeight: '600', color: colors.text, textAlign: 'center', marginBottom: 4 },
  cell: {
    width: 52,
    height: 30,
    margin: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: { borderWidth: 2, borderColor: colors.text },
});
