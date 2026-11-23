// 알림함: 앱 전체에서 한 번만 불러오고 실시간 구독 (종 아이콘 배지, 알림 화면, 메인 미리보기가 공유)
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from './auth';
import { useRealtime } from './hooks';
import { supabase } from './supabase';

export type AppNotification = {
  id: string;
  user_id: string;
  team_id: string | null;
  type: 'event' | 'post' | 'poll' | 'task' | 'draw' | 'member' | 'friend' | 'invite' | string;
  title: string;
  body: string;
  link: string;
  actor_id: string | null;
  created_at: string;
  read_at: string | null;
};

type State = {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const Ctx = createContext<State>({
  items: [],
  unread: 0,
  loading: false,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  remove: async () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60);
    // 017 SQL 실행 전이면 테이블이 없어 오류 → 조용히 빈 목록
    setItems(error ? [] : ((data ?? []) as AppNotification[]));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  useRealtime(userId ? `notifications-${userId}` : '', [{ table: 'notifications', filter: `user_id=eq.${userId}` }], refresh);

  const markRead = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)));
    await supabase.from('notifications').update({ read_at: now }).eq('id', id).is('read_at', null);
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null);
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  }, []);

  const value = useMemo<State>(
    () => ({ items, unread: items.filter((n) => !n.read_at).length, loading, refresh, markRead, markAllRead, remove }),
    [items, loading, refresh, markRead, markAllRead, remove],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  return useContext(Ctx);
}

/** "방금", "5분 전", "3시간 전", "어제", "11/20" */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return '어제';
  if (d < 7) return `${d}일 전`;
  const t = new Date(iso);
  return `${t.getMonth() + 1}/${t.getDate()}`;
}
