/**
 * CodeMirror 6 DaisyUI 主题适配
 * 
 * 使用 DaisyUI 的 CSS 变量实现主题同步
 * DaisyUI 5.x 使用 --color-* 格式的 CSS 变量
 */

import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * 创建 DaisyUI 兼容的 CodeMirror 主题
 */
export function createDaisyUITheme(): Extension {
  // 编辑器基础样式 - 使用 DaisyUI 5.x 的 CSS 变量格式
  // 设置 dark: true 因为我们使用 CSS 变量动态适配任意主题
  const baseTheme = EditorView.theme({
    // 编辑器容器 - 使用 !important 确保覆盖默认样式
    '&': {
      backgroundColor: 'var(--color-base-100) !important',
      color: 'var(--color-base-content) !important',
      height: '100%',
    },
    
    // 编辑区域
    '.cm-content': {
      caretColor: 'var(--color-primary)',
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: '14px',
      lineHeight: '1.6',
      padding: '16px 0',
    },
    
    // 光标
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--color-primary)',
      borderLeftWidth: '2px',
    },
    
    // 选中背景 - 使用 !important 覆盖 basicSetup 默认样式
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(59, 130, 246, 0.3) !important', // blue-500 30%
    },
    
    // 非聚焦时的选中背景
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(59, 130, 246, 0.15) !important',
    },
    
    // 选中匹配高亮 - 禁用避免多重叠加
    '.cm-selectionMatch': {
      backgroundColor: 'transparent !important',
    },
    
    // 当前行高亮 - 非常浅的背景
    '.cm-activeLine': {
      backgroundColor: 'rgba(128, 128, 128, 0.05) !important',
    },
    
    // 当前行号高亮
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--color-base-200)',
    },
    
    // 行号槽
    '.cm-gutters': {
      backgroundColor: 'var(--color-base-100) !important',
      color: 'color-mix(in srgb, var(--color-base-content) 40%, transparent)',
      borderRight: '1px solid var(--color-base-200)',
      fontSize: '12px',
    },
    
    // 行号
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 12px 0 8px',
      minWidth: '40px',
    },
    
    // 折叠槽
    '.cm-foldGutter .cm-gutterElement': {
      padding: '0 4px',
      cursor: 'pointer',
      color: 'color-mix(in srgb, var(--color-base-content) 50%, transparent)',
      transition: 'color 150ms ease',
    },
    
    '.cm-foldGutter .cm-gutterElement:hover': {
      color: 'var(--color-primary)',
    },
    
    // 折叠占位符
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--color-base-200)',
      border: 'none',
      color: 'color-mix(in srgb, var(--color-base-content) 60%, transparent)',
      padding: '0 8px',
      borderRadius: '4px',
      cursor: 'pointer',
    },
    
    // 搜索匹配高亮
    '.cm-searchMatch': {
      backgroundColor: 'color-mix(in srgb, var(--color-warning) 30%, transparent)',
      borderRadius: '2px',
    },
    
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'color-mix(in srgb, var(--color-success) 40%, transparent)',
    },
    
    // 括号匹配
    '&.cm-focused .cm-matchingBracket': {
      backgroundColor: 'color-mix(in srgb, var(--color-success) 30%, transparent)',
      outline: '1px solid color-mix(in srgb, var(--color-success) 50%, transparent)',
    },
    
    '&.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: 'color-mix(in srgb, var(--color-error) 30%, transparent)',
      outline: '1px solid color-mix(in srgb, var(--color-error) 50%, transparent)',
    },
    
    // 滚动条
    '.cm-scroller': {
      overflow: 'auto',
      scrollbarWidth: 'thin',
      scrollbarColor: 'color-mix(in srgb, var(--color-base-content) 20%, transparent) transparent',
    },
    
    // Tooltip
    '.cm-tooltip': {
      backgroundColor: 'var(--color-base-200)',
      color: 'var(--color-base-content)',
      border: '1px solid var(--color-base-300)',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    },
    
    '.cm-tooltip.cm-tooltip-autocomplete': {
      '& > ul > li': {
        padding: '4px 8px',
      },
      '& > ul > li[aria-selected]': {
        backgroundColor: 'var(--color-primary)',
        color: 'var(--color-primary-content)',
      },
    },
    
    // 搜索面板
    '.cm-panel': {
      backgroundColor: 'var(--color-base-200)',
      borderTop: '1px solid var(--color-base-300)',
    },
    
    '.cm-panel input': {
      backgroundColor: 'var(--color-base-100)',
      color: 'var(--color-base-content)',
      border: '1px solid var(--color-base-300)',
      borderRadius: '4px',
      padding: '4px 8px',
    },
    
    '.cm-panel input:focus': {
      borderColor: 'var(--color-primary)',
      outline: 'none',
    },
    
    '.cm-panel button': {
      backgroundColor: 'var(--color-base-300)',
      color: 'var(--color-base-content)',
      border: 'none',
      borderRadius: '4px',
      padding: '4px 12px',
      cursor: 'pointer',
    },
    
    '.cm-panel button:hover': {
      backgroundColor: 'var(--color-primary)',
      color: 'var(--color-primary-content)',
    },
  }, { dark: true });

  // Markdown 语法高亮样式 - 使用固定颜色值保证可见性
  const markdownHighlightStyle = HighlightStyle.define([
    // 标题 - 使用明亮的蓝色
    { 
      tag: t.heading1, 
      fontWeight: '700',
      fontSize: '1.5em',
      color: '#60a5fa', // blue-400
    },
    { 
      tag: t.heading2, 
      fontWeight: '700',
      fontSize: '1.3em',
      color: '#60a5fa',
    },
    { 
      tag: t.heading3, 
      fontWeight: '600',
      fontSize: '1.1em',
      color: '#60a5fa',
    },
    { 
      tag: [t.heading4, t.heading5, t.heading6], 
      fontWeight: '600',
      color: '#60a5fa',
    },
    
    // 强调
    { tag: t.strong, fontWeight: '700', color: '#f472b6' }, // pink-400
    { tag: t.emphasis, fontStyle: 'italic', color: '#a78bfa' }, // violet-400
    { 
      tag: t.strikethrough, 
      textDecoration: 'line-through',
      color: '#9ca3af', // gray-400
    },
    
    // 链接
    { 
      tag: t.link, 
      color: '#22d3ee', // cyan-400
      textDecoration: 'underline',
    },
    { 
      tag: t.url, 
      color: '#38bdf8', // sky-400
    },
    
    // 代码
    { 
      tag: t.monospace, 
      fontFamily: 'ui-monospace, monospace',
      color: '#4ade80', // green-400
    },
    
    // 引用
    { 
      tag: t.quote, 
      color: '#94a3b8', // slate-400
      fontStyle: 'italic',
    },
    
    // 列表标记
    { 
      tag: t.list, 
      color: '#fbbf24', // amber-400
    },
    
    // 注释
    { 
      tag: t.comment, 
      color: '#6b7280', // gray-500
      fontStyle: 'italic',
    },
    
    // 元数据 (YAML frontmatter)
    { 
      tag: t.meta, 
      color: '#fb923c', // orange-400
    },
    
    // 标记符号 (如 #, **, __ 等)
    { 
      tag: t.processingInstruction, 
      color: '#6b7280', // gray-500
    },
    
    // 特殊字符 - Cloze 语法 {{ }}
    {
      tag: t.special(t.brace),
      color: '#f97316', // orange-500
      fontWeight: '600',
    },
  ]);

  return [baseTheme, syntaxHighlighting(markdownHighlightStyle)];
}

/**
 * 获取当前 DaisyUI 主题名称
 */
export function getCurrentTheme(): string {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

/**
 * 判断当前是否为深色主题
 */
export function isDarkTheme(): boolean {
  const theme = getCurrentTheme();
  const darkThemes = ['dark', 'night', 'coffee', 'dim', 'sunset', 'dracula', 'halloween', 'forest', 'black', 'luxury', 'business'];
  return darkThemes.includes(theme);
}
