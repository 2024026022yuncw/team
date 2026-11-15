import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { MonthCalendar } from '@/components/MonthCalendar';
import { Card, Input, SectionTitle, styles } from '@/components/ui';
import {
  addDiaryTodo,
  deleteDiaryTodo,
  getDiaryNote,
  listDiaryDates,
  listDiaryTodos,
  listMyOpenTasks,
  saveDiaryNote,
  toggleDiaryTodo,
} from '@/lib/api';
import { Alert } from '@/lib/alert';
import { useUserId } from '@/lib/auth';
import { dDay, formatDay, monthGrid, toDateKey, todayKey } from '@/lib/date';
import { useAsync } from '@/lib/hooks';
import { errorMessage } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import type { DiaryTodo, Task } from '@/lib/types';

const MOODS = ['😄', '🙂', '😐', '😥', '😫', '🔥'];

export default function DiaryScreen() {
  const router = useRouter();
  const userId = useUserId();
  const [date, setDate] = useState(todayKey());
  const [month, setMonth] = useState(() => new Date());
  const [showCalendar, setShowCalendar] = useState(false);

  const [todos, setTodos] = useState<DiaryTodo[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [mood, setMood] = useState('');
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const loadedDate = useRef<string | null>(null);
  const lastSaved = useRef('');

  // 달력 점: 기록이 있는 날
  const grid = monthGrid(month);
  const { data: markedDates, reload: reloadMarks } = useAsync<Set<string>>(
    () => listDiaryDates(toDateKey(grid[0]), toDateKey(grid[grid.length - 1])),
    [toDateKey(grid[0])],
    new Set(),
  );

  // 내게 배정된 팀 할 일
  const { data: teamTasks } = useAsync<(Task & { team_name: string })[]>(() => listMyOpenTasks(userId), [userId], []);

  // 날짜 바뀌면 그날 데이터 불러오기
  useEffect(() => {
    let cancelled = false;
    loadedDate.current = null;
    Promise.all([listDiaryTodos(date), getDiaryNote(date)])
      .then(([t, n]) => {
        if (cancelled) return;
        setTodos(t);
        setMood(n?.mood ?? '');
        setContent(n?.content ?? '');
        setSaved('idle');
        lastSaved.current = `${n?.mood ?? ''}|${n?.content ?? ''}`;
        loadedDate.current = date;
      })
      .catch((e) => Alert.alert('불러오기 실패', errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [date]);

  // 메모/기분 자동 저장 (입력 멈추고 0.8초 후)
  useEffect(() => {
    if (loadedDate.current !== date) return;
    const snapshot = `${mood}|${content}`;
    if (snapshot === lastSaved.current) return;
    setSaved('saving');
    const timer = setTimeout(() => {
      saveDiaryNote(userId, date, mood, content)
        .then(() => {
          lastSaved.current = snapshot;
          setSaved('saved');
          reloadMarks();
        })
        .catch((e) => {
          setSaved('idle');
          Alert.alert('저장 실패', errorMessage(e));
        });
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, content]);

  const add = useCallback(async () => {
    const title = newTodo.trim();
    if (!title) return;
    setNewTodo('');
    try {
      const todo = await addDiaryTodo(date, title);
      setTodos((prev) => [...prev, todo]);
      reloadMarks();
    } catch (e) {
      Alert.alert('추가 실패', errorMessage(e));
    }
  }, [newTodo, date, reloadMarks]);

  async function toggle(t: DiaryTodo) {
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    try {
      await toggleDiaryTodo(t.id, !t.done);
    } catch (e) {
      Alert.alert('변경 실패', errorMessage(e));
    }
  }

  async function remove(t: DiaryTodo) {
    setTodos((prev) => prev.filter((x) => x.id !== t.id));
    try {
      await deleteDiaryTodo(t.id);
      reloadMarks();
    } catch (e) {
      Alert.alert('삭제 실패', errorMessage(e));
    }
  }

  const doneCount = todos.filter((t) => t.done).length;
  const isToday = date === todayKey();
  const dots: Record<string, string[]> = {};
  markedDates.forEach((k) => (dots[k] = [colors.primary]));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 날짜 헤더 */}
        <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
          <Pressable onPress={() => setShowCalendar((v) => !v)} style={[styles.row, { gap: 6 }]}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{formatDay(date)}</Text>
            <Ionicons name={showCalendar ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text} />
          </Pressable>
          {!isToday && (
            <Pressable
              onPress={() => {
                setDate(todayKey());
                setMonth(new Date());
              }}
              style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.primarySoft }}
            >
              <Text style={{ color: colors.primary, fontWeight: '700' }}>오늘</Text>
            </Pressable>
          )}
        </View>

        {showCalendar && (
          <Card>
            <MonthCalendar
              month={month}
              onMonthChange={setMonth}
              selected={date}
              onSelect={(k) => {
                setDate(k);
                setShowCalendar(false);
              }}
              dots={dots}
            />
          </Card>
        )}

        {/* 오늘 할 일 */}
        <SectionTitle right={todos.length ? <Text style={styles.muted}>{doneCount}/{todos.length} 완료</Text> : null}>
          {isToday ? '오늘 할 일' : '할 일'}
        </SectionTitle>
        <Card style={{ paddingVertical: 8 }}>
          {todos.map((t) => (
            <View key={t.id} style={[styles.row, { paddingVertical: 8, gap: 10 }]}>
              <Pressable onPress={() => toggle(t)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: t.done }}>
                <Ionicons
                  name={t.done ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={t.done ? colors.success : colors.textMuted}
                />
              </Pressable>
              <Text
                style={[
                  { flex: 1, fontSize: 16, color: colors.text },
                  t.done && { textDecorationLine: 'line-through', color: colors.textMuted },
                ]}
              >
                {t.title}
              </Text>
              <Pressable onPress={() => remove(t)} hitSlop={8} accessibilityLabel="삭제">
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
          <View style={[styles.row, { gap: 8, paddingVertical: 6 }]}>
            <Ionicons name="add" size={24} color={colors.primary} />
            <TextInput
              value={newTodo}
              onChangeText={setNewTodo}
              onSubmitEditing={add}
              placeholder="할 일 추가 후 엔터"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              submitBehavior="submit"
              maxLength={100}
              style={{ flex: 1, fontSize: 16, color: colors.text, paddingVertical: 6 }}
            />
            {newTodo.trim() ? (
              <Pressable onPress={add} hitSlop={8}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>추가</Text>
              </Pressable>
            ) : null}
          </View>
        </Card>

        {/* 내게 배정된 팀 할 일 */}
        {teamTasks.length > 0 && (
          <>
            <SectionTitle>내 팀 과제</SectionTitle>
            <Card style={{ paddingVertical: 8 }}>
              {teamTasks.slice(0, 5).map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => router.push({ pathname: '/team/[id]/task', params: { id: t.team_id, taskId: t.id } })}
                  style={[styles.row, { paddingVertical: 8, gap: 10 }]}
                >
                  <Ionicons name={t.status === 'doing' ? 'time' : 'ellipse-outline'} size={20} color={t.status === 'doing' ? colors.warning : colors.textSub} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: colors.text }} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={styles.muted}>{t.team_name}</Text>
                  </View>
                  {t.due_date ? (
                    <Text style={[styles.muted, t.due_date < todayKey() && { color: colors.danger, fontWeight: '700' }]}>
                      {dDay(t.due_date)}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </Card>
          </>
        )}

        {/* 하루 기록 */}
        <SectionTitle
          right={
            <Text style={styles.muted}>{saved === 'saving' ? '저장 중…' : saved === 'saved' ? '저장됨 ✓' : ''}</Text>
          }
        >
          오늘의 기록
        </SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            {MOODS.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMood(mood === m ? '' : m)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: mood === m ? colors.primarySoft : 'transparent',
                  borderWidth: mood === m ? 1.5 : 0,
                  borderColor: colors.primary,
                }}
                accessibilityLabel={`기분 ${m}`}
              >
                <Text style={{ fontSize: 24 }}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <Input
            value={content}
            onChangeText={setContent}
            placeholder="오늘 팀플은 어땠나요? 회의 내용, 느낀 점 등을 자유롭게 적어보세요."
            multiline
            maxLength={5000}
            style={{ minHeight: 140 }}
          />
          <Text style={[styles.muted, { marginTop: 8 }]}>🔒 다이어리는 나만 볼 수 있어요.</Text>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
