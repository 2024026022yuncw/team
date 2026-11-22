export type Profile = {
  id: string;
  display_name: string;
};

export type Team = {
  id: string;
  name: string;
  description: string;
  course_name: string; // 이 팀플의 수업 (없으면 빈 문자열)
  invite_code: string;
  owner_id: string;
  created_at: string;
};

export type TeamMember = {
  team_id: string;
  user_id: string;
  role: 'owner' | 'member';
  role_title: string;
  joined_at: string;
  profile: Profile | null;
};

export type TeamEvent = {
  id: string;
  team_id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  meeting_type: 'offline' | 'online' | null; // null = 모임 아님 (마감 등)
  online_platform: string;
  meeting_link: string;
  created_by: string | null;
};

export type Poll = {
  id: string;
  team_id: string;
  title: string;
  dates: string[]; // 'YYYY-MM-DD'
  start_hour: number;
  end_hour: number;
  closed: boolean;
  created_by: string | null;
  created_at: string;
};

export type PollVote = {
  poll_id: string;
  user_id: string;
  slot_date: string;
  slot_hour: number;
};

export type TaskStatus = 'todo' | 'doing' | 'done';

export type Task = {
  id: string;
  team_id: string;
  title: string;
  description: string;
  assignee_id: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_by: string | null;
  created_at: string;
};

export type DiaryTodo = {
  id: string;
  user_id: string;
  entry_date: string;
  title: string;
  done: boolean;
  created_at: string;
};

export type DiaryNote = {
  user_id: string;
  entry_date: string;
  mood: string;
  content: string;
};

export type TimetableEntry = {
  id: string;
  user_id: string;
  day_of_week: number; // 0=일 1=월 ... 6=토
  start_min: number;
  end_min: number;
  title: string;
  location: string;
  color: string;
};

export type TimetableException = {
  entry_id: string;
  user_id: string;
  exception_date: string; // 'YYYY-MM-DD'
};

export type PersonalEvent = {
  id: string;
  user_id: string;
  event_date: string; // 'YYYY-MM-DD'
  start_min: number;
  end_min: number;
  title: string;
  location: string;
  color: string;
};

export type PostKind = 'notice' | 'minutes';

export type TeamPost = {
  id: string;
  team_id: string;
  kind: PostKind;
  title: string;
  content: string;
  meeting_date: string | null;
  pinned: boolean;
  event_id: string | null; // 일정에서 올린 공지면 연결된 일정
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PostRead = {
  post_id: string;
  user_id: string;
  read_at: string;
};

export type Friendship = {
  id: string;
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
  created_at: string;
};

/** 화면용: 상대방 기준으로 정리한 친구/요청 */
export type FriendItem = Friendship & {
  otherId: string;
  otherName: string;
  direction: 'sent' | 'received';
};

export type TeamInvite = {
  id: string;
  team_id: string;
  team_name: string;
  course_name: string;
  inviter_name: string;
  created_at: string;
};
