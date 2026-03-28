# PPT 设计系统

## 18 套配色方案

### 商务系列

#### business-authority
- Primary: `#1E3A5F` | Secondary: `#2C5282` | Accent: `#C9A84C` | Background: `#FFFFFF` | Text: `#1A202C`
- 适用：金融、法律、政府报告

#### platinum-white-gold
- Primary: `#374151` | Secondary: `#6B7280` | Accent: `#D4AF37` | Background: `#FAFAFA` | Text: `#111827`
- 适用：高端企业、咨询公司

#### tech-blue
- Primary: `#1D4ED8` | Secondary: `#3B82F6` | Accent: `#60A5FA` | Background: `#F8FAFC` | Text: `#1E293B`
- 适用：科技公司、SaaS 产品

### 创意系列

#### dreamy-creative
- Primary: `#7C3AED` | Secondary: `#A78BFA` | Accent: `#F472B6` | Background: `#FAF5FF` | Text: `#1F2937`
- 适用：设计工作室、文创产品

#### bohemian
- Primary: `#DC2626` | Secondary: `#F97316` | Accent: `#FBBF24` | Background: `#FFFBEB` | Text: `#292524`
- 适用：电商、消费品牌

#### art-food
- Primary: `#B45309` | Secondary: `#D97706` | Accent: `#92400E` | Background: `#FEF3C7` | Text: `#1C1917`
- 适用：餐饮、食品行业

#### coastal-coral
- Primary: `#0891B2` | Secondary: `#06B6D4` | Accent: `#FB923C` | Background: `#F0FDFA` | Text: `#164E63`
- 适用：旅游、休闲产品

### 自然系列

#### nature-outdoor
- Primary: `#15803D` | Secondary: `#22C55E` | Accent: `#86EFAC` | Background: `#F0FDF4` | Text: `#14532D`
- 适用：环保、农业、户外

#### forest-eco
- Primary: `#166534` | Secondary: `#4ADE80` | Accent: `#A3E635` | Background: `#ECFDF5` | Text: `#052E16`
- 适用：可持续发展、ESG 报告

### 学术系列

#### vintage-academic
- Primary: `#7C2D12` | Secondary: `#9A3412` | Accent: `#C2410C` | Background: `#FFF7ED` | Text: `#431407`
- 适用：学术研究、教育培训

#### education-chart
- Primary: `#1B4F72` | Secondary: `#2980B9` | Accent: `#F39C12` | Background: `#FDF6EC` | Text: `#1C2833`
- 适用：教学课件、数据报告

### 科技系列

#### tech-vibrant
- Primary: `#4F46E5` | Secondary: `#6366F1` | Accent: `#EC4899` | Background: `#EEF2FF` | Text: `#1E1B4B`
- 适用：AI、大数据、创新展示

#### tech-nightscape
- Primary: `#0F172A` | Secondary: `#1E293B` | Accent: `#38BDF8` | Background: `#020617` | Text: `#E2E8F0`
- 适用：暗色主题演示、开发者大会

### 其他系列

#### modern-health
- Primary: `#0D7377` | Secondary: `#14B8A6` | Accent: `#5EEAD4` | Background: `#F0F9F4` | Text: `#134E4A`
- 适用：医疗健康、生物科技

#### artisan-handmade
- Primary: `#78350F` | Secondary: `#A16207` | Accent: `#CA8A04` | Background: `#FEFCE8` | Text: `#422006`
- 适用：手工艺、传统行业

#### elegant-fashion
- Primary: `#831843` | Secondary: `#BE185D` | Accent: `#F9A8D4` | Background: `#FDF2F8` | Text: `#500724`
- 适用：时尚、美妆、奢侈品

#### luxe-mystery
- Primary: `#1E1B4B` | Secondary: `#312E81` | Accent: `#C084FC` | Background: `#0C0A1D` | Text: `#DDD6FE`
- 适用：高端品牌、神秘感产品

#### orange-mint
- Primary: `#EA580C` | Secondary: `#F97316` | Accent: `#34D399` | Background: `#FFF7ED` | Text: `#1C1917`
- 适用：年轻化产品、社交平台

## 4 种风格

### corporate（商务正式）
- 标题字号：36pt，加粗
- 正文字号：18pt
- 行间距：1.5 倍
- 布局：居中标题 + 左对齐正文
- 装饰：底部色条

### modern（现代简约）
- 标题字号：32pt，加粗
- 正文字号：16pt
- 行间距：1.8 倍
- 布局：左对齐标题 + 大量留白
- 装饰：侧边色块

### classic（经典学术）
- 标题字号：28pt，加粗
- 正文字号：14pt
- 行间距：1.4 倍
- 布局：居中标题 + 两栏正文
- 装饰：页眉页脚线条

### creative（创意活泼）
- 标题字号：40pt，加粗
- 正文字号：18pt
- 行间距：1.6 倍
- 布局：不规则布局 + 色块背景
- 装饰：圆角色块 + 渐变

## 字体搭配规则

| 风格 | 中文字体 | 英文字体 | 备选 |
|------|---------|---------|------|
| corporate | PingFang SC | Helvetica Neue | 微软雅黑 / Arial |
| modern | PingFang SC | SF Pro Display | 苹方 / Inter |
| classic | Songti SC | Times New Roman | 宋体 / Georgia |
| creative | PingFang SC | Montserrat | 苹方 / Poppins |

**中文字体规则**：python-pptx 中必须使用完整字体名（如 `PingFang SC` 而非 `苹方`）。
