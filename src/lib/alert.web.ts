// 웹에서는 react-native-web 의 Alert 가 동작하지 않으므로 브라우저 alert/confirm 으로 대체
type AlertButton = { text?: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };

function alert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');

  if (!buttons || buttons.length === 0) {
    window.alert(text);
    return;
  }
  if (actions.length <= 1 && buttons.length === 1) {
    window.alert(text);
    buttons[0].onPress?.();
    return;
  }
  // 선택지가 여러 개면 하나씩 물어봄 (예: 투표 마감 / 삭제)
  for (const b of actions) {
    const question = actions.length === 1 ? text : `${title}\n\n${b.text} 할까요?`;
    if (window.confirm(question)) {
      b.onPress?.();
      return;
    }
  }
  buttons.find((b) => b.style === 'cancel')?.onPress?.();
}

export const Alert = { alert };
