import { useState } from 'react';
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

/** 네모 아이콘에 넣을 짧은 과목명: 4글자까지는 그대로(2줄), 더 길면 앞 3글자 */
export function shortCourse(name: string): string {
  const n = name.replace(/\s+/g, '');
  return n.length <= 4 ? n : n.slice(0, 3);
}

/**
 * 팀 목록의 네모 아이콘. 수업이 있으면 과목명(같은 과목은 같은 색), 없으면 팀 이름 첫 글자.
 */
export function TeamIcon({ team, size = 52 }: { team: Pick<Team, 'id' | 'name' | 'course_name'>; size?: number }) {
  const course = team.course_name?.trim() ?? '';
  const label = course ? shortCourse(course) : team.name.slice(0, 1);
  const long = label.length >= 3;
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
        {label.length === 4 ? `${label.slice(0, 2)}\n${label.slice(2)}` : label}
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
