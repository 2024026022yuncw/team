import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getTeam, listMembers } from './api';
import { useUserId } from './auth';
import { useRealtime } from './hooks';
import type { Team, TeamMember } from './types';

type TeamState = {
  teamId: string;
  team: Team | null;
  members: TeamMember[];
  loading: boolean;
  isOwner: boolean;
  /** user id → 표시 이름 */
  nameOf: (userId: string | null | undefined) => string;
  reload: () => Promise<void>;
};

const TeamContext = createContext<TeamState | null>(null);

export function TeamProvider({ teamId, children }: { teamId: string; children: ReactNode }) {
  const userId = useUserId();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([getTeam(teamId), listMembers(teamId)]);
      setTeam(t);
      setMembers(m);
    } catch (e) {
      console.warn('[team] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useRealtime(`team-members-${teamId}`, [{ table: 'team_members', filter: `team_id=eq.${teamId}` }], reload);

  const value = useMemo<TeamState>(() => {
    const names = new Map(members.map((m) => [m.user_id, m.profile?.display_name || '이름 없음']));
    return {
      teamId,
      team,
      members,
      loading,
      isOwner: members.some((m) => m.user_id === userId && m.role === 'owner'),
      nameOf: (id) => (id ? (names.get(id) ?? '나간 멤버') : '미지정'),
      reload,
    };
  }, [teamId, team, members, loading, userId, reload]);

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam(): TeamState {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used inside TeamProvider');
  return ctx;
}
