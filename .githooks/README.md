# .githooks

本仓库自带的 git 钩子（受版本管理，可审、可分享）。默认不生效，每个 clone 需一次性启用：

```bash
git config core.hooksPath .githooks
```

启用后 `git commit` 会自动跑 `pre-commit` 里的检查。各检查都做了**路径过滤**——只在本次提交动了相关文件时才跑，平时提交零干扰。

| 钩子 | 触发条件 | 跑什么 |
|------|---------|--------|
| `pre-commit` | 暂存了 `scripts/check-prd-skeleton.sh` 或 `tests/fixtures/prd-doctype/` | doctype 骨架检测 fixture 回归（`scripts/check-prd-skeleton.sh`） |

> 应急跳过（不建议，仓库规范要求别滥用）：`git commit --no-verify`。
