# Twinkle Image

[English](README.md) | [简体中文](README_ZH_CN.md)

Twinkle Image 是基于 Nova Image Studio 二次开发的自托管 AI 图像创作工作台，将图片生成、对话式 Agent、UI 切图、网页复刻、GIF 制作、提示词管理和无限画布整合在一个 Next.js 与 Node.js 应用中。

> [!IMPORTANT]
> 本仓库是 [Nova Image Studio](https://github.com/tianjiangqiji/nova-image-studio) 的独立社区二开，不是上游官方版本，也不代表获得上游维护者认可。二开特有问题请提交到 [Twinkle Image 仓库](https://github.com/bendangmi/Twinkle-Image/issues)。

## 版本基线

| 项目 | 当前值 |
| --- | --- |
| 二开版本 | `3.1.11` |
| 维护分支 | `main` |
| 二开仓库 | `https://github.com/bendangmi/Twinkle-Image.git` |
| 上游仓库 | `https://github.com/tianjiangqiji/nova-image-studio.git` |
| 许可证 | GNU AGPL v3.0 |

## 二开内容

本仓库在 Nova Image Studio 基础上维护以下定制：

- Twinkle Image 品牌与定制默认模型目录。
- 可选的 Twinkle Model API 配置与模型发现。
- 在模型支持时使用精确自定义图片尺寸。
- 图片与 GIF 工作流中的模型目录刷新改进。
- GIF 模型选择修复与输入法组合期间的快捷键保护。
- Docker 镜像打包、离线部署资源与 Windows 本地启动脚本。

发布说明和版权历史应明确区分上游能力与二开贡献。

## 主要工作区

| 工作区 | 用途 |
| --- | --- |
| 文本生图 | 根据文字提示生成一张或多张图片。 |
| 图生图 | 编辑、转换或风格化上传的参考图。 |
| Agent | 通过多轮规划、视觉、搜索和模型工具辅助创作。 |
| UI 设计 | 将 UI 图片拆分为素材并复刻为可预览网页；仅宽屏可用。 |
| 反推提示词 | 从上传图片流式生成提示词描述。 |
| GIF 生成 | 生成多帧、拼合网格并在浏览器编码 GIF。 |
| 无限画布 | 以空间方式组织生成和导入的素材。 |

实际能力取决于所选模型协议和能力档案。带蒙版编辑依赖兼容 OpenAI `/v1/images/edits` 的实现，并非所有供应商都支持。

## 模型与任务系统

- 图片和文字模型分别维护协议、显示名称、模型 ID、API Key、Base URL 与能力设置。
- 文本工具兼容 OpenAI Responses、OpenAI Chat Completions、Anthropic Messages 和 Google Gemini 协议。
- 任务在 Node.js 后端排队处理，通过 WebSocket 推送状态，连接失败时回退到 HTTP 轮询。
- 任务元数据默认存储在 SQLite，生成媒体默认存储在本地文件系统。
- 浏览器工作区与历史记录使用 IndexedDB/localStorage，并可通过内置备份流程导出。

协议名称相同并不代表供应商实现完全兼容；生产使用前应使用非敏感数据逐个验证模型。

## 系统架构

```text
浏览器
  └── Next.js 16 / React 19 前端
        └── Node.js API 与任务队列
              ├── SQLite 任务数据库
              ├── 本地生成媒体目录
              ├── WebSocket 状态推送
              └── 用户配置的模型供应商
```

主要技术包括 TypeScript、Next.js、React、Zustand、Tailwind CSS、Vitest、Node.js、`better-sqlite3`、Sharp、WebSocket 与 Docker。

## 目录结构

```text
.
├── frontend/             Next.js Web 应用
├── backend/              API、队列、SQLite 与媒体存储
├── deploy/               离线 Docker 部署包
├── scripts/              打包与本地启动脚本
├── docs/ 和 doc/         指南与截图
├── Dockerfile            生产镜像
├── docker-compose.yml    根目录部署组合
└── 本地启动与镜像打包教程.md  本地开发与镜像打包指南
```

## 本地开发

### 环境要求

- Next.js 16 支持的 Node.js 版本
- npm
- 当前系统编译 `better-sqlite3` 和 Sharp 所需的原生工具链

安装全部工作区依赖：

```bash
npm run install:all
```

准备后端环境变量：

```bash
cp backend/.env.example backend/.env
```

后端工作目录为 `backend/` 时，应使用 `./data/nova-tasks.sqlite`、`./data/nova-images` 等本地相对路径。生成的 `.env` 禁止提交。

分别启动前后端：

```bash
npm run dev:frontend
npm run dev:backend
```

仅启动前端开发服务器：

```bash
npm run dev
```

Windows 前后端一键启动脚本、端口和排障方式见 [本地启动与镜像打包教程.md](本地启动与镜像打包教程.md)。单进程生产式本地模式请先运行 `npm run build`，再运行 `npm start`。

## Docker 部署

根目录 Compose 需要本地已有 `twinkle-image:3.1.11` 镜像，默认对外端口为 `46311`。

```bash
docker build -t twinkle-image:3.1.11 .
mkdir -p data
docker compose up -d
docker compose ps
docker compose logs -f twinkle-image
```

启动前检查 `.env`、`blacklist.json` 和 `prompts.json`，更换提示词广场示例密码及其他示例值。根目录组合将数据挂载到 `./data`，备份时必须同时保存 SQLite 数据库和生成媒体。

离线镜像导出、校验值、命名卷、更新和回滚流程见 [deploy/DEPLOY.md](deploy/DEPLOY.md)。在目标环境完成备份、健康检查、HTTPS、限流、模型连接与恢复验证前，不应宣称部署已达到生产可用状态。

## 配置说明

`backend/.env.example` 记录了重要后端参数，包括：

- `NOVA_TASK_DB` 与 `NOVA_IMAGE_DIR` 持久化路径。
- `NOVA_TASK_CONCURRENCY`、队列限制、任务 TTL 和请求限制。
- `PROMPT_GALLERY_MODE` 与 `PROMPT_GALLERY_PASSWORD`。

模型 API Key 属于高敏感数据。如果允许用户在浏览器输入供应商凭据，应明确凭据的存储与传输路径，强制使用 HTTPS，并在对第三方提供服务前审查浏览器备份/导出行为。

## 质量检查

提交前执行：

```bash
npm run lint
npm run test:run
npm run build
```

后端还可在 `backend/` 目录通过 `npm test` 运行 Node 测试。

## 同步上游

预期远程配置：

```text
origin    https://github.com/bendangmi/Twinkle-Image.git
upstream  https://github.com/tianjiangqiji/nova-image-studio.git
```

应在独立分支合并上游更新，保留上游历史，重点检查模型定义、存储格式、任务处理和部署文件冲突，并重新运行前后端测试。禁止向 `upstream` 推送二开提交。

## 安全与负责任使用

- 禁止提交 API Key、`.env`、用户导出包、SQLite 数据库、私有生成媒体或日志。
- 服务保存私人模型凭据时，应置于 HTTPS 与认证/受限网络边界之后。
- 应在应用和反向代理两层配置队列与请求限制。
- 生成内容应符合适用法律、供应商政策以及隐私、版权、肖像权和商标要求。
- 发布源码并不代表维护者同时提供模型服务、额度或任何保证。

## 参与贡献

二开 Pull Request 请提交到本仓库。改动应保持聚焦、补充回归测试、记录存储或配置迁移，并为可见 UI 变化提供截图。仅存在于上游的问题应先在 Nova Image Studio 上复现，再决定是否向上游报告。

## 版权、署名与许可证

Twinkle Image 派生自 [Nova Image Studio](https://github.com/tianjiangqiji/nova-image-studio)。上游源码与历史贡献仍归属原作者，二开修改归各自贡献者。

本仓库按 [GNU Affero General Public License v3.0](LICENSE) 分发。如果修改受该许可证覆盖的软件并通过网络向用户提供服务，应审查 AGPL 第 13 条并按要求提供对应源码。再分发时应保留适用的版权、许可证、署名和修改声明；第三方依赖与集成项目继续适用各自许可证。

项目还继承了对 [infinite-canvas](https://github.com/basketikun/infinite-canvas)、[image-to-slice](https://github.com/50kg/image-to-slice) 和 [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs) 的致谢。再分发相关代码时应核对并保留其许可证声明。

项目名称与 Logo 可能受到独立于源码版权的保护。AGPL 不授予商标权，也不代表上游认可。本节仅用于信息说明，不构成法律意见。

## 共享产品设计规范

所有 UI/UX、公开首页、工作台、响应式与浅色/深色主题改动均遵循 `AGENTS.md` 中记录的共享 Anthropic 风格产品设计 Skill。公开首页路径为 `/` 并默认使用简体中文，完整图像工作台保留在 `/studio`。
