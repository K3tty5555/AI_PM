# Codex 待合并 Memory

Codex 产生的新经验先写到本目录，不直接写入 Claude 项目级 memory 主源。

建议文件命名：

```text
codex-YYYYMMDD-{short-topic}.md
```

建议格式：

```markdown
---
name: 简短标题
type: feedback | project | reference | user
source: codex
created: YYYY-MM-DD
target: $CLAUDE_MEMORY_DIR/{suggested_file}.md
---

## 事实

## Why

## How to apply
```

合并规则：

- 用户确认后再写入 Claude memory。
- 不写入 API Key、token、cookie、私钥、密码。
- 若只是临时过程信息，不进入 memory。
