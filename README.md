# Twinkle Image

[English](README.md) | [简体中文](README_ZH_CN.md)

Twinkle Image is a self-hosted AI image creation workspace derived from Nova Image Studio. It combines image generation, conversational agents, UI slicing, web recreation, GIF creation, prompt management, and an infinite canvas in a Next.js and Node.js application.

## Shared Product Design

All UI/UX, public landing-page, workspace, responsive, and light/dark theme changes follow the shared Anthropic-inspired product design skill documented in `AGENTS.md`. The public homepage is `/` and uses Simplified Chinese by default; the functional image workspace remains available at `/studio`.

> [!IMPORTANT]
> This repository is an independent community fork of [Nova Image Studio](https://github.com/tianjiangqiji/nova-image-studio). It is not an official Nova Image Studio release and is not endorsed by the upstream maintainer. Report fork-specific issues to the [Twinkle Image repository](https://github.com/bendangmi/Twinkle-Image/issues).

## Release Baseline

| Item | Value |
| --- | --- |
| Fork version | `3.1.11` |
| Maintained branch | `main` |
| Fork repository | `https://github.com/bendangmi/Twinkle-Image.git` |
| Upstream repository | `https://github.com/tianjiangqiji/nova-image-studio.git` |
| License | GNU AGPL v3.0 |

## Fork-Specific Changes

This fork currently maintains the following changes on top of Nova Image Studio:

- Twinkle Image branding and a curated default model registry.
- Optional Twinkle Model API configuration and model discovery.
- Exact custom image dimensions where supported by the selected model.
- Improved model-registry refresh behavior across image and GIF workflows.
- GIF model-selection fixes and IME-safe keyboard shortcuts.
- Docker image packaging, offline deployment resources, and Windows local-start scripts.

Upstream features and fork contributions should remain distinguishable in release notes and copyright history.

## Main Workspaces

| Workspace | Purpose |
| --- | --- |
| Text to image | Generate one or more images from text prompts. |
| Image to image | Edit, transform, or stylize uploaded reference images. |
| Agent | Use multi-turn planning, vision, search, and model tools for assisted creation. |
| UI design | Slice a UI image into assets and recreate it as a previewable web project; wide screens only. |
| Reverse prompt | Stream a prompt description from an uploaded image. |
| GIF generation | Generate frames, compose grids, and encode GIFs in the browser. |
| Infinite canvas | Organize generated and imported assets spatially. |

The exact features available depend on the configured model protocol and capability profile. Mask-based edits require an OpenAI-compatible `/v1/images/edits` implementation; not every provider supports that API.

## Model and Task System

- Image and text models have independent protocol, display name, model ID, API key, base URL, and capability settings.
- Text tools support OpenAI Responses, OpenAI Chat Completions, Anthropic Messages, and Google Gemini-compatible protocols.
- Tasks are queued in the Node.js backend and reported through WebSocket, with HTTP polling as a connection fallback.
- Task metadata is stored in SQLite and generated media is stored on the local filesystem by default.
- Browser workspaces and history use IndexedDB/local storage and can be exported through the built-in backup workflow.

Provider compatibility is not guaranteed merely because a protocol name matches. Test each model with non-sensitive data before production use.

## Architecture

```text
Browser
  └── Next.js 16 / React 19 frontend
        └── Node.js API and task queue
              ├── SQLite task database
              ├── Local generated-media directory
              ├── WebSocket status updates
              └── User-configured model providers
```

Key technologies include TypeScript, Next.js, React, Zustand, Tailwind CSS, Vitest, Node.js, `better-sqlite3`, Sharp, WebSocket, and Docker.

## Repository Layout

```text
.
├── frontend/             Next.js web application
├── backend/              API server, queue, SQLite, and media storage
├── deploy/               Offline Docker deployment bundle
├── scripts/              Packaging and local-start helpers
├── docs/ and doc/        Guides and screenshots
├── Dockerfile            Production image
├── docker-compose.yml    Root deployment profile
└── 本地启动与镜像打包教程.md  Local development and image packaging guide
```

## Local Development

### Requirements

- Node.js compatible with Next.js 16
- npm
- Native build prerequisites required by `better-sqlite3` and Sharp on the host platform

Install all workspaces:

```bash
npm run install:all
```

Prepare the backend environment:

```bash
cp backend/.env.example backend/.env
```

Use local paths such as `./data/nova-tasks.sqlite` and `./data/nova-images` when the backend working directory is `backend/`. Never commit the resulting `.env`.

Start the frontend and backend separately:

```bash
npm run dev:frontend
npm run dev:backend
```

Start only the frontend development server from the repository root. Additional Next.js CLI options are forwarded, so the host and port can be overridden:

```bash
npm run dev -- --hostname 127.0.0.1 --port 46311
```

For the repository's single-process production-style local mode, run `npm run build` followed by `npm start`.

See [本地启动与镜像打包教程.md](本地启动与镜像打包教程.md) for Windows helpers, ports, and troubleshooting.

## Docker Deployment

The root compose profile expects a locally available `twinkle-image:3.1.11` image and exposes port `46311` by default.

```bash
docker build -t twinkle-image:3.1.11 .
mkdir -p data
docker compose up -d
docker compose ps
docker compose logs -f twinkle-image
```

Before startup, review `.env`, `blacklist.json`, and `prompts.json`. Replace the example prompt-gallery password and any other sample values. The root profile mounts local data from `./data`; back up the SQLite database and generated media together.

For offline image export, checksums, named volumes, updates, and rollback, follow [deploy/DEPLOY.md](deploy/DEPLOY.md). Do not claim a deployment is production-ready until backups, health checks, HTTPS, rate limiting, provider connectivity, and restore procedures have been tested in the target environment.

## Configuration Notes

Important backend settings are documented in `backend/.env.example`, including:

- `NOVA_TASK_DB` and `NOVA_IMAGE_DIR` for persistent data.
- `NOVA_TASK_CONCURRENCY`, queue limits, task TTL, and request limits.
- `PROMPT_GALLERY_MODE` and `PROMPT_GALLERY_PASSWORD`.

Model API keys are highly sensitive. If users enter provider credentials in the browser, explain where those credentials are stored and transmitted, require HTTPS, and review the browser backup/export behavior before offering the service to third parties.

## Quality Checks

Run focused checks before submitting changes:

```bash
npm run lint
npm run test:run
npm run build
```

The backend also provides Node's test runner through `npm test` from `backend/`.

## Upstream Synchronization

Expected remotes:

```text
origin    https://github.com/bendangmi/Twinkle-Image.git
upstream  https://github.com/tianjiangqiji/nova-image-studio.git
```

Merge upstream changes on a dedicated branch. Preserve upstream history, review conflicts in model definitions, storage formats, task handling, and deployment files, then rerun frontend and backend tests. Never push fork commits to `upstream`.

## Security and Responsible Use

- Never commit API keys, `.env` files, user exports, SQLite databases, generated private media, or logs.
- Keep the service behind HTTPS and an authenticated/restricted network boundary when it contains private model credentials.
- Configure queue and request limits at both the application and reverse-proxy layers.
- Review generated content for applicable law, provider policy, privacy, copyright, publicity, and trademark rights.
- The maintainers do not provide model services, quotas, or warranties merely by publishing this source code.

## Contributing

Open fork-specific pull requests against this repository. Keep changes focused, add regression coverage, document storage or configuration migrations, and include screenshots for visible UI changes. Upstream-only defects should be reproduced against Nova Image Studio before being reported upstream.

## Copyright, Attribution, and License

Twinkle Image is derived from [Nova Image Studio](https://github.com/tianjiangqiji/nova-image-studio). Upstream source and history remain attributable to their original authors; fork modifications are attributable to their respective contributors.

The repository is distributed under the [GNU Affero General Public License v3.0](LICENSE). If you modify the covered software and make it available to users over a network, review AGPL section 13 and provide the corresponding source as required. Preserve applicable copyright, license, attribution, and modification notices. Third-party dependencies and integrated projects remain subject to their own licenses.

Additional acknowledgements inherited from the project include [infinite-canvas](https://github.com/basketikun/infinite-canvas), [image-to-slice](https://github.com/50kg/image-to-slice), and [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs). Verify and preserve their license notices when redistributing affected code.

Project names and logos may be protected separately from source-code copyright. The AGPL does not grant trademark rights or imply upstream endorsement. This section is informational and is not legal advice.
