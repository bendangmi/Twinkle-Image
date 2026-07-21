import { describe, expect, it } from 'vitest';
import { isImeComposing } from '@/lib/keyboard';

describe('isImeComposing', () => {
  it('detects the standard composition flag', () => {
    expect(isImeComposing({ nativeEvent: { isComposing: true } })).toBe(true);
  });

  it('detects the legacy IME key code used by Safari and some input methods', () => {
    expect(isImeComposing({ nativeEvent: { isComposing: false, keyCode: 229 } })).toBe(true);
  });

  it('does not classify a regular Enter key as composition', () => {
    expect(isImeComposing({ nativeEvent: { isComposing: false, keyCode: 13 } })).toBe(false);
  });
});
