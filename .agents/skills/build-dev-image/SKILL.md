---
name: 构建开发镜像
description: 触发 GitHub Actions 从 personal 分支构建并推送 Docker Hub 开发镜像（:dev），盯完进度并验证结果
disable-model-invocation: true
---

## 流程

前置：`gh auth status` 报已登录。未登录则停下，把 `gh auth login` 留给用户执行。

1. 触发构建。构建源固定为 personal 分支：

   ```bash
   gh workflow run develop-image.yml -R WallBreakerNO4/sharkord --ref personal
   ```

2. 等 5 秒取回 run id，然后转入后台盯梢（全程约 10~20 分钟）：

   ```bash
   gh run list -R WallBreakerNO4/sharkord --workflow=develop-image.yml --limit 1
   gh run watch <run-id> -R WallBreakerNO4/sharkord --exit-status --interval 30
   ```

3. 完成判定，两条同时满足才算建成：

   - `gh run view <run-id> -R WallBreakerNO4/sharkord --json conclusion` 输出 `success`
   - `gh run view <run-id> -R WallBreakerNO4/sharkord --log | grep containerimage.digest` 命中至少一行

   annotation 里的缓存服务失败与 Node 弃用警告不影响判定。

4. 汇报：镜像位于 `<Docker Hub 用户名>/sharkord:dev`。用户名存在 GitHub secrets 中不可读，
   从日志里 docker/build-push-action 的 JSON 输出（含 name 与 digest 字段）找出镜像名，
   或请用户在 hub.docker.com 自查。附上本次构建的 revision 提交。

## 失败分支

conclusion 为 failure 时：收集 `gh run view <run-id> -R WallBreakerNO4/sharkord --log-failed` 的
关键行，连同失败 job 名一起报告，等用户决定是否重跑。GitHub 侧瞬时故障
（缓存服务 5xx、mediasoup worker 下载超时）先重跑一次再下结论。
