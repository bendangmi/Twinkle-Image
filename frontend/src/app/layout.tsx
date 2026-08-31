import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ServiceWorkerManager } from "@/components/ServiceWorkerManager";
import "./globals.css";

export const metadata: Metadata = {
  title: "Twinkle Image - AI 视觉工作台",
  description: "Twinkle Image AI 图像创作与素材工作台",
  icons: {
    icon: [
      { url: '/brand-mark-64.png?v=9', sizes: '64x64', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/brand-mark-64.png?v=9',
    apple: '/icon-192.png',
  },
  manifest: '/manifest.json',
  other: {
    'theme-color': '#faf9f5',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          id="theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = window.localStorage.getItem('theme');
                  if (theme === 'dark' || theme === 'light') {
                    document.documentElement.setAttribute('data-theme', theme);
                  } else {
                    document.documentElement.removeAttribute('data-theme');
                  }
                } catch {
                  document.documentElement.removeAttribute('data-theme');
                }
              })();
            `,
          }}
        />
        <script
          id="wide-mode-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = window.localStorage.getItem('nova-wide-mode');
                  var wide = stored === 'enabled' && window.innerWidth >= 1280;
                  if (wide) {
                    document.documentElement.setAttribute('data-wide-mode', '');
                  }
                } catch {}
              })();
            `,
          }}
        />
      </head>
      <body
        className="antialiased min-h-screen bg-background text-foreground"
      >
        <TooltipProvider>
          <ServiceWorkerManager />
          <ErrorBoundary>
            <main>
              {children}
            </main>
          </ErrorBoundary>
        </TooltipProvider>
      </body>
    </html>
  );
}
