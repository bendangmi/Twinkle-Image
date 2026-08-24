'use client';

import { useCallback, useEffect, useState } from 'react';

export const WIDE_MODE_STORAGE_KEY = 'nova-wide-mode';

// 宽屏（侧栏）布局基于 xl 断点设计。视口窄于该宽度时，侧栏会与顶部 Header 重复、
// 纵向 Tab 布局错位，因此宽屏必须自动关闭；重新变宽不会自动开启。
export const WIDE_MODE_MIN_WIDTH = 1280;

type StoredWideMode = 'enabled' | 'disabled';

function readStoredWideMode(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return localStorage.getItem(WIDE_MODE_STORAGE_KEY) === 'enabled';
  } catch {
    return false;
  }
}

function writeStoredWideMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    const value: StoredWideMode = enabled ? 'enabled' : 'disabled';
    localStorage.setItem(WIDE_MODE_STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable in hardened/private browser modes.
  }
}

function viewportAllowsWide(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= WIDE_MODE_MIN_WIDTH;
}

/** 将宽度模式状态同步到 <html> 属性，确保 CSS 选择器始终有效 */
function syncHtmlAttribute(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  if (enabled) {
    document.documentElement.setAttribute('data-wide-mode', '');
  } else {
    document.documentElement.removeAttribute('data-wide-mode');
  }
}

export function useWideMode() {
  // 初始渲染必须与静态导出 HTML 一致（wideMode=false），否则 wide-mode-init 内联脚本
  // 设置的 html[data-wide-mode] 会让客户端首屏读到 true，与构建期 HTML 不符而触发
  // React #418 文本水合错误。真实值在挂载后的 effect 中读取。
  const [wideMode, setWideModeState] = useState(false);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      const stored = readStoredWideMode();
      const allowed = viewportAllowsWide();
      setWideModeState(stored && allowed);
      if (stored && !allowed) {
        // 在窄视口下加载时同样自动关闭，避免出现重复 Header 的坏状态。
        writeStoredWideMode(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 视口收窄到阈值以下时自动关闭宽屏；只做单向关闭，绝不自动开启。
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(`(max-width: ${WIDE_MODE_MIN_WIDTH - 1}px)`);

    const enforce = (isNarrow: boolean) => {
      if (!isNarrow) return;
      setWideModeState(current => {
        if (!current) return current;
        writeStoredWideMode(false);
        return false;
      });
    };

    enforce(mql.matches);
    const listener = (event: MediaQueryListEvent) => enforce(event.matches);
    mql.addEventListener('change', listener);

    return () => mql.removeEventListener('change', listener);
  }, []);

  // 将 wideMode 状态同步到 <html> 属性，使 CSS 选择器 html[data-wide-mode] 始终有效
  useEffect(() => {
    syncHtmlAttribute(wideMode);
  }, [wideMode]);

  const setWideMode = useCallback((enabled: boolean) => {
    if (enabled && !viewportAllowsWide()) return;
    setWideModeState(enabled);
    writeStoredWideMode(enabled);
  }, []);

  const toggleWideMode = useCallback(() => {
    setWideModeState(current => {
      const next = !current;
      if (next && !viewportAllowsWide()) return current;
      writeStoredWideMode(next);
      return next;
    });
  }, []);

  return {
    wideMode,
    setWideMode,
    toggleWideMode,
  };
}
