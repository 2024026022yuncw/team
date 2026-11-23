import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { styles } from '@/components/ui';
import { timeAgo, useNotifications, type AppNotification } from '@/lib/notifications';
import { colors } from '@/lib/theme';

const ICON_BG: Record<string, string> = {
  event: '#DBEAFE',
  post: '#FEF3C7',
  poll: '#EDE9FE',
  task: '#DCFCE7',
  draw: '#FCE7F3',
  member: '#E0F2FE',
  friend: '#FFE4E6',
  invite: '#FFE4E6',
};

/** 알림 한 줄. 누르면 읽음 처리 후 해당 화면으로 */
export function NotificationRow({ n, onRemove }: { n: AppNotification; onRemove?: () => void }) {
  const router = useRouter();
  const { markRead } = useNotifications();
  const unread = !n.read_at;
  // 제목 맨 앞 이모지를 아이콘으로 사용
  const emoji = Array.from(n.title)[0] ?? '🔔';
  const title = n.title.replace(/^\S+\s/, '');

  return (
    <Pressable
      onPress={() => {
        markRead(n.id);
        if (n.link) router.push(n.link as Href);
      }}
      style={({ pressed }) => [
        styles.row,
        {
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: 12,
          backgroundColor: pressed ? '#F3F4F6' : unread ? colors.primarySoft : 'transparent',
        },
      ]}
      accessibilityLabel={`${unread ? '안 읽은 알림, ' : ''}${n.title}, ${n.body}`}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: ICON_BG[n.type] ?? '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: unread ? '700' : '500' }} numberOfLines={1}>
          {title}
        </Text>
        {n.body ? (
          <Text style={styles.sub} numberOfLines={2}>
            {n.body}
          </Text>
        ) : null}
        <Text style={[styles.muted, { marginTop: 2 }]}>{timeAgo(n.created_at)}</Text>
      </View>
      {unread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />}
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel="알림 지우기">
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      )}
    </Pressable>
  );
}

/** 탭 헤더의 종 아이콘 + 안 읽은 수 */
export function NotificationBell() {
  const router = useRouter();
  const { unread } = useNotifications();
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      style={{ marginRight: 8, padding: 4 }}
      accessibilityLabel={unread ? `알림 ${unread}개 안 읽음` : '알림'}
    >
      <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={24} color={colors.text} />
      {unread > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: -2,
            minWidth: 17,
            height: 17,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}
