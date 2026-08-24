# 本地前后端启动教程

本项目支持两种本地运行方式：

- **前后端分离开发模式（推荐）**：前端和后端使用不同端口，支持 HMR 热更新；前端的 `/api/nova/*` 请求会自动代理到后端，WebSocket 也会连接到配置的后端端口。
- **单进程生产模式**：先构建前端，再由后端在同一个端口提供页面和 API，适合验证生产构建。

## 1. 安装依赖

在项目根目录执行：

```powershell
npm install
npm --prefix frontend install
npm --prefix backend install
```

Node.js 建议使用 20 或 22。

首次运行前复制后端配置模板：

```powershell
Copy-Item backend/.env.example backend/.env
```

API Key、模型和 Base URL 在前端“设置”中配置，不要把真实密钥提交到 Git。

## 2. 前后端分离开发模式

### 一键启动（Windows）

推荐使用根目录脚本。默认避开常见的 `3000` 端口：

```powershell
.\scripts\start-local-dev.ps1
```

默认访问地址：

- 前端：<http://localhost:3100>
- 后端：<http://localhost:3101>

脚本会把日志写到根目录的 `local-frontend-3100.*.log` 和 `local-backend-3101.*.log`，并打印两个进程的 PID。

CMD 也可以启动：

```cmd
scripts\start-local-dev.cmd
```

### 手动切换端口

第一个参数是前端端口，第二个参数是后端端口，两个端口必须不同：

```powershell
.\scripts\start-local-dev.ps1 -FrontendPort 3200 -BackendPort 3201
```

或：

```cmd
scripts\start-local-dev.cmd 3200 3201
```

此时访问 <http://localhost:3200>。脚本会自动设置：

```text
PORT=3201                         # 后端监听端口
NEXT_PUBLIC_BACKEND_URL=http://localhost:3201
```

前端端口或后端端口改变后都要重新启动对应进程；尤其是 `NEXT_PUBLIC_BACKEND_URL` 在 Next.js 启动时注入，修改后必须重启前端。

### 手动分别启动

如果不使用脚本，打开两个终端窗口。

终端一：启动后端（示例端口 `3201`）：

```powershell
Set-Location backend
$env:NODE_ENV = 'production'
$env:PORT = '3201'
$env:HOSTNAME = '127.0.0.1'
npm run dev
```

终端二：启动前端（示例端口 `3200`，并指定后端端口）：

```powershell
Set-Location frontend
$env:NODE_ENV = 'development'
$env:NEXT_PUBLIC_BACKEND_URL = 'http://127.0.0.1:3201'
npm run dev -- --hostname 127.0.0.1 --port 3200
```

如果端口被占用，换成任意可用端口，并同时修改前端的 `NEXT_PUBLIC_BACKEND_URL`。前端代理配置位于 `frontend/next.config.ts`。

## 3. 单进程生产模式

该模式需要先构建前端，后端会在同一个端口提供静态页面、API 和 WebSocket：

```powershell
npm --prefix frontend run build
.\scripts\start-local.ps1 -Port 3300
```

访问 <http://localhost:3300>。CMD 用法：

```cmd
npm --prefix frontend run build
scripts\start-local.cmd 3300
```

如果只想启动默认端口，可以直接运行 `npm start`；也可以在 PowerShell 中使用 `PORT=3300` 等环境变量覆盖默认值。

## 4. 停止服务与排查端口

分离脚本会打印进程 PID，停止示例：

```powershell
Stop-Process -Id <前端PID>,<后端PID>
```

查看某端口是否被占用：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3200,3201
```

如果前端页面能打开但请求失败，依次确认：

1. 后端端口确实在监听；
2. `NEXT_PUBLIC_BACKEND_URL` 与后端地址端口一致；
3. 修改端口后已重启前端；
4. 查看根目录下对应的 `local-frontend-*.err.log` 和 `local-backend-*.err.log`。
