// 한 기기에 여러 계정을 저장해 두고 전환 (인스타그램 방식)
//
// - 각 계정의 최신 로그인 토큰을 이 기기 저장소에 보관 (다른 기기·서버로는 안 감)
// - 토큰은 쓰는 동안 계속 바뀌므로(refresh token rotation) 갱신될 때마다 저장값도 바꿔야 함 → AuthProvider 에서 호출
// - 전환할 때는 절대 signOut()(서버에서 세션 무효화)을 쓰지 않음. setSession 으로 화면의 계정만 바꿈
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

export type SavedAccount = {
  userId: string;
  email: string | null;
  name: string;
  isGuest: boolean;
  accessToken: string;
  refreshToken: string;
  savedAt: number;
};

const KEY = 'teammeetup.savedAccounts';
const MAX_ACCOUNTS = 5;

function read(): SavedAccount[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedAccount[]) : [];
    return Array.isArray(list) ? list.filter((a) => a && a.userId && a.refreshToken) : [];
  } catch {
    return [];
  }
}

function write(list: SavedAccount[]) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
  } catch {
    // 저장소를 못 쓰는 환경이면 계정 전환만 안 됨
  }
  listeners.forEach((fn) => fn());
}

// 화면 갱신용 구독
const listeners = new Set<() => void>();
export function subscribeAccounts(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function listSavedAccounts(): SavedAccount[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

/** 현재 세션을 저장(또는 최신 토큰으로 갱신). name 이 없으면 기존 이름 유지 */
export function saveSession(session: Session, name?: string) {
  const list = read();
  const prev = list.find((a) => a.userId === session.user.id);
  const meta = session.user.user_metadata as { display_name?: string } | undefined;
  const entry: SavedAccount = {
    userId: session.user.id,
    email: session.user.email ?? null,
    name: name || prev?.name || meta?.display_name || session.user.email?.split('@')[0] || '게스트',
    isGuest: Boolean(session.user.is_anonymous),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    savedAt: Date.now(),
  };
  write([entry, ...list.filter((a) => a.userId !== session.user.id)]);
}

export function removeSavedAccount(userId: string) {
  write(read().filter((a) => a.userId !== userId));
}

/** 저장된 계정으로 전환. 실패(토큰 만료 등)하면 그 계정을 목록에서 빼고 오류를 던짐 */
export async function switchToAccount(userId: string) {
  const target = read().find((a) => a.userId === userId);
  if (!target) throw new Error('저장된 계정을 찾을 수 없어요.');

  // 지금 계정의 최신 토큰을 먼저 저장 (돌아올 수 있게)
  const { data: current } = await supabase.auth.getSession();
  if (current.session) saveSession(current.session);

  const { data, error } = await supabase.auth.setSession({
    access_token: target.accessToken,
    refresh_token: target.refreshToken,
  });
  if (error || !data.session) {
    removeSavedAccount(userId);
    // 실패했으면 원래 계정으로 되돌림
    if (current.session) {
      await supabase.auth.setSession({
        access_token: current.session.access_token,
        refresh_token: current.session.refresh_token,
      });
    }
    throw new Error(
      target.isGuest
        ? '이 게스트 계정은 만료돼서 다시 들어갈 수 없어요.'
        : `${target.email ?? target.name} 계정의 로그인이 만료됐어요. 다시 로그인해주세요.`,
    );
  }
  saveSession(data.session, target.name);
}

/**
 * "다른 계정 추가": 지금 계정은 저장해 두고, 로그인된 상태 그대로 로그인 화면을 엶.
 * ⚠️ signOut 은 scope:'local' 이어도 서버에서 지금 세션을 무효화하므로 쓰면 안 됨
 *    (저장해 둔 토큰이 죽어서 나중에 전환 실패). 새 계정으로 로그인하면 화면의 세션만 바뀜.
 */
let addingFrom: string | null = null;

export async function startAddingAccount(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) saveSession(data.session);
  addingFrom = data.session?.user.id ?? null;
}

/** 추가 중이면 시작한 계정의 id (AuthGate 가 이 계정일 땐 로그인 화면에 머묾) */
export function addingAccountFrom(): string | null {
  return addingFrom;
}

export function finishAddingAccount() {
  addingFrom = null;
}
