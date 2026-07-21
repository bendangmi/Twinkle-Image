type KeyboardCompositionEvent = {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  };
};

/** Whether this key event belongs to an active IME composition session. */
export function isImeComposing(event: KeyboardCompositionEvent): boolean {
  const nativeEvent = event.nativeEvent ?? event;
  return nativeEvent.isComposing === true || nativeEvent.keyCode === 229;
}
