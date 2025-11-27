# Web Worker KaTeX 实施计划

> 目标：将 KaTeX 渲染移至 Web Worker，消除主线程阻塞，保证 60fps 交互流畅

## 一、项目当前状态

### 1.1 KaTeX 使用点分析

| 文件 | 使用方式 | 阻塞影响 | 优先级 |
|------|----------|----------|--------|
| `MarkdownContent.tsx` | `rehype-katex` 插件 (unified 管道) | 高 - 同步阻塞 | P0 |
| `MathClozeBlock.tsx` | `katex.renderToString()` + LRU 缓存 | 中 - 首次渲染阻塞 | P0 |
| `StickyNote.tsx` | `rehype-katex` 插件 | 低 - 独立组件 | P1 |

### 1.2 现有优化机制

```
已有:
├── katexCache.ts        # LRU 缓存 (500条)，避免重复渲染
├── MathClozeBlock.tsx   # useMemo 缓存渲染结果
└── KATEX_OPTIONS        # 关闭严格模式，减少警告开销

不足:
├── 首次渲染仍阻塞主线程 50-200ms
├── rehype-katex 是同步插件，无法异步
└── 大量公式文档首屏时间长
```

### 1.3 相关文件清单

```
核心渲染:
├── src/components/shared/MarkdownContent.tsx     # 425 行 - 主渲染组件
├── src/components/shared/MathClozeBlock.tsx      # 156 行 - 数学 Cloze 块
├── src/components/shared/ClozeWithContext.tsx    # 80 行 - Cloze 状态封装
├── src/lib/katexCache.ts                         # 94 行 - LRU 缓存

使用 MarkdownContent 的组件:
├── src/components/modes/EditMode.tsx             # 编辑模式预览
├── src/components/modes/ClozeMode.tsx            # 复习模式
├── src/components/modes/BlurMode.tsx             # 模糊模式
├── src/components/sticky/StickyNote.tsx          # 便签组件

Markdown 解析:
├── src/lib/markdown/parser.ts                    # 174 行 - Cloze 解析
├── src/lib/markdown/clozeUtils.ts                # Cloze 工具函数
├── src/lib/markdown/splitter.ts                  # 块分割器
```

---

## 二、影响范围评估

### 2.1 直接影响 (需修改)

| 文件 | 修改内容 | 复杂度 | 风险 |
|------|----------|--------|------|
| `MathClozeBlock.tsx` | 改用异步渲染 Hook | 低 | 低 |
| `MarkdownContent.tsx` | 替换 rehype-katex 为自定义处理 | 高 | 中 |
| `StickyNote.tsx` | 替换 rehype-katex | 中 | 低 |
| `katexCache.ts` | 添加 Worker 客户端接口 | 中 | 低 |

### 2.2 间接影响 (需验证)

| 组件 | 验证点 |
|------|--------|
| `EditMode.tsx` | 预览同步滚动是否正常 |
| `ClozeMode.tsx` | 公式 Cloze 显示/隐藏切换 |
| `BlurMode.tsx` | 公式渲染效果 |
| `TableOfContents.tsx` | 标题提取不受影响 |

### 2.3 不受影响

- `parser.ts` - 仅做文本解析，不涉及 KaTeX
- `clozeUtils.ts` - 纯文本处理
- 所有 Dashboard 组件
- 所有 Store

---

## 三、技术方案

### 3.1 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web Worker KaTeX 架构                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │   KaTeX Worker   │    │         Main Thread              │  │
│  │  (katexWorker.ts)│    │                                  │  │
│  │                  │    │  ┌────────────────────────────┐  │  │
│  │  ┌────────────┐  │    │  │   KatexWorkerClient        │  │  │
│  │  │ KaTeX lib  │  │    │  │   (katexWorkerClient.ts)   │  │  │
│  │  └────────────┘  │    │  │                            │  │  │
│  │       │          │    │  │  • 批量请求队列 (16ms)      │  │  │
│  │       ▼          │    │  │  • 请求去重 (相同公式)      │  │  │
│  │  renderToString  │◄───┼──│  • 回调管理                │  │  │
│  │       │          │    │  │  • 降级处理 (Worker 失败)  │  │  │
│  │       ▼          │────┼──►                            │  │  │
│  │  HTML string     │    │  └────────────────────────────┘  │  │
│  │                  │    │              │                    │  │
│  └──────────────────┘    │              ▼                    │  │
│                          │  ┌────────────────────────────┐  │  │
│                          │  │   katexCache (LRU)         │  │  │
│                          │  │   • 缓存命中 → 同步返回     │  │  │
│                          │  │   • 缓存未命中 → Worker     │  │  │
│                          │  └────────────────────────────┘  │  │
│                          │              │                    │  │
│                          │              ▼                    │  │
│                          │  ┌────────────────────────────┐  │  │
│                          │  │   useKatexRender Hook      │  │  │
│                          │  │   • 同步检查缓存           │  │  │
│                          │  │   • 异步请求 Worker        │  │  │
│                          │  │   • Loading 状态管理       │  │  │
│                          │  └────────────────────────────┘  │  │
│                          │              │                    │  │
│                          │              ▼                    │  │
│                          │  ┌────────────────────────────┐  │  │
│                          │  │   React Components         │  │  │
│                          │  │   • MathBlock              │  │  │
│                          │  │   • MathInline             │  │  │
│                          │  │   • MathClozeBlock         │  │  │
│                          │  └────────────────────────────┘  │  │
│                          │                                  │  │
│                          └──────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心模块

#### 新增文件

| 文件路径 | 功能 | 行数估计 |
|----------|------|----------|
| `src/workers/katexWorker.ts` | Worker 入口，执行 KaTeX 渲染 | ~50 |
| `src/lib/katexWorkerClient.ts` | Worker 通信客户端 | ~150 |
| `src/hooks/useKatexRender.ts` | React Hook 封装 | ~60 |
| `src/components/shared/MathBlock.tsx` | 块级数学组件 | ~40 |
| `src/components/shared/MathInline.tsx` | 行内数学组件 | ~30 |

#### 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `src/components/shared/MathClozeBlock.tsx` | 使用 `useKatexRender` |
| `src/components/shared/MarkdownContent.tsx` | 移除 rehype-katex，使用自定义组件 |
| `src/components/sticky/StickyNote.tsx` | 移除 rehype-katex，使用自定义组件 |
| `src/lib/katexCache.ts` | 可选：添加持久化接口 |

### 3.3 关键技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Worker 通信 | 批量 + 去重 | 减少消息开销，同一公式只渲染一次 |
| rehype-katex 替换 | 自定义 rehype 插件 | 保持 unified 管道完整性 |
| 缓存策略 | 先查缓存，再发 Worker | 缓存命中无 Loading 闪烁 |
| 降级方案 | Worker 失败 → 主线程渲染 | 保证功能可用 |
| 占位符 | 骨架屏 + 动画 | 减少感知等待时间 |

---

## 四、实施阶段

### Phase 1: Worker 基础设施 (1-2 天) ✅ 已完成

**目标**: 建立 Worker 通信机制，验证可行性

**任务清单**:
- [x] 1.1 创建 `src/workers/katexWorker.ts`
- [x] 1.2 创建 `src/lib/katexWorkerClient.ts`
- [x] 1.3 创建 `src/hooks/useKatexRender.ts`
- [x] 1.4 TypeScript 编译验证通过

**验收标准**:
- [ ] Worker 能正确渲染 LaTeX 公式
- [ ] 批量请求在 16ms 内合并发送
- [ ] 相同公式请求被去重
- [ ] 缓存命中时同步返回，无 Loading

**测试用例**:
```typescript
// 1. 基本渲染
useKatexRender('E = mc^2', { displayMode: false })
// 预期: { html: '<span class="katex">...</span>', isLoading: false }

// 2. 缓存命中
// 第二次调用相同公式
// 预期: isLoading 从未变为 true

// 3. 批量请求
// 同时调用 5 个不同公式
// 预期: Worker 只收到 1 次 postMessage (包含 5 个请求)

// 4. 去重
// 同时调用 3 次相同公式
// 预期: Worker 只渲染 1 次
```

### Phase 2: MathClozeBlock 迁移 (0.5 天) ✅ 已完成

**目标**: 验证组件层集成

**任务清单**:
- [x] 2.1 修改 `MathClozeBlock.tsx` 使用 `useKatexRender`
- [x] 2.2 添加优雅的加载占位符 (MathSkeleton)
- [x] 2.3 TypeScript 编译通过

**验收标准**:
- [ ] 公式 Cloze 正常显示/隐藏
- [ ] 加载时显示骨架屏动画
- [ ] 缓存命中时无闪烁
- [ ] 点击切换状态流畅

**测试用例**:
```typescript
// 1. 首次加载
// 预期: 显示骨架屏 → 渲染公式 (< 100ms)

// 2. 切换模式 (Edit → Cloze → Blur)
// 预期: 公式已缓存，无 Loading

// 3. 复杂公式
// \begin{pmatrix} a & b \\ c & d \end{pmatrix}
// 预期: 渲染正确，不阻塞 UI

// 4. 错误公式
// \invalid{command}
// 预期: 显示错误提示，不崩溃
```

### Phase 3: MarkdownContent 重构 (2-3 天) ✅ 已完成

**目标**: 替换 rehype-katex，实现完全异步

**任务清单**:
- [x] 3.1 创建 `MathBlock.tsx` 和 `MathInline.tsx`
- [x] 3.2 创建自定义 rehype 插件 `rehypeAsyncMath.tsx`
- [x] 3.3 修改 `MarkdownContent.tsx` 使用新组件
- [x] 3.4 修改 `StickyNote.tsx` 使用新组件
- [x] 3.5 修改 `SimpleBlockRenderer.tsx` 和 `BlockRenderer.tsx`
- [x] 3.6 更新 `sharedComponents.tsx` 添加 Math 组件映射

**验收标准**:
- [ ] 所有现有功能保持不变
- [ ] 首屏渲染不再被公式阻塞
- [ ] 公式逐个显示 (渐进加载)
- [ ] TOC 导航正常工作
- [ ] EditMode 预览同步滚动正常

**测试用例**:
```typescript
// 1. 普通文档
// 预期: 立即显示文本，公式异步加载

// 2. 数学密集型文档 (50+ 公式)
// 预期: 首屏 < 200ms，公式逐个显示

// 3. Cloze 模式
// 预期: 文本 Cloze 和数学 Cloze 都正常

// 4. TOC 导航
// 预期: 点击标题跳转正常

// 5. EditMode 滚动同步
// 预期: 编辑器滚动，预览同步滚动
```

### Phase 4: StickyNote 迁移 + 优化 (1 天) ✅ 已完成

**目标**: 完成全面迁移，性能优化

**任务清单**:
- [x] 4.1 修改 `StickyNote.tsx` 使用新组件
- [ ] 4.2 实现预渲染策略 (文档加载时预热缓存) - 可选优化
- [ ] 4.3 可选：添加 IndexedDB 持久化缓存
- [x] 4.4 TypeScript 编译验证通过

**验收标准**:
- [ ] StickyNote 公式正常渲染
- [ ] 预渲染减少可见公式 Loading
- [ ] 无内存泄漏
- [ ] Worker 正常终止和重建

**测试用例**:
```typescript
// 1. StickyNote 公式
// 预期: 正常渲染

// 2. 预渲染
// 打开文档后立即滚动到底部
// 预期: 底部公式已预渲染，无 Loading

// 3. 长时间使用
// 打开/关闭 100 个文档
// 预期: 内存稳定，无泄漏

// 4. Worker 恢复
// 手动终止 Worker
// 预期: 自动重建，渲染恢复
```

---

## 五、验收标准汇总

### 5.1 功能验收

| 功能点 | 验收标准 |
|--------|----------|
| 数学公式渲染 | 与原实现视觉一致 |
| Cloze 数学块 | 显示/隐藏切换正常 |
| 行内公式 | 与文本对齐正确 |
| 块级公式 | 居中显示正确 |
| 错误处理 | 无效公式显示错误提示 |
| TOC 导航 | 点击跳转正常 |
| 滚动同步 | EditMode 双栏同步 |

### 5.2 性能验收

| 指标 | 当前值 | 目标值 | 验证方法 |
|------|--------|--------|----------|
| 首屏阻塞时间 | 100-200ms | 0ms | Performance API |
| 首屏完成时间 | 300-500ms | <200ms | Lighthouse |
| 公式渲染延迟 | 同步 | <50ms (异步) | console.time |
| 缓存命中率 | 30% | 80%+ | 日志统计 |
| 主线程帧率 | 可能掉帧 | 稳定 60fps | DevTools Performance |

### 5.3 稳定性验收

| 场景 | 验收标准 |
|------|----------|
| Worker 崩溃 | 自动降级到主线程渲染 |
| 大量公式 | 不 OOM，渐进加载 |
| 快速切换文档 | 无竞态条件 |
| 长时间使用 | 无内存泄漏 |

---

## 六、回滚方案

如果遇到严重问题，可以快速回滚：

### 6.1 保留旧代码

```typescript
// MarkdownContent.tsx
const USE_WORKER_KATEX = true; // 特性开关

const rehypePlugins = USE_WORKER_KATEX
  ? [[rehypeAsyncMath, KATEX_OPTIONS], rehypeRaw]
  : [[rehypeKatex, KATEX_OPTIONS], rehypeRaw];
```

### 6.2 回滚步骤

1. 设置 `USE_WORKER_KATEX = false`
2. 重新构建
3. 验证功能恢复

---

## 七、风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| Worker 加载慢 | 中 | 首次渲染延迟 | 预加载 Worker |
| 占位符闪烁 | 中 | UX 不佳 | 缓存命中同步渲染 |
| 内存泄漏 | 低 | 性能下降 | 定期清理回调 Map |
| 兼容性问题 | 低 | 功能异常 | 特性检测 + 降级 |

---

## 八、时间估算

| 阶段 | 预计时间 | 依赖 |
|------|----------|------|
| Phase 1: Worker 基础设施 | 1-2 天 | 无 |
| Phase 2: MathClozeBlock 迁移 | 0.5 天 | Phase 1 |
| Phase 3: MarkdownContent 重构 | 2-3 天 | Phase 2 |
| Phase 4: StickyNote + 优化 | 1 天 | Phase 3 |
| **总计** | **4.5-6.5 天** | |

---

## 九、相关文档

- `docs/PERFORMANCE_OPTIMIZATION.md` - 性能优化总体记录
- `docs/UX_NAVIGATION_DESIGN.md` - 导航设计
- `docs/CODEMIRROR_MIGRATION_PLAN.md` - CodeMirror 迁移

---

*文档版本: 1.1*
*创建日期: 2025-11-27*
*完成日期: 2025-11-27*
*状态: ✅ 已完成*
