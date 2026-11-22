import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { Chip, styles } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { todayKey } from '@/lib/date';
import { colors, radius } from '@/lib/theme';

type Msg = { role: 'user' | 'model'; text: string };

const SUGGESTIONS = ['오늘 일정 알려줘', '내일 팀 모임 있어?', '이번 주 마감인 할 일은?', '안 읽은 공지 요약해줘', '이번 주 수업 없는 날은?'];

// 웹은 같은 Vercel 주소의 /api, 모바일 앱은 EXPO_PUBLIC_API_URL
const API_URL = Platform.OS === 'web' ? '/api/assistant' : `${process.env.EXPO_PUBLIC_API_URL ?? ''}/api/assistant`;

export default function AssistantScreen() {
  const { session, profile } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // 다른 화면의 질문 버튼에서 들어오면 그 질문을 바로 보냄 (한 번만)
  const { q } = useLocalSearchParams<{ q?: string }>();
  const autoAsked = useRef(false);
  useEffect(() => {
    if (q && session && !autoAsked.current) {
      autoAsked.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, session]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy || !session) return;
    const next: Msg[] = [...messages, { role: 'user', text: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        // 날짜·시간대는 기기 기준으로 보냄 (서버는 한국 시간이 아님)
        body: JSON.stringify({ messages: next, today: todayKey(), tzOffset: new Date().getTimezoneOffset() }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      const reply = res.ok ? data.reply ?? '' : `⚠️ ${data.error ?? (res.status === 504 ? 'AI 응답이 너무 오래 걸렸어요.' : `서버 오류 (${res.status})`)}`;
      setMessages((prev) => [...prev, { role: 'model', text: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'model', text: '⚠️ 연결에 실패했어요. 인터넷 연결을 확인해주세요.' }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {/* 첫 인사 */}
        <Bubble role="model">
          {`안녕하세요, ${profile?.display_name || ''}님! 🤖\n팀 일정, 내 시간표, 할 일, 공지를 보고 답해 드릴게요. 무엇이 궁금하세요?`}
        </Bubble>
        {messages.length === 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, marginBottom: 8 }}>
            {SUGGESTIONS.map((s) => (
              <Chip key={s} label={s} onPress={() => send(s)} />
            ))}
          </View>
        )}

        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.text}
          </Bubble>
        ))}
        {busy && (
          <View style={[styles.row, { gap: 8, marginTop: 4 }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>생각하는 중…</Text>
          </View>
        )}

        <Text style={[styles.muted, { marginTop: 16, textAlign: 'center' }]}>
          질문과 내 일정 정보(내가 볼 수 있는 것만)가 Google Gemini로 전송돼요.{'\n'}무료 등급이라 입력 내용이 Google
          서비스 개선에 쓰일 수 있어요. AI 답변은 틀릴 수 있어요.
        </Text>
      </ScrollView>

      {/* 입력창 */}
      <View style={[styles.row, { gap: 8, padding: 12, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="예: 오늘 일정 뭐야?"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={() => send(input)}
          submitBehavior="submit"
          returnKeyType="send"
          maxLength={500}
          editable={!busy}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 10,
            fontSize: 16,
            color: colors.text,
            backgroundColor: colors.bg,
          }}
        />
        <Pressable
          onPress={() => send(input)}
          disabled={!input.trim() || busy}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: !input.trim() || busy ? colors.border : colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityLabel="보내기"
        >
          <Ionicons name="arrow-up" size={22} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ role, children }: { role: 'user' | 'model'; children: string }) {
  const mine = role === 'user';
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        backgroundColor: mine ? colors.primary : colors.card,
        borderWidth: mine ? 0 : 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        borderBottomRightRadius: mine ? 4 : radius.lg,
        borderBottomLeftRadius: mine ? radius.lg : 4,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginVertical: 4,
      }}
    >
      <Text style={{ color: mine ? '#fff' : colors.text, fontSize: 15, lineHeight: 22 }} selectable>
        {children}
      </Text>
    </View>
  );
}
