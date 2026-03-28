# PPT QA 验证流程

## 流水线

```
生成 .pptx → markitdown 提取文本 → 占位符检测 → 内容完整性校验 → 输出报告
```

## 步骤 1：文本提取

优先使用 markitdown（更好的格式保留）：
```bash
python3 -c "from markitdown import MarkItDown; m = MarkItDown(); r = m.convert('output.pptx'); print(r.text_content)"
```

Fallback 使用 python-pptx 直接提取：
```python
from pptx import Presentation
prs = Presentation('output.pptx')
for slide in prs.slides:
    for shape in slide.shapes:
        if shape.has_text_frame:
            print(shape.text_frame.text)
```

## 步骤 2：占位符检测

检查提取的文本中是否残留模板占位符：

```python
PLACEHOLDER_PATTERNS = [
    r'\{.*?\}',           # {变量名}
    r'\[.*?占位.*?\]',    # [xxx占位]
    r'TODO',              # TODO 标记
    r'TBD',               # TBD 标记
    r'在此插入',          # 中文占位提示
    r'Lorem ipsum',       # 英文假文
]
```

Chart 页面的图表占位区域不计入检测。

## 步骤 3：内容完整性校验

对比 outline.json 和实际幻灯片：

| 检查项 | 通过条件 |
|--------|---------|
| 页数匹配 | 实际页数 == outline 条目数 |
| 标题覆盖 | 每个 outline 标题在提取文本中出现 |
| 要点覆盖 | 80%+ 的 outline bullets 在提取文本中出现 |
| 空白页检测 | 无内容为空的幻灯片（Cover/End 除外） |

## 步骤 4：输出报告

```json
{
  "status": "pass",
  "slide_count": 15,
  "checks": {
    "placeholder_free": true,
    "slide_count_match": true,
    "title_coverage": 1.0,
    "bullet_coverage": 0.93,
    "empty_slides": []
  },
  "warnings": [],
  "errors": []
}
```

status 取值：
- `pass`：所有检查通过
- `warn`：有 warnings 但无 errors
- `fail`：有 errors

## 常见 Warning

- `bullet_coverage < 0.9`：部分要点被截断或合并，可能是文本溢出
- `file_size > 1MB`：文件偏大，可能包含嵌入媒体

## 常见 Error

- `placeholder_found`：残留占位符，需要清理
- `empty_slide`：空白幻灯片，检查生成逻辑
- `slide_count_mismatch`：页数不匹配，检查 outline 解析
