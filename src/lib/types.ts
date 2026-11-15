export type Profile = {
  id: string;
  display_name: string;
};

export type Team = {
  id: string;
  name: string;
  description: string;
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
