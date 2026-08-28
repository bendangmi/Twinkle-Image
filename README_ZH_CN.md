# Twinkle Image

[English](README.md) | [简体中文](README_ZH_CN.md)

Twinkle Image 是基于 Nova Image Studio 二次开发的自托管 AI 图片创作工作台，以 Next.js 前端和 Node.js 任务后端整合图片生成与编辑、Agent 辅助创作、UI 复刻、GIF 制作、提示词管理和无限画布。

> [!IMPORTANT]
> 本仓库是 [Nova Image Studio](https://github.com/tianjiangqiji/nova-image-studio) 的独立社区二开，不是 Nova Image Studio 官方版本，也不代表获得上游维护者认可。二开特有问题请提交到 [bendangmi/Twinkle-Image](https://github.com/bendangmi/Twinkle-Image/issues)。

## 版本基线

| 项目 | 当前值 |
| --- | --- |
| 二开版本 | `3.1.11` |
| 维护分支 | `main` |
| 二开仓库 | `https://github.com/bendangmi/Twinkle-Image.git` |
| 上游仓库 | `https://github.com/tianjiangqiji/nova-image-studio.git` |
| 开发地址 | 前端 `127.0.0.1:46311`，后端 `127.0.0.1:46312` |
| 许可证 | GNU AGPL v3.0 |

## 二开边界

### Twinkle 维护的改动

- Twinkle Image 品牌、公共首页与精选默认模型注册表。
- 可选的 Twinkle Model 登录、API Key 选择与模型发现。
- 所选模型支持时的精确自定义图片尺寸。
- 图片与 GIF 工作流共享的模型注册表刷新行为。
- GIF 模型选择修复与兼容输入法的键盘快捷键。
- Docker 打包、离线部署资源与 Windows 本地启动工具。

### 继承自 Nova Image Studio 的能力

- 文生图与图生图工作流。
- 结合文本、视觉、搜索和图片工具的多轮创作 Agent。
- UI 图片切片与可在浏览器预览的网页复刻。
- 从上传图片生成反向提示词。
- GIF 帧生成、网格合成与浏览器端编码。
- 无限画布、提示词广场、任务历史与备份/导出流程。

未明确标记为 Twinkle 二开的能力可能完全来自 Nova Image Studio 或其集成项目。派生版本发布说明必须保留相关署名。

## 工作区与路由

| 入口 | 用途 |
| --- | --- |
| `/` | Twinkle Image 公共首页，默认简体中文 |
| `/studio` | 图片创作主工作区 |
| 文生图 | 根据提示词生成一张或多张图片 |
| 图生图 | 转换、编辑或风格化参考图片 |
| Agent | 规划并执行多轮辅助创作 |
| UI 设计 | 切分 UI 图片并复刻为可预览网页，适合宽屏 |
| 反向提示词 | 从图片流式生成描述或提示词 |
| GIF | 生成帧并编码动画结果 |
| 无限画布 | 空间化组织生成和导入素材 |

功能是否可用取决于所选协议与模型能力配置。遮罩编辑要求供应商实现 OpenAI 兼容的 `/v1/images/edits`；协议名称兼容不代表每个端点和参数都兼容。

## 系统架构

```text
浏览器
  └── Next.js 16 / React 19 前端
        ├── 浏览器工作区状态与 IndexedDB 历史
        └── Node.js API 与任务队列
              ├── SQLite 任务元数据
              ├── 本地生成媒体目录
              ├── WebSocket 状态更新与 HTTP 轮询回退
              └── 用户配置的模型供应商或 Twinkle Model
```

文本模型协议包括 OpenAI Responses、OpenAI Chat Completions、Anthropic Messages 与 Google Gemini 兼容流程；图片协议行为按模型配置。依赖任何供应商前，都应先用非敏感输入进行实际测试。

## 目录结构

```text
.
├── frontend/                    Next.js 应用与 Vitest 测试
├── backend/                     Node.js API、任务队列、SQLite 与媒体存储
├── data/                        创建后的本地持久化数据
├── deploy/                      离线部署包与镜像脚本
├── scripts/                     打包与本地启动工具
├── docs/ and doc/               指南与截图
├── Dockerfile                   生产镜像
├── docker-compose.yml           单服务部署组合
└── 本地启动与镜像打包教程.md       Windows 本地与打包指南
```

不要提交本地 `data/`、生成媒体、SQLite 文件、`.env`、日志、测试输出、`.next/` 或导出的镜像。

## 快速开始

### 环境要求

- Next.js 16 支持的 Node.js 版本
- npm
- 当前系统编译 `better-sqlite3` 与 Sharp 所需的原生构建工具

安装全部工作区：

```bash
npm run install:all
```

创建私有后端环境文件：

```bash
cp backend/.env.example backend/.env
```

PowerShell 可执行 `Copy-Item backend/.env.example backend/.env`。

在两个终端分别启动后端与前端：

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

访问 <http://127.0.0.1:46311>。使用本地示例配置时，后端监听 `46312`。模型凭据与地址通过应用设置管理，不要把个人凭据写入公共镜像。

## 数据与配置

后端示例使用：

- `NOVA_TASK_DB=./data/nova-tasks.sqlite`
- `NOVA_IMAGE_DIR=./data/nova-images`
- 队列大小、并发数、任务 TTL 与按 IP/API Key 限流
- 提示词广场可见性与可选访问密码

SQLite 任务元数据与生成媒体是两类独立资产，必须一起备份。浏览器工作区、参考图与历史还可能存在 IndexedDB/local storage 中，不会包含在仅服务端备份里。

Twinkle Model 集成会在浏览器存储用户会话，并向已配置服务请求模型和 API Key 信息。登录前应审查该服务的运营者、计费、隐私与保留条款。禁止把高权限系统凭据放入浏览器可见配置。

## Docker 部署

根目录 Compose 使用单一镜像，并通过 `./data` 持久化后端数据：

```bash
cp backend/.env.docker.example .env
# 部署前逐项检查配置。
docker compose up -d --build
docker compose ps
docker compose logs -f twinkle-image
```

默认通过 <http://127.0.0.1:46311> 提供服务。停止服务但保留数据：

```bash
docker compose down
```

Compose 还会挂载 `blacklist.json`、`prompts.json` 与 `.env`。必须确认目标主机上的文件权限和备份策略。导出 Docker 镜像不会包含挂载的 `data/` 目录。

公网使用时，应在服务前增加认证或可信网络边界，由持续维护的反向代理终止 HTTPS，限制上传大小与请求速率，并验证 WebSocket 代理。本仓库不承诺默认 Compose 已达到加固后的多租户生产标准。

## 质量检查

提交改动前运行仓库配置的检查：

```bash
npm run lint
npm run test:run
npm --prefix backend test
npm run build
```

可见改动还应检查 `/` 与 `/studio`、浅色与深色模式、桌面与移动布局、键盘焦点、输入法输入、图片上传、任务进度、历史记录和下载/导出。真实供应商测试应使用专用低权限凭据与非敏感内容。

## 同步上游

预期远程配置：

```text
origin    https://github.com/bendangmi/Twinkle-Image.git
upstream  https://github.com/tianjiangqiji/nova-image-studio.git
```

在独立分支合并上游。保留模型定义、存储格式、任务状态转换、Twinkle 集成和部署行为，再运行前后端测试。禁止向 `upstream` 推送二开提交，也不能用旧二开文件整份覆盖上游新文件。

## 安全与负责任使用

- 禁止提交 API Key、账户会话、`.env`、浏览器导出、SQLite 数据库、私有生成媒体或日志。
- 上传、参考图、提示词、输出、任务元数据和供应商响应均可能包含敏感信息。
- 应在应用层与反向代理层同时配置队列和请求限制。
- 生成内容需遵守适用的供应商政策、隐私、版权、肖像、商标与当地法律要求。
- 公开本仓库不附带模型访问、额度、内容审核或任何保证。

## 参与贡献

二开 Pull Request 请提交到本仓库。改动应保持聚焦、补充回归测试、记录存储或配置迁移，并为可见 UI 变化提供截图。复用现有主题与组件系统；UI 开发遵循共享的[产品设计规范](../.agents/skills/anthropic-product-design/SKILL.md)。

## 署名与许可证

Twinkle Image 派生自 [Nova Image Studio](https://github.com/tianjiangqiji/nova-image-studio)。上游源码与历史贡献继续归属原作者，二开修改归各自贡献者。

本仓库按 [GNU Affero General Public License v3.0](LICENSE) 分发。修改后的网络部署可能需要根据 AGPL 第 13 条提供完整对应源码。再分发时必须保留适用的版权、许可证、署名与修改声明。第三方组件继续适用各自许可证。

继承的致谢项目包括 [infinite-canvas](https://github.com/basketikun/infinite-canvas)、[image-to-slice](https://github.com/50kg/image-to-slice) 与 [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs)。再分发相关代码时应核验并保留适用许可证声明。

项目名称、Logo、托管服务、供应商访问与模型权利独立于源码许可证。AGPL 不授予商标权，也不代表上游认可。本节仅用于信息说明，不构成法律意见。
