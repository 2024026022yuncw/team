// 팀 캘린더의 하루 타임라인: [모임 가능] [팀 일정] [내 일정(나만)] 세 줄
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

const HOUR_H = 44;

export type TimelineBlock = {
  key: string;
  start: number; // 분
  end: number;
  title: string;
  sub?: string;
  color: string;
  onPress?: () => void;
};

export type FreeWindow = { start: number; end: number; label: string; full: boolean };

type Props = {
  range: [number, number]; // 시(hour)
  free: FreeWindow[];
  team: TimelineBlock[];
  mine: TimelineBlock[] | null; // null 이면 "내 일정" 줄 숨김
  onPressFree: (w: FreeWindow) => void;
};

const fmt = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

export function DayTimeline({ range, free, team, mine, onPressFree }: Props) {
  const [startH, endH] = range;
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const height = hours.length * HOUR_H;
  const top = (m: number) => ((m - startH * 60) / 60) * HOUR_H;
  const h = (s: number, e: number) => Math.max(((e - s) / 60) * HOUR_H - 2, 16);

  const lanes: { key: string; title: string; render: () => React.ReactNode }[] = [
    {
      key: 'free',
      title: '✅ 모임 가능',
      render: () =>
        free.map((w) => (
          <Pressable
            key={`f-${w.start}`}
            onPress={() => onPressFree(w)}
            style={[
              s.block,
              { top: top(w.start), height: h(w.start, w.end) },
              w.full ? s.freeFull : s.freePartial,
            ]}
            accessibilityLabel={`${fmt(w.start)}부터 ${fmt(w.end)}까지 ${w.label}, 눌러서 모임 만들기`}
          >
            <Text style={[s.freeText, !w.full && { color: '#047857' }]} numberOfLines={2}>
              {fmt(w.start)}~{fmt(w.end)}
            </Text>
            {h(w.start, w.end) > 34 && (
              <Text style={[s.freeSub, !w.full && { color: '#047857' }]} numberOfLines={1}>
                {w.label}
              </Text>
            )}
          </Pressable>
        )),
    },
    {
      key: 'team',
      title: '👥 팀 일정',
      render: () =>
        team.map((b) => (
          <Pressable
            key={b.key}
            onPress={b.onPress}
            style={[s.block, { top: top(b.start), height: h(b.start, b.end), backgroundColor: b.color }]}
          >
            <Text style={s.blockTitle} numberOfLines={2}>
              {b.title}
            </Text>
          </Pressable>
        )),
    },
  ];
  if (mine) {
    lanes.push({
      key: 'mine',
      title: '🔒 내 일정',
      render: () =>
        mine.map((b) => (
          <Pressable
            key={b.key}
            onPress={b.onPress}
            style={[s.block, s.mine, { top: top(b.start), height: h(b.start, b.end), borderColor: b.color }]}
          >
            <Text style={[s.blockTitle, { color: colors.text }]} numberOfLines={2}>
              {b.title}
            </Text>
            {b.sub && h(b.start, b.end) > 34 ? (
              <Text style={s.mineSub} numberOfLines={1}>
                {b.sub}
              </Text>
            ) : null}
          </Pressable>
        )),
    });
  }

  return (
    <View>
      <View style={s.headerRow}>
        <View style={s.timeCol} />
        {lanes.map((l) => (
          <Text key={l.key} style={s.laneTitle} numberOfLines={1}>
            {l.title}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={[s.timeCol, { height }]}>
          {hours.map((hr) => (
            <Text key={hr} style={[s.hourLabel, { top: (hr - startH) * HOUR_H - 6 }]}>
              {hr}
            </Text>
          ))}
        </View>
        {lanes.map((l) => (
          <View key={l.key} style={[s.lane, { height }]}>
            {hours.map((hr) => (
              <View key={hr} style={[s.hourLine, { top: (hr - startH) * HOUR_H }]} />
            ))}
            {l.render()}
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', marginBottom: 6 },
  timeCol: { width: 26 },
  laneTitle: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.textSub },
  hourLabel: { position: 'absolute', right: 5, fontSize: 10, color: colors.textMuted },
  lane: { flex: 1, position: 'relative', borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  hourLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  block: { position: 'absolute', left: 3, right: 3, borderRadius: 6, padding: 4, overflow: 'hidden' },
  blockTitle: { color: '#fff', fontSize: 11, fontWeight: '700' },
  freeFull: { backgroundColor: '#10B981' },
  freePartial: { backgroundColor: '#D1FAE5', borderWidth: 1, borderColor: '#10B981', borderStyle: 'dashed' },
  freeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  freeSub: { color: 'rgba(255,255,255,0.9)', fontSize: 10, marginTop: 1 },
  mine: { backgroundColor: '#F3F4F6', borderLeftWidth: 4 },
  mineSub: { color: colors.textSub, fontSize: 10, marginTop: 1 },
});
