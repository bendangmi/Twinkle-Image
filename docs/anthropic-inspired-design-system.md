# Twinkle Image 视觉系统

本文档定义 Twinkle Image 的 Anthropic-inspired 二开风格。目标是借鉴 Anthropic 的视觉语言，而不是复制其品牌标识或让产品冒充 Anthropic 官方产品。

## 风格总结

Anthropic 的视觉表达更接近一本经过严谨编辑的现代出版物，而不是常见的高饱和 SaaS 仪表盘。它依靠温暖的纸张色、接近油墨的深色文字、清晰的排版层级和少量低饱和强调色建立识别度。

核心原则：

- 温暖而理性：底色使用暖白而非纯白，深色模式也保留轻微暖调。
- 编辑感排版：标题使用 Poppins 风格的几何无衬线，正文使用 Lora 风格的衬线字体。
- 克制的层级：主要依靠边框、留白和色面区分区域，避免大量悬浮卡片与重阴影。
- 少而明确的颜色：陶土橙用于主操作，低饱和蓝与绿色用于信息和成功状态。
- 工具优先：操作区域保持紧凑、可扫描，装饰不干扰图片创作流程。

## 设计令牌

| 角色 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| Background | `#faf9f5` | `#181714` | 页面底色 |
| Foreground | `#141413` | `#f4f2ea` | 主要文字 |
| Card | `#fffef9` | `#211f1b` | 工作区表面 |
| Border | `#d8d5ca` | `#454137` | 分隔与轮廓 |
| Primary | `#d97757` | `#d97757` | 主操作与焦点 |
| Blue | `#6a9bcc` | `#80add7` | 处理中与辅助信息 |
| Green | `#788c5d` | `#98aa79` | 成功状态 |

## 组件规则

- 圆角上限为 `8px`，图像预览和圆形状态控件除外。
- 主按钮使用陶土橙色面、暖白文字和轻微底部阴影；次按钮使用暖灰表面与细边框。
- 输入框使用实体纸面背景、单层边框和轻微内阴影。
- 弹窗使用暖色表面、细边框和单个柔和投影；遮罩保持中性。
- 标签页选中态使用纸面背景和陶土橙提示，不使用蓝色胶囊。
- 卡片之间不再嵌套装饰性卡片；页面分区依赖留白和边框。

## 排版

- 标题：`Poppins, Noto Sans SC, Arial, sans-serif`
- 正文：`Lora, Noto Serif SC, Georgia, serif`
- 控件文字使用标题字体栈，保证小尺寸下的识别效率。
- 字距固定为 `0`，避免中文与英文混排时出现不稳定的紧缩。

## 实现位置

- 全局颜色、字体、圆角和表面样式：`frontend/src/app/globals.css`
- 应用壳层与品牌区：`frontend/src/components/workspace/WorkspaceShell.tsx`
- 主导航：`frontend/src/components/workspace/WorkspaceModeTabs.tsx`
- 基础组件：`frontend/src/components/ui/`

业务组件应优先使用 `bg-background`、`bg-card`、`text-foreground`、`text-muted-foreground`、`border-border` 和 `text-primary` 等语义类，避免写死颜色。
