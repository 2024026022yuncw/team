import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Card, Chip, EmptyState, Fab, Loading, styles } from '@/components/ui';
import { listPostReads, listPosts } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { formatDay } from '@/lib/date';
import { useAsync, useRealtime } from '@/lib/hooks';
import { useTeam } from '@/lib/team-context';
import { colors } from '@/lib/theme';
import type { PostKind, PostRead, TeamPost } from '@/lib/types';

export const KIND_META: Record<PostKind, { label: string; emoji: string; color: string; bg: string }> = {
  notice: { label: '공지', emoji: '📢', color: '#B45309', bg: '#FEF3C7' },
  minutes: { label: '회의록', emoji: '📝', color: colors.primary, bg: colors.primarySoft },
};

/** 2026-11-16T... → "11월 16일 (월)" */
export function postDate(iso: string) {
  const d = new Date(iso);
  return formatDay(d);
}

export function NoticesTab() {
  const router = useRouter();
  const userId = useUserId();
  const { teamId, members, nameOf } = useTeam();
  const [filter, setFilter] = useState<'all' | PostKind>('all');

  const { data, loading, reload } = useAsync<{ posts: TeamPost[]; reads: PostRead[] }>(
    async () => {
      const posts = await listPosts(teamId);
      const reads = await listPostReads(posts.map((p) => p.id));
      return { posts, reads };
    },
    [teamId],
    { posts: [], reads: [] },
  );
  useRealtime(
    `posts-${teamId}`,
    [{ table: 'team_posts', filter: `team_id=eq.${teamId}` }, { table: 'post_reads' }],
    reload,
  );

  const readers = new Map<string, Set<string>>();
  for (const r of data.reads) {
    if (!readers.has(r.post_id)) readers.set(r.post_id, new Set());
    readers.get(r.post_id)!.add(r.user_id);
  }
  const visible = filter === 'all' ? data.posts : data.posts.filter((p) => p.kind === filter);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="전체" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="📢 공지" active={filter === 'notice'} onPress={() => setFilter('notice')} />
          <Chip label="📝 회의록" active={filter === 'minutes'} onPress={() => setFilter('minutes')} />
        </View>

        {loading ? (
          <Loading />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="megaphone-outline"
            title={filter === 'minutes' ? '회의록이 없어요' : '아직 글이 없어요'}
            hint="+ 버튼으로 공지나 회의록을 올려 팀원들과 공유하세요."
          />
        ) : (
          visible.map((p) => {
            const meta = KIND_META[p.kind];
            const readSet = readers.get(p.id) ?? new Set<string>();
            // 글쓴이는 자동으로 읽은 것으로 침
            const readCount = new Set([...readSet, ...(p.created_by ? [p.created_by] : [])]).size;
            const unread = !readSet.has(userId) && p.created_by !== userId;
            return (
              <Card
                key={p.id}
                onPress={() => router.push({ pathname: '/team/[id]/post/[postId]', params: { id: teamId, postId: p.id } })}
                style={p.pinned ? { borderColor: meta.color, borderWidth: 1.5 } : undefined}
              >
                <View style={[styles.row, { gap: 6, marginBottom: 6 }]}>
                  {p.pinned && <Ionicons name="pin" size={14} color={meta.color} />}
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: meta.bg }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: meta.color }}>
                      {meta.emoji} {meta.label}
                    </Text>
                  </View>
                  {p.kind === 'minutes' && p.meeting_date ? (
                    <Text style={styles.muted}>{formatDay(p.meeting_date)} 회의</Text>
                  ) : null}
                  {unread && (
                    <View style={{ backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 'auto' }}>
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>N</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.title, unread && { fontWeight: '800' }]} numberOfLines={1}>
                  {p.title}
                </Text>
                {p.content ? (
                  <Text style={[styles.sub, { marginTop: 4 }]} numberOfLines={2}>
                    {p.content}
                  </Text>
                ) : null}
                <View style={[styles.row, { justifyContent: 'space-between', marginTop: 8 }]}>
                  <Text style={styles.muted}>
                    {nameOf(p.created_by)} · {postDate(p.created_at)}
                  </Text>
                  <Text style={styles.muted}>
                    👀 {readCount}/{members.length}명 읽음
                  </Text>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
      <Fab onPress={() => router.push({ pathname: '/team/[id]/post-edit', params: { id: teamId } })} />
    </View>
  );
}
