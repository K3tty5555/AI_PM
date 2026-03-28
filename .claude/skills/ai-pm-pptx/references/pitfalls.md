# python-pptx 常见坑

## 1. 单位换算

python-pptx 使用 EMU（English Metric Units）作为内部单位。

```python
from pptx.util import Inches, Pt, Emu

# 常用换算
Inches(1)    # = 914400 EMU
Pt(12)       # = 152400 EMU
Emu(914400)  # = 1 inch

# 幻灯片默认尺寸
# 宽: 13.333 inches (Inches(13.333))
# 高: 7.5 inches (Inches(7.5))
```

**注意**：不要混用不同单位类型，统一使用 `Inches` 或 `Pt`。

## 2. 标题下方不用强调线

python-pptx 没有原生下划线装饰。如果需要视觉分隔：
- 用留白替代（标题下方 0.3-0.5 inch 空白）
- 或用 `add_shape` 画一条细线（但增加复杂度）

推荐：**用留白**，更简洁且跨平台一致。

## 3. 中文字体必须用完整字体名

```python
# 正确
run.font.name = 'PingFang SC'
run.font.name = 'Microsoft YaHei'
run.font.name = 'Songti SC'

# 错误
run.font.name = '苹方'      # 不识别中文名
run.font.name = 'PingFang'  # 不完整
```

同时必须设置东亚字体：
```python
from pptx.oxml.ns import qn
rPr = run._r.get_or_add_rPr()
rPr.set(qn('a:lang'), 'zh-CN')
# 或通过 XML 直接设置 ea 字体
ea = rPr.makeelement(qn('a:ea'), {'typeface': 'PingFang SC'})
rPr.append(ea)
```

## 4. 母版布局引用需精确匹配

```python
# 获取布局时必须用精确名称
slide_layout = prs.slide_layouts[0]  # 按索引（不推荐，不同模板索引不同）

# 推荐：按名称查找
def get_layout_by_name(prs, name):
    for layout in prs.slide_layouts:
        if layout.name == name:
            return layout
    return prs.slide_layouts[0]  # fallback
```

**空白布局通常叫 `Blank`**，但不同 Office 版本可能不同。安全做法是用最后一个布局或遍历查找。

## 5. 文本框溢出

python-pptx 不自动缩放文字。内容过多时会溢出：

```python
# 设置自动缩放（需要 XML 操作）
from pptx.oxml.ns import qn
txBody = text_frame._txBody
bodyPr = txBody.find(qn('a:bodyPr'))
bodyPr.set('autofit', 'true')  # 注意：不是所有渲染器都支持

# 更安全的做法：限制 bullets 数量
MAX_BULLETS_PER_SLIDE = 5
```

## 6. 颜色设置

```python
from pptx.util import Pt
from pptx.dml.color import RGBColor

# 正确：使用 RGBColor
run.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)

# 从 hex 字符串转换
def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    return RGBColor(
        int(hex_str[0:2], 16),
        int(hex_str[2:4], 16),
        int(hex_str[4:6], 16)
    )
```

## 7. 形状层叠顺序

后添加的形状在上层。如果需要背景色块：
1. 先添加背景矩形
2. 再添加文本框

```python
# 背景色块
bg_shape = slide.shapes.add_shape(
    MSO_SHAPE.RECTANGLE, left, top, width, height
)
bg_shape.fill.solid()
bg_shape.fill.fore_color.rgb = hex_to_rgb('#1D4ED8')
bg_shape.line.fill.background()  # 无边框

# 然后添加文本框（在色块上方）
txBox = slide.shapes.add_textbox(left, top, width, height)
```

## 8. 保存前检查

生成后务必检查：
- 文件大小是否合理（空白 PPT ~30KB，10 页正常 ~100-300KB）
- 用 `verify.py` 检查占位符残留
- 用 markitdown（如果安装了）提取文本验证内容完整性
