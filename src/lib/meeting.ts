// 모임 방식(온라인/오프라인) 표시와 공지 내용 생성
import { formatDay, formatTime, toDateKey } from './date';
import type { TeamEvent } from './types';

export type MeetingType = 'offline' | 'online';

export const PLATFORMS = [
  { value: 'zoom', label: 'Zoom', emoji: '🎥', linkHint: 'Zoom 회의 링크 또는 회의 ID' },
  { value: 'kakao', label: '카카오톡', emoji: '💬', linkHint: '단톡방 이름 또는 보이스톡/페이스톡 안내' },
  { value: 'facetime', label: '페이스타임', emoji: '📱', linkHint: '페이스타임 링크 또는 연락처' },
  { value: 'meet', label: 'Google Meet', emoji: '🟢', linkHint: 'Google Meet 링크' },
  { value: 'discord', label: 'Discord', emoji: '🎧', linkHint: '서버/채널 초대 링크' },
  { value: 'other', label: '기타', emoji: '💻', linkHint: '접속 방법 (링크, 프로그램 등)' },
] as const;

export function platformOf(value: string | null | undefined) {
  return PLATFORMS.find((p) => p.value === value) ?? null;
}

export function isUrl(text: string) {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** 캘린더 카드 한 줄 요약: "🏫 공학관 302호" / "🎥 Zoom" */
export function meetingSummary(e: Pick<TeamEvent, 'meeting_type' | 'location' | 'online_platform'>): string | null {
  if (e.meeting_type === 'offline') return `🏫 오프라인${e.location ? ` · ${e.location}` : ''}`;
  if (e.meeting_type === 'online') {
    const p = platformOf(e.online_platform);
    return `${p?.emoji ?? '💻'} 온라인${p ? ` · ${p.label}` : ''}`;
  }
  return e.location ? `📍 ${e.location}` : null;
}

function whenText(e: Pick<TeamEvent, 'starts_at' | 'ends_at'>) {
  const s = new Date(e.starts_at);
  const en = new Date(e.ends_at);
  return toDateKey(s) === toDateKey(en)
    ? `${formatDay(s)} ${formatTime(s)} ~ ${formatTime(en)}`
    : `${formatDay(s)} ${formatTime(s)} ~ ${formatDay(en)} ${formatTime(en)}`;
}

/** 일정 → 공지 제목/내용 */
export function noticeFromEvent(
  e: Pick<TeamEvent, 'title' | 'starts_at' | 'ends_at' | 'meeting_type' | 'location' | 'online_platform' | 'meeting_link' | 'description'>,
  changed = false,
): { title: string; content: string } {
  const s = new Date(e.starts_at);
  const prefix = changed ? '[변경] ' : e.meeting_type ? '[모임 확정] ' : '[일정] ';
  const title = `${prefix}${s.getMonth() + 1}/${s.getDate()} ${formatTime(s)} ${e.title}`.slice(0, 100);

  const lines = [`📅 일시: ${whenText(e)}`];
  if (e.meeting_type === 'offline') {
    lines.push('🏫 방식: 오프라인');
    lines.push(`📍 장소: ${e.location || '(미정)'}`);
  } else if (e.meeting_type === 'online') {
    const p = platformOf(e.online_platform);
    lines.push(`${p?.emoji ?? '💻'} 방식: 온라인${p ? ` (${p.label})` : ''}`);
    if (e.meeting_link) lines.push(`🔗 접속: ${e.meeting_link}`);
  } else if (e.location) {
    lines.push(`📍 장소: ${e.location}`);
  }
  if (e.description) lines.push('', `📝 메모`, e.description);
  lines.push('', changed ? '일정이 변경되었어요. 캘린더에서 다시 확인해주세요.' : '캘린더에도 등록되어 있어요. 늦지 않게 참석해주세요!');
  return { title, content: lines.join('\n') };
}
