import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { NumberStepper } from '@/components/Pickers';
import { Avatar, Button, Card, Chip, Field, Input, SectionTitle, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { deleteTeamDraw, listTeamDraws, runTeamDraw, updateRoleTitle } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { formatShortDay, formatTime } from '@/lib/date';
import { useAsync, useRealtime } from '@/lib/hooks';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';
import { colorFor, colors, radius } from '@/lib/theme';
import type { TeamDraw } from '@/lib/types';

const TITLE_PRESETS = ['발표자', 'PPT 제작', '자료조사', '보고서', '질의응답', '회의록'];

type Phase = 'idle' | 'spinning' | 'done';

export default function DrawScreen() {
  const userId = useUserId();
  const { teamId, members, nameOf, isOwner, reload: reloadTeam } = useTeam();
  const [title, setTitle] = useState('발표자');
  const [count, setCount] = useState(1);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [result, setResult] = useState<TeamDraw | null>(null);
  const [assigning, setAssigning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: history, reload } = useAsync<TeamDraw[]>(() => listTeamDraws(teamId), [teamId], []);
  useRealtime(`draws-${teamId}`, [{ table: 'team_draws', filter: `team_id=eq.${teamId}` }], reload);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const participants = members.map((m) => m.user_id).filter((id) => !excluded.includes(id));
  const maxCount = Math.max(1, participants.length);
  const safeCount = Math.min(count, maxCount);

  function toggle(id: string) {
    setExcluded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function start() {
    if (participants.length === 0 || phase === 'spinning') return;
    setPhase('spinning');
    setResult(null);

    // 결과는 서버에서 정함 (요청과 동시에 룰렛을 돌림)
    let drawn: TeamDraw | null = null;
    let failed = false;
    runTeamDraw(teamId, title.trim() || '발표자', participants, safeCount)
      .then((d) => (drawn = d))
      .catch((e) => {
        failed = true;
        Alert.alert('뽑기 실패', errorMessage(e));
      });

    const pool = [...participants];
    let i = Math.floor(Math.random() * pool.length);
    let delay = 50;
    const startedAt = Date.now();

    const tick = () => {
      if (failed) {
        setPhase('idle');
        setHighlight(null);
        return;
      }
      i = (i + 1) % pool.length;
      setHighlight(pool[i]);
      const elapsed = Date.now() - startedAt;
      // 2초 동안은 빠르게, 그 뒤로 점점 느리게
      if (elapsed > 2000) delay = Math.min(delay * 1.18, 420);
      // 충분히 느려졌고 결과가 왔으면, 첫 번째 당첨자에서 멈춤
      if (drawn && delay >= 400 && pool[i] === drawn.winners[0]) {
        const d: TeamDraw = drawn;
        setResult(d);
        setPhase('done');
        reload();
        return;
      }
      timer.current = setTimeout(tick, delay);
    };
    tick();
  }

  async function assignRoles() {
    if (!result) return;
    setAssigning(true);
    try {
      await Promise.all(result.winners.map((id) => updateRoleTitle(teamId, id, result.title.slice(0, 20))));
      reloadTeam();
      Alert.alert('역할 지정 완료', `${result.winners.map((id) => nameOf(id)).join(', ')} 님의 역할을 "${result.title}"(으)로 저장했어요.`);
    } catch (e) {
      Alert.alert('실패', errorMessage(e));
    } finally {
      setAssigning(false);
    }
  }

  function removeHistory(d: TeamDraw) {
    Alert.alert('기록 삭제', '이 뽑기 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => deleteTeamDraw(d.id).then(reload).catch((e) => Alert.alert('실패', errorMessage(e))),
      },
    ]);
  }

  const spinning = phase === 'spinning';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* 룰렛 화면 */}
      <Card style={{ alignItems: 'center', paddingVertical: 28, backgroundColor: phase === 'done' ? '#FEF3C7' : colors.card }}>
        {phase === 'idle' && (
          <>
            <Text style={{ fontSize: 48 }}>🎲</Text>
            <Text style={[styles.title, { marginTop: 8 }]}>{title || '발표자'} 뽑기</Text>
            <Text style={[styles.muted, { marginTop: 4 }]}>
              {participants.length}명 중 {safeCount}명
            </Text>
          </>
        )}
        {spinning && highlight && (
          <>
            <Avatar id={highlight} name={nameOf(highlight)} size={72} />
            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 12 }}>{nameOf(highlight)}</Text>
            <Text style={[styles.muted, { marginTop: 4 }]}>두구두구두구…</Text>
          </>
        )}
        {phase === 'done' && result && (
          <>
            <Text style={{ fontSize: 40 }}>🎉</Text>
            <Text style={[styles.sub, { marginTop: 4 }]}>오늘의 {result.title}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 12 }}>
              {result.winners.map((id) => (
                <View key={id} style={{ alignItems: 'center' }}>
                  <Avatar id={id} name={nameOf(id)} size={64} />
                  <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 8 }}>{nameOf(id)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Card>

      {phase === 'done' && result ? (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <Button title="역할로 지정" icon="ribbon-outline" onPress={assignRoles} loading={assigning} style={{ flex: 1 }} />
          <Button title="설정 바꾸기" variant="secondary" onPress={() => setPhase('idle')} style={{ flex: 1 }} />
        </View>
      ) : (
        <Button
          title={spinning ? '뽑는 중…' : '🎲 뽑기!'}
          onPress={start}
          disabled={spinning || participants.length === 0}
          style={{ marginBottom: 8 }}
        />
      )}
      <Text style={[styles.muted, { textAlign: 'center', marginBottom: 8 }]}>
        결과는 서버에서 무작위로 정해지고 기록돼서, 다시 뽑아도 팀원 모두 기록을 볼 수 있어요.
      </Text>

      {/* 설정 */}
      {phase !== 'spinning' && (
        <>
          <SectionTitle>설정</SectionTitle>
          <Field label="무엇을 뽑을까요?">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {TITLE_PRESETS.map((t) => (
                <Chip key={t} label={t} active={title === t} onPress={() => setTitle(t)} />
              ))}
            </View>
            <Input value={title} onChangeText={setTitle} placeholder="직접 입력 (예: 2차 발표자)" maxLength={30} />
          </Field>

          <Field label="몇 명 뽑을까요?">
            <NumberStepper value={safeCount} min={1} max={maxCount} onChange={setCount} format={(v) => `${v}명`} />
          </Field>

          <Field label={`참가자 (${participants.length}/${members.length}) — 눌러서 빼거나 넣기`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {members.map((m) => (
                <Chip
                  key={m.user_id}
                  label={`${nameOf(m.user_id)}${m.user_id === userId ? ' (나)' : ''}`}
                  active={!excluded.includes(m.user_id)}
                  color={colorFor(m.user_id)}
                  onPress={() => toggle(m.user_id)}
                />
              ))}
            </View>
          </Field>
        </>
      )}

      {/* 기록 */}
      <SectionTitle>뽑기 기록</SectionTitle>
      {history.length === 0 ? (
        <Text style={styles.muted}>아직 기록이 없어요.</Text>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {history.map((d) => (
            <View key={d.id} style={[styles.row, { gap: 10, paddingVertical: 10 }]}>
              <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                <Text>🎲</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {d.title}: {d.winners.map((id) => nameOf(id)).join(', ')}
                </Text>
                <Text style={styles.muted}>
                  {formatShortDay(new Date(d.created_at))} {formatTime(d.created_at)} · {d.participants.length}명 중 · {nameOf(d.created_by)}
                </Text>
              </View>
              {(d.created_by === userId || isOwner) && (
                <Pressable onPress={() => removeHistory(d)} hitSlop={10} accessibilityLabel="기록 삭제">
                  <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
