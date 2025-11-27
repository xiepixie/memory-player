# Markdown Rendering Refactor

## 概述

本文档描述了 Memory Player 中 Markdown 渲染的增量优化方案。

## 架构

### Phase 1: Regex-based (推荐生产使用)

```
markdown string
    ↓ splitContentIntoBlocks (regex + 多行块保护)
SimpleBlock[] (id, type, hash, content, estimatedHeight)
    ↓ SimpleBlockRenderer (memo by hash)
React Elements
```

**文件:**
- `src/hooks/useIncrementalMarkdown.ts` - Regex 分割 + LRU 缓存
- `src/components/shared/SimpleBlockRenderer.tsx` - 块渲染器

### Phase 2: MDAST-based (更精确)

```
markdown string
    ↓ unified/remark-parse
MDAST (Abstract Syntax Tree)
    ↓ splitIntoBlocks (AST 级分割)
Block[] (id, type, hash, nodes, rawContent, lineRange)
    ↓ BlockRenderer (使用 rawContent, 无双重解析)
React Elements
```

**文件:**
- `src/hooks/useMdastBlocks.ts` - MDAST 解析 + 缓存
- `src/lib/markdown/astCache.ts` - AST LRU 缓存
- `src/lib/markdown/blockSplitter.ts` - AST 块分割
- `src/components/shared/BlockRenderer.tsx` - MDAST 块渲染器

### 共享基础设施

- `src/lib/markdown/sharedComponents.tsx` - 组件工厂 (Cloze, Table, Code 等)
- `src/lib/markdown/scrollController.ts` - 滚动抽象层
- `src/components/shared/VirtualizedMarkdown.tsx` - 虚拟滚动容器

## 关键优化

### 1. 块级缓存

每个块通过 content hash 缓存，内容未变则跳过重渲染。

### 2. 双重解析消除 (Phase 2)

```
优化前: markdown → MDAST → nodesToMarkdown() → ReactMarkdown → 再解析
优化后: markdown → MDAST → rawContent (原始子串) → ReactMarkdown
```

Block 接口包含 `rawContent` 字段，直接从原始内容提取，无需序列化。

### 3. 虚拟滚动

- 阈值: 15 块以上启用虚拟化
- 使用 `@tanstack/react-virtual`
- `measureElement` 动态测量高度

### 4. LRU 缓存

- Phase 1: `BlockCache` (maxSize=50)
- Phase 2: `ASTCache` (maxSize=50)

## 使用示例

### 推荐: IncrementalMarkdownContent

```tsx
import { IncrementalMarkdownContent } from '../components/shared/IncrementalMarkdownContent';

function MyComponent({ content }: { content: string }) {
  return (
    <IncrementalMarkdownContent 
      content={content} 
      variant="review" 
      onClozeClick={handleClozeClick}
    />
  );
}
```

### Phase 1: 底层 API

```tsx
import { useIncrementalMarkdown } from '../hooks/useIncrementalMarkdown';
import { AdaptiveMarkdown } from '../components/shared/VirtualizedMarkdown';

function LowLevelComponent({ content }: { content: string }) {
  const { blocks } = useIncrementalMarkdown(content);
  return <AdaptiveMarkdown blocks={blocks} variant="review" />;
}
```

### Phase 2: MDAST API

```tsx
import { useMdastBlocks } from '../hooks/useMdastBlocks';
import { BlockRenderer } from '../components/shared/BlockRenderer';

function MdastComponent({ content }: { content: string }) {
  const { blocks, diff } = useMdastBlocks(content);
  
  return (
    <div>
      {blocks.map((block, i) => (
        <BlockRenderer 
          key={block.id} 
          block={block} 
          blockIndex={i}
          variant="review" 
        />
      ))}
    </div>
  );
}
```

## Phase 2 独特价值

| 特性 | Phase 1 (Regex) | Phase 2 (MDAST) |
|------|-----------------|-----------------|
| 块边界准确性 | 近似 | 精确 |
| 嵌套结构处理 | 易出错 | 正确 |
| 源码位置映射 | 无 | `lineRange` |
| 增量 diff | hash 对比 | AST 级别 |
| 与编辑器同步 | 困难 | 精确对应 |

## 集成路径

### 替换 MarkdownContent

```tsx
// 替换前
<MarkdownContent content={...} variant="review" />

// 替换后
<IncrementalMarkdownContent content={...} variant="review" />
```

**注意**: `MarkdownContent` 仍需保留，因为它有独特功能:
- `hideFirstH1` - 隐藏第一个 H1
- `precomputedHeadings` - 预计算标题用于 TOC

## 待办

- [ ] 在 EditMode 中集成测试
- [ ] 在 ClozeMode 中集成测试
- [x] 在 BlurMode 中集成测试 (修复了 sharedComponents.tsx 缺失的组件)
- [ ] 性能基准测试

## 已修复问题 (2025-11-27)

### BlurMode 渲染问题
`sharedComponents.tsx` 缺少以下关键组件导致 `IncrementalMarkdownContent` 无法正确渲染：

1. **math-cloze 代码块** - 数学公式被当作代码块渲染
   - 修复：`code` 组件添加 `language-math-cloze-*` 检测，渲染 `MathClozeBlock`
   - 修复：`pre` 组件检测 math-cloze 子元素，跳过 pre 包装

2. **#cloze-* 链接** - 点击后路由跳转
   - 修复：`a` 组件处理 `#cloze-*` href，blur 模式渲染纯文本

3. **标题/加粗样式** - markdown 样式丢失
   - 修复：添加 `h1-h6`、`strong` 组件

4. **错误链接/高亮** - `#error-*`、`#highlight` 未处理
   - 修复：`a` 组件完整实现

---

*版本: 2.0*
*创建日期: 2025-11-27*
