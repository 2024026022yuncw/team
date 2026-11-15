export const colors = {
  primary: '#4F46E5',
  primarySoft: '#EEF2FF',
  text: '#111827',
  textSub: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  bg: '#F9FAFB',
  card: '#FFFFFF',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
  sunday: '#DC2626',
  saturday: '#2563EB',
};

// 멤버별 아바타 색 (user id 해시로 고정)
const AVATAR_COLORS = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DB2777', '#7C3AED', '#DC2626', '#2563EB'];

export function colorFor(id: string | null | undefined): string {
  if (!id) return colors.textMuted;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export const radius = { sm: 8, md: 12, lg: 16 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
