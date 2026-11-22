import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from './storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
// Supabase 대시보드의 Connect 화면은 EXPO_PUBLIC_SUPABASE_KEY 이름을 쓰므로 둘 다 지원
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// 모바일 앱에서는 포그라운드일 때만 토큰 자동 갱신 (웹은 supabase-js 가 알아서 처리)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

/** Supabase 에러를 사용자에게 보여줄 문장으로 변환 */
export function errorMessage(err: unknown): string {
  if (!err) return '알 수 없는 오류가 발생했습니다.';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    const msg = (err as any).message as string;
    if (msg.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (msg.includes('User already registered')) return '이미 가입된 이메일입니다.';
    if (msg.includes('Email not confirmed')) return '이메일 인증을 먼저 완료해주세요.';
    if (msg.includes('Password should be')) return '비밀번호는 6자 이상이어야 합니다.';
    if (/anonymous sign-ins are disabled/i.test(msg)) return '게스트 로그인이 아직 꺼져 있어요. 관리자가 Supabase 에서 켜야 해요.';
    if (/already been registered|email address.*(exists|registered)/i.test(msg)) return '이미 다른 계정이 쓰고 있는 이메일이에요.';
    if (/rate limit/i.test(msg)) return '요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
    return msg;
  }
  return String(err);
}
