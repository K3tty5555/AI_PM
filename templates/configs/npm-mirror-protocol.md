# npm 镜像源检测规范

## 背景

在国内网络环境下，npm 官方源经常超时。执行 npm 相关操作前，需先检测可用的国内镜像源，避免网络问题阻塞开发流程。

## 镜像优先级列表

| 优先级 | 名称 | Registry 地址 |
|--------|------|---------------|
| 1 | 淘宝镜像 | https://registry.npmmirror.com |
| 2 | 华为镜像 | https://repo.huaweicloud.com/repository/npm/ |
| 3 | 腾讯镜像 | https://mirrors.cloud.tencent.com/npm/ |
| 4 | npm 官方 | https://registry.npmjs.org |

## 检测脚本（标准片段）

在执行任何 `npm install` 之前，先运行以下检测：

```bash
#!/bin/bash
detect_npm_registry() {
  local mirrors=(
    "https://registry.npmmirror.com"
    "https://repo.huaweicloud.com/repository/npm/"
    "https://mirrors.cloud.tencent.com/npm/"
    "https://registry.npmjs.org"
  )
  for mirror in "${mirrors[@]}"; do
    if timeout 3 npm ping --registry="$mirror" 2>&1 | grep -q "PONG"; then
      echo "$mirror"
      return 0
    fi
  done
  # 所有源不可用时回退官方源
  echo "https://registry.npmjs.org"
}

NPM_REGISTRY=$(detect_npm_registry)
echo "使用镜像源: $NPM_REGISTRY"
npm install --registry="$NPM_REGISTRY"
```

## 在技能文件中引用

任何技能文件中需要执行 npm 操作时，在操作前加入以下说明：

```markdown
> ⚠️ 执行 npm 操作前，先按 `templates/configs/npm-mirror-protocol.md`
> 中的检测脚本选定可用镜像源，并将 `--registry={检测结果}` 加入 npm 命令。
```

## 适用命令

- `npm install`
- `npm ci`
- `npx`（部分场景适用）

## 不适用场景

- `pnpm`（使用 pnpm 独立镜像配置）
- `bun`（使用 bun 独立镜像配置）

## 镜像源验证方式

```bash
# 快速测试某个镜像是否可用
timeout 3 npm ping --registry=https://registry.npmmirror.com 2>&1 | grep "PONG"
# 有输出表示可用
```
