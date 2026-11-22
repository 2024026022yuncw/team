import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View, type TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Input, Segmented, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { errorMessage, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const [guestBusy, setGuestBusy] = useState(false);

  /** 게스트(익명 로그인): 진짜 계정이 만들어지고 이 기기에 로그인 상태가 저장됨 */
  async function startGuest() {
    if (guestBusy) return;
    setGuestBusy(true);
    try {
      const tag = String(Math.floor(1000 + Math.random() * 9000));
      const { error } = await supabase.auth.signInAnonymously({ options: { data: { display_name: `게스트${tag}` } } });
      if (error) throw error;
    } catch (e) {
      Alert.alert('게스트 시작 실패', errorMessage(e));
    } finally {
      setGuestBusy(false);
    }
  }

  async function submit() {
    if (busy) return; // 엔터 연타로 중복 요청 방지
    if (!email.trim() || !password) {
      Alert.alert('입력 확인', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert('입력 확인', '팀원들에게 보일 이름을 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert('이메일을 확인해주세요', '가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인하세요.');
          setMode('login');
        }
      }
    } catch (e) {
      Alert.alert('실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Ionicons name="people" size={38} color="#fff" />
            </View>
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }}>팀플모임</Text>
            <Text style={[styles.sub, { marginTop: 6 }]}>일정 공유부터 역할 분담까지 한 곳에서</Text>
          </View>

          <Segmented
            options={[
              { value: 'login', label: '로그인' },
              { value: 'signup', label: '회원가입' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <View style={{ height: 24 }} />

          {mode === 'signup' && (
            <Field label="이름">
              <Input
                value={name}
                onChangeText={setName}
                placeholder="홍길동"
                maxLength={20}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
            </Field>
          )}
          <Field label="이메일">
            <Input
              ref={emailRef}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
              submitBehavior="submit"
              // 엔터: 비밀번호가 비어 있으면 비밀번호 칸으로, 이미 입력돼 있으면 바로 로그인
              onSubmitEditing={() => (password ? submit() : passwordRef.current?.focus())}
            />
          </Field>
          <Field label="비밀번호">
            <Input
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              placeholder="6자 이상"
              secureTextEntry
              autoComplete={mode === 'login' ? 'password' : 'new-password'}
              returnKeyType="go"
              onSubmitEditing={submit}
            />
          </Field>

          <Button title={mode === 'login' ? '로그인' : '가입하기'} onPress={submit} loading={busy} />

          {/* 게스트 체험 */}
          <View style={[styles.row, { marginVertical: 20, gap: 8 }]}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={styles.muted}>또는</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>
          <Button title="👀 가입 없이 게스트로 둘러보기" variant="secondary" onPress={startGuest} loading={guestBusy} />
          <Text style={[styles.muted, { textAlign: 'center', marginTop: 8, lineHeight: 18 }]}>
            게스트 계정은 이 기기·브라우저에서 계속 유지돼요.{'\n'}나중에 내 정보에서 이메일을 등록하면 그대로 정식 계정이 돼요.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
