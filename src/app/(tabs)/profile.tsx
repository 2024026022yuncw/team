import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { AccountSwitcher } from '@/components/AccountSwitcher';
import { EmailInput, isValidEmail } from '@/components/EmailInput';
import { Avatar, Button, Card, Field, Input, styles } from '@/components/ui';
import { removeSavedAccount } from '@/lib/accounts';
import { Alert } from '@/lib/alert';
import { deleteMyAccount, updateDisplayName } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { errorMessage, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isGuest = Boolean(session?.user.is_anonymous);
  const [upEmail, setUpEmail] = useState('');
  const [upPassword, setUpPassword] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  /** 비밀번호 변경: 현재 비밀번호로 본인 확인 → 새 비밀번호 저장 */
  async function changePassword() {
    const email = session?.user.email;
    if (!email || pwBusy) return;
    if (pwNew.length < 6) {
      Alert.alert('입력 확인', '새 비밀번호는 6자 이상이어야 해요.');
      return;
    }
    if (pwNew !== pwConfirm) {
      Alert.alert('입력 확인', '새 비밀번호가 서로 달라요.');
      return;
    }
    if (pwNew === pwCurrent) {
      Alert.alert('입력 확인', '지금 비밀번호와 다른 비밀번호를 입력해주세요.');
      return;
    }
    setPwBusy(true);
    try {
      // 현재 비밀번호 확인 (틀리면 여기서 실패)
      const { error: checkErr } = await supabase.auth.signInWithPassword({ email, password: pwCurrent });
      if (checkErr) {
        Alert.alert('확인 실패', '현재 비밀번호가 올바르지 않아요.');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
      Alert.alert('변경 완료', '비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.');
    } catch (e) {
      Alert.alert('변경 실패', errorMessage(e));
    } finally {
      setPwBusy(false);
    }
  }

  useEffect(() => setName(profile?.display_name ?? ''), [profile?.display_name]);

  async function save() {
    if (!session || !name.trim()) return;
    setBusy(true);
    try {
      await updateDisplayName(session.user.id, name.trim());
      await refreshProfile();
      Alert.alert('저장 완료', '이름이 변경되었어요.');
    } catch (e) {
      Alert.alert('실패', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function withdraw() {
    Alert.alert(
      '회원탈퇴',
      '정말 탈퇴할까요?\n\n• 다이어리, 시간표, 투표 기록이 모두 삭제돼요.\n• 내가 팀장인 팀은 가장 먼저 들어온 팀원에게 넘어가요. (혼자인 팀은 삭제)\n• 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const uid = session?.user.id;
              await deleteMyAccount();
              if (uid) removeSavedAccount(uid);
              await supabase.auth.signOut({ scope: 'local' });
              Alert.alert('탈퇴 완료', '그동안 이용해주셔서 감사합니다.');
            } catch (e) {
              Alert.alert('탈퇴 실패', errorMessage(e));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  function logout() {
    Alert.alert(
      '로그아웃',
      isGuest
        ? '게스트 계정은 로그아웃하면 다시 들어올 수 없어요.\n\n• 계속 쓰려면: 위에서 이메일을 등록하세요.\n• 다른 계정을 잠깐 쓰려면: 로그아웃 대신 "계정 전환 → 다른 계정 추가"를 쓰면 게스트 계정이 저장돼요.\n\n그래도 로그아웃할까요?'
        : '로그아웃할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: () => {
            if (session) removeSavedAccount(session.user.id);
            supabase.auth.signOut();
          },
        },
      ],
    );
  }

  /** 게스트 → 정식 계정: 같은 계정에 이메일·비밀번호를 붙임 (데이터 그대로 유지) */
  async function upgrade() {
    const email = upEmail.trim();
    if (!email || upPassword.length < 6) {
      Alert.alert('입력 확인', '이메일과 6자 이상 비밀번호를 입력해주세요.');
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert('입력 확인', '이메일 주소를 확인해주세요. (예: hong@naver.com)');
      return;
    }
    setUpgrading(true);
    try {
      const { error: emailErr } = await supabase.auth.updateUser({ email });
      if (emailErr) throw emailErr;
      const { error: pwErr } = await supabase.auth.updateUser({ password: upPassword });
      if (pwErr) {
        // 이메일 인증이 켜진 프로젝트라면 인증 후 비밀번호를 설정해야 함
        Alert.alert('이메일을 확인해주세요', `${email} 로 보낸 메일을 확인한 뒤 다시 비밀번호를 등록해주세요.\n(${errorMessage(pwErr)})`);
        return;
      }
      await supabase.auth.refreshSession();
      setUpEmail('');
      setUpPassword('');
      Alert.alert('정식 계정 완료 🎉', `이제 ${email} 로 어느 기기에서든 로그인할 수 있어요. 지금까지의 데이터는 그대로예요.`);
    } catch (e) {
      Alert.alert('등록 실패', errorMessage(e));
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
        <Avatar id={session?.user.id} name={profile?.display_name ?? ''} size={72} />
        <Text style={[styles.title, { marginTop: 12 }]}>{profile?.display_name}</Text>
        <Text style={styles.sub}>{isGuest ? '👀 게스트 계정' : session?.user.email}</Text>
      </Card>

      {isGuest && (
        <Card style={{ borderColor: colors.warning, borderWidth: 1.5 }}>
          <Text style={[styles.title, { marginBottom: 4 }]}>이메일 등록하고 계속 쓰기</Text>
          <Text style={[styles.sub, { marginBottom: 12, lineHeight: 20 }]}>
            게스트 계정은 이 기기·브라우저에서만 유지돼요. 브라우저 기록을 지우거나 로그아웃하면 다시 들어올 수 없어요.
            이메일을 등록하면 지금 계정이 그대로 정식 계정이 돼요(팀·시간표·다이어리 유지).
          </Text>
          <Field label="이메일">
            <EmailInput value={upEmail} onChange={setUpEmail} />
          </Field>
          <Field label="비밀번호">
            <Input
              value={upPassword}
              onChangeText={setUpPassword}
              placeholder="6자 이상"
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={upgrade}
            />
          </Field>
          <Button title="정식 계정으로 전환" onPress={upgrade} loading={upgrading} />
        </Card>
      )}

      {/* 비밀번호 변경 (정식 계정만) */}
      {!isGuest && session?.user.email && (
        <Card>
          <Text style={[styles.title, { marginBottom: 12 }]}>비밀번호 변경</Text>
          <Field label="현재 비밀번호">
            <Input value={pwCurrent} onChangeText={setPwCurrent} secureTextEntry autoComplete="current-password" placeholder="지금 쓰는 비밀번호" />
          </Field>
          <Field label="새 비밀번호">
            <Input value={pwNew} onChangeText={setPwNew} secureTextEntry autoComplete="new-password" placeholder="6자 이상" />
          </Field>
          <Field label="새 비밀번호 확인">
            <Input
              value={pwConfirm}
              onChangeText={setPwConfirm}
              secureTextEntry
              autoComplete="new-password"
              placeholder="한 번 더 입력"
              returnKeyType="go"
              onSubmitEditing={changePassword}
            />
          </Field>
          {pwConfirm.length > 0 && pwNew !== pwConfirm && (
            <Text style={{ color: colors.danger, fontSize: 13, marginTop: -8, marginBottom: 8 }}>새 비밀번호가 서로 달라요.</Text>
          )}
          <Button
            title="비밀번호 바꾸기"
            onPress={changePassword}
            loading={pwBusy}
            disabled={!pwCurrent || pwNew.length < 6 || pwNew !== pwConfirm}
          />
        </Card>
      )}

      <Card>
        <Field label="표시 이름 (팀원에게 보여요)">
          <Input value={name} onChangeText={setName} maxLength={20} />
        </Field>
        <Button
          title="저장"
          onPress={save}
          loading={busy}
          disabled={!name.trim() || name.trim() === profile?.display_name}
        />
      </Card>

      {session && <AccountSwitcher currentUserId={session.user.id} />}

      <View style={{ marginTop: 8 }}>
        <Button title="로그아웃" variant="secondary" icon="log-out-outline" onPress={logout} />
      </View>

      <View style={{ marginTop: 32, alignItems: 'center' }}>
        <Button title="회원탈퇴" variant="ghost" onPress={withdraw} loading={deleting} style={{ height: 40 }} />
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          탈퇴하면 다이어리·시간표·투표 기록이 모두 삭제되고 되돌릴 수 없어요.
        </Text>
      </View>
    </ScrollView>
  );
}
