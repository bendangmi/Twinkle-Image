# Twinkle Image 离线 Docker 部署

当前镜像版本：`3.1.6`

## 1. 在开发机生成离线镜像

要求 Docker Desktop 已启动。在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\build-image.ps1
```

脚本默认自动递增 `deploy/VERSION` 的补丁版本号，并同步 package、Docker Compose
和部署文档，然后构建镜像、导出 tar 和生成 SHA256 校验文件。默认构建
`linux/amd64`。ARM64 服务器使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\build-image.ps1 -Platform linux/arm64
```

构建失败后重试当前版本，不再次递增版本号：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\build-image.ps1 -NoVersionBump
```

也可以显式指定版本：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\build-image.ps1 -Version 3.1.6
```

脚本会生成：

- `deploy/twinkle-image-3.1.6.tar`
- `deploy/twinkle-image-3.1.6.tar.sha256`

tar 文件体积较大，已被 Git 忽略，不会推送到 GitHub。

## 2. 上传部署文件

将以下内容上传到服务器同一目录，例如 `/opt/twinkle-image`：

```text
twinkle-image-3.1.6.tar
twinkle-image-3.1.6.tar.sha256
docker-compose.yaml
.env
config/blacklist.json
config/prompts.json
```

本地先根据 `.env.example` 创建 `.env`，并务必修改
`PROMPT_GALLERY_PASSWORD`。

## 3. 在服务器校验并导入镜像

```bash
cd /opt/twinkle-image
sha256sum -c twinkle-image-3.1.6.tar.sha256
docker load -i twinkle-image-3.1.6.tar
docker image inspect twinkle-image:3.1.6 --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.version"}}'
```

`docker load` 导入后，Compose 的 `image:` 应填写镜像标签
`twinkle-image:3.1.6`，不是 tar 文件名。

## 4. 启动

```bash
docker compose up -d
docker compose ps
docker compose logs -f --tail=100 twinkle-image
```

默认访问地址：`http://服务器IP:3002`。可在 `.env` 中修改
`TWINKLE_PORT` 后重新执行 `docker compose up -d`。

SQLite 数据库和生成图片保存在 Docker 命名卷
`twinkle-image-data` 中，重建容器不会丢失。

## 5. 更新版本

上传新版本 tar 后执行：

```bash
docker load -i twinkle-image-新版本.tar
```

然后把 `docker-compose.yaml` 中的 `image:` 修改为导入后的新标签，再执行：

```bash
docker compose up -d
docker image prune
```

## 6. 备份和恢复数据

备份：

```bash
docker run --rm -v twinkle-image_twinkle-image-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/twinkle-image-data.tar.gz -C /data .
```

卷的实际名称可用 `docker volume ls` 查看。恢复前先执行
`docker compose down`，再将备份解压回同一个卷。

## 常用命令

```bash
docker compose restart
docker compose down
docker compose logs --tail=200 twinkle-image
docker inspect --format '{{json .State.Health}}' twinkle-image
```
