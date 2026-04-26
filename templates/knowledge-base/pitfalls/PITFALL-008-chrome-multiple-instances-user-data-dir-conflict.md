---
id: PITFALL-008
category: pitfalls
tags: [Chrome headless, Mermaid, user-data-dir, SIGTRAP, exit-133, md2docx]
source-project: ai辅批助手-20260310
created: 2026-03-11
---

# Chrome 多实例连续渲染时 exit 133（SIGTRAP）崩溃

## 症状

PRD 含多个 Mermaid 流程图时，DOCX 中第一个渲染为图片，第二个（及之后）降级为代码块。
终端输出 `Trace/BPT trap: 5`，Chrome exit code 133。

## 根因

多次 `subprocess.run` 连续启动 Chrome 时，若未指定 `--user-data-dir`，各实例默认使用同一个用户数据目录，产生锁文件冲突，后续实例触发 SIGTRAP 崩溃。

## 修复

在每次 `render_mermaid` 返回后加 `time.sleep(2)`，给 Chrome 足够时间完全释放系统资源：

```python
# render_mermaid() 末尾
import time; time.sleep(2)
return out_png
```

**注意**：`--user-data-dir` 临时目录方案无效——该 flag 会导致 Chrome 在 Python `shell=True` subprocess 中挂起（timeout），比崩溃更糟。

## 适用范围

任何在同一 Python 进程内多次连续调用 Chrome headless 的场景（截图、Mermaid 渲染等）。
