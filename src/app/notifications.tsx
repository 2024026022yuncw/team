import { Stack } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { NotificationRow } from '@/components/NotificationList';
import { Button, Card, EmptyState, Loading, SectionTitle, styles } from '@/components/ui';
import { useNotifications, type AppNotification } from '@/lib/notifications';

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function NotificationsScreen() {
  const { items, unread, loading, refresh, markAllRead, remove } = useNotifications();
  const today = items.filter((n) => isToday(n.created_at));
  const earlier = items.filter((n) => !isToday(n.created_at));

  const section = (title: string, list: AppNotification[]) =>
    list.length > 0 && (
      <>
        <SectionTitle>{title}</SectionTitle>
        <Card style={{ paddingVertical: 4, paddingHorizontal: 4 }}>
          {list.map((n) => (
            <NotificationRow key={n.id} n={n} onRemove={() => remove(n.id)} />
          ))}
        </Card>
      </>
    );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}>
      <Stack.Screen options={{ title: unread ? `🔔 알림 (${unread})` : '🔔 알림' }} />
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={styles.sub}>팀 일정·공지·투표·할 일·친구·초대 알림을 모아 봐요.</Text>
      </View>
      {unread > 0 && <Button title="모두 읽음" variant="secondary" small onPress={markAllRead} style={{ marginTop: 10, alignSelf: 'flex-start' }} />}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-outline" title="알림이 없어요" hint="팀원이 일정·공지·투표를 올리거나 할 일을 배정하면 여기에 알려드려요." />
      ) : (
        <>
          {section('오늘', today)}
          {section('이전', earlier)}
        </>
      )}
    </ScrollView>
  );
}
