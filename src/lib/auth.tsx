import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { saveSession } from './accounts';
import { supabase } from './supabase';
import type { Profile } from './types';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('id, display_name').eq('id', userId).maybeSingle();
    setProfile(data ?? null);
    // 계정 전환 목록의 이름도 최신으로
    if (data?.display_name) {
      const { data: s } = await supabase.auth.getSession();
      if (s.session?.user.id === userId) saveSession(s.session, data.display_name);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) saveSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // 로그인·토큰 갱신마다 저장된 계정의 토큰을 최신으로 (안 하면 나중에 전환할 때 만료됨)
      if (newSession) saveSession(newSession);
      // 콜백 안에서 바로 await 하면 데드락이 생길 수 있어 다음 tick 으로 미룸
      setTimeout(() => loadProfile(newSession?.user.id), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** 로그인된 사용자 id (로그인 화면 밖에서만 사용) */
export function useUserId(): string {
  const { session } = useAuth();
  return session?.user.id ?? '';
}
