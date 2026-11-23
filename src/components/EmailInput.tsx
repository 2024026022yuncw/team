import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type Ref } from 'react';
import { Pressable, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { colors, radius } from '@/lib/theme';

export const EMAIL_DOMAINS = ['naver.com', 'gmail.com', 'daum.net', 'hanmail.net', 'kakao.com', 'nate.com'];
const CUSTOM = '__custom__';

export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

function split(email: string): { local: string; domain: string } {
  const at = email.indexOf('@');
  if (at < 0) return { local: email, domain: '' };
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/**
 * 이메일 입력: [아이디] @ [도메인 선택 ▼ / 직접 입력]
 * - value/onChange 는 합쳐진 전체 이메일 (예: hong@naver.com)
 * - 아이디 칸에 전체 이메일을 붙여넣거나 브라우저 자동완성으로 들어오면 알아서 나눔
 */
export function EmailInput({
  value,
  onChange,
  onSubmitEditing,
  inputRef,
  returnKeyType = 'next',
}: {
  value: string;
  onChange: (email: string) => void;
  onSubmitEditing?: () => void;
  inputRef?: Ref<TextInputInstance>;
  returnKeyType?: 'next' | 'done' | 'go';
}) {
  const initial = split(value);
  const [local, setLocal] = useState(initial.local);
  // 목록에 있는 도메인이면 그 값, 아니면 직접 입력 모드
  const [domain, setDomain] = useState(initial.domain || EMAIL_DOMAINS[0]);
  const [custom, setCustom] = useState(initial.domain !== '' && !EMAIL_DOMAINS.includes(initial.domain));
  const [sheet, setSheet] = useState(false);

  // 바깥에서 값이 비워지면(예: 등록 완료 후) 입력칸도 비움
  useEffect(() => {
    if (value === '' && local !== '') setLocal('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(nextLocal: string, nextDomain: string) {
    const l = nextLocal.trim();
    const d = nextDomain.trim();
    onChange(l ? `${l}@${d}` : '');
  }

  function changeLocal(text: string) {
    const t = text.replace(/\s+/g, '');
    if (t.includes('@')) {
      // 전체 이메일이 들어온 경우 → 나눠서 채움
      const s = split(t);
      setLocal(s.local);
      if (s.domain) {
        const known = EMAIL_DOMAINS.includes(s.domain.toLowerCase());
        setCustom(!known);
        setDomain(known ? s.domain.toLowerCase() : s.domain);
        emit(s.local, s.domain);
        return;
      }
    }
    setLocal(t);
    emit(t, domain);
  }

  function pickDomain(d: string) {
    if (d === CUSTOM) {
      setCustom(true);
      setDomain('');
      emit(local, '');
      return;
    }
    setCustom(false);
    setDomain(d);
    emit(local, d);
  }

  const box = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  } as const;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <TextInput
        ref={inputRef}
        value={local}
        onChangeText={changeLocal}
        placeholder="아이디"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType={returnKeyType}
        submitBehavior="submit"
        onSubmitEditing={onSubmitEditing}
        style={[box, { flex: 1.2, minWidth: 0 }]}
        accessibilityLabel="이메일 아이디"
      />
      <Text style={{ fontSize: 16, color: colors.textSub }}>@</Text>
      {custom ? (
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            value={domain}
            onChangeText={(t) => {
              const d = t.replace(/\s+/g, '').replace(/^@/, '');
              setDomain(d);
              emit(local, d);
            }}
            placeholder="example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType={returnKeyType}
            submitBehavior="submit"
            onSubmitEditing={onSubmitEditing}
            style={[box, { flex: 1, minWidth: 0, paddingRight: 34 }]}
            accessibilityLabel="이메일 도메인 직접 입력"
          />
          <Pressable
            onPress={() => setSheet(true)}
            hitSlop={8}
            style={{ position: 'absolute', right: 8 }}
            accessibilityLabel="도메인 목록에서 고르기"
          >
            <Ionicons name="chevron-down" size={18} color={colors.textSub} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setSheet(true)}
          style={[box, { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
          accessibilityLabel={`이메일 도메인 ${domain}, 눌러서 바꾸기`}
        >
          <Text style={{ fontSize: 16, color: colors.text, flexShrink: 1 }} numberOfLines={1}>
            {domain}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.textSub} />
        </Pressable>
      )}

      <ActionSheet
        visible={sheet}
        title="이메일 주소 선택"
        actions={[
          ...EMAIL_DOMAINS.map((d) => ({ label: d, onPress: () => pickDomain(d) })),
          { label: '직접 입력', icon: 'create-outline' as const, onPress: () => pickDomain(CUSTOM) },
        ]}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}
