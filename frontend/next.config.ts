import type { NextConfig } from "next";
import path from "node:path";
import fs from "node:fs";
import withPWA from "next-pwa";

const dev = process.env.NODE_ENV !== "production";
const backendUrl = (process.env.NOVA_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "")
  .trim()
  .replace(/\/+$/, "");

// 从根目录 package.json 读取版本号，编译时自动注入
const rootPkgPath = path.join(__dirname, "..", "package.json");
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
const appVersion = rootPkg.version || "0.0.0";

const nextConfig: NextConfig = {
  // 显式声明追踪根目录，避免 Next.js 16 在 monorepo/多 lockfile 场景下产生警告
  outputFileTracingRoot: path.join(__dirname),
  // 仅在生产构建时启用静态导出，开发模式关闭以支持 HMR 热更新
  ...(dev ? {} : { output: "export" }),
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  ...(dev && backendUrl
    ? {
        async rewrites() {
          return [
            {
              source: "/api/nova/:path*",
              destination: `${backendUrl}/api/nova/:path*`,
            },
          ];
        },
      }
    : {}),
  images: {
    unoptimized: true,
  },
  // 编译时自动注入版本号，前端通过 process.env.NEXT_PUBLIC_APP_VERSION 访问
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

export default withPWA({
  dest: "public",
  disable: dev,
  register: true,
  skipWaiting: true,
})(nextConfig);
