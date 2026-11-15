import Ionicons from '@expo/vector-icons/Ionicons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { DAY_LABELS, ENTRY_COLORS, formatMin } from '@/components/TimetableGrid';
import { Button, Card, Chip, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { createTimetableEntries, deleteMyTimetable, type TimetableInput } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

type ParsedEntry = Omit<TimetableInput, 'color'>;

// 웹은 같은 Vercel 주소의 /api, 모바일 앱은 배포 주소를 EXPO_PUBLIC_API_URL 로 지정
const API_URL =
  Platform.OS === 'web' ? '/api/parse-timetable' : `${process.env.EXPO_PUBLIC_API_URL ?? ''}/api/parse-timetable`;

/** 긴 쪽 기준으로 줄여서 JPEG base64 로 (서버 요청 크기 한도 대비) */
async function prepareImage(asset: ImagePicker.ImagePickerAsset): Promise<{ base64: string; mediaType: string }> {
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width > 1400) ctx.resize({ width: 1400 });
  const ref = await ctx.renderAsync();
  const result = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG, base64: true });
  if (!result.base64) throw new Error('이미지를 변환하지 못했어요.');
  return { base64: result.base64, mediaType: 'image/jpeg' };
}

export default function TimetableImportScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [entries, setEntries] = useState<ParsedEntry[] | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [warning, setWarning] = useState('');
  const [replace, setReplace] = useState(true);
  const [saving, setSaving] = useState(false);

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setAsset(res.assets[0]);
    setEntries(null);
    setWarning('');
    analyze(res.assets[0]);
  }

  async function analyze(a: ImagePicker.ImagePickerAsset) {
    if (!session) return;
    setAnalyzing(true);
    try {
      const { base64, mediaType } = await prepareImage(a);
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ image: base64, mediaType }),
      });
      const data = (await res.json().catch(() => ({}))) as { entries?: ParsedEntry[]; warning?: string; error?: string };
      if (res.status === 504) throw new Error('AI 응답이 너무 오래 걸렸어요. 잠시 후 다시 시도해주세요.');
      if (!res.ok) throw new Error(data.error ?? `서버 오류 (${res.status})`);
      const list = data.entries ?? [];
      setEntries(list);
      setSelected(list.map(() => true));
      setWarning(data.warning ?? '');
    } catch (e) {
      Alert.alert('분석 실패', errorMessage(e));
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    if (!entries || !session) return;
    // 같은 과목은 같은 색으로
    const colorByTitle = new Map<string, string>();
    const chosen = entries
      .filter((_, i) => selected[i])
      .map((e) => {
        if (!colorByTitle.has(e.title)) colorByTitle.set(e.title, ENTRY_COLORS[colorByTitle.size % ENTRY_COLORS.length]);
        return { ...e, color: colorByTitle.get(e.title)! };
      });
    if (chosen.length === 0) return;
    setSaving(true);
    try {
      if (replace) await deleteMyTimetable(session.user.id);
      await createTimetableEntries(chosen);
      Alert.alert('등록 완료', `${chosen.length}개 일정을 시간표에 추가했어요.`);
      router.back();
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const count = selected.filter(Boolean).length;
  const sorted = entries
    ? entries
        .map((e, i) => ({ e, i }))
        .sort((a, b) => ((a.e.day_of_week + 6) % 7) - ((b.e.day_of_week + 6) % 7) || a.e.start_min - b.e.start_min)
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Text style={{ fontWeight: '700', color: colors.primary, marginBottom: 4 }}>📷 시간표 캡처로 자동 입력</Text>
        <Text style={[styles.sub, { lineHeight: 20 }]}>
          에브리타임 앱의 시간표 화면을 캡처해서 올리면 AI가 과목·요일·시간·강의실을 읽어 와요. 등록 전에 결과를 확인할 수
          있어요.
        </Text>
      </Card>

      <Button
        title={asset ? '다른 이미지 선택' : '시간표 이미지 선택'}
        icon="image-outline"
        variant={asset ? 'secondary' : 'primary'}
        onPress={pick}
        disabled={analyzing || saving}
      />

      {asset && (
        <View style={{ marginTop: 12, alignItems: 'center' }}>
          <Image
            source={{ uri: asset.uri }}
            style={{ width: '100%', height: 220, borderRadius: radius.md, backgroundColor: '#F3F4F6' }}
            resizeMode="contain"
          />
        </View>
      )}

      {analyzing && (
        <Card style={{ marginTop: 12, alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.sub}>AI가 시간표를 읽고 있어요… (10~40초)</Text>
        </Card>
      )}

      {entries && !analyzing && (
        <View style={{ marginTop: 16 }}>
          {warning ? (
            <Card style={{ borderColor: colors.warning }}>
              <Text style={{ color: colors.warning }}>⚠️ {warning}</Text>
            </Card>
          ) : null}

          {entries.length === 0 ? (
            <Text style={styles.sub}>읽어온 일정이 없어요. 시간표 부분이 잘 보이게 다시 캡처해보세요.</Text>
          ) : (
            <>
              <Text style={[styles.title, { marginBottom: 8 }]}>
                {entries.length}개를 찾았어요 <Text style={styles.muted}>· 틀린 항목은 체크 해제 후 나중에 수정하세요</Text>
              </Text>
              <Card style={{ paddingVertical: 4 }}>
                {sorted.map(({ e, i }) => (
                  <Pressable
                    key={i}
                    onPress={() => setSelected((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                    style={[styles.row, { paddingVertical: 10, gap: 10 }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected[i] }}
                  >
                    <Ionicons
                      name={selected[i] ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={selected[i] ? colors.primary : colors.textMuted}
                    />
                    <Text style={{ width: 22, fontWeight: '700', color: colors.text }}>{DAY_LABELS[e.day_of_week]}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>{e.title}</Text>
                      <Text style={styles.muted}>
                        {formatMin(e.start_min)}~{formatMin(e.end_min)}
                        {e.location ? ` · ${e.location}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </Card>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                <Chip label="기존 시간표 지우고 바꾸기" active={replace} onPress={() => setReplace(true)} />
                <Chip label="기존 시간표에 추가" active={!replace} onPress={() => setReplace(false)} />
              </View>
              <Button title={`${count}개 시간표에 등록`} onPress={save} loading={saving} disabled={count === 0} />
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}
