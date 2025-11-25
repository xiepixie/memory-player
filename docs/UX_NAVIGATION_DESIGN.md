# Memory Player - 导航与状态管理 UX 设计

## 页面角色定位

### 1. LibraryView (入口层)
**职责**：用户的"家"，提供 Vault 选择、文件浏览、数据洞察

| 状态 | UI 呈现 |
|------|---------|
| `rootPath=null` | Welcome Screen - 品牌展示 + Open Vault + Demo Vault + Recent Vaults |
| `rootPath=exists` | Library Browser - Dashboard + File List |

**子视图**：
- **Focus Tab**: ActionCenter (开始/恢复复习) + 文件列表
- **Insights Tab**: 完整 Dashboard 数据分析

### 2. NoteRenderer (内容层)
**职责**：笔记阅读、编辑、复习

| viewMode | 描述 |
|----------|------|
| `edit` | 编辑模式 - 双栏 Markdown 编辑器 |
| `test` | Cloze 模式 - 挖空测试 |
| `master` | Blur 模式 - 模糊回忆 |
| `summary` | Session 结束总结 |

### 3. Dashboard (数据层)
**职责**：数据分析、复习行动触发

**嵌入位置**：LibraryView 内部，通过 `mode` prop 控制显示范围
- `hero-only`: 只显示 ActionCenter
- `insights-only`: 只显示数据图表
- `full`: 完整 Dashboard

---

## 导航状态机

```
                    ┌─────────────────────────────────────┐
                    │           AuthGate                   │
                    │  checking → needs-login → ready     │
                    └─────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              ┌─────▼─────┐                  ┌──────▼──────┐
              │  Welcome  │                  │   Layout    │
              │  Screen   │                  │ (rootPath)  │
              │  (null)   │                  │             │
              └─────┬─────┘                  └──────┬──────┘
                    │                               │
            Open Vault                     ┌───────┴───────┐
                    │                      │               │
              ┌─────▼─────┐          ┌─────▼─────┐  ┌──────▼──────┐
              │  Library  │          │   Note    │  │   Session   │
              │  Browser  │◄────────►│  Renderer │  │   Summary   │
              │  (files)  │  Open    │  (file)   │  │  (complete) │
              └───────────┘  File    └───────────┘  └─────────────┘
```

---

## 状态持久化策略

### Zustand Persist (IndexedDB)

```typescript
partialize: (state) => ({
  // 核心状态
  rootPath: state.rootPath,
  recentVaults: state.recentVaults,
  files: state.files,
  theme: state.theme,
  
  // 视图状态
  viewMode: state.viewMode,
  currentFilepath: state.currentFilepath,
  currentClozeIndex: state.currentClozeIndex,
  
  // Session 状态
  queue: state.queue,
  sessionIndex: state.sessionIndex,
  sessionTotal: state.sessionTotal,
  sessionStats: state.sessionStats,
  
  // 增量同步游标
  lastServerSyncAt: state.lastServerSyncAt,
})
```

### 不持久化的状态（需要 hydration）
- `currentNote` - 从文件系统加载
- `currentMetadata` - 从后端获取
- `fileMetadatas` - 首次进入时全量拉取

---

## 冷启动 Hydration 流程

### 场景：用户刷新页面时处于复习模式

```
┌──────────────────────────────────────────────────────────────┐
│ 1. 读取持久化状态                                              │
│    viewMode='test', currentFilepath='/notes/math.md'         │
│    queue=[...], sessionIndex=5                               │
└────────────────────────────────┬─────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────┐
│ 2. NoteRenderer 挂载                                          │
│    - 检查 session 是否 stale (>4小时)                         │
│    - 如果 stale → setViewMode('library') 显示 Resume UI      │
│    - 如果 fresh → 开始 hydration                             │
└────────────────────────────────┬─────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────┐
│ 3. Hydration 阶段                                             │
│    - 显示 Loading UI ("Restoring your session...")           │
│    - loadNote(currentFilepath, targetClozeIndex)             │
│    - 完成后正常显示内容                                        │
└──────────────────────────────────────────────────────────────┘
```

### 场景：用户从 Session Summary 返回

```
┌──────────────────────────────────────────────────────────────┐
│ 1. 用户点击 "Back to Library"                                 │
│    - setQueue([])  // 清理 session 状态                       │
│    - setViewMode('library')                                  │
└────────────────────────────────┬─────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────┐
│ 2. LibraryView 渲染                                           │
│    - ActionCenter 显示 "Ready to Review" (非 Active Session)  │
│    - 用户可以开始新 session                                    │
└──────────────────────────────────────────────────────────────┘
```

---

## Session 状态管理

### Session 生命周期

```
┌─────────────┐    startSession()    ┌─────────────┐
│   IDLE      │────────────────────►│   ACTIVE    │
│  (queue=[]) │                      │ (queue>0)   │
└─────────────┘                      └──────┬──────┘
       ▲                                    │
       │                             saveReview()
       │                                    │
       │         ┌──────────────────────────┼──────────────────────────┐
       │         │                          │                          │
       │    nextIndex < queue.length   nextIndex >= queue.length   >4 hours
       │         │                          │                          │
       │    ┌────▼────┐              ┌──────▼──────┐            ┌──────▼──────┐
       │    │  NEXT   │              │  COMPLETE   │            │   STALE     │
       │    │  CARD   │              │  (summary)  │            │  SESSION    │
       │    └────┬────┘              └──────┬──────┘            └──────┬──────┘
       │         │                          │                          │
       │         └──────────────────────────┴──────────────────────────┘
       │                                    │
       │                        setQueue([]) / onDiscard
       │                                    │
       └────────────────────────────────────┘
```

### Stale Session 处理

当 `sessionStats.timeStarted` 距今超过 4 小时：
1. **NoteRenderer 检测**：自动重定向到 Library
2. **ActionCenter 显示**："Unfinished Session" 卡片
3. **用户选择**：
   - "Continue Session" → 恢复到上次位置
   - "Discard" → 清空 queue，开始新的

---

## 云端 vs 本地模式

### 模式切换流程

```
┌─────────────────────────────────────────────────────────────┐
│                     AuthGate                                 │
├─────────────────────────────────────────────────────────────┤
│ 1. 检查 Supabase 配置                                        │
│    - 无配置 → initDataService('mock') → 进入 Local Mode     │
│    - 有配置 → 检查登录状态                                   │
│                                                              │
│ 2. 登录状态检查                                              │
│    - 已登录 → initDataService('supabase') → 进入 Cloud Mode │
│    - 未登录 → 显示 Login UI                                  │
│                                                              │
│ 3. Session 过期处理                                          │
│    - signOut() → 清理状态 → 重新显示 Login UI                │
└─────────────────────────────────────────────────────────────┘
```

### UI 差异

| 功能 | Cloud Mode | Local Mode |
|------|-----------|------------|
| **Header 显示** | Sync Button + Account Menu | "Local-only" Badge |
| **数据源** | Supabase | LocalStorage/IndexedDB |
| **Vault 选择** | 云端 Vault 列表 | 本地文件夹 |
| **实时同步** | ✅ Realtime 订阅 | ❌ |
| **跨设备** | ✅ | ❌ |

---

## 返回导航逻辑

### 从任意页面返回的规则

| 当前位置 | 返回目标 | 触发方式 |
|---------|---------|---------|
| NoteRenderer (edit/test/master) | LibraryView | `closeNote()` 或 Back Button |
| SessionSummary | LibraryView | "Back to Library" Button |
| LibraryView (rootPath exists) | Welcome Screen | 点击 Logo |
| Welcome Screen | - | 无返回 |

### 快捷键

- `Escape`: 退出 Immersive Mode 或关闭当前笔记
- `Ctrl+B/I`: 编辑模式格式化
- `Ctrl+Shift+C`: 新建 Cloze
- `Alt+↑/↓`: 跳转 Cloze

---

## 边缘情况处理

### 1. 持久化状态不一致
**场景**：`currentFilepath` 存在但 `rootPath` 为空
**处理**：在 Layout 或 NoteRenderer 中检测，自动清理不一致状态

### 2. 文件不存在
**场景**：持久化的 `currentFilepath` 对应的文件已删除
**处理**：`loadNote` 失败时显示错误 Toast，返回 Library

### 3. Session 中途切换 Vault
**场景**：用户在复习中切换到另一个 Vault
**处理**：提示用户确认，清理当前 session

### 4. 网络断开
**场景**：Cloud Mode 下网络断开
**处理**：乐观 UI 更新，本地缓存，恢复时自动同步

### 5. Demo Vault 刷新
**场景**：用户在 Demo Vault 中刷新页面
**处理**：
- `loadContentFromSource` 检测 Demo 文件使用双重检查：`rootPath === 'DEMO_VAULT' || filepath.startsWith('/Demo/')`
- 这确保即使在 IndexedDB 异步恢复期间 `rootPath` 暂时为空，Demo 文件仍能正确加载
- Layout 状态保护也排除 Demo 文件，避免误判为不一致状态

### 6. Async Persist Hydration 竞态
**场景**：IndexedDB 异步恢复导致状态暂时不完整
**处理**：
- 关键检查（如 Demo 文件检测）使用多重条件避免依赖单一状态
- Stale session 检测等待 persist 恢复完成后再执行
- Layout 状态保护使用 filepath 模式匹配作为回退

### 7. loadSettings 与 persist 冲突 (已修复)
**场景**：刷新后 rootPath 被重置为 null，导致返回选择仓库页面
**根本原因**：
- `loadSettings()` 检查 `localStorage.getItem('app-store')` 是否存在
- 但 persist middleware 使用 IndexedDB，而非 localStorage
- 因此检查永远返回 `null`，导致执行旧的迁移逻辑 `set({ rootPath: null, ... })`
**修复**：将 `loadSettings` 改为 no-op，完全依赖 persist middleware 处理状态恢复

---

## 模式切换优化

### Write/Cloze/Blur 模式切换
- **双层持久架构**：Editor 层和 Review 层同时挂载，通过 CSS 控制显示
- **Cloze 和 Blur 同时挂载**：避免切换时的组件卸载/重新挂载开销
- **滑动背景指示器**：模式切换按钮使用 CSS transition 的滑动背景，视觉更流畅

### StickyBoard 交互增强
- **快捷键支持**：`Ctrl+N` 快速添加新便签
- **键盘提示**：打开时显示 3 秒的快捷键提示
- **悬停效果优化**：添加按钮悬停高亮效果

---

## Cloze 样式统一

### Text Cloze 与 Math Cloze 统一
所有 cloze 类型现在共享一致的交互样式：

| 状态 | 背景 | 边框 | Badge |
|------|------|------|-------|
| Hidden (Interactive) | `bg-base-300/80` | `border-base-content/15` | `bg-primary/10 text-primary` |
| Hidden Hover | `bg-base-300` | `border-primary/30` | `bg-primary/20 border-primary/40` |
| Revealed | `bg-success/15` | `border-success/80` | `bg-success/15 text-success` |
| Context (Non-target) | `bg-primary/5` | `border-primary/25` | 降低透明度 |

### 无障碍性增强
- `tabIndex`: 可通过 Tab 键聚焦
- `role="button"`: 屏幕阅读器支持
- `aria-pressed`: 状态指示
- `onKeyDown`: Enter/Space 键触发

---

## 长数学文档性能优化

### CSS 性能优化
```css
/* KaTeX 渲染优化 */
.katex-display { contain: layout style; }

/* Cloze 布局隔离 */
[data-cloze-key] { contain: layout; }

/* Math cloze 重绘边界 */
.math-cloze-block { contain: layout style paint; isolation: isolate; }

/* 滚动容器 GPU 加速 */
#note-scroll-container { transform: translateZ(0); will-change: scroll-position; }
```

### React 性能优化
1. **MathClozeBlock**: `React.memo` + `useMemo` 缓存 KaTeX HTML
2. **InlineCloze**: 独立 memoized 组件，避免全局 re-render
3. **toggleReveal**: 使用 `useRef` 追踪状态，移除 `revealed` 依赖使回调稳定
4. **组件拆分**: 将 inline 渲染逻辑提取到独立文件
