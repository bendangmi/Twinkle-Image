# Twinkle Image

[English](README.md) | [简体中文](README_ZH_CN.md)

Twinkle Image is a self-hosted AI image-creation workspace derived from Nova Image Studio. It combines image generation and editing, agent-assisted workflows, UI recreation, GIF production, prompt management, and an infinite canvas in a Next.js frontend with a Node.js task backend.

> [!IMPORTANT]
> This repository is an independent community fork of [Nova Image Studio](https://github.com/tianjiangqiji/nova-image-studio). It is not an official Nova Image Studio release and is not endorsed by the upstream maintainer. Report fork-specific issues to [bendangmi/Twinkle-Image](https://github.com/bendangmi/Twinkle-Image/issues).

## Release Baseline

| Item | Current value |
| --- | --- |
| Fork version | `3.3.1` |
| Upstream baseline | `v3.3.0` (`7041092`) |
| Maintained branch | `main` |
| Fork repository | `https://github.com/bendangmi/Twinkle-Image.git` |
| Upstream repository | `https://github.com/tianjiangqiji/nova-image-studio.git` |
| Development URLs | Frontend `127.0.0.1:46311`, backend `127.0.0.1:46312` |
| License | GNU AGPL v3.0 |

## Fork Scope

### Twinkle-maintained changes

- Twinkle Image branding, public landing page, and curated default model registry.
- Optional Twinkle Model sign-in, API-key selection, and model discovery.
- Exact custom image dimensions when supported by the selected model.
- Model-registry refresh behavior shared across image and GIF workflows.
- GIF model-selection fixes and IME-safe keyboard shortcuts.
- Docker packaging, offline deployment resources, and Windows local-start helpers.

### Inherited Nova Image Studio capabilities

- Text-to-image and image-to-image workflows.
- Multi-turn creation agent with text, vision, search, and image tools.
- UI image slicing and browser-previewable web recreation.
- Reverse-prompt generation from uploaded images.
- GIF frame generation, grid composition, and browser-side encoding.
- Infinite canvas, prompt gallery, task history, and backup/export workflows.

Features not identified as Twinkle-specific may originate entirely from Nova Image Studio or its integrated projects. Keep that attribution in derivative release notes.

## Workspaces and Routes

| Entry | Purpose |
| --- | --- |
| `/` | Public Twinkle Image landing page; Simplified Chinese by default |
| `/studio` | Main image-creation workspace |
| Text to image | Generate one or more images from prompts |
| Image to image | Transform, edit, or stylize references |
| Agent | Plan and execute assisted multi-turn creation |
| UI design | Slice a UI image and recreate a previewable web project; wide-screen workflow |
| Reverse prompt | Produce a streamed description or prompt from an image |
| GIF | Generate frames and encode an animated result |
| Infinite canvas | Arrange generated and imported assets spatially |

Availability depends on the selected protocol and model capability profile. Mask-based editing requires an OpenAI-compatible `/v1/images/edits` implementation; a compatible protocol name alone does not guarantee that every endpoint or parameter is supported.

## Architecture

```text
Browser
  └── Next.js 16 / React 19 frontend
        ├── browser workspace state and IndexedDB history
        └── Node.js API and task queue
              ├── SQLite task metadata
              ├── local generated-media directory
              ├── WebSocket status updates with HTTP polling fallback
              └── user-configured model providers or Twinkle Model
```

Text model protocols include OpenAI Responses, OpenAI Chat Completions, Anthropic Messages, and Google Gemini-compatible flows. Image protocol behavior is configured per model. Test each provider with non-sensitive inputs before relying on it.

## Repository Layout

```text
.
├── frontend/                    Next.js application and Vitest tests
├── backend/                     Node.js API, task queue, SQLite, and media storage
├── data/                        Local persistent data when created
├── deploy/                      Offline deployment bundle and image scripts
├── scripts/                     Packaging and local-start helpers
├── docs/                        Guides and screenshots
├── Dockerfile                   Production image
├── docker-compose.yml           Single-service deployment profile
└── 本地启动与镜像打包教程.md       Windows-oriented local and packaging guide
```

Do not commit local `data/`, generated media, SQLite files, `.env` files, logs, test output, `.next/`, or exported images.

## Quick Start

### Requirements

- A Node.js version supported by Next.js 16
- npm
- Native build prerequisites required by `better-sqlite3` and Sharp on the host platform

Install all workspaces:

```bash
npm run install:all
```

Create a private backend environment file:

```bash
cp backend/.env.example backend/.env
```

PowerShell users can run `Copy-Item backend/.env.example backend/.env`.

Start the backend and frontend in separate terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

Open <http://127.0.0.1:46311>. The backend listens on `46312` with the sample local configuration. Model credentials and endpoints are configured through the application settings; do not bake personal credentials into a public image.

## Data and Configuration

The backend sample uses:

- `NOVA_TASK_DB=./data/nova-tasks.sqlite`
- `NOVA_IMAGE_DIR=./data/nova-images`
- queue size, concurrency, task TTL, and per-IP/per-key rate limits
- prompt-gallery visibility and optional access password

SQLite task metadata and generated media are separate assets and must be backed up together. Browser-side workspaces, references, and history may also exist in IndexedDB/local storage and are not included in a server-only backup.

Twinkle Model integration stores a user session in browser storage and requests model/API-key information from the configured service. Review that service's operator, billing, privacy, and retention terms before signing in. Never put a privileged system credential into browser-visible configuration.

## Docker Deployment

The root compose profile runs one image and persists backend data through `./data`:

```bash
cp backend/.env.docker.example .env
# Review every value before deployment.
docker compose up -d --build
docker compose ps
docker compose logs -f twinkle-image
```

The service is exposed at <http://127.0.0.1:46311> by default. Stop without deleting data:

```bash
docker compose down
```

The compose file also mounts `blacklist.json`, `prompts.json`, and `.env`. Confirm file permissions and backup policy on the target host. Exporting the Docker image does not include the mounted `data/` directory.

For internet-facing use, put the service behind authentication or a trusted network boundary, terminate HTTPS at a maintained reverse proxy, restrict upload sizes and request rates, and verify WebSocket proxying. This repository does not claim that the default compose profile is a hardened multi-tenant service.

## Quality Checks

Run the configured checks before submitting changes:

```bash
npm run lint
npm run test:run
npm --prefix backend test
npm run build
```

For visible changes, verify `/` and `/studio`, light and dark modes, desktop and mobile layouts, keyboard focus, IME input, image upload, task progress, history, and download/export behavior. Real provider tests should use dedicated low-privilege credentials and non-sensitive content.

## Upstream Synchronization

Expected remotes:

```text
origin    https://github.com/bendangmi/Twinkle-Image.git
upstream  https://github.com/tianjiangqiji/nova-image-studio.git
```

Merge upstream changes on a dedicated branch. Preserve model definitions, storage formats, task state transitions, Twinkle integration, and deployment behavior; then rerun frontend and backend tests. Never push fork commits to `upstream` or replace new upstream files wholesale with older fork copies.

## Security and Responsible Use

- Never commit API keys, account sessions, `.env` files, browser exports, SQLite databases, generated private media, or logs.
- Treat uploads, references, prompts, outputs, task metadata, and provider responses as potentially sensitive.
- Configure queue and request limits at the application and reverse-proxy layers.
- Review generated content for applicable provider policy, privacy, copyright, publicity, trademark, and local legal requirements.
- Publishing this repository does not provide model access, quotas, content review, or warranties.

## Contributing

Open fork-specific pull requests in this repository. Keep changes focused, add regression coverage, document storage or configuration migrations, and provide screenshots for visible UI changes. Reuse the existing theme and component system; UI work follows the shared [product design guidance](../.agents/skills/anthropic-product-design/SKILL.md).

## Attribution and License

Twinkle Image is derived from [Nova Image Studio](https://github.com/tianjiangqiji/nova-image-studio). Upstream source and history remain attributable to their original authors; fork modifications remain attributable to their contributors.

The repository is distributed under the [GNU Affero General Public License v3.0](LICENSE). Modified network deployments may be required to offer complete corresponding source under AGPL section 13. Preserve applicable copyright, license, attribution, and modification notices. Third-party components remain under their own licenses.

Inherited acknowledgements include [infinite-canvas](https://github.com/basketikun/infinite-canvas), [image-to-slice](https://github.com/50kg/image-to-slice), and [imagetracerjs](https://github.com/jankovicsandras/imagetracerjs). Verify and preserve their applicable license notices when redistributing affected code.

Project names, logos, hosted services, provider access, and model rights are separate from source-code licensing. The AGPL grants no trademark rights and does not imply upstream endorsement. This section is informational and is not legal advice.
