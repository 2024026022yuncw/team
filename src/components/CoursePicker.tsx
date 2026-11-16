import { useState } from 'react';
import { Text, View } from 'react-native';

import { Chip, Input, styles } from '@/components/ui';
import { listTimetable } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { colors } from '@/lib/theme';

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
