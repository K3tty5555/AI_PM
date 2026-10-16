---
name: ai-pm-setup
description: 布置网页、安卓手机和 Windows 软件的操作能力。当用户说「布置操作能力」「连手机」「配 Playwright」「操作 Windows 软件」或 `/ai-pm setup` 时使用。
---

# ai-pm-setup：操作能力布置中心

AI_PM 只负责把现成工具装好、配好、验好。脚本入口是 `python3 .claude/skills/ai-pm-setup/scripts/aipm_setup.py`。

## 安全底线

1. 装之前先问：说明要装什么、安装位置和许可条款，用户明确同意后才传 `--yes`。
2. 需要管理员权限的命令交给用户在「以管理员身份运行」的 PowerShell 中执行。
3. 完成后提醒 AI 能碰到设备上已登录的账号，建议使用测试账号或备用手机。
4. mobile-mcp 的云设备工具已在项目权限中硬拦；安装 App、输入密码、付款、发送或发布仍需按 `live-probe.md` 的「动手前必须当次问」执行。
5. 遥测只说已按官方开关关闭，不声称没有上报。

## 流程

先跑 `status --json` 识别可用端；用户选端后，先说明安装内容再跑 `install --target <端> --yes --json`；写入 `.mcp.json` 后跑 `check --target <端> --json`。新 MCP 需要重开 Claude，再说「继续布置」。之后每次使用能力前跑 `status --quick --target <端> --json`。

## 错误码修法

| 码 | 修法 |
|---|---|
| `OK` | 可用 |
| `NOT_APPLICABLE` | 这台电脑不支持该端 |
| `INVALID_KEY` | 检查登记字段 |
| `CONSENT_REQUIRED` | 先向用户说明并取得同意 |
| `MCP_MISSING` | 用户同意后重跑 install |
| `MCP_CONFIG_INVALID` / `CONFIG_INVALID` | 不覆盖坏文件，修好或删除后重试 |
| `MCP_CONFLICT` | 保留用户手改条目，展示差异后再决定 |
| `MCP_NOT_CONNECTED` / `MCP_NEEDS_APPROVAL` | 检查 `claude mcp list`，必要时在 `/mcp` 启用 |
| `PENDING_RECHECK` | 重开 Claude 后继续自检 |
| `LOCK_BUSY` | 等其他会话结束再重试 |
| `NODE_MISSING` / `NODE_TOO_OLD` | 安装 Node 20+ 后重开终端 |
| `PYTHON_MISSING` / `PYTHON_TOO_OLD` | Windows 安装 Python 3.14+ 并勾选 Add to PATH |
| `ARM64_UNSUPPORTED` | 本期暂不支持 ARM64 Windows |
| `BROWSER_MISSING` / `PORT_BUSY` | 安装 Chrome/Edge 或更换端口 |
| `ADB_MISSING` / `ADB_BLOCKED` | 按配方安装或放行文件 |
| `DOWNLOAD_FAILED` / `VENDOR_MISSING` / `SHA1_MISMATCH` / `IN_USE` | 换渠道、使用私有备份、关闭占用 adb 的软件 |
| `TOOL_MISSING` / `NPM_INSTALL_FAILED` / `UV_INSTALL_FAILED` | 按输出重装对应工具 |
| `NO_DEVICE` / `UNAUTHORIZED` / `OFFLINE` / `NO_PERMISSION` / `MULTIPLE` | 检查数据线、授权、驱动或登记目标序列号 |
| `UI_DUMP_FAILED` / `SCREENSHOT_FAILED` | 按安卓配方处理 USB 调试与品牌限制 |

## 命令

`status [--target T] [--quick] [--json]`、`install --target T [--yes] [--json]`、`check --target T [--json]`、`register --target T --key K --value V`、`disable --target T`、`launch-browser`、`pending-hint`。
