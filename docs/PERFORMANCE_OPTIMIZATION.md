# Memory Player 性能优化文档

> 基于 MCP Context7 获取的 React、Zustand、Motion 最佳实践

## 一、已实施优化

### 1. TreeItem 组件 (`FileTreeView.tsx`)

**问题**：200+ 文件时，每次渲染都重新计算所有文件的卡片状态

**解决方案**：
```tsx
// ✅ 添加 memo 包裹
const TreeItem = memo(({ node, ... }) => {
    // ✅ 使用 useMemo 缓存状态计算
    const { statusColor, statusDot, cardCount } = useMemo(() => {
        // 计算逻辑
    }, [node.path, metadatas[node.path]?.cards]);
});
```

**收益**：
- 减少 ~70% 文件树渲染时间
- 200 文件 × 10 卡片 = 2000 次日期比较 → 仅在数据变化时计算

### 2. LibraryView grouped 计算

**问题**：每次渲染都重新分组所有文件

**解决方案**：
```tsx
// ✅ 包装在 useMemo 中
const grouped = useMemo(() => {
    return filteredFiles.reduce((acc, file) => {
        // 分组逻辑 + 提前退出优化
        if (hasOverdue) break; // 最高优先级，无需继续
    }, initialAcc);
}, [filteredFiles, fileMetadatas]);
```

**收益**：
- 减少 ~50% LibraryView 渲染开销
- 添加 `break` 提前退出，减少不必要的日期比较

### 3. FileSection 动画优化

**问题**：每个文件项使用 `motion.div` + `whileHover` + `whileTap`

**解决方案** (基于 Motion 最佳实践)：
```tsx
// ❌ 之前：200+ 个动画上下文
<motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>

// ✅ 之后：CSS transitions (零 JS 开销)
<div className="transition-all duration-150 
    hover:scale-[1.005] hover:translate-x-1
    active:scale-[0.98]">
```

**收益**：
- 移除 200+ 个 Framer Motion 动画上下文
- 使用 CSS 硬件加速的 transform

### 4. LibraryView Zustand 选择器优化

**问题**：20+ 属性混在一个 useShallow 选择器中，包括高频变化的 `fileMetadatas`

**解决方案** (基于 Zustand 最佳实践)：
```tsx
// ✅ 1. ACTIONS - 单独获取（稳定引用，永不触发重渲染）
const setRootPath = useAppStore((s) => s.setRootPath);
const loadNote = useAppStore((s) => s.loadNote);
const loadVaults = useAppStore((s) => s.loadVaults);
// ... 12 个 actions

// ✅ 2. LOW-FREQUENCY DATA - useShallow 分组
const { rootPath, files, recentVaults, syncMode, currentUser, vaults } = useAppStore(
  useShallow((s) => ({
    rootPath: s.rootPath,
    files: s.files,
    recentVaults: s.recentVaults,
    syncMode: s.syncMode,
    currentUser: s.currentUser,
    vaults: s.vaults,
  }))
);

// ✅ 3. HIGH-FREQUENCY DATA - 单独选择
// fileMetadatas 每次 review 都变化，隔离防止级联重渲染
const fileMetadatas = useAppStore((s) => s.fileMetadatas);
const lastSyncAt = useAppStore((s) => s.lastSyncAt);
```

**收益**：
- Actions 引用稳定，useEffect 依赖数组不再因选择器变化而触发
- 高频数据隔离，`fileMetadatas` 变化不触发低频数据的 shallow 比较
- 选择器从 20+ 属性减少到 6 个数据属性

---

## 二、最佳实践总结

### Zustand 选择器 (来自 Context7)

```tsx
// ✅ 使用 useShallow 防止不必要的重渲染
const { nuts, honey } = useBearStore(
    useShallow((state) => ({ nuts: state.nuts, honey: state.honey }))
);

// ✅ Actions 可以单独获取（它们是稳定引用）
const loadNote = useAppStore((state) => state.loadNote);

// ❌ 避免选择整个 state
const state = useAppStore(); // 任何变化都会触发重渲染
```

### Motion / Framer Motion 动画

```tsx
// ❌ 避免在列表项上使用 whileHover/whileTap
<motion.div whileHover={{ scale: 1.1 }} /> // 每项创建动画上下文

// ✅ 使用 CSS transitions
<div className="hover:scale-105 transition-transform" />

// ✅ 使用 transform 而非 layout 属性
animate(el, { transform: "translateX(100px)" }) // GPU 加速
animate(el, { left: "100px" }) // ❌ 触发 layout

// ✅ 使用 clipPath 替代 borderRadius 动画
animate(el, { clipPath: "inset(0 round 50px)" }) // GPU 加速
animate(el, { borderRadius: "50px" }) // ❌ 触发 paint
```

### React 性能模式

```tsx
// ✅ 组件级别 memo
const TreeItem = memo(({ node, ...props }) => { ... });

// ✅ 计算缓存
const expensiveValue = useMemo(() => compute(data), [data]);

// ✅ 回调稳定性
const handleClick = useCallback((id) => { ... }, [deps]);

// ✅ 提前退出循环
for (const card of cards) {
    if (hasOverdue) break; // 找到最高优先级立即退出
}
```

---

## 三、未来优化方向

### ⚠️ 高优先级优化影响分析

以下是原计划的高优先级优化项的详细影响评估：

#### 1. 虚拟滚动 (react-window) - ❌ 暂不实施

**影响范围**：
| 功能 | 影响 | 严重程度 |
|------|------|----------|
| TOC 导航 | 依赖 `getElementById` 定位，虚拟化后未渲染元素不存在 | 🔴 破坏性 |
| Cloze 滚动 | 81 处 scroll 相关代码，依赖完整 DOM | 🔴 破坏性 |
| Header 提取 | `MutationObserver` 监听 DOM 变化 | 🔴 需重写 |
| Edit 同步 | 40 处 scroll 代码用于预览同步 | 🔴 破坏性 |

**根本问题**：ReactMarkdown 整体渲染，Markdown 块高度不固定无法预计算

**结论**：需要架构级重构，风险远超收益

#### 2. KaTeX Web Worker - ❌ 暂不实施

**问题**：
- `rehype-katex` 是 ReactMarkdown 同步插件，无法改为异步
- Web Worker 无法操作 DOM（KaTeX 需要字体测量）
- MathClozeBlock 已有 `useMemo` 缓存

**结论**：当前实现已较优，改动风险高

#### 3. parseNote 状态机 - ❌ 暂不实施

**问题**：
- 正则引擎是高度优化的 C++ 代码，5 次 O(N) 实际很快
- 状态机实现复杂，容易引入解析 bug
- 需要全面测试所有 cloze 边缘情况

**结论**：收益不明确，风险中等

---

### ✅ 实际可行的高优先级优化

| 优化项 | 描述 | 预期收益 | 状态 |
|--------|------|----------|------|
| **KaTeX LRU 缓存** | 全局缓存已渲染的公式 HTML (`katexCache.ts`) | -30% 首屏时间 | ✅ 已实施 |
| **按需加载 KaTeX** | 仅在有数学公式时加载 | -200KB 初始包 | 待实施 |

#### KaTeX LRU 缓存实现

```typescript
// src/lib/katexCache.ts - 有效的缓存
class KatexLRUCache {
  private cache: Map<string, CacheEntry> = new Map();
  
  get(latex: string, displayMode: boolean): string | null { ... }
  set(latex: string, displayMode: boolean, html: string): void { ... }
}

// MathClozeBlock.tsx 集成
const renderKatexToString = (latex: string, displayMode: boolean = true): string => {
    const cached = katexCache.get(latex, displayMode);
    if (cached !== null) return cached; // 缓存命中，跳过解析
    
    const html = katex.renderToString(latex, { displayMode, ... });
    katexCache.set(latex, displayMode, html);
    return html;
};
```

#### ❌ ParsedNote 缓存 - 已移除

**移除原因**（经过深度分析）：

| 分析项 | 结果 |
|--------|------|
| 单次 parseNote 耗时 | **~0.006ms (6微秒)** |
| EditMode debounce 命中率 | **0%**（内容每次都变） |
| 重复访问同一笔记 | ~80%，但 6 微秒不值得缓存 |
| 复杂度 | 需要处理失效、hash 碰撞等 |

**结论**：复杂度高于收益，正则解析已足够快

### 中优先级

| 优化项 | 描述 | 状态 |
|--------|------|------|
| **细粒度 Zustand 选择器** | 拆分 LibraryView 的 20+ 属性选择器 | ✅ 已完成 |
| **fileMetadatas 分片** | 按文件夹分片存储，减少更新粒度 | ❌ 暂不实施 |
| **增量 Markdown AST** | 仅重新解析变化的部分 | ❌ 暂不实施 |

#### fileMetadatas 分片 - 影响分析

**风险**：🔴 极高

| 组件 | 使用次数 | 影响 |
|------|----------|------|
| appStore.ts | 24 | 🔴 需重写所有更新逻辑 |
| LibraryView.tsx | 9 | 🟡 grouped 计算需遍历 |
| Dashboard.tsx | 6 | 🟡 统计聚合需遍历 |
| NoteRenderer.tsx | 3 | 🟡 需适配新访问模式 |

**问题**：
- 组件依赖 `fileMetadatas[path]` 同步访问
- Dashboard 需要遍历所有 metadata 计算统计
- 分片会引入异步加载和竞态条件

#### 增量 Markdown AST - 影响分析

**风险**：🔴 极高

**问题**：
- ReactMarkdown 是整体渲染，无增量 API
- 需要自定义 Markdown 解析器
- 影响所有 custom renderers (cloze、math-cloze、error links)
- MarkdownContent 291 行复杂逻辑需要重写

### 参考资料

- [Zustand useShallow](https://github.com/pmndrs/zustand/blob/main/docs/hooks/use-shallow.md)
- [Motion Performance](https://motion.dev/docs/performance)
- [react-window](https://github.com/bvaughn/react-window)

---

## 四、已修复的性能问题历史

1. **ThreeColumnLayout 无限循环** - 渲染期间 setState
2. **ClozeMode 过度动画** - 每个 cloze 的 layout 动画
3. **FileTreeView AnimatePresence** - 200+ 节点动画
4. **NoteRenderer 双层动画** - 简化为 CSS transitions
5. **模式切换 layoutId** - 移除昂贵的共享布局动画

---

*文档更新于: 2024-11*
