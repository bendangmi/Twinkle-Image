import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { HeadManagerContext } from 'next/dist/shared/lib/head-manager-context.shared-runtime';
import { describe, expect, it, vi } from 'vitest';
import RootLayout from '../layout';

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/ServiceWorkerManager', () => ({
  ServiceWorkerManager: () => null,
}));

describe('RootLayout hydration', () => {
  it('ignores an extension inspector injected into the head before hydration', async () => {
    const originalHead = document.head.innerHTML;
    const originalBody = document.body.innerHTML;
    const originalBodyClass = document.body.className;
    const originalLang = document.documentElement.lang;
    const tree = (
      <HeadManagerContext.Provider value={{ appDir: true }}>
        <RootLayout><div>Studio content</div></RootLayout>
      </HeadManagerContext.Provider>
    );
    const parsed = new DOMParser().parseFromString(renderToString(tree), 'text/html');
    document.head.innerHTML = parsed.head.innerHTML;
    document.body.innerHTML = parsed.body.innerHTML;
    document.body.className = parsed.body.className;
    document.documentElement.lang = 'zh-CN';

    const inspector = document.createElement('script');
    inspector.type = 'text/javascript';
    inspector.src = 'chrome-extension://dbjbempljhcmhlfpfacalomonjpalpko/scripts/inspector.js';
    document.head.insertBefore(inspector, document.head.querySelectorAll('script')[1] ?? null);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onRecoverableError = vi.fn();
    let root: Root | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(document, tree, { onRecoverableError });
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(document.querySelector('main')?.textContent).toBe('Studio content');
      expect(document.head.contains(inspector)).toBe(true);
    } finally {
      await act(async () => root?.unmount());
      consoleError.mockRestore();
      document.head.innerHTML = originalHead;
      document.body.innerHTML = originalBody;
      document.body.className = originalBodyClass;
      document.documentElement.lang = originalLang;
    }
  });
});
