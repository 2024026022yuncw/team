import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { Avatar, Button, Card, Chip, Input, SectionTitle, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { COURSE_SHORT_MAX, CoursePicker, CourseShortField, shortCourse, TeamIcon } from '@/components/CoursePicker';
import {
  deleteTeam,
  inviteFriendToTeam,
  listFriendships,
  listTeamPendingInvitees,
  removeMember,
  listMyCourseShorts,
  sendFriendRequest,
  setAllowFriendJoin,
  setShareWithFriends,
  setMyCourseShort,
  updateRoleTitle,
  updateTeam,
} from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';
import { colors, radius } from '@/lib/theme';
import type { FriendItem, TeamMember } from '@/lib/types';

const ROLE_PRESETS = ['팀장', '발표', '자료조사', 'PPT', '보고서', '개발', '디자인', '회의록'];

export function MembersTab() {
  const router = useRouter();
  const userId = useUserId();
  const { team, members, nameOf, isOwner, reload } = useTeam();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [roleText, setRoleText] = useState('');
  const [courseOpen, setCourseOpen] = useState(false);
  const [courseText, setCourseText] = useState('');
  const [courseShortText, setCourseShortText] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  // 친구 관계 (팀원 옆 "+친구" 버튼, 친구 초대 목록용)
  const { data: friendships, reload: reloadFriends } = useAsync<FriendItem[]>(() => listFriendships(userId), [userId], []);
  const { data: pendingInvitees, reload: reloadInvitees } = useAsync<string[]>(
    () => (team ? listTeamPendingInvitees(team.id) : Promise.resolve([])),
    [team?.id],
    [],
  );
  const relation = new Map(friendships.map((f) => [f.otherId, f]));
  const memberIds = new Set(members.map((m) => m.user_id));
  const invitableFriends = friendships.filter((f) => f.status === 'accepted' && !memberIds.has(f.otherId));

  // 나만 보이는 약칭
  const [myShortOpen, setMyShortOpen] = useState(false);
  const [myShortText, setMyShortText] = useState('');
  const { data: myShorts, reload: reloadMyShort } = useAsync<Map<string, string>>(
    () => listMyCourseShorts(),
    [team?.id],
    new Map(),
  );
  const myShort = (team && myShorts.get(team.id)) || '';
  const myShare = members.find((x) => x.user_id === userId)?.share_with_friends !== false;
  const teamDefaultShort = team?.course_name ? team.course_short?.trim() || shortCourse(team.course_name) : '';

  if (!team) return null;

  async function addFriend(m: TeamMember) {
    try {
      const result = await sendFriendRequest({ userId: m.user_id });
      Alert.alert(
        '친구 요청',
        result === 'accepted'
          ? `${nameOf(m.user_id)} 님과 친구가 됐어요! 🎉`
          : result === 'already_friends'
            ? '이미 친구예요.'
            : `${nameOf(m.user_id)} 님에게 친구 요청을 보냈어요.`,
      );
      reloadFriends();
    } catch (e) {
      Alert.alert('실패', errorMessage(e));
    }
  }

  async function inviteFriend(f: FriendItem) {
    try {
      await inviteFriendToTeam(team!.id, f.otherId);
      reloadInvitees();
      Alert.alert('초대 완료', `${f.otherName} 님에게 팀 초대를 보냈어요. 수락하면 팀원이 돼요.`);
    } catch (e) {
      Alert.alert('초대 실패', errorMessage(e));
    }
  }

  // 수업·팀 기본 약칭 (팀장만, teams 정책)
  async function saveCourse() {
    try {
      const name = courseText.trim();
      await updateTeam(team!.id, { course_name: name, course_short: name ? courseShortText.trim() : '' });
      setCourseOpen(false);
      reload();
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    }
  }

  // 나만 보이는 약칭 (비우면 팀 기본으로)
  async function saveMyShort(value: string) {
    try {
      const v = value.trim() === teamDefaultShort ? '' : value;
      await setMyCourseShort(userId, team!.id, v);
      setMyShortOpen(false);
      reloadMyShort();
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    }
  }

  async function copyCode() {
    await Clipboard.setStringAsync(team!.invite_code);
    Alert.alert('복사 완료', `초대 코드 ${team!.invite_code} 를 복사했어요.`);
  }

  async function shareInvite() {
    const link =
      Platform.OS === 'web'
        ? `${window.location.origin}/team/join?code=${team!.invite_code}`
        : `teammeetup://team/join?code=${team!.invite_code}`;
    const message = `[팀플모임] "${team!.name}" 팀에 초대합니다!\n아래 링크를 열거나, '코드로 참여'에 초대 코드를 입력하세요.\n\n초대 코드: ${team!.invite_code}\n바로 참여: ${link}`;

    if (Platform.OS !== 'web') {
      Share.share({ message });
      return;
    }
    // 웹: 휴대폰 브라우저는 공유 시트, PC 는 클립보드 복사
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        // 사용자가 취소한 경우 등 → 복사로 대체
      }
    }
    await Clipboard.setStringAsync(message);
    Alert.alert('초대 메시지 복사 완료', '카톡 등에 붙여넣어 팀원에게 보내세요.');
  }

  function openRole(m: TeamMember) {
    setEditing(m);
    setRoleText(m.role_title);
  }

  async function saveRole() {
    if (!editing) return;
    try {
      await updateRoleTitle(editing.team_id, editing.user_id, roleText.trim());
      setEditing(null);
      reload();
    } catch (e) {
      Alert.alert('저장 실패', errorMessage(e));
    }
  }

  function kick(m: TeamMember) {
    Alert.alert('멤버 내보내기', `${nameOf(m.user_id)} 님을 팀에서 내보낼까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '내보내기',
        style: 'destructive',
        onPress: () => removeMember(m.team_id, m.user_id).then(reload).catch((e) => Alert.alert('실패', errorMessage(e))),
      },
    ]);
  }

  function leave() {
    if (isOwner) {
      Alert.alert('팀 삭제', '팀장이 나가면 팀이 삭제돼요. 일정·투표·할 일이 모두 사라집니다. 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '팀 삭제',
          style: 'destructive',
          onPress: () =>
            deleteTeam(team!.id)
              .then(() => router.dismissTo('/'))
              .catch((e) => Alert.alert('실패', errorMessage(e))),
        },
      ]);
    } else {
      Alert.alert('팀 나가기', '이 팀에서 나갈까요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '나가기',
          style: 'destructive',
          onPress: () =>
            removeMember(team!.id, userId)
              .then(() => router.dismissTo('/'))
              .catch((e) => Alert.alert('실패', errorMessage(e))),
        },
      ]);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Text style={[styles.sub, { color: colors.primary, fontWeight: '600' }]}>초대 코드</Text>
        <Text style={{ fontSize: 32, fontWeight: '800', letterSpacing: 6, color: colors.primary, marginVertical: 8 }}>
          {team.invite_code}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="복사" icon="copy-outline" variant="secondary" small onPress={copyCode} style={{ flex: 1 }} />
          <Button title="초대 공유" icon="share-social-outline" small onPress={shareInvite} style={{ flex: 1 }} />
        </View>
      </Card>

      {/* 이 팀플의 수업 */}
      <Card style={{ paddingVertical: 12 }}>
        <View style={[styles.row, { justifyContent: 'space-between', gap: 8 }]}>
          {team.course_name ? <TeamIcon team={{ ...team, my_course_short: myShort }} size={40} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>수업</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: team.course_name ? colors.text : colors.textMuted, marginTop: 2 }}>
              {team.course_name ? `📚 ${team.course_name}` : '지정 안 됨'}
            </Text>
          </View>
          {/* 수업·팀 기본 약칭은 팀장만 */}
          {isOwner && (
            <Button
              title={team.course_name ? '변경' : '지정'}
              variant="secondary"
              small
              onPress={() => {
                setCourseText(team.course_name);
                setCourseShortText(team.course_short ?? '');
                setCourseOpen(true);
              }}
            />
          )}
        </View>
        {/* 나만 보이는 약칭: 누구나 */}
        {team.course_name ? (
          <View style={[styles.row, { justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border }]}>
            <Text style={styles.sub}>
              🔒 내 화면 약칭: <Text style={{ fontWeight: '700', color: colors.text }}>{myShort || teamDefaultShort}</Text>
              {myShort ? '' : <Text style={styles.muted}> (팀 기본)</Text>}
            </Text>
            <Button
              title="바꾸기"
              variant="ghost"
              small
              onPress={() => {
                setMyShortText(myShort || teamDefaultShort);
                setMyShortOpen(true);
              }}
            />
          </View>
        ) : null}
        {team.description ? <Text style={[styles.sub, { marginTop: 8 }]}>{team.description}</Text> : null}
        {/* 친구 팀 목록 공개 (팀장만 변경) */}
        <View style={[styles.row, { justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border, gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sub}>💛 친구 팀 목록에 공개</Text>
            <Text style={styles.muted}>
              {team.allow_friend_join !== false ? '팀원의 친구가 초대 없이 참여할 수 있어요' : '초대나 초대 코드로만 참여할 수 있어요'}
            </Text>
          </View>
          {isOwner ? (
            <Chip
              label={team.allow_friend_join !== false ? '공개 중' : '비공개'}
              active={team.allow_friend_join !== false}
              onPress={() =>
                setAllowFriendJoin(team.id, team.allow_friend_join === false)
                  .then(reload)
                  .catch((e) => Alert.alert('저장 실패', errorMessage(e)))
              }
            />
          ) : (
            <Text style={styles.muted}>{team.allow_friend_join !== false ? '공개' : '비공개'}</Text>
          )}
        </View>
        {/* 내 친구에게 보이기: 각자 */}
        <View style={[styles.row, { justifyContent: 'space-between', marginTop: 10, gap: 8, opacity: team.allow_friend_join !== false ? 1 : 0.5 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sub}>🔒 내 친구에게 이 팀 보이기</Text>
            <Text style={styles.muted}>
              {team.allow_friend_join === false
                ? '팀장이 비공개로 해서 지금은 아무에게도 안 보여요'
                : myShare
                  ? '내 친구들의 "친구 팀" 목록에 이 팀이 나와요'
                  : '내 친구들에게는 이 팀이 안 보여요'}
            </Text>
          </View>
          <Chip
            label={myShare ? '보이기' : '숨기기'}
            active={myShare}
            onPress={() =>
              setShareWithFriends(team.id, userId, !myShare)
                .then(reload)
                .catch((e) => Alert.alert('저장 실패', errorMessage(e)))
            }
          />
        </View>
      </Card>

      <SectionTitle>멤버 {members.length}명</SectionTitle>
      {members.map((m) => (
        <Card key={m.user_id} style={{ paddingVertical: 12 }}>
          <View style={[styles.row, { gap: 12 }]}>
            <Avatar id={m.user_id} name={nameOf(m.user_id)} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                {nameOf(m.user_id)}
                {m.user_id === userId ? <Text style={styles.muted}> (나)</Text> : null}
                {m.role === 'owner' ? <Text style={{ color: colors.warning }}> 👑</Text> : null}
              </Text>
              <Pressable onPress={() => openRole(m)} hitSlop={6}>
                <Text style={{ color: m.role_title ? colors.primary : colors.textMuted, marginTop: 2 }}>
                  {m.role_title ? `역할: ${m.role_title}` : '+ 역할 지정'}
                </Text>
              </Pressable>
            </View>
            {m.user_id !== userId &&
              (() => {
                const rel = relation.get(m.user_id);
                if (rel?.status === 'accepted') return <Text style={styles.muted}>💛 친구</Text>;
                if (rel?.direction === 'sent') return <Text style={styles.muted}>요청함</Text>;
                return (
                  <Button
                    title={rel?.direction === 'received' ? '수락' : '+친구'}
                    small
                    variant="secondary"
                    onPress={() => addFriend(m)}
                  />
                );
              })()}
            {isOwner && m.user_id !== userId ? (
              <Pressable onPress={() => kick(m)} hitSlop={10} accessibilityLabel="멤버 내보내기">
                <Ionicons name="person-remove-outline" size={20} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Button
          title="친구 초대"
          icon="person-add-outline"
          variant="secondary"
          onPress={() => setInviteOpen(true)}
          style={{ flex: 1 }}
        />
        <Button
          title="🎲 발표자 뽑기"
          variant="secondary"
          onPress={() => router.push({ pathname: '/team/[id]/draw', params: { id: team.id } })}
          style={{ flex: 1 }}
        />
      </View>

      <Button
        title={isOwner ? '팀 삭제' : '팀 나가기'}
        variant="danger"
        icon="exit-outline"
        onPress={leave}
        style={{ marginTop: 16 }}
      />

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}
          onPress={() => setEditing(null)}
        >
          <Pressable style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: 20 }} onPress={() => {}}>
            <Text style={[styles.title, { marginBottom: 12 }]}>
              {editing ? nameOf(editing.user_id) : ''} 님의 역할
            </Text>
            <Input value={roleText} onChangeText={setRoleText} placeholder="예: 발표, 자료조사" maxLength={20} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
              {ROLE_PRESETS.map((r) => (
                <Chip key={r} label={r} active={roleText === r} onPress={() => setRoleText(r)} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button title="취소" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
              <Button title="저장" onPress={saveRole} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 친구 초대 */}
      <Modal visible={inviteOpen} transparent animationType="fade" onRequestClose={() => setInviteOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}
          onPress={() => setInviteOpen(false)}
        >
          <Pressable style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: 20, maxHeight: '80%' }} onPress={() => {}}>
            <Text style={[styles.title, { marginBottom: 4 }]}>친구를 팀에 초대</Text>
            <Text style={[styles.muted, { marginBottom: 12 }]}>초대받은 친구가 수락하면 팀원이 돼요.</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {invitableFriends.length === 0 ? (
                <Text style={[styles.sub, { paddingVertical: 12 }]}>
                  초대할 수 있는 친구가 없어요. 친구 탭에서 친구를 추가해보세요.
                </Text>
              ) : (
                invitableFriends.map((f) => {
                  const invited = pendingInvitees.includes(f.otherId);
                  return (
                    <View key={f.id} style={[styles.row, { gap: 12, paddingVertical: 8 }]}>
                      <Avatar id={f.otherId} name={f.otherName} size={34} />
                      <Text style={{ flex: 1, fontSize: 16, color: colors.text }}>{f.otherName}</Text>
                      {invited ? (
                        <Text style={styles.muted}>초대함</Text>
                      ) : (
                        <Button title="초대" small onPress={() => inviteFriend(f)} />
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
            <Button title="닫기" variant="secondary" onPress={() => setInviteOpen(false)} style={{ marginTop: 12 }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* 나만 보이는 약칭 */}
      <Modal visible={myShortOpen} transparent animationType="fade" onRequestClose={() => setMyShortOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}
          onPress={() => setMyShortOpen(false)}
        >
          <Pressable style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: 20 }} onPress={() => {}}>
            <Text style={[styles.title, { marginBottom: 4 }]}>🔒 내 화면 약칭</Text>
            <Text style={[styles.muted, { marginBottom: 12 }]}>
              내 팀 목록 아이콘에 나만 이렇게 보여요. 팀원에게는 팀 기본 약칭({teamDefaultShort})이 보여요.
            </Text>
            <View style={[styles.row, { gap: 10 }]}>
              <TeamIcon team={{ ...team, my_course_short: myShortText }} size={44} />
              <Input
                value={myShortText}
                onChangeText={(t) => setMyShortText(Array.from(t.replace(/\s+/g, '')).slice(0, COURSE_SHORT_MAX).join(''))}
                placeholder={teamDefaultShort}
                style={{ flex: 1 }}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Button title="팀 기본으로" variant="secondary" onPress={() => saveMyShort('')} style={{ flex: 1 }} />
              <Button title="저장" onPress={() => saveMyShort(myShortText)} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 수업 지정/변경 (팀장) */}
      <Modal visible={courseOpen} transparent animationType="fade" onRequestClose={() => setCourseOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}
          onPress={() => setCourseOpen(false)}
        >
          <Pressable style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: 20 }} onPress={() => {}}>
            <Text style={[styles.title, { marginBottom: 4 }]}>어떤 수업의 팀플인가요?</Text>
            <Text style={[styles.muted, { marginBottom: 12 }]}>내 시간표의 과목을 고르거나 직접 입력하세요. 약칭은 팀원 모두의 기본값이 돼요(각자 자기 화면에서 바꿀 수 있어요).</Text>
            <CoursePicker value={courseText} onChange={setCourseText} />
            {courseOpen && <CourseShortField course={courseText} value={courseShortText} onChange={setCourseShortText} />}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Button title="취소" variant="secondary" onPress={() => setCourseOpen(false)} style={{ flex: 1 }} />
              <Button title="저장" onPress={saveCourse} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
