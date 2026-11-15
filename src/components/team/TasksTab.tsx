import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Avatar, Card, Chip, EmptyState, Fab, Loading, SectionTitle, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { listTasks, setTaskStatus } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { dDay, todayKey } from '@/lib/date';
import { useAsync, useRealtime } from '@/lib/hooks';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';
import { colors } from '@/lib/theme';
import type { Task, TaskStatus } from '@/lib/types';

export const STATUS_META: Record<TaskStatus, { label: string; color: string; icon: 'ellipse-outline' | 'time' | 'checkmark-circle' }> = {
  todo: { label: '할 일', color: colors.textSub, icon: 'ellipse-outline' },
  doing: { label: '진행 중', color: colors.warning, icon: 'time' },
  done: { label: '완료', color: colors.success, icon: 'checkmark-circle' },
};
const NEXT: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' };

export function TasksTab() {
  const router = useRouter();
  const userId = useUserId();
  const { teamId, members, nameOf } = useTeam();
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const { data: tasks, setData, loading, reload } = useAsync<Task[]>(() => listTasks(teamId), [teamId], []);
  useRealtime(`tasks-${teamId}`, [{ table: 'tasks', filter: `team_id=eq.${teamId}` }], reload);

  const visible = filter === 'mine' ? tasks.filter((t) => t.assignee_id === userId) : tasks;

  // 멤버별 진행률 (역할 분담 현황)
  const progress = useMemo(
    () =>
      members.map((m) => {
        const mine = tasks.filter((t) => t.assignee_id === m.user_id);
        return { member: m, total: mine.length, done: mine.filter((t) => t.status === 'done').length };
      }),
    [members, tasks],
  );

  async function cycle(task: Task) {
    const next = NEXT[task.status];
    setData((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    try {
      await setTaskStatus(task.id, next);
    } catch (e) {
      Alert.alert('변경 실패', errorMessage(e));
      reload();
    }
  }

  const today = todayKey();

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle>역할 분담 현황</SectionTitle>
        <Card>
          {progress.map(({ member, total, done }) => (
            <View key={member.user_id} style={[styles.row, { marginBottom: 10, gap: 10 }]}>
              <Avatar id={member.user_id} name={nameOf(member.user_id)} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.text }}>
                  {nameOf(member.user_id)}
                  {member.role_title ? <Text style={styles.muted}>  · {member.role_title}</Text> : null}
                </Text>
                <View style={{ height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                  <View
                    style={{
                      height: 6,
                      width: `${total ? (done / total) * 100 : 0}%`,
                      backgroundColor: colors.success,
                    }}
                  />
                </View>
              </View>
              <Text style={styles.muted}>
                {done}/{total}
              </Text>
            </View>
          ))}
          <Text style={styles.muted}>역할 이름은 멤버 탭에서 정할 수 있어요.</Text>
        </Card>

        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Chip label="전체" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="내 할 일" active={filter === 'mine'} onPress={() => setFilter('mine')} />
        </View>

        {loading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <EmptyState icon="checkbox-outline" title="할 일이 없어요" hint="+ 버튼으로 할 일을 만들고 담당자를 지정하세요." />
        ) : (
          (['todo', 'doing', 'done'] as TaskStatus[]).map((status) => {
            const list = visible.filter((t) => t.status === status);
            if (list.length === 0) return null;
            return (
              <View key={status}>
                <SectionTitle>
                  {STATUS_META[status].label} <Text style={styles.muted}>{list.length}</Text>
                </SectionTitle>
                {list.map((t) => {
                  const overdue = t.due_date && t.due_date < today && t.status !== 'done';
                  return (
                    <Card
                      key={t.id}
                      onPress={() => router.push({ pathname: '/team/[id]/task', params: { id: teamId, taskId: t.id } })}
                      style={{ paddingVertical: 12 }}
                    >
                      <View style={[styles.row, { gap: 10 }]}>
                        <Pressable onPress={() => cycle(t)} hitSlop={10} accessibilityLabel={`상태 변경: ${STATUS_META[t.status].label}`}>
                          <Ionicons name={STATUS_META[t.status].icon} size={24} color={STATUS_META[t.status].color} />
                        </Pressable>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              { fontSize: 16, fontWeight: '600', color: colors.text },
                              t.status === 'done' && { textDecorationLine: 'line-through', color: colors.textMuted },
                            ]}
                            numberOfLines={1}
                          >
                            {t.title}
                          </Text>
                          <View style={[styles.row, { marginTop: 4, gap: 8 }]}>
                            <Text style={styles.muted}>👤 {nameOf(t.assignee_id)}</Text>
                            {t.due_date ? (
                              <Text style={[styles.muted, overdue ? { color: colors.danger, fontWeight: '700' } : null]}>
                                ⏰ {dDay(t.due_date)}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        {t.assignee_id ? <Avatar id={t.assignee_id} name={nameOf(t.assignee_id)} size={28} /> : null}
                      </View>
                    </Card>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>
      <Fab onPress={() => router.push({ pathname: '/team/[id]/task', params: { id: teamId } })} />
    </View>
  );
}
