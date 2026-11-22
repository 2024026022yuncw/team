import { supabase } from './supabase';
import type {
  DiaryNote,
  DiaryTodo,
  Poll,
  PollVote,
  Task,
  TaskStatus,
  Team,
  TeamDraw,
  TeamEvent,
  TeamMember,
  FriendItem,
  Friendship,
  PersonalEvent,
  PostRead,
  TeamInvite,
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

export async function updateTeam(teamId: string, patch: Partial<Pick<Team, 'name' | 'description' | 'course_name' | 'course_short'>>) {
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

/** 팀의 안 읽은 글 수 (내가 쓴 글은 제외) */
export async function countUnreadPosts(teamId: string, userId: string): Promise<number> {
  const posts = check(
    await supabase.from('team_posts').select('id, created_by').eq('team_id', teamId),
  ) as { id: string; created_by: string | null }[];
  const others = posts.filter((p) => p.created_by !== userId);
  if (others.length === 0) return 0;
  const reads = check(
    await supabase
      .from('post_reads')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', others.map((p) => p.id)),
  ) as { post_id: string }[];
  const readIds = new Set(reads.map((r) => r.post_id));
  return others.filter((p) => !readIds.has(p.id)).length;
}

// ------------------------------------------------------------------ 친구
export async function myFriendCode(): Promise<string> {
  return check(await supabase.rpc('my_friend_code')) as string;
}

/** 결과: requested | accepted(상대가 먼저 요청해서 바로 친구) | already_requested | already_friends */
export async function sendFriendRequest(target: { code?: string; userId?: string }): Promise<string> {
  return check(
    await supabase.rpc('send_friend_request', {
      p_code: target.code ?? null,
      p_user: target.userId ?? null,
    }),
  ) as string;
}

export async function acceptFriendRequest(id: string) {
  check(await supabase.rpc('accept_friend_request', { p_id: id }));
}

/** 친구 끊기 / 보낸 요청 취소 / 받은 요청 거절 */
export async function removeFriendship(id: string) {
  check(await supabase.from('friendships').delete().eq('id', id));
}

export async function listFriendships(userId: string): Promise<FriendItem[]> {
  const rows = check(
    await supabase.from('friendships').select('*').order('created_at', { ascending: false }),
  ) as Friendship[];
  const otherIds = rows.map((r) => (r.requester === userId ? r.addressee : r.requester));
  const profiles = otherIds.length
    ? (check(await supabase.from('profiles').select('id, display_name').in('id', otherIds)) as {
        id: string;
        display_name: string;
      }[])
    : [];
  const names = new Map(profiles.map((p) => [p.id, p.display_name]));
  return rows.map((r) => {
    const otherId = r.requester === userId ? r.addressee : r.requester;
    return {
      ...r,
      otherId,
      otherName: names.get(otherId) || '이름 없음',
      direction: r.requester === userId ? ('sent' as const) : ('received' as const),
    };
  });
}

// ------------------------------------------------------------------ 팀 초대
export async function inviteFriendToTeam(teamId: string, friendId: string) {
  check(await supabase.rpc('invite_friend_to_team', { p_team_id: teamId, p_friend: friendId }));
}

export async function listMyTeamInvites(): Promise<TeamInvite[]> {
  return check(await supabase.rpc('my_team_invites')) as TeamInvite[];
}

export async function acceptTeamInvite(id: string): Promise<string> {
  return check(await supabase.rpc('accept_team_invite', { p_id: id })) as string;
}

export async function declineTeamInvite(id: string) {
  check(await supabase.from('team_invites').delete().eq('id', id));
}

/** 팀에 보낸(아직 수락 안 된) 초대 대상 */
export async function listTeamPendingInvitees(teamId: string): Promise<string[]> {
  const rows = check(await supabase.from('team_invites').select('invitee').eq('team_id', teamId)) as {
    invitee: string;
  }[];
  return rows.map((r) => r.invitee);
}

/** 내가 속한 모든 팀의 팀원(나 제외) — 친구 탭의 "같은 팀원" 목록용 */
export async function listMyTeammates(userId: string): Promise<{ userId: string; name: string; teamNames: string[] }[]> {
  // RLS 로 내가 속한 팀의 멤버만 조회됨
  const rows = check(await supabase.from('team_members').select('team_id, user_id')) as { team_id: string; user_id: string }[];
  const others = rows.filter((r) => r.user_id !== userId);
  if (others.length === 0) return [];
  const teamIds = Array.from(new Set(others.map((r) => r.team_id)));
  const userIds = Array.from(new Set(others.map((r) => r.user_id)));
  const [teams, profiles] = await Promise.all([
    supabase.from('teams').select('id, name').in('id', teamIds),
    supabase.from('profiles').select('id, display_name').in('id', userIds),
  ]);
  const teamName = new Map((check(teams) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  const userName = new Map((check(profiles) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
  return userIds
    .map((id) => ({
      userId: id,
      name: userName.get(id) || '이름 없음',
      teamNames: others.filter((r) => r.user_id === id).map((r) => teamName.get(r.team_id) ?? ''),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

// ------------------------------------------------------------------ 랜덤 뽑기
export async function runTeamDraw(teamId: string, title: string, participants: string[], count: number): Promise<TeamDraw> {
  return check(
    await supabase
      .rpc('run_team_draw', { p_team_id: teamId, p_title: title, p_participants: participants, p_count: count })
      .single<TeamDraw>(),
  );
}

export async function listTeamDraws(teamId: string): Promise<TeamDraw[]> {
  return check(
    await supabase.from('team_draws').select('*').eq('team_id', teamId).order('created_at', { ascending: false }).limit(20),
  );
}

export async function deleteTeamDraw(id: string) {
  check(await supabase.from('team_draws').delete().eq('id', id));
}

// ------------------------------------------------------------------ 나만 보이는 아이콘 약칭
export async function listMyCourseShorts(): Promise<Map<string, string>> {
  // RLS 로 내 설정만 조회됨
  const rows = check(await supabase.from('user_team_prefs').select('team_id, course_short')) as {
    team_id: string;
    course_short: string;
  }[];
  return new Map(rows.filter((r) => r.course_short).map((r) => [r.team_id, r.course_short]));
}

export async function setMyCourseShort(userId: string, teamId: string, short: string) {
  const v = Array.from(short.replace(/\s+/g, '')).slice(0, 4).join('');
  if (!v) {
    check(await supabase.from('user_team_prefs').delete().eq('user_id', userId).eq('team_id', teamId));
    return;
  }
  check(
    await supabase
      .from('user_team_prefs')
      .upsert({ user_id: userId, team_id: teamId, course_short: v, updated_at: new Date().toISOString() }),
  );
}

/** 내 팀 목록 + 나만 보이는 약칭 */
export async function listMyTeamsWithPrefs(): Promise<Team[]> {
  const [teams, shorts] = await Promise.all([listMyTeams(), listMyCourseShorts().catch(() => new Map<string, string>())]);
  return teams.map((t) => ({ ...t, my_course_short: shorts.get(t.id) ?? '' }));
}

// ------------------------------------------------------------------ 친구 팀 참여
export type FriendTeam = {
  team_id: string;
  team_name: string;
  course_name: string;
  course_short: string;
  member_count: number;
  friend_names: string[];
};

export async function listFriendTeams(): Promise<FriendTeam[]> {
  return check(await supabase.rpc('list_friend_teams')) as FriendTeam[];
}

export async function joinFriendTeam(teamId: string) {
  check(await supabase.rpc('join_friend_team', { p_team_id: teamId }));
}

/** 팀장: 친구 팀 목록 공개 여부 */
export async function setAllowFriendJoin(teamId: string, allow: boolean) {
  check(await supabase.from('teams').update({ allow_friend_join: allow }).eq('id', teamId));
}
