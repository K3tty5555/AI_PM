# AI_PM 远程原型服务器初始化

这组文件用于 Connect 已有腾讯云服务器的 AI_PM 原型发布入口。初始化由维护者显式执行，不能由本地 `prepare` 自动改服务器。

需要完成：

1. 创建 `aipm` 用户和 `/srv/aipm`；
2. 将 `aipm_remote_feedback.py`、`aipm_prototype_collab.py` 和 `aipm-remote-install` 放到 `/opt/aipm/` 或 `/usr/local/bin/`；
3. 安装 `aipm-remote-feedback.service` 并启用；
4. 把 `nginx-aipm-locations.conf` include 到现有 HTTPS server；
5. 只放行既有 80/443，反馈服务保持回环监听；
6. 用 `curl /__aipm_health__` 和一次测试反馈验证后，再执行真实发布计划。

首次安装完成后，本地发布流程只需要执行：

```bash
python3 scripts/aipm_remote_publish.py prepare ...
python3 scripts/aipm_remote_publish.py plan ... --policy remote-feedback-policy.json
```

确认计划后，才复制其中的 `ssh` / `rsync` 命令执行。真实发布会把构建目录原子落到 `/srv/aipm/<build_id>`，不会覆盖历史构建。

评审结束后，先只查看反馈拉回计划：

```bash
python3 scripts/aipm_remote_publish.py pull \
  --manifest "{项目目录}/06-prototype/remote-publish.json" \
  --remote-target "{SSH 用户}@{服务器}" \
  --out "{项目目录}/06-prototype/feedback"
```

确认目标目录后再追加 `--execute`。拉回默认使用 `--ignore-existing`，不会覆盖本地已经导入的反馈快照。
