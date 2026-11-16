import { supabase } from './supabase';
import type {
  DiaryNote,
  DiaryTodo,
  Poll,
  PollVote,
  Task,
  TaskStatus,
  Team,
  TeamEvent,
  TeamMember,
  PersonalEvent,
  PostRead,
  TeamPost,
  TimetableEntry,
  TimetableException,
} from './types';

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

// ------------------------------------------------------------------ 팀
export async function listMyTeams(): Promise<Team[]> {
  // RLS 때문에 내가 속한 팀만 조회됨
  return check(await supabase.from('teams').select('*').order('created_at', { ascending: false }));
}

export async function getTeam(teamId: string): Promise<Team | null> {
  return check(await supabase.from('teams').select('*').eq('id', teamId).maybeSingle());
}

export async function createTeam(name: string, description: string): Promise<Team> {
  return check(await supabase.rpc('create_team', { p_name: name, p_description: description }).single<Team>());
}

export async function joinTeam(code: string): Promise<Team> {
  return check(await supabase.rpc('join_team', { p_code: code }).single<Team>());
}

export async function updateTeam(teamId: string, patch: Partial<Pick<Team, 'name' | 'description'>>) {
  check(await supabase.from('teams').update(patch).eq('id', teamId));
}

export async function deleteTeam(teamId: string) {
  check(await supabase.from('teams').delete().eq('id', teamId));
}

export async function listMembers(teamId: string): Promise<TeamMember[]> {
  const rows = check(
    await supabase
      .from('team_members')
      .select('team_id, user_id, role, role_title, joined_at')
      .eq('team_id', teamId)
      .order('joined_at'),
  ) as Omit<TeamMember, 'profile'>[];

  const ids = rows.map((r) => r.user_id);
  const profiles = ids.length
    ? check(await supabase.from('profiles').select('id, display_name').in('id', ids))
    : [];
  const byId = new Map((profiles as { id: string; display_name: string }[]).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null }));
}

export async function updateRoleTitle(teamId: string, userId: string, roleTitle: string) {
  check(await supabase.from('team_members').update({ role_title: roleTitle }).eq('team_id', teamId).eq('user_id', userId));
}

export async function removeMember(teamId: string, userId: string) {
  check(await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId));
}

// ------------------------------------------------------------------ 일정
export async function listEvents(teamId: string, from: Date, to: Date): Promise<TeamEvent[]> {
  return check(
    await supabase
      .from('events')
      .select('*')
      .eq('team_id', teamId)
      .lt('starts_at', to.toISOString())
      .gte('ends_at', from.toISOString())
      .order('starts_at'),
  );
}

export async function getEvent(id: string): Promise<TeamEvent | null> {
  return check(await supabase.from('events').select('*').eq('id', id).maybeSingle());
}

export type EventInput = Pick<
  TeamEvent,
  'title' | 'description' | 'location' | 'starts_at' | 'ends_at' | 'meeting_type' | 'online_platform' | 'meeting_link'
>;

export async function createEvent(teamId: string, userId: string, input: EventInput): Promise<TeamEvent> {
  return check(
    await supabase
      .from('events')
      .insert({ ...input, team_id: teamId, created_by: userId })
      .select('*')
      .single(),
  );
}

export async function updateEvent(id: string, input: EventInput) {
  check(await supabase.from('events').update(input).eq('id', id));
}

export async function deleteEvent(id: string) {
  check(await supabase.from('events').delete().eq('id', id));
}

// ------------------------------------------------------------------ 투표
export async function listPolls(teamId: string): Promise<Poll[]> {
  return check(
    await supabase.from('polls').select('*').eq('team_id', teamId).order('created_at', { ascending: false }),
  );
}

export async function getPoll(id: string): Promise<Poll | null> {
  return check(await supabase.from('polls').select('*').eq('id', id).maybeSingle());
}

export async function createPoll(
  teamId: string,
  userId: string,
  input: Pick<Poll, 'title' | 'dates' | 'start_hour' | 'end_hour'>,
): Promise<Poll> {
  return check(
    await supabase
      .from('polls')
      .insert({ ...input, team_id: teamId, created_by: userId })
      .select('*')
      .single(),
  );
}

export async function setPollClosed(id: string, closed: boolean) {
  check(await supabase.from('polls').update({ closed }).eq('id', id));
}

export async function deletePoll(id: string) {
  check(await supabase.from('polls').delete().eq('id', id));
}

export async function listVotes(pollId: string): Promise<PollVote[]> {
  return check(await supabase.from('poll_votes').select('*').eq('poll_id', pollId));
}

export async function addVote(pollId: string, userId: string, date: string, hour: number) {
  check(
    await supabase
      .from('poll_votes')
      .upsert({ poll_id: pollId, user_id: userId, slot_date: date, slot_hour: hour }, { ignoreDuplicates: true }),
  );
}

export async function removeVote(pollId: string, userId: string, date: string, hour: number) {
  check(
    await supabase
      .from('poll_votes')
      .delete()
      .eq('poll_id', pollId)
      .eq('user_id', userId)
      .eq('slot_date', date)
      .eq('slot_hour', hour),
  );
}

// ------------------------------------------------------------------ 할 일
export async function listTasks(teamId: string): Promise<Task[]> {
  return check(
    await supabase
      .from('tasks')
      .select('*')
      .eq('team_id', teamId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at'),
  );
}

export async function getTask(id: string): Promise<Task | null> {
  return check(await supabase.from('tasks').select('*').eq('id', id).maybeSingle());
}

export type TaskInput = Pick<Task, 'title' | 'description' | 'assignee_id' | 'due_date' | 'status'>;

export async function createTask(teamId: string, userId: string, input: TaskInput) {
  check(await supabase.from('tasks').insert({ ...input, team_id: teamId, created_by: userId }));
}

export async function updateTask(id: string, input: Partial<TaskInput>) {
  check(await supabase.from('tasks').update(input).eq('id', id));
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  await updateTask(id, { status });
}

export async function deleteTask(id: string) {
  check(await supabase.from('tasks').delete().eq('id', id));
}

/** 내게 배정된 미완료 팀 할 일 (다이어리에 함께 표시) */
export async function listMyOpenTasks(userId: string): Promise<(Task & { team_name: string })[]> {
  const rows = check(
    await supabase
      .from('tasks')
      .select('*, teams(name)')
      .eq('assignee_id', userId)
      .neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false }),
  ) as (Task & { teams: { name: string } | null })[];
  return rows.map(({ teams, ...t }) => ({ ...t, team_name: teams?.name ?? '' }));
}

// ------------------------------------------------------------------ 다이어리
export async function listDiaryTodos(date: string): Promise<DiaryTodo[]> {
  return check(await supabase.from('diary_todos').select('*').eq('entry_date', date).order('created_at'));
}

/** 달력 점 표시용: 기간 내 할 일/기록이 있는 날짜 */
export async function listDiaryDates(from: string, to: string): Promise<Set<string>> {
  const [todos, notes] = await Promise.all([
    supabase.from('diary_todos').select('entry_date').gte('entry_date', from).lte('entry_date', to),
    supabase.from('diary_notes').select('entry_date, content, mood').gte('entry_date', from).lte('entry_date', to),
  ]);
  const set = new Set<string>();
  (check(todos) as { entry_date: string }[]).forEach((r) => set.add(r.entry_date));
  (check(notes) as { entry_date: string; content: string; mood: string }[])
    .filter((r) => r.content || r.mood)
    .forEach((r) => set.add(r.entry_date));
  return set;
}

export async function addDiaryTodo(date: string, title: string): Promise<DiaryTodo> {
  return check(await supabase.from('diary_todos').insert({ entry_date: date, title }).select('*').single());
}

export async function toggleDiaryTodo(id: string, done: boolean) {
  check(await supabase.from('diary_todos').update({ done }).eq('id', id));
}

export async function deleteDiaryTodo(id: string) {
  check(await supabase.from('diary_todos').delete().eq('id', id));
}

export async function getDiaryNote(date: string): Promise<DiaryNote | null> {
  return check(await supabase.from('diary_notes').select('*').eq('entry_date', date).maybeSingle());
}

export async function saveDiaryNote(userId: string, date: string, mood: string, content: string) {
  check(
    await supabase
      .from('diary_notes')
      .upsert({ user_id: userId, entry_date: date, mood, content, updated_at: new Date().toISOString() }),
  );
}

// ------------------------------------------------------------------ 프로필
export async function updateDisplayName(userId: string, name: string) {
  check(await supabase.from('profiles').update({ display_name: name }).eq('id', userId));
}

// ------------------------------------------------------------------ 시간표
export async function listTimetable(userIds: string[]): Promise<TimetableEntry[]> {
  if (userIds.length === 0) return [];
  return check(
    await supabase.from('timetable_entries').select('*').in('user_id', userIds).order('start_min'),
  );
}

export async function getTimetableEntry(id: string): Promise<TimetableEntry | null> {
  return check(await supabase.from('timetable_entries').select('*').eq('id', id).maybeSingle());
}

export type TimetableInput = Pick<TimetableEntry, 'day_of_week' | 'start_min' | 'end_min' | 'title' | 'location' | 'color'>;

export async function createTimetableEntries(inputs: TimetableInput[]) {
  check(await supabase.from('timetable_entries').insert(inputs));
}

export async function updateTimetableEntry(id: string, input: TimetableInput) {
  check(await supabase.from('timetable_entries').update(input).eq('id', id));
}

export async function deleteTimetableEntry(id: string) {
  check(await supabase.from('timetable_entries').delete().eq('id', id));
}

// ------------------------------------------------------------------ 회원탈퇴
export async function deleteMyAccount() {
  check(await supabase.rpc('delete_my_account'));
}

// ------------------------------------------------------------------ 휴강 / 개인 일정
export async function listExceptions(userIds: string[], from: string, to: string): Promise<TimetableException[]> {
  if (userIds.length === 0) return [];
  return check(
    await supabase
      .from('timetable_exceptions')
      .select('entry_id, user_id, exception_date')
      .in('user_id', userIds)
      .gte('exception_date', from)
      .lte('exception_date', to),
  );
}

export async function addException(entryId: string, date: string) {
  check(
    await supabase
      .from('timetable_exceptions')
      .upsert({ entry_id: entryId, exception_date: date }, { ignoreDuplicates: true }),
  );
}

export async function removeException(entryId: string, date: string) {
  check(await supabase.from('timetable_exceptions').delete().eq('entry_id', entryId).eq('exception_date', date));
}

export async function listPersonalEvents(userIds: string[], from: string, to: string): Promise<PersonalEvent[]> {
  if (userIds.length === 0) return [];
  return check(
    await supabase
      .from('personal_events')
      .select('*')
      .in('user_id', userIds)
      .gte('event_date', from)
      .lte('event_date', to)
      .order('start_min'),
  );
}

export async function getPersonalEvent(id: string): Promise<PersonalEvent | null> {
  return check(await supabase.from('personal_events').select('*').eq('id', id).maybeSingle());
}

export type PersonalEventInput = Pick<PersonalEvent, 'event_date' | 'start_min' | 'end_min' | 'title' | 'location' | 'color'>;

export async function createPersonalEvent(input: PersonalEventInput) {
  check(await supabase.from('personal_events').insert(input));
}

export async function updatePersonalEvent(id: string, input: PersonalEventInput) {
  check(await supabase.from('personal_events').update(input).eq('id', id));
}

export async function deletePersonalEvent(id: string) {
  check(await supabase.from('personal_events').delete().eq('id', id));
}

/** 내 시간표 전체 삭제 (이미지로 덮어쓰기용) */
export async function deleteMyTimetable(userId: string) {
  check(await supabase.from('timetable_entries').delete().eq('user_id', userId));
}

// ------------------------------------------------------------------ 공지 / 회의록
export async function listPosts(teamId: string): Promise<TeamPost[]> {
  return check(
    await supabase
      .from('team_posts')
      .select('*')
      .eq('team_id', teamId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false }),
  );
}

export async function getPost(id: string): Promise<TeamPost | null> {
  return check(await supabase.from('team_posts').select('*').eq('id', id).maybeSingle());
}

export type PostInput = Pick<TeamPost, 'kind' | 'title' | 'content' | 'meeting_date' | 'pinned'>;

export async function createPost(
  teamId: string,
  userId: string,
  input: PostInput & { event_id?: string | null },
): Promise<TeamPost> {
  return check(
    await supabase
      .from('team_posts')
      .insert({ ...input, team_id: teamId, created_by: userId })
      .select('*')
      .single(),
  );
}

export async function updatePost(id: string, input: Partial<PostInput>) {
  check(await supabase.from('team_posts').update(input).eq('id', id));
}

export async function deletePost(id: string) {
  check(await supabase.from('team_posts').delete().eq('id', id));
}

/** 팀의 모든 글 읽음 기록 (목록의 "N명 읽음"/새 글 표시용) */
export async function listPostReads(postIds: string[]): Promise<PostRead[]> {
  if (postIds.length === 0) return [];
  return check(await supabase.from('post_reads').select('*').in('post_id', postIds));
}

export async function markPostRead(postId: string) {
  check(await supabase.from('post_reads').upsert({ post_id: postId }, { ignoreDuplicates: true }));
}
