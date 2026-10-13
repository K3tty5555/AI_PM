# 原型远程发布增强档

## 目标

把已经通过原型静态验收的 `06-prototype/` 发布到 Connect 复用的腾讯云服务器，生成团队可访问的评审链接，并让巡检评论、页面标注和低保真确认结果远程写回。

远程发布不替代本地原型。项目本地目录仍是原型与反馈的事实源，服务器只保存可访问的构建副本和待拉回的反馈快照。

## 访问模式

每次发布必须选择一种模式：

- `public`：页面公开访问；反馈服务按构建策略接收写回，仍受大小和频率限制。
- `token`：页面链接带构建级令牌；原型页面会把令牌转成反馈请求头，反馈服务校验令牌摘要。

令牌只在发布命令完成时显示一次，不写入仓库、不写入 `remote-publish.json`。分享受限链接时，必须把令牌 URL 当作敏感分享材料处理。

## 本地命令

原型命令链通过后执行：

```bash
python3 scripts/aipm_remote_publish.py prepare \
  --prototype "{项目目录}/06-prototype" \
  --project "{项目名}" \
  --spec-hash "{prototype-spec.json 的 SHA-256}" \
  --prototype-hash "{index.html 的 SHA-256}" \
  --base-url "https://{服务器地址}" \
  --access-mode public|token \
  --out "{项目目录}/06-prototype"
```

该命令生成 `remote-publish.json`、不可变 bundle 和 `remote-feedback-policy.json`。清单不含写入令牌。

只查看部署命令，不执行远程写入：

```bash
python3 scripts/aipm_remote_publish.py plan \
  --manifest "{项目目录}/06-prototype/remote-publish.json" \
  --bundle "{项目目录}/06-prototype/remote-publish-{build_id}.tar.gz" \
  --remote-target "{SSH 用户}@{服务器}" \
  --remote-root /srv/aipm
```

评审结束后先生成反馈拉回计划；确认目录后再追加 `--execute`：

```bash
python3 scripts/aipm_remote_publish.py pull \
  --manifest "{项目目录}/06-prototype/remote-publish.json" \
  --remote-target "{SSH 用户}@{服务器}" \
  --out "{项目目录}/06-prototype/feedback" \
  --execute
```

## 服务器契约

服务器初始化由维护者显式执行：

1. Nginx 提供 `/aipm/` 下的不可变静态构建目录；
2. Nginx 将 `/__aipm_feedback__` 和 `/__aipm_health__` 反向代理到 `aipm_remote_feedback.py`；
3. 反馈服务只监听 `127.0.0.1`，反馈策略文件只允许服务账号读取；
4. 发布先写 `.incoming/{build_id}`，校验清单和 SHA-256 后再原子改名；
5. 反馈写入 `{project}/{build_id}/feedback/`，每次提交保留独立快照；
6. AI_PM 通过受保护的拉回命令把快照带回本地 `06-prototype/feedback/`，再按现有 `modification-preview` 流程处理。

发布器不把 SSH 私钥、反馈令牌或服务器密码写入项目文件。首次真实部署前必须完成服务器目录、Nginx、systemd 和防火墙配置，并用健康检查与一次测试反馈验证。

## PRD 接线

原型发布完成后，PRD 增量写入远程评审链接、访问模式、`build_id`、`spec_hash` 和发布时间。链接失败或反馈服务不可用时，PRD 不得标记为“已发布”，只保留本地原型和“待远程发布”状态。
