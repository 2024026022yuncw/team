import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Chip, Input, styles } from '@/components/ui';
import { listTimetable } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { colorFor, colors } from '@/lib/theme';
import type { Team } from '@/lib/types';

/**
 * 팀의 수업 선택: 내 시간표 과목 버튼 / 직접 입력 / 없음
 * value 가 빈 문자열이면 "없음"
 */
export function CoursePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const userId = useUserId();
  const { data: courses, loading } = useAsync<string[]>(
    async () => {
      const entries = await listTimetable([userId]);
      return Array.from(new Set(entries.map((e) => e.title.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'));
    },
    [userId],
    [],
  );
  // 시간표에 없는 값이면 직접 입력 모드로 시작
  const [manual, setManual] = useState(false);
  const isManual = manual || (value !== '' && !loading && !courses.includes(value));

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip
          label="없음"
          active={value === '' && !isManual}
          onPress={() => {
            setManual(false);
            onChange('');
          }}
        />
        {courses.map((c) => (
          <Chip
            key={c}
            label={`📚 ${c}`}
            active={!isManual && value === c}
            onPress={() => {
              setManual(false);
              onChange(c);
            }}
          />
        ))}
        <Chip
          label="✏️ 직접 입력"
          active={isManual}
          onPress={() => {
            setManual(true);
            if (courses.includes(value)) onChange('');
          }}
        />
      </View>
      {isManual && (
        <Input value={value} onChangeText={onChange} placeholder="예: 경영학원론" maxLength={50} autoFocus />
      )}
      {!loading && courses.length === 0 && (
        <Text style={[styles.muted, { marginTop: 4, color: colors.textMuted }]}>
          시간표 탭에 수업을 등록하면 여기서 바로 고를 수 있어요.
        </Text>
      )}
    </View>
  );
}

export const COURSE_SHORT_MAX = 4;
// 약칭을 만들 때 건너뛸 연결어
const SKIP_WORDS = new Set(['및', '와', '과', '의', 'and', 'of', 'the', '&']);

/**
 * 과목명 → 아이콘용 약칭 (최대 4글자)
 * - 여러 단어: 단어마다 첫 글자 (경영과 정보기술 → 경정, Python 프로그래밍 기초 → P프기)
 * - 한 단어: 4글자 이하는 그대로(자료구조), 길면 앞 3글자(캡스톤디자인 → 캡스톤)
 * - 괄호 안(분반 등)은 무시: 경영과 정보기술(02분반) → 경정
 */
export function shortCourse(name: string): string {
  const cleaned = name.replace(/[([{].*?[)\]}]/g, ' ').trim();
  const words = cleaned
    .split(/[\s·,/&+\-_:]+/)
    .filter((w) => w && !SKIP_WORDS.has(w.toLowerCase()));
  if (words.length >= 2) {
    return words
      .map((w) => Array.from(w)[0])
      .slice(0, COURSE_SHORT_MAX)
      .join('');
  }
  const chars = Array.from(words[0] ?? cleaned.replace(/\s+/g, ''));
  return (chars.length <= COURSE_SHORT_MAX ? chars : chars.slice(0, 3)).join('');
}

/** 팀 아이콘 약칭 입력: 과목이 바뀌면 자동으로 채우고, 직접 고치면 그 값을 유지 */
export function CourseShortField({
  course,
  value,
  onChange,
}: {
  course: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const auto = course.trim() ? shortCourse(course) : '';
  // 처음 값이 자동 값과 다르면 사용자가 정한 것으로 봄
  const [edited, setEdited] = useState(value !== '' && value !== auto);
  // 과목이 바뀌면(직접 고친 적 없을 때만) 자동 약칭으로 채움
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (value) return; // 이미 저장된 약칭이 있으면 그대로
    }
    if (!edited) onChange(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);
  if (!course.trim()) return null;
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TeamIcon team={{ id: course, name: course, course_name: course, course_short: value }} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.muted, { marginBottom: 4 }]}>아이콘 약칭 (최대 {COURSE_SHORT_MAX}글자)</Text>
          <Input
            value={value}
            onChangeText={(t) => {
              setEdited(true);
              onChange(Array.from(t.replace(/\s+/g, '')).slice(0, COURSE_SHORT_MAX).join(''));
            }}
            placeholder={auto}
            style={{ paddingVertical: 8 }}
          />
        </View>
      </View>
      {edited && value !== auto && (
        <Text
          style={{ color: colors.primary, fontSize: 13, marginTop: 4 }}
          onPress={() => {
            setEdited(false);
            onChange(auto);
          }}
        >
          자동 약칭({auto})으로 되돌리기
        </Text>
      )}
    </View>
  );
}

/**
 * 팀 목록의 네모 아이콘. 수업이 있으면 약칭(직접 정한 것 우선, 없으면 자동), 없으면 팀 이름 첫 글자.
 * 같은 과목은 같은 색.
 */
export function TeamIcon({
  team,
  size = 52,
}: {
  team: Pick<Team, 'id' | 'name' | 'course_name'> & { course_short?: string; my_course_short?: string };
  size?: number;
}) {
  const course = team.course_name?.trim() ?? '';
  // 표시 순서: 내 약칭 → 팀장이 정한 약칭 → 과목명에서 자동
  const label = course
    ? team.my_course_short?.trim() || team.course_short?.trim() || shortCourse(course)
    : (Array.from(team.name)[0] ?? '');
  const len = Array.from(label).length;
  const long = len >= 3;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: colorFor(course || team.id),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        paddingHorizontal: 4,
      }}
      accessibilityLabel={course ? `수업 ${course}` : undefined}
    >
      <Text
        style={{
          color: '#fff',
          fontWeight: '800',
          textAlign: 'center',
          fontSize: !course ? 22 : long ? 13 : 16,
          lineHeight: !course ? 26 : long ? 16 : 20,
        }}
        numberOfLines={2}
      >
        {/* 4글자는 2글자씩 두 줄로 */}
        {len === 4 ? `${Array.from(label).slice(0, 2).join('')}\n${Array.from(label).slice(2).join('')}` : label}
      </Text>
    </View>
  );
}

/** 팀 카드 등에 붙이는 작은 수업 표시 */
export function CourseBadge({ name }: { name: string }) {
  if (!name) return null;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: colors.primarySoft,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginBottom: 3,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }} numberOfLines={1}>
        📚 {name}
      </Text>
    </View>
  );
}
