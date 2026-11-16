import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { KIND_META, postDate } from '@/components/team/NoticesTab';
import { Avatar, Button, Card, Loading, SectionTitle, styles } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { deletePost, getPost, listPostReads, markPostRead, updatePost } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { formatDay, formatTime } from '@/lib/date';
import { useAsync, useRealtime } from '@/lib/hooks';
import { errorMessage } from '@/lib/supabase';
import { useTeam } from '@/lib/team-context';
import { colors } from '@/lib/theme';
import type { PostRead, TeamPost } from '@/lib/types';

export default function PostScreen() {
  const router = useRouter();
  const userId = useUserId();
  const { teamId, members, nameOf, isOwner } = useTeam();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data, loading, reload } = useAsync<{ post: TeamPost | null; reads: PostRead[] }>(
    async () => {
      const [post, reads] = await Promise.all([getPost(postId), listPostReads([postId])]);
      return { post, reads };
    },
    [postId],
    { post: null, reads: [] },
  );
  useRealtime(`post-${postId}`, [{ table: 'team_posts', filter: `id=eq.${postId}` }, { table: 'post_reads' }], reload);

  // 열어보면 읽음 처리
  useEffect(() => {
    if (!postId) return;
    markPostRead(postId).catch(() => {});
  }, [postId]);

  const { post, reads } = data;
  if (loading) return <Loading />;
  if (!post) return <Text style={{ padding: 24 }}>삭제되었거나 볼 수 없는 글이에요.</Text>;

  const meta = KIND_META[post.kind];
  const canEdit = post.created_by === userId || isOwner;
  const readIds = new Set([...reads.map((r) => r.user_id), ...(post.created_by ? [post.created_by] : []), userId]);
  const readAt = new Map(reads.map((r) => [r.user_id, r.read_at]));
  // 내용 속 링크는 누르면 열리도록 따로 모아 보여줌
  const links = Array.from(new Set(post.content.match(/https?:\/\/[^\s)]+/g) ?? [])).slice(0, 5);
  const edited = new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 60_000;

  const actions: SheetAction[] = [
    {
      label: '수정',
      icon: 'create-outline',
      onPress: () => router.push({ pathname: '/team/[id]/post-edit', params: { id: teamId, postId: post.id } }),
    },
    {
      label: post.pinned ? '상단 고정 해제' : '상단에 고정',
      icon: 'pin-outline',
      onPress: () =>
        updatePost(post.id, { pinned: !post.pinned })
          .then(reload)
          .catch((e) => Alert.alert('실패', errorMessage(e))),
    },
    {
      label: '삭제',
      icon: 'trash-outline',
      destructive: true,
      onPress: () =>
        Alert.alert('글 삭제', '이 글을 삭제할까요? 팀원 모두에게서 사라져요.', [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: () =>
              deletePost(post.id)
                .then(() => router.back())
                .catch((e) => Alert.alert('삭제 실패', errorMessage(e))),
          },
        ]),
    },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: meta.label,
          headerRight: canEdit
            ? () => (
                <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} accessibilityLabel="글 관리">
                  <Ionicons name="ellipsis-horizontal-circle" size={26} color={colors.text} />
                </Pressable>
              )
            : undefined,
        }}
      />

      <View style={[styles.row, { gap: 6, marginBottom: 8 }]}>
        {post.pinned && <Ionicons name="pin" size={14} color={meta.color} />}
        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: meta.bg }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: meta.color }}>
            {meta.emoji} {meta.label}
          </Text>
        </View>
        {post.kind === 'minutes' && post.meeting_date ? (
          <Text style={styles.sub}>{formatDay(post.meeting_date)} 회의</Text>
        ) : null}
      </View>

      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{post.title}</Text>
      <View style={[styles.row, { gap: 8, marginTop: 10, marginBottom: 16 }]}>
        <Avatar id={post.created_by} name={nameOf(post.created_by)} size={28} />
        <Text style={styles.sub}>
          {nameOf(post.created_by)} · {postDate(post.created_at)} {formatTime(post.created_at)}
          {edited ? ' (수정됨)' : ''}
        </Text>
      </View>

      <Card>
        <Text style={{ fontSize: 16, lineHeight: 26, color: colors.text }} selectable>
          {post.content || '(내용 없음)'}
        </Text>
        {links.length > 0 && (
          <View style={{ marginTop: 12, gap: 6 }}>
            {links.map((url) => (
              <Pressable key={url} onPress={() => Linking.openURL(url)} style={[styles.row, { gap: 6 }]}>
                <Ionicons name="link" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                  {url}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Card>
      {post.event_id && (
        <Button
          title="캘린더에서 일정 보기"
          icon="calendar-outline"
          variant="secondary"
          small
          onPress={() => router.push({ pathname: '/team/[id]/event', params: { id: teamId, eventId: post.event_id! } })}
          style={{ marginBottom: 8 }}
        />
      )}

      <SectionTitle>
        👀 읽음 {readIds.size}/{members.length}
      </SectionTitle>
      <Card style={{ paddingVertical: 8 }}>
        {members.map((m) => {
          const read = readIds.has(m.user_id);
          const at = readAt.get(m.user_id);
          return (
            <View key={m.user_id} style={[styles.row, { gap: 10, paddingVertical: 6, opacity: read ? 1 : 0.45 }]}>
              <Avatar id={m.user_id} name={nameOf(m.user_id)} size={26} />
              <Text style={{ flex: 1, color: colors.text }}>
                {nameOf(m.user_id)}
                {m.user_id === post.created_by ? <Text style={styles.muted}> (글쓴이)</Text> : null}
              </Text>
              <Text style={{ color: read ? colors.success : colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                {read ? (at ? `읽음 · ${formatTime(at)}` : '읽음') : '안 읽음'}
              </Text>
            </View>
          );
        })}
      </Card>

      <ActionSheet visible={menuOpen} title="글 관리" actions={actions} onClose={() => setMenuOpen(false)} />
    </ScrollView>
  );
}
