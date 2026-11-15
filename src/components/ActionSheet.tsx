import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/lib/theme';
import type { IconName } from './ui';

export type SheetAction = {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
};

/** 화면 아래에서 올라오는 선택 메뉴 (웹·앱 공통) */
export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          {title ? <Text style={s.title}>{title}</Text> : null}
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => [s.action, pressed && { backgroundColor: '#F3F4F6' }]}
            >
              {a.icon ? (
                <Ionicons name={a.icon} size={20} color={a.destructive ? colors.danger : colors.primary} />
              ) : null}
              <Text style={[s.actionText, a.destructive && { color: colors.danger }]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={[s.action, { justifyContent: 'center', marginTop: 4 }]}>
            <Text style={[s.actionText, { color: colors.textSub }]}>닫기</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 16,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSub, marginTop: 4, marginBottom: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 8 },
  actionText: { fontSize: 16, color: colors.text, fontWeight: '500' },
});
