# CodeMirror 6 编辑器迁移实施计划

> EditMode 左侧编辑区升级：从原生 textarea 到 CodeMirror 6

## 一、项目背景与目标

### 1.1 当前架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EditMode.tsx (1638 行)                        │
│  ┌──────────────────────┐              ┌────────────────────────────┐  │
│  │     <textarea>       │   content    │   MarkdownContent          │  │
│  │  • selectionStart    │ ──────────── │   (ReactMarkdown 渲染)      │  │
│  │  • selectionEnd      │      ↓       │   • variant="edit"         │  │
│  │  • scrollTop         │  parseNote() │   • onClozeClick           │  │
│  │  • execCommand       │      ↓       │   • onErrorLinkClick       │  │
│  └──────────────────────┘  parsedPreview                             │  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 迁移目标

| 目标 | 优先级 | 说明 |
|------|--------|------|
| **功能完整** | P0 | 100% 保留现有 Cloze 编辑功能 |
| **性能最优** | P0 | 不低于当前 60fps，大文档更优 |
| **体验提升** | P1 | 行号、折叠、语法高亮、搜索 |
| **代码质量** | P2 | 减少 EditMode 代码复杂度 |

### 1.3 不变部分

- ✅ `MarkdownContent.tsx` - 右侧预览区完全不变
- ✅ `BlurMode.tsx` / `ClozeMode.tsx` - 使用 `variant` 属性，无影响
- ✅ `parser.ts` / `ClozeUtils.ts` - 纯函数，无需改动
- ✅ `katexCache.ts` - KaTeX 缓存继续使用

---

## 二、用户行为分析与 UX 设计

### 2.1 核心用户行为流

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cloze 编辑用户行为流                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 选中文本 → Ctrl+Shift+C → 创建 Cloze                                │
│     ↓                                                                   │
│  2. 预览区立即更新 → 用户确认效果                                        │
│     ↓                                                                   │
│  3. 点击预览 Cloze → 编辑器定位到对应源码                                │
│     ↓                                                                   │
│  4. 修改 answer 内容 → 预览实时同步                                      │
│     ↓                                                                   │
│  5. Ctrl+S 保存                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 UX 痛点与优化机会

| 当前痛点 | 用户影响 | CodeMirror 6 解决方案 |
|----------|----------|----------------------|
| 无行号 | 难以定位长文档位置 | `lineNumbers()` 内置 |
| 无语法高亮 | Markdown 可读性差 | `lang-markdown` 语法着色 |
| 无代码折叠 | 长文档浏览困难 | `foldGutter()` 折叠标记 |
| 无搜索替换 | 查找 Cloze 靠肉眼 | `@codemirror/search` |
| Undo 不可靠 | `execCommand` 偶发失败 | 内置 `history()` |
| 无括号匹配 | `{{}}` 配对不直观 | `bracketMatching()` |
| 无当前行高亮 | 编辑位置不清晰 | `highlightActiveLine()` |

### 2.3 深度 UX 设计优化

#### 2.3.1 Cloze 语法视觉增强

```
设计目标: 让 {{c1::answer::hint}} 在编辑器中一目了然

方案 A: Mark Decoration (纯样式)
┌────────────────────────────────────────────────────────────┐
│  This is {{c1::important::hint}} text                      │
│           ├──┬──────────┬────┤                             │
│           │  │          │    └── hint: 灰色斜体            │
│           │  │          └────── answer: 主色加粗           │
│           │  └───────────────── c1: 小型 badge            │
│           └──────────────────── {{ }}: 淡化显示           │
└────────────────────────────────────────────────────────────┘

方案 B: Replace Decoration (隐藏语法，显示 pill)
┌────────────────────────────────────────────────────────────┐
│  This is [c1] important [hint] text                        │
│           └─────────────────────┘                          │
│              点击展开为完整语法                              │
└────────────────────────────────────────────────────────────┘

推荐: 方案 A (Phase 2+)，保持源码可见同时增强可读性
```

#### 2.3.2 预览-编辑器同步滚动

```
当前: 单向同步 (点击预览 → 编辑器滚动)

优化设计:
┌──────────────────┬──────────────────────┐
│   Editor Pane    │   Preview Pane       │
│                  │                      │
│   ████████       │       ████████       │
│   ████████  ←────┼────→  ████████       │
│   ████████       │       ████████       │
│                  │                      │
│  滚动 ←─────────────────→ 同步滚动      │
└──────────────────┴──────────────────────┘

实现要点:
1. 编辑器滚动 → 计算可见行范围 → 映射到预览位置
2. 预览滚动 → 计算可见标题 → 映射到编辑器位置
3. 防止循环触发: 使用 scrolling flag 互斥
```

#### 2.3.3 智能 Cloze 创建体验

```
场景: 用户选中 "重要概念" 后按 Ctrl+Shift+C

当前流程:
1. 包裹为 {{c{max+1}::重要概念}}
2. 光标定位到 answer 内部

优化流程:
1. 检测选区前后是否有空白 → 自动 trim
2. 检测是否在数学公式内 → 自动使用 $$ 包裹
3. 检测附近是否有同主题 Cloze → 提示复用 ID
4. 创建后 → 预览区对应位置短暂高亮 (已有 flashPreviewCloze)
5. Navigator 自动滚动到新 Cloze badge

新增交互:
- Ctrl+Shift+C 连按两次 → 使用上一个 ID (sameId=true)
- 选中已有 Cloze → 快捷键变为 "Uncloze"
- 选中多段文本 → 批量创建多个 Cloze (future)
```

#### 2.3.4 错误状态视觉反馈

```
当前: 预览区显示红色错误链接

优化设计 (编辑器内):

Unclosed Cloze:
┌────────────────────────────────────────────────────────────┐
│  This is {{c1::unclosed text                               │
│           └────────────────┘                               │
│           红色波浪下划线 + gutter 错误标记                   │
└────────────────────────────────────────────────────────────┘

Dangling Closer:
┌────────────────────────────────────────────────────────────┐
│  Some text with stray }}                                   │
│                       └─┘                                  │
│                       橙色高亮                              │
└────────────────────────────────────────────────────────────┘

实现: 使用 @codemirror/lint + 自定义 linter
```

---

## 三、实施阶段与验收点

### Phase 1: 基础替换 (Day 1)

#### 3.1.1 任务清单

- [ ] 创建 `CodeMirrorEditor.tsx` 封装组件
- [ ] 替换 textarea 为 CodeMirror
- [ ] 配置基础 extensions (markdown, basicSetup)
- [ ] 实现 `onChange` 同步到 React state
- [ ] 确保预览区正常更新

#### 3.1.2 代码结构

```tsx
// src/components/shared/CodeMirrorEditor.tsx
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSelectionChange?: (from: number, to: number) => void;
  className?: string;
}

export const CodeMirrorEditor = forwardRef<ReactCodeMirrorRef, CodeMirrorEditorProps>(
  ({ value, onChange, onSelectionChange, className }, ref) => {
    return (
      <CodeMirror
        ref={ref}
        value={value}
        height="100%"
        className={className}
        extensions={[
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          EditorView.lineWrapping,
        ]}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          bracketMatching: true,
          highlightSelectionMatches: true,
          autocompletion: false,
        }}
      />
    );
  }
);
```

#### 3.1.3 验收标准

| 验收项 | 标准 | 测试方法 |
|--------|------|----------|
| 内容同步 | 输入即时反映到预览 | 输入文字，观察右侧 |
| 行号显示 | 左侧显示行号 | 视觉检查 |
| 语法高亮 | Markdown 语法着色 | 输入 `# ## **` 等 |
| 折叠功能 | 可折叠代码块 | 点击折叠图标 |
| 性能基准 | 无明显卡顿 | 快速输入测试 |

---

### Phase 2: API 适配 (Day 2-3)

#### 3.2.1 工具 Hook 设计

```tsx
// src/hooks/useCodeMirrorActions.ts
import { RefObject, useCallback } from 'react';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';

export function useCodeMirrorActions(ref: RefObject<ReactCodeMirrorRef | null>) {
  const getView = useCallback(() => ref.current?.view, [ref]);

  // 获取文档内容
  const getContent = useCallback(() => {
    return getView()?.state.doc.toString() ?? '';
  }, [getView]);

  // 获取选区
  const getSelection = useCallback(() => {
    const sel = getView()?.state.selection.main;
    return sel ? { from: sel.from, to: sel.to } : { from: 0, to: 0 };
  }, [getView]);

  // 获取选中文本
  const getSelectedText = useCallback(() => {
    const view = getView();
    if (!view) return '';
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  }, [getView]);

  // 替换范围内文本
  const replaceRange = useCallback((from: number, to: number, text: string) => {
    const view = getView();
    if (!view) return;
    view.dispatch({ changes: { from, to, insert: text } });
  }, [getView]);

  // 替换选区文本
  const replaceSelection = useCallback((text: string) => {
    const view = getView();
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
  }, [getView]);

  // 设置选区
  const setSelection = useCallback((anchor: number, head?: number) => {
    const view = getView();
    if (!view) return;
    view.dispatch({
      selection: EditorSelection.single(anchor, head ?? anchor),
    });
    view.focus();
  }, [getView]);

  // 滚动到位置并选中
  const scrollToPosition = useCallback((pos: number, select?: { from: number; to: number }) => {
    const view = getView();
    if (!view) return;
    
    const transaction: any = {
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    };
    
    if (select) {
      transaction.selection = EditorSelection.single(select.from, select.to);
    }
    
    view.dispatch(transaction);
    view.focus();
  }, [getView]);

  // 插入文本到当前位置
  const insertAtCursor = useCallback((text: string) => {
    const view = getView();
    if (!view) return;
    const { from } = view.state.selection.main;
    view.dispatch({
      changes: { from, to: from, insert: text },
      selection: EditorSelection.cursor(from + text.length),
    });
  }, [getView]);

  // 包裹选中文本
  const wrapSelection = useCallback((before: string, after: string) => {
    const view = getView();
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const newText = before + selected + after;
    view.dispatch({
      changes: { from, to, insert: newText },
      selection: EditorSelection.range(from + before.length, from + before.length + selected.length),
    });
  }, [getView]);

  // 聚焦编辑器
  const focus = useCallback(() => {
    getView()?.focus();
  }, [getView]);

  return {
    getContent,
    getSelection,
    getSelectedText,
    replaceRange,
    replaceSelection,
    setSelection,
    scrollToPosition,
    insertAtCursor,
    wrapSelection,
    focus,
  };
}
```

#### 3.2.2 函数迁移映射表

| 原函数 | 原实现 | 新实现 |
|--------|--------|--------|
| `insertCloze` | `document.execCommand` | `replaceSelection` + `setSelection` |
| `replaceTextRange` | `setSelectionRange` + `execCommand` | `replaceRange` |
| `replaceAllText` | `select()` + `execCommand` | `replaceRange(0, doc.length, text)` |
| `scrollToCloze` | `scrollTo({ top })` + 行高计算 | `scrollToPosition` |
| `jumpToSiblingCloze` | 同上 | `scrollToPosition` |
| `handlePreviewClozeClick` | 同上 | `scrollToPosition` + `setSelection` |
| `handleClearCloze` | `unclozeAt` + `replaceAllText` | `replaceRange` |
| `getTextareaGeometry` | 手动计算行高 | **删除** (CM6 内置) |
| `getClozeIndex` | 正则扫描缓存 | **保留** (性能优化) |

#### 3.2.3 验收标准

| 验收项 | 标准 | 测试方法 |
|--------|------|----------|
| Cloze 创建 | `Ctrl+Shift+C` 正常工作 | 选中文本，按快捷键 |
| 同 ID Cloze | `Ctrl+Alt+C` 正常工作 | 创建后再选中，按快捷键 |
| Uncloze | `Ctrl+Shift+X` 正常工作 | 光标在 Cloze 内，按快捷键 |
| 预览点击定位 | 点击预览 Cloze 跳转 | 点击右侧 Cloze chip |
| Navigator 跳转 | 点击 badge 跳转 | 点击顶部 c1, c2 等 |
| 错误跳转 | 点击错误链接跳转 | 创建未闭合 Cloze |
| Undo/Redo | `Ctrl+Z/Y` 正常 | 创建 Cloze 后撤销 |

---

### Phase 3: 快捷键系统 (Day 3)

#### 3.3.1 Keymap 定义

```tsx
// src/lib/codemirror/keymaps.ts
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';

export interface ClozeKeymapHandlers {
  insertCloze: (sameId?: boolean) => void;
  handleClearCloze: () => void;
  jumpToSiblingCloze: (direction: 'next' | 'prev') => void;
  handleSave: () => void;
  insertBold: () => void;
  insertItalic: () => void;
}

export function createClozeKeymap(handlers: ClozeKeymapHandlers) {
  return Prec.high(keymap.of([
    // Cloze 操作
    {
      key: 'Mod-Shift-c',
      run: () => { handlers.insertCloze(false); return true; },
      preventDefault: true,
    },
    {
      key: 'Mod-Alt-c',
      run: () => { handlers.insertCloze(true); return true; },
      preventDefault: true,
    },
    {
      key: 'Mod-Shift-x',
      run: () => { handlers.handleClearCloze(); return true; },
      preventDefault: true,
    },
    // 导航
    {
      key: 'Alt-ArrowDown',
      run: () => { handlers.jumpToSiblingCloze('next'); return true; },
    },
    {
      key: 'Alt-ArrowUp',
      run: () => { handlers.jumpToSiblingCloze('prev'); return true; },
    },
    // 保存
    {
      key: 'Mod-s',
      run: () => { handlers.handleSave(); return true; },
      preventDefault: true,
    },
    // 格式化 (覆盖默认，使用我们的 wrap 逻辑)
    {
      key: 'Mod-b',
      run: () => { handlers.insertBold(); return true; },
      preventDefault: true,
    },
    {
      key: 'Mod-i',
      run: () => { handlers.insertItalic(); return true; },
      preventDefault: true,
    },
  ]));
}
```

#### 3.3.2 验收标准

| 快捷键 | 功能 | 验收标准 |
|--------|------|----------|
| `Ctrl+Shift+C` | 新 Cloze | ID 自动递增 |
| `Ctrl+Alt+C` | 同 ID Cloze | 复用最近 ID |
| `Ctrl+Shift+X` | Uncloze | 移除语法，保留文本 |
| `Alt+↓` | 下一个 Cloze | 循环跳转 |
| `Alt+↑` | 上一个 Cloze | 循环跳转 |
| `Ctrl+S` | 保存 | 触发保存逻辑 |
| `Ctrl+B` | 加粗 | 包裹 `**` |
| `Ctrl+I` | 斜体 | 包裹 `*` |
| `Ctrl+Z` | 撤销 | CM6 内置 |
| `Ctrl+Y` | 重做 | CM6 内置 |
| `Ctrl+F` | 搜索 | CM6 内置 |

---

### Phase 4: 主题适配 (Day 4)

#### 3.4.1 DaisyUI 主题同步

```tsx
// src/lib/codemirror/themes.ts
import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';

// 从 DaisyUI CSS 变量读取颜色
function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export function createDaisyUITheme(): Extension {
  // 动态读取当前主题颜色
  const theme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--color-base-100)',
      color: 'var(--color-base-content)',
    },
    '.cm-content': {
      caretColor: 'var(--color-primary)',
      fontFamily: 'ui-monospace, monospace',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--color-primary)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--color-primary) 20%, transparent)',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)',
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--color-base-200) 50%, transparent)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--color-base-200)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-base-100)',
      color: 'var(--color-base-content)',
      opacity: 0.5,
      borderRight: '1px solid var(--color-base-200)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px',
    },
    '.cm-foldGutter .cm-gutterElement': {
      padding: '0 4px',
      cursor: 'pointer',
    },
  }, { dark: false }); // 通过 CSS 变量自动适配深色

  // Markdown 语法高亮
  const highlightStyle = HighlightStyle.define([
    { tag: t.heading1, fontWeight: 'bold', fontSize: '1.5em' },
    { tag: t.heading2, fontWeight: 'bold', fontSize: '1.3em' },
    { tag: t.heading3, fontWeight: 'bold', fontSize: '1.1em' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.link, color: 'var(--color-primary)', textDecoration: 'underline' },
    { tag: t.url, color: 'var(--color-info)' },
    { tag: t.monospace, fontFamily: 'monospace', backgroundColor: 'var(--color-base-200)' },
    { tag: t.quote, color: 'var(--color-base-content)', opacity: 0.7, fontStyle: 'italic' },
    { tag: t.list, color: 'var(--color-secondary)' },
    // Cloze 语法特殊高亮 (可选，Phase 2+)
    // { tag: t.special(t.brace), color: 'var(--color-primary)' },
  ]);

  return [theme, syntaxHighlighting(highlightStyle)];
}
```

#### 3.4.2 主题切换监听

```tsx
// 在 EditMode 中监听主题变化
useEffect(() => {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'data-theme') {
        // 触发 CodeMirror 重新应用主题
        editorRef.current?.view?.dispatch({});
      }
    }
  });
  
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  
  return () => observer.disconnect();
}, []);
```

#### 3.4.3 验收标准

| 验收项 | 标准 |
|--------|------|
| 浅色主题 | 编辑器背景、文字与 DaisyUI 一致 |
| 深色主题 | 切换主题后编辑器同步变化 |
| 选中高亮 | 使用主题主色 |
| 活动行 | 可见的当前行高亮 |
| Gutter | 与整体风格协调 |

---

### Phase 5: 性能优化与测试 (Day 5)

#### 3.5.1 性能优化清单

| 优化项 | 实现方式 | 预期收益 |
|--------|----------|----------|
| **Debounced onChange** | 200ms 防抖 (保持现有逻辑) | 减少 parseNote 调用 |
| **Cloze 索引缓存** | 保留 `getClozeIndex` | 跳转 O(1) |
| **Extension 稳定引用** | `useMemo` 包裹 extensions | 避免重建 |
| **Keymap 稳定引用** | `useMemo` 包裹 keymap | 避免重建 |
| **虚拟视口** | CM6 内置 | 大文档性能 |

```tsx
// 性能优化示例
const extensions = useMemo(() => [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  createDaisyUITheme(),
  clozeKeymap, // 稳定引用
  EditorView.lineWrapping,
  EditorView.updateListener.of((update) => {
    if (update.selectionSet) {
      const { from, to } = update.state.selection.main;
      onSelectionChange?.(from, to);
    }
  }),
], [clozeKeymap, onSelectionChange]);
```

#### 3.5.2 性能测试场景

| 场景 | 测试方法 | 通过标准 |
|------|----------|----------|
| 输入延迟 | 快速连续输入 | <16ms 无感知延迟 |
| 大文档加载 | 5000 行 Markdown | <500ms |
| 大文档滚动 | 5000 行快速滚动 | 60fps |
| Cloze 创建 | 连续创建 10 个 | 每次 <50ms |
| 预览同步 | 输入后预览更新 | <300ms (debounce) |

#### 3.5.3 回归测试清单

- [ ] 创建新 Cloze (Ctrl+Shift+C)
- [ ] 创建同 ID Cloze (Ctrl+Alt+C)
- [ ] Uncloze (Ctrl+Shift+X)
- [ ] 选区内批量 Uncloze
- [ ] Navigator 跳转
- [ ] 预览点击定位
- [ ] 预览右键菜单
- [ ] 错误链接跳转
- [ ] Normalize IDs
- [ ] Clean Invalid
- [ ] 复制 Cloze 答案
- [ ] 删除 Cloze
- [ ] 清除 Cloze (保留文本)
- [ ] Metadata Editor 标签编辑
- [ ] 外部文件变更检测
- [ ] 保存功能

---

## 四、代码改动范围

### 4.1 新增文件

| 文件 | 用途 |
|------|------|
| `src/components/shared/CodeMirrorEditor.tsx` | 编辑器封装组件 |
| `src/hooks/useCodeMirrorActions.ts` | 编辑器操作 Hook |
| `src/lib/codemirror/keymaps.ts` | 快捷键配置 |
| `src/lib/codemirror/themes.ts` | 主题配置 |

### 4.2 修改文件

| 文件 | 改动范围 | 改动类型 |
|------|----------|----------|
| `EditMode.tsx` | 高 (~800 行) | 替换 textarea，适配 API |
| `package.json` | 低 | 已添加依赖 |

### 4.3 不修改文件

| 文件 | 原因 |
|------|------|
| `MarkdownContent.tsx` | 仅接收 `renderableContent` 字符串 |
| `BlurMode.tsx` | 使用 `variant="blur"` |
| `ClozeMode.tsx` | 使用 `variant="review"` |
| `parser.ts` | 纯函数 |
| `ClozeUtils.ts` | 纯函数 |
| `katexCache.ts` | 独立缓存 |
| `clozeRevealStore.ts` | Review 模式专用 |

---

## 五、风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| CM6 React 集成问题 | 低 | 中 | 使用成熟的 @uiw/react-codemirror |
| 快捷键冲突 | 低 | 低 | 使用 Prec.high 提升优先级 |
| 主题不匹配 | 中 | 低 | CSS 变量动态适配 |
| 性能回退 | 极低 | 中 | 保留 feature flag 可回滚 |
| 包体积增加 | 确定 | 低 | ~45KB gzip，可接受 |

### 回滚计划

```tsx
// EditMode.tsx
const USE_CODEMIRROR = true; // 可通过环境变量控制

return USE_CODEMIRROR ? (
  <CodeMirrorEditor ref={editorRef} ... />
) : (
  <textarea ref={textareaRef} ... />
);
```

---

## 六、验收总表

### Phase 1 验收 (基础替换)

- [ ] CodeMirror 组件正常渲染
- [ ] 内容变更同步到 React state
- [ ] 预览区正常更新
- [ ] 行号、折叠、语法高亮可见
- [ ] 无控制台错误

### Phase 2 验收 (API 适配)

- [ ] 所有 Cloze 操作正常
- [ ] 预览交互正常
- [ ] Navigator 跳转正常
- [ ] 错误跳转正常
- [ ] Undo/Redo 可靠

### Phase 3 验收 (快捷键)

- [ ] 所有快捷键响应正确
- [ ] 无快捷键冲突
- [ ] 与 Anki 习惯一致

### Phase 4 验收 (主题)

- [ ] 浅色/深色主题适配
- [ ] 主题切换无延迟
- [ ] 视觉与整体一致

### Phase 5 验收 (性能)

- [ ] 输入延迟 <16ms
- [ ] 大文档 (5000行) 流畅
- [ ] 全部回归测试通过
- [ ] 无内存泄漏

---

## 七、后续优化 (Future)

### 7.1 Cloze 语法 Decoration (P2)

使用 `MatchDecorator` 高亮 `{{c1::...}}` 语法，增强可读性。

### 7.2 双向滚动同步 (P3)

编辑器滚动时同步预览区位置。

### 7.3 Cloze Linter (P3)

在编辑器内直接显示语法错误。

### 7.4 Minimap (P4)

长文档导航 minimap。

---