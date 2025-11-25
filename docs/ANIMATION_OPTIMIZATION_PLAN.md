# 动画性能优化计划

> **目标**: 将所有动画从 Framer Motion 迁移到 CSS Transitions/Animations，消除主线程阻塞，实现 60fps 流畅体验。

## 核心问题分析

### 为什么 Framer Motion 在本项目中表现不佳？

Framer Motion 本身是一个优秀的动画库，但在特定场景下会导致性能问题：

#### 1. React 状态驱动的性能陷阱

```tsx
// ❌ 问题写法：动画触发整个组件树重渲染
const [isOpen, setIsOpen] = useState(false);

<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
    >
      {/* 复杂内容 */}
    </motion.div>
  )}
</AnimatePresence>
```

**问题**：`isOpen` 状态变化 → 触发 React 重渲染 → AnimatePresence 计算动画差异 → 执行动画

#### 2. `layout` Prop 的高昂代价

```tsx
// ❌ 最危险的用法
{items.map((item) => (
  <motion.div
    key={item.id}
    layout  // 每个元素都在每帧测量 DOM 尺寸
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
  >
    {item.content}
  </motion.div>
))}
```

**代价**：
- 每帧调用 `getBoundingClientRect()` 测量所有启用 `layout` 的元素
- 触发浏览器强制同步布局 (Forced Synchronous Layout)
- DOM 树越深、元素越多，主线程阻塞越严重

#### 3. AnimatePresence 的隐藏开销

AnimatePresence 需要：
1. 维护离开动画的元素副本
2. 计算进入/离开动画的差异
3. 协调多个动画状态

### GPU 加速属性 vs 布局触发属性

| 属性类型 | 示例 | GPU 加速 | 触发重排 |
|---------|------|---------|---------|
| **Transform** | `transform: translateX/Y, scale, rotate` | ✅ 是 | ❌ 否 |
| **Opacity** | `opacity` | ✅ 是 | ❌ 否 |
| **Filter** | `filter: blur()` | ✅ 是 | ❌ 否 |
| **布局属性** | `width, height, padding, margin` | ❌ 否 | ✅ 是 |
| **定位属性** | `top, left, right, bottom` | ❌ 否 | ✅ 是 |

---

## 当前项目动画使用审计

### 🔴 高优先级 (严重性能影响)

| 文件 | 问题 | 影响 |
|-----|------|------|
| `RecycleBin.tsx:95` | `layout` prop 在列表项上 | 列表滚动/增删时每帧测量所有元素 |
| `LibraryView.tsx:412-420` | Welcome Screen 无限循环 blob 动画 | 后台持续消耗 CPU |
| `ThemeController.tsx:37-39` | `whileHover/whileTap` 在按钮上 | 每次 hover/tap 触发 React 状态更新 |

### 🟡 中优先级 (可优化)

| 文件 | 问题 | 建议 |
|-----|------|------|
| `LibraryView.tsx:398-699` | 多层嵌套 AnimatePresence | 合并或用 CSS transitions 替代 |
| `LibraryHeader.tsx:401-459` | Account dropdown AnimatePresence | 改用 CSS transitions |
| `AuthGate.tsx:113-302` | 页面级 AnimatePresence | 改用 CSS transitions |

### 🟢 已优化 (可作为参考)

| 文件 | 优化方式 |
|-----|---------|
| `ToastContainer.tsx` | CSS keyframes + `animate-in/out` |
| `SessionSummary.tsx` | CSS transitions |
| `ModeActionHint.tsx` | CSS transitions |
| `NoteRenderer.tsx:386-445` | CSS transforms 实现双层切换 |
| `LibraryView.tsx:551-558` | CSS transitions 实现 sliding pill |

---

## 优化方案

### Phase 1: 消除 `layout` Prop (紧急)

**文件**: `RecycleBin.tsx`

```tsx
// ❌ 当前代码
<motion.div
  key={note.noteId}
  layout  // 删除这个
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -4 }}
>

// ✅ 优化后
<div
  key={note.noteId}
  className="animate-in fade-in slide-in-from-bottom-1 duration-150"
>
```

---

### Phase 2: 替换 `whileHover/whileTap` (高优)

**文件**: `ThemeController.tsx`

```tsx
// ❌ 当前代码
<motion.button
  whileHover={{ scale: 1.05, rotate: 15 }}
  whileTap={{ scale: 0.95 }}
>

// ✅ 优化后
<button
  className="transition-transform duration-150 hover:scale-105 hover:rotate-[15deg] active:scale-95"
>
```

**原理**: CSS `:hover` 和 `:active` 伪类由浏览器原生处理，不触发 React 重渲染。

---

### Phase 3: 替换 AnimatePresence Dropdowns (中优)

**文件**: `ThemeController.tsx`, `LibraryHeader.tsx`

```tsx
// ❌ 当前代码
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
    >
      {/* dropdown content */}
    </motion.div>
  )}
</AnimatePresence>

// ✅ 优化后
<div
  className={`
    transition-all duration-200 ease-out
    ${isOpen 
      ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' 
      : 'opacity-0 translate-y-2 scale-95 pointer-events-none'}
  `}
>
  {/* dropdown content - 始终挂载 */}
</div>
```

**注意**: 始终挂载 dropdown 可能会有无障碍问题，需要添加 `aria-hidden={!isOpen}`。

---

### Phase 4: 优化 Welcome Screen 动画 (中优)

**文件**: `LibraryView.tsx`

```tsx
// ❌ 当前代码：无限循环动画
<motion.div 
  animate={{ scale: [1, 1.1, 1], rotate: [0, 10, 0] }}
  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
  className="blob ..."
/>

// ✅ 优化方案 A: CSS 动画 (GPU 加速)
// 在 index.css 中添加:
@keyframes blob-float {
  0%, 100% { transform: scale(1) rotate(0deg); }
  50% { transform: scale(1.1) rotate(10deg); }
}

.blob-animated {
  animation: blob-float 20s ease-in-out infinite;
  will-change: transform;
}

// 组件中:
<div className="blob-animated ..." />

// ✅ 优化方案 B: 仅在 Welcome Screen 可见时播放
const [blobsVisible, setBlobsVisible] = useState(true);

// 进入 Library 后暂停
useEffect(() => {
  if (rootPath) {
    setBlobsVisible(false);
  }
}, [rootPath]);
```

---

### Phase 5: 简化页面级过渡 (低优)

**文件**: `AuthGate.tsx`, `LibraryView.tsx` (Welcome ↔ Library)

对于整页切换，可以保留 Framer Motion 但简化配置：

```tsx
// 简化过渡，减少计算量
<motion.div
  key="page"
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.2 }}  // 缩短时长
>
```

或完全改用 CSS View Transitions API (需要现代浏览器支持)。

---

## CSS 动画工具类参考

在 `src/index.css` 中添加以下工具类：

```css
/* === 进入动画 === */
.animate-in {
  animation-duration: 200ms;
  animation-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
  animation-fill-mode: both;
}

.fade-in {
  animation-name: fadeIn;
}

.slide-in-from-bottom-1 {
  --tw-enter-translate-y: 0.25rem;
  animation-name: slideInFromBottom;
}

.slide-in-from-bottom-2 {
  --tw-enter-translate-y: 0.5rem;
  animation-name: slideInFromBottom;
}

.zoom-in-95 {
  animation-name: zoomIn95;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideInFromBottom {
  from { 
    opacity: 0;
    transform: translateY(var(--tw-enter-translate-y, 0.5rem)); 
  }
  to { 
    opacity: 1;
    transform: translateY(0); 
  }
}

@keyframes zoomIn95 {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* === 离开动画 === */
.animate-out {
  animation-duration: 150ms;
  animation-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
  animation-fill-mode: both;
}

.fade-out {
  animation-name: fadeOut;
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* === 背景装饰动画 === */
@keyframes blob-float-1 {
  0%, 100% { transform: scale(1) rotate(0deg); }
  50% { transform: scale(1.1) rotate(10deg); }
}

@keyframes blob-float-2 {
  0%, 100% { transform: scale(1) rotate(0deg); }
  50% { transform: scale(1.2) rotate(-15deg); }
}

.blob-animated-1 {
  animation: blob-float-1 20s ease-in-out infinite;
  will-change: transform;
}

.blob-animated-2 {
  animation: blob-float-2 25s ease-in-out infinite;
  will-change: transform;
}

/* GPU 加速提示 */
.gpu-accelerated {
  will-change: transform, opacity;
  transform: translateZ(0);
}
```

---

## 性能验证清单

优化后使用 Chrome DevTools 验证：

1. **Performance Panel**
   - [ ] 录制页面切换，检查 "Recalculate Style" 时间 < 5ms
   - [ ] 检查 "Layout" 事件频率 (应该很少)
   - [ ] 检查 GPU 层数量合理 (Layers Panel)

2. **Rendering Panel**
   - [ ] 启用 "Paint flashing"，确认只有动画区域在重绘
   - [ ] 启用 "Layout Shift Regions"，确认无意外布局偏移

3. **INP (Interaction to Next Paint)**
   - [ ] 使用 web-vitals 测量，目标 < 200ms
   - [ ] 重点测试：点击文件打开、切换 Tab、打开下拉菜单

---

## 实施优先级

| 优先级 | 任务 | 预计收益 | 预计工时 |
|--------|------|---------|---------|
| P0 | 移除 RecycleBin layout prop | 列表性能大幅提升 | 30min |
| P1 | 替换 ThemeController whileHover/whileTap | 减少不必要渲染 | 30min |
| P1 | 替换 dropdown AnimatePresence | 下拉菜单更流畅 | 1h |
| P2 | CSS 化 Welcome Screen blobs | 减少后台 CPU | 30min |
| P2 | 简化/移除 LibraryHeader motion | 导航栏更快响应 | 1h |
| P3 | 评估 AuthGate 过渡必要性 | 启动更快 | 30min |

---

## 参考资料

- [Motion Performance Guide](https://motion.dev/docs/performance)
- [CSS Triggers](https://csstriggers.com/) - 各 CSS 属性的渲染成本
- [Web Vitals INP](https://web.dev/inp/) - 交互响应性指标
- [Avoid Large, Complex Layouts](https://web.dev/avoid-large-complex-layouts-and-layout-thrashing/)

---

## 更新日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2025-01-XX | v1.0 | 初始优化计划 |
| 2025-01-XX | v1.1 | **完成优化实施** |

---

## ✅ 已完成的优化

### P0: RecycleBin.tsx
- ❌ 移除 `layout` prop (严重性能问题)
- ❌ 移除 `AnimatePresence`
- ✅ 改用 CSS `.animate-card-entry` 和 `.animate-fade-slide-in`

### P1: ThemeController.tsx
- ❌ 移除 `whileHover={{ scale: 1.05, rotate: 15 }}`
- ❌ 移除 `whileTap={{ scale: 0.95 }}`
- ❌ 移除 `AnimatePresence`
- ✅ 改用 CSS `hover:scale-105 hover:rotate-[15deg] active:scale-95`
- ✅ 改用 CSS `.dropdown-enter/.dropdown-open/.dropdown-closed`

### P1: LibraryHeader.tsx
- ❌ 移除外层 `motion.div` 动画
- ❌ 移除内部 `motion.div` 元素
- ❌ 移除 Account dropdown `AnimatePresence`
- ✅ 改用 CSS `.animate-header-entry` 和 `.animate-fade-slide-in`
- ✅ 改用 CSS `.dropdown-enter/.dropdown-open/.dropdown-closed`

### P2: LibraryView.tsx - Welcome Screen
- ❌ 移除 blob 的 Framer Motion 无限循环动画
- ❌ 移除内部 `motion.div` 元素
- ✅ 改用 CSS `.blob-animated-1` 和 `.blob-animated-2`
- ✅ 改用 CSS `.animate-content-entry` 和 `.animate-content-entry-delayed`
- ✅ **保留** 页面级 `AnimatePresence` (exit 动画仍有价值)

### P2: AuthGate.tsx
- ❌ 移除 loading spinner 无限循环动画
- ❌ 移除 login page blob 无限循环动画
- ✅ 改用 CSS `.animate-loading-spinner`
- ✅ 改用 CSS `.blob-animated-login-1` 和 `.blob-animated-login-2`
- ✅ **保留** 页面级 `AnimatePresence` (exit 动画仍有价值)

---

## 新增 CSS 动画工具类 (index.css)

```css
/* Dropdown 动画 */
.dropdown-enter / .dropdown-open / .dropdown-closed

/* 列表项进入动画 */
.animate-fade-slide-in

/* Welcome 背景 blob */
.blob-animated-1 / .blob-animated-2

/* Header 入场动画 */
.animate-header-entry

/* 内容区域入场动画 */
.animate-content-entry / .animate-content-entry-delayed

/* 卡片入场动画 */
.animate-card-entry

/* Loading 旋转动画 */
.animate-loading-spinner

/* Login 页面 blob */
.blob-animated-login-1 / .blob-animated-login-2
```
