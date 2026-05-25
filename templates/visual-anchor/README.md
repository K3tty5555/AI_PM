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

## 注意

- 图片文字只作为视觉表达，不能当作 PRD 字段或最终文案事实源。
- 参考截图若含敏感信息，只在本地项目输出目录使用，不提交到仓库。
- `visual-fingerprint.md` 应抽象视觉规律，不复制真实业务敏感数据。
