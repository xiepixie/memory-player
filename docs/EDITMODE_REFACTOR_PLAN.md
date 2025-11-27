# EditMode 重构计划 (精简版 v2)

> **核心原则**: 复用已有组件，避免过度设计。1411 行是可读性问题，非复用性问题。

## 一、现有组件清单 

### 1.1 已存在 (无需新建)

| 模块 | 文件 | 行数 | 覆盖功能 |
|------|------|------|----------|
| **Cloze 操作** | `lib/markdown/clozeUtils.ts` | 340 | getMaxClozeNumber, createCloze, unclozeAt, normalizeClozeIds, cleanInvalidClozes, findClozeIndices... |
| **CM 操作** | `hooks/useCodeMirrorActions.ts` | 290 | replaceRange, setSelection, scrollToPosition, wrapSelection... |
| **文件监听** | `hooks/useFileWatcher.ts` | 42 | 已封装 fileSystem.watchFile |
| **快捷键** | `lib/codemirror/keymaps.ts` | 153 | createClozeKeymap (Ctrl+Shift+C, Alt+↑↓...) |
| **增量渲染** | `shared/IncrementalMarkdownContent.tsx` | 103 | 块级缓存 + 虚拟滚动 |
| **KaTeX 异步** | `hooks/useKatexRender.ts` | ~100 | Web Worker + 缓存 |

### 1.2 不需要新建的文件

| 原计划文件 | 取消原因 |
|------------|----------|
| `useClozeOperations.ts` | `ClozeUtils` + `cmActions` 已完全覆盖 |
| `useScrollSync.ts` | 仅 EditMode 使用，不可复用 |
| `useFilePersistence.ts` | `useFileWatcher` 已存在，save 逻辑绑定 store |
| `EditModeToolbar.tsx` | 仅 EditMode 使用，抽离不增加复用性 |
| `EditModeModals.tsx` | 同上 |
| `MetadataEditor.tsx` | 目前仅 EditMode 使用，暂不抽离 |

### 1.3 待验收项目 (来自设计文档)

**MARKDOWN_RENDERING_REFACTOR.md:**
- [ ] EditMode 中集成测试 IncrementalMarkdownContent
- [ ] ClozeMode 中集成测试
- [ ] 性能基准测试

**WEB_WORKER_KATEX_PLAN.md:**
- [ ] Worker 能正确渲染 LaTeX 公式
- [ ] 批量请求在 16ms 内合并发送
- [ ] 缓存命中时同步返回，无 Loading
- [ ] 首屏渲染不再被公式阻塞

---

## 二、核心问题与优化策略

### 2.1 EditMode.tsx 问题诊断

| 问题 | 严重性 | 行数 | 描述 |
|------|--------|------|------|
| **DOM 强耦合** | 🔴 高 | 296, 477 | `document.querySelector('.group/preview')` |
| **冗余包装函数** | 🟡 中 | 多处 | handleXxx 仅调用 ClozeUtils + cmActions |
| **未使用增量渲染** | 🟡 中 | 1396 | 仍使用 MarkdownContent |

### 2.2 优化策略 (不新增文件)

```diff
EditMode.tsx (1411 → ~900 行)

Phase A: 去除 DOM 强耦合
- const previewPane = document.querySelector('.group\\/preview .overflow-y-auto');
+ const previewPaneRef = useRef<HTMLDivElement>(null);
+ // JSX: <div ref={previewPaneRef} className="...">

Phase B: 简化冗余包装 (可选)
- 内联简单的 handler 逻辑
- 移除不必要的中间函数

Phase C: 集成增量渲染
- <MarkdownContent ... />
+ <IncrementalMarkdownContent ... />
```

---

## 三、实施阶段

### Phase A: previewRef 替换 querySelector (0.5 天)

**目标**: 移除 DOM 直接查询，改用 React Ref

**修改点**:
1. 添加 `previewPaneRef = useRef<HTMLDivElement>(null)`
2. 替换 `getPreviewPane()` 实现
3. 在 JSX 中添加 `ref={previewPaneRef}`

**代码变更**:
```typescript
// 删除
const previewPaneRef = useRef<Element | null>(null);
const getPreviewPane = useCallback(() => {
  if (!previewPaneRef.current || !previewPaneRef.current.isConnected) {
    previewPaneRef.current = document.querySelector('.group\\/preview .overflow-y-auto');
  }
  return previewPaneRef.current;
}, []);

// 替换为
const previewPaneRef = useRef<HTMLDivElement>(null);
const getPreviewPane = useCallback(() => previewPaneRef.current, []);
```

**验收**: 
- [ ] 点击 ClozeNavigator，预览同步滚动
- [ ] 点击预览 Cloze，编辑器跳转

---

### Phase B: 简化冗余包装函数 (0.5 天) [可选]

**目标**: 减少不必要的中间函数

**示例**:
```typescript
// 可以内联的简单 handler
const handleCopyClozeAnswer = () => {
  // 直接在 onClick 中实现，无需单独函数
};
```

**注意**: 此阶段为可选优化，不影响功能

---

### Phase C: 集成 IncrementalMarkdownContent (0.5 天)

**目标**: 替换预览组件为增量渲染版本

**修改**:
```diff
- import { MarkdownContent } from '../shared/MarkdownContent';
+ import { IncrementalMarkdownContent } from '../shared/IncrementalMarkdownContent';

  <div ref={previewPaneRef} className="flex-1 overflow-y-auto px-8 py-8">
-   <MarkdownContent
+   <IncrementalMarkdownContent
      content={parsedPreview.renderableContent}
-     headings={parsedPreview.headings}
      variant="edit"
      onClozeClick={handlePreviewClozeClick}
      onClozeContextMenu={handlePreviewClozeContextMenu}
      onErrorLinkClick={handlePreviewErrorClick}
  </div>
```

**注意**: `IncrementalMarkdownContent` 不支持 `headings` prop，TOC 需要单独处理

#### 3.2 验收

- [ ] 编辑器滚动，预览同步滚动
- [ ] 点击预览 Cloze，编辑器跳转
- [ ] 50+ 公式文档首屏 < 200ms

---

### Phase 4: 稳健同步机制 (可选, 1 天)

**目标**: 解决基于索引的脆弱匹配问题

#### 4.1 Cloze UUID 方案

```typescript
// parser.ts 修改
interface ClozeItem {
  id: number;
  uuid: string; // 新增: `${id}-${occurrence}-${hash}`
  // ...
}
```

```tsx
// MarkdownContent 渲染
<span data-cloze-uuid={cloze.uuid}>...</span>
```

```typescript
// useScrollSync 查询
const element = document.querySelector(`[data-cloze-uuid="${uuid}"]`);
```

---

## 四、影响范围

### 4.1 直接修改文件

| 文件 | 修改类型 | 风险 |
|------|----------|------|
| `EditMode.tsx` | 优化 (1411→~900行) | 低 |

### 4.2 新增文件

**无** (复用现有组件)

### 4.3 不受影响

- `ClozeMode.tsx` - 独立渲染逻辑
- `BlurMode.tsx` - 独立渲染逻辑
- 所有 Store / Dashboard 组件

---

## 五、验收标准

### 5.1 功能验收

| 功能 | 验收方法 |
|------|----------|
| Cloze 创建/删除 | Ctrl+Shift+C, Ctrl+Shift+X |
| 编辑器↔预览同步 | 点击预览 Cloze，编辑器跳转 |
| 文件保存 | Ctrl+S，dirty 状态正确 |

### 5.2 代码质量验收

| 指标 | 目标值 |
|------|--------|
| EditMode.tsx 行数 | < 900 |
| DOM 直接查询 | **0** (使用 Ref) |
| 新增文件数 | **0** |

---

## 六、时间估算

| 阶段 | 预计时间 |
|------|----------|
| Phase A: previewRef 替换 | 0.5 天 |
| Phase B: 简化冗余 (可选) | 0.5 天 |
| Phase C: 增量渲染集成 | 0.5 天 |
| **总计** | **1-1.5 天** |

---

## 七、回滚方案

```typescript
// 保留原 MarkdownContent 作为备选
<IncrementalMarkdownContent ... />
// 如有问题，改回:
<MarkdownContent ... />
```

---

*版本: 2.0 (精简版)*
*更新日期: 2025-11-27*