# Cloze 渲染架构重构设计

## 当前问题总结

### 1. 重复的组件覆盖逻辑

| 位置 | 代码行 | 问题 |
|------|--------|------|
| `MarkdownContent.tsx` | 106-168, 231-289 | 定义了 cloze/math-cloze 的默认渲染 |
| `ClozeMode.tsx` | 262-370 | **完全覆盖**相同逻辑，增加 reveal 状态 |

**后果**：维护两份几乎相同的代码，任何 bug 修复需要同步两处。

### 2. InlineCloze 组件未被复用

- `InlineCloze` 是一个优化良好的 `memo` 组件
- `MarkdownContent` 直接内联渲染 cloze，没有使用它
- `ClozeMode` 使用了它，但通过完全覆盖 `a` 组件的方式

### 3. BlurMode 双重内容处理

```tsx
// BlurMode.tsx - 当前实现
<MarkdownContent content={cleanContent(currentNote.content)} />

function cleanContent(content: string): string {
  return content
    .replace(/==(.*?)==/g, '$1')
    .replace(/{{c\d+::([\s\S]*?)(?:::(.*?))?}}/g, '$1');
}
```

**问题**：
- `parseNote` 已经生成了 `renderableContent`，其中 cloze 被转换为链接格式
- `cleanContent` 使用的正则可能与 parser 不一致
- 应该使用 parser 的输出或定义统一的 "blur" 渲染模式

### 4. Occurrence Counter 重复实现

- `MarkdownContent.tsx:35` - `clozeCounts` ref
- `ClozeMode.tsx:15` - `clozeCountsRef`

两处做相同的 `id → occurrence index` 计算。

---

## 用户行为逻辑分析

| 模式 | 用户目标 | Cloze 显示 | 交互行为 |
|------|----------|-----------|----------|
| **EditMode** | 编辑笔记 | 显示答案 + `sup` ID 标记 | 点击跳转源码，右键菜单 |
| **ClozeMode** | 测试记忆 | 隐藏 → 点击揭示 | 点击 reveal，confetti，滚动聚焦 |
| **BlurMode** | 整页回忆 | 纯文本（无 cloze 视觉效果） | 无交互 |

### 状态差异

| 属性 | EditMode | ClozeMode | BlurMode |
|------|----------|-----------|----------|
| `isRevealed` | 始终 true | 由用户控制 | N/A |
| `isInteractive` | true (定位) | true (reveal) | false |
| `showIdBadge` | true | true | false |
| `variant` | `edit` | `review` | `blur` |

---

## 重构方案

### 核心思路

1. 给 `MarkdownContent` 添加 `variant` prop
2. 在内部根据 variant 使用不同的渲染策略
3. 复用 `InlineCloze` 和 `MathClozeBlock`
4. ClozeMode 只需传入状态，不再覆盖组件

### API 设计

```tsx
// MarkdownContent.tsx - 新 Props

type ClozeVariant = 'edit' | 'review' | 'blur';

interface MarkdownContentProps {
    content: string;
    className?: string;
    hideFirstH1?: boolean;
    disableIds?: boolean;
    
    // === Cloze 相关 (新增) ===
    /** 渲染模式 */
    variant?: ClozeVariant; // default: 'edit'
    
    /** ClozeMode 专用：当前正在复习的 cloze ID */
    currentClozeIndex?: number | null;
    
    /** ClozeMode 专用：reveal 状态 */
    revealedState?: Record<string, boolean>;
    
    /** ClozeMode 专用：toggle reveal 回调 */
    onToggleReveal?: (key: string) => void;
    
    // === EditMode 专用 (保留) ===
    onClozeClick?: (id: number, occurrenceIndex: number, target: HTMLElement) => void;
    onClozeContextMenu?: (id: number, occurrenceIndex: number, target: HTMLElement, event: React.MouseEvent) => void;
    onErrorLinkClick?: (kind: 'unclosed' | 'malformed' | 'dangling', occurrenceIndex: number, target?: HTMLElement) => void;
}
```

### 渲染策略

```tsx
// 在 MarkdownContent 内部

const variant = props.variant ?? 'edit';

// 根据 variant 决定渲染组件
const renderInlineCloze = (id: number, key: string, children: ReactNode, hint?: string) => {
    switch (variant) {
        case 'blur':
            // 纯文本，无样式
            return <span>{children}</span>;
            
        case 'review': {
            const isTarget = currentClozeIndex !== null ? id === currentClozeIndex : true;
            const isRevealed = revealedState?.[key] ?? false;
            return (
                <InlineCloze
                    id={id}
                    clozeKey={key}
                    isTarget={isTarget}
                    isContext={!isTarget}
                    isRevealed={currentClozeIndex !== null ? (isTarget ? isRevealed : true) : isRevealed}
                    hint={hint}
                    onToggle={onToggleReveal ?? (() => {})}
                >
                    {children}
                </InlineCloze>
            );
        }
        
        case 'edit':
        default:
            // 现有 EditMode 渲染逻辑
            return (/* 当前 MarkdownContent 的 a 组件逻辑 */);
    }
};
```

### 使用示例

```tsx
// EditMode.tsx - 无变化（默认 variant='edit'）
<MarkdownContent
    content={parsedPreview.renderableContent}
    onClozeClick={handlePreviewClozeClick}
    onClozeContextMenu={handlePreviewClozeContextMenu}
/>

// ClozeMode.tsx - 简化后
<MarkdownContent
    content={currentNote.renderableContent}
    variant="review"
    currentClozeIndex={currentClozeIndex}
    revealedState={revealed}
    onToggleReveal={toggleReveal}
    hideFirstH1
/>
// 不再需要 components={{ a: ..., code: ... }} 覆盖！

// BlurMode.tsx - 简化后
<MarkdownContent
    content={currentNote.renderableContent}  // 使用 renderableContent，不再需要 cleanContent
    variant="blur"
    hideFirstH1
/>
```

---

## 实施步骤

### Phase 1: 扩展 MarkdownContent

1. 添加新 props: `variant`, `currentClozeIndex`, `revealedState`, `onToggleReveal`
2. 导入并复用 `InlineCloze` 组件
3. 修改 `a` 和 `code` 组件，根据 variant 选择渲染策略

### Phase 2: 简化 ClozeMode

1. 移除 `components={{ a: ..., code: ... }}` 覆盖
2. 使用新的 props 传递状态
3. 删除冗余的 `clozeCountsRef`（由 MarkdownContent 内部管理）

### Phase 3: 修复 BlurMode

1. 使用 `renderableContent` 替代 `cleanContent(content)`
2. 设置 `variant="blur"`
3. 删除 `cleanContent` 函数

### Phase 4: 清理

1. 验证所有模式正常工作
2. 移除冗余代码
3. 更新性能文档

---

## 预期收益

| 指标 | 改进 |
|------|------|
| **代码行数** | 减少 ~150 行重复代码 |
| **维护成本** | Cloze 渲染逻辑统一管理 |
| **一致性** | 三种模式共用相同的基础组件 |
| **性能** | InlineCloze memo 优化在所有模式生效 |

---

## 风险评估

1. **Breaking Change**: ClozeMode 的行为可能微调，需要仔细测试
2. **BlurMode 兼容性**: 需要确认 `renderableContent` 的链接格式在 blur 模式下正确处理

## 实施记录

### 已完成 ✅

1. **扩展 MarkdownContent**
   - 添加 `variant: 'edit' | 'review' | 'blur'` prop
   - 添加 `currentClozeIndex`, `revealedState`, `onToggleReveal` props
   - `code` 组件：根据 variant 渲染 MathClozeBlock（edit/review/blur 三种模式）
   - `a` 组件：根据 variant 渲染 InlineCloze（review 模式）或纯文本（blur 模式）

2. **简化 ClozeMode**
   - 移除 `ClozeContext.Provider` 包裹
   - 移除 `components={{ a: ClozeLink, code: ClozeCode }}` 覆盖
   - 改用 `variant="review"` + 状态 props

3. **简化 BlurMode**
   - 使用 `renderableContent` 替代 `cleanContent(content)`
   - 设置 `variant="blur"`
   - 删除 `cleanContent()` 函数

4. **删除冗余文件**
   - `ClozeContext.tsx` - 不再需要
   - `ClozeComponents.tsx` - 不再需要

### 代码变更统计

| 指标 | 变化 |
|------|------|
| 删除文件 | 2 个 (ClozeContext.tsx, ClozeComponents.tsx) |
| 减少代码 | ~140 行重复逻辑 |
| 新增代码 | ~60 行 variant 逻辑（集中在 MarkdownContent） |
| 净减少 | ~80 行 + 2 个文件 |

### 架构改进

**Before**:
```
ClozeMode → ClozeContext.Provider → MarkdownContent → ClozeComponents (a, code)
BlurMode → cleanContent() → MarkdownContent
```

**After**:
```
ClozeMode → MarkdownContent(variant="review", state props)
BlurMode → MarkdownContent(variant="blur")
EditMode → MarkdownContent(variant="edit" [default])
```

### 验证

- ✅ TypeScript 编译通过
- ✅ Vite 生产构建成功

---

## 第二次优化：Context 隔离

### 问题

Props 方案中，每次点击 cloze 时：
1. `revealedState` 对象引用变化
2. MarkdownContent 的 memo 失效
3. 整个 ReactMarkdown AST 重新遍历

### 解决方案

使用 Context 将 reveal 状态与 MarkdownContent 解耦：

```tsx
// ClozeMode.tsx
<ClozeRevealProvider revealed={revealed} ...>
  <MarkdownContent variant="review" />  // 不接收 revealed
</ClozeRevealProvider>

// MarkdownContent 内部
<ClozeWithContext id={...} />  // 从 Context 获取状态
```

### 新增文件

| 文件 | 作用 |
|------|------|
| `ClozeRevealContext.tsx` | Context Provider + Hook |
| `ClozeWithContext.tsx` | 从 Context 读取状态并渲染 |

### 性能收益

| 指标 | Before (Props) | After (Context) |
|------|----------------|-----------------|
| ReactMarkdown 遍历 | O(n) nodes | 0 |
| 组件重渲染 | 所有 | 只有 ClozeWithContext |

### 架构图 (Context 方案 - 已废弃)

```
ClozeMode (state: revealed)
├── ClozeRevealProvider (持有 Context)
│   └── MarkdownContent (memo 生效，不因 revealed 变化而重渲染)
│       ├── 普通内容 (不重渲染)
│       └── ClozeWithContext (使用 useContext，随 Context 更新)
│           └── InlineCloze / MathClozeBlock (memo 生效)
```

---

## 第三次优化：Zustand 细粒度订阅

### Context 方案的问题

Context 方案虽然避免了 ReactMarkdown 重新渲染，但有一个缺陷：
- 当 `revealed` 对象变化时，Context 的 `value` 也变化
- **所有** 使用 `useContext` 的 `ClozeWithContext` 组件都会重新渲染
- 即使只有一个 cloze 被点击，所有 cloze 都重新渲染

### Zustand 解决方案

使用 Zustand 的细粒度 selector，让每个 cloze 只订阅自己的 key：

```tsx
// store/clozeRevealStore.ts
export const useIsRevealed = (key: string): boolean => {
    return useClozeRevealStore((state) => !!state.revealed[key]);
};

// ClozeWithContext.tsx
const baseRevealed = useIsRevealed(clozeKey);  // 只订阅 "1-0"
```

### 性能收益

| 场景 | Context | Zustand |
|------|---------|---------|
| 点击 cloze "1-0" | 所有 cloze 重渲染 | **只有 "1-0" 重渲染** |
| 10 个 cloze | 10 次组件渲染 | **1 次组件渲染** |

### 最终架构图

```
ClozeMode
├── useClozeRevealStore (Zustand)
│   └── revealed: { "1-0": true, "2-0": false, ... }
│
└── MarkdownContent (memo 生效)
    ├── 普通内容 (不重渲染)
    └── ClozeWithContext
        └── useIsRevealed("1-0")  ← 细粒度订阅
            └── InlineCloze (只有 key 变化时重渲染)
```

### 数据流

```
1. 用户点击 cloze "1-0"
2. ClozeWithContext 调用 store.toggleReveal("1-0")
3. Zustand 更新 revealed["1-0"] = true
4. 只有订阅 "1-0" 的 ClozeWithContext 重新渲染
5. 其他 cloze 组件不受影响
```

### 文件变更

| 文件 | 状态 |
|------|------|
| `store/clozeRevealStore.ts` | ✅ 新增 |
| `ClozeWithContext.tsx` | ✅ 使用 Zustand |
| `ClozeMode.tsx` | ✅ 使用 Zustand |
| `ClozeRevealContext.tsx` | ❌ 已删除 |
