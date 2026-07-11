# 原型视觉锚点包模板

视觉锚点包用于在原型阶段把 Claude Code 与 Codex 串起来：

1. Claude Code 或人工根据 PRD、原型蓝图和参考截图写出 `request.json`。
2. 用户切到 Codex，让 Codex 读取 `request.json`。
3. Codex 生成 `visual-fingerprint.md`、`prompts/`、`images/`、`manifest.json` 和 `audit.md`。
4. 用户切回 Claude Code，Claude Code 读取 `manifest.json` 继续 HTML 原型或 PRD 截图导出。

## 文件

| 文件                       | 用途                                                        |
| ------------------------ | --------------------------------------------------------- |
| `request.template.json`  | 视觉稿生成请求模板，复制到 `{项目}/06-prototype-visual/request.json` 后填写 |
| `manifest.template.json` | 视觉稿生成结果模板，由 Codex 生成后写回                                   |
| `visual-fingerprint.template.md` | 视觉指纹模板，由 Codex 提炼参考图和 PRD 后写回 |
| `audit.template.md` | 视觉锚点包质量审计模板，由 Codex 写回 |

## 推荐项目目录

```text
output/projects/{项目名}/06-prototype-visual/
├── request.json
├── visual-fingerprint.md
├── prompts/
├── images/
├── manifest.json
└── audit.md
```

## 门禁约定

- `gateMode: "soft"`：没有视觉锚点也可以继续，但原型审计提示视觉一致性风险。
- `gateMode: "strict"`：必须先由 Codex 生成视觉锚点包，Claude Code 才继续 HTML 原型。

## 状态检查

Claude Code 和 Codex 都可以用同一个检查命令判断下一步该做什么：

```bash
node scripts/ai-sync/check-visual-anchor-package.js output/projects/{项目名}
```

输出里的 `NEXT_ACTION` 是跨模型交接指令：

| 状态 | 下一步 |
|------|------|
| `no-package` | 继续普通 HTML 原型，并在审计中提示视觉一致性风险 |
| `request-only + soft` | 可继续普通 HTML 原型，也可切到 Codex 生成视觉锚点包 |
| `request-only + strict` | 暂停 HTML，切到 Codex 生成视觉锚点包 |
| `ready` | Claude Code 必须读取 `manifest.json` 和 `visual-fingerprint.md` |
| `partial + soft` | 可继续，但审计要列出缺失页面 |
| `partial + strict` | 暂停，切到 Codex 补齐 |
| `failed` | 降级普通 HTML 原型，并记录失败原因 |

脚本退出码：

- `0`：当前状态可继续。
- `1`：包结构或 JSON 无效，需要修复。
- `2`：强门禁要求先切到 Codex。

## 注意

- 图片文字只作为视觉表达，不能当作 PRD 字段或最终文案事实源。
- 参考截图若含敏感信息，只在本地项目输出目录使用，不提交到仓库。
- `visual-fingerprint.md` 应抽象视觉规律，不复制真实业务敏感数据。
