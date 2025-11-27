/**
 * CodeMirror 6 编辑器封装组件
 * 
 * 基于 @uiw/react-codemirror 封装，提供：
 * - Markdown 语法高亮
 * - DaisyUI 主题适配
 * - 自定义快捷键支持
 * - 性能优化 (extensions 稳定引用)
 * 
 * Best Practices:
 * - extensions 使用 useMemo 保持稳定引用
 * - 通过 forwardRef 暴露 ref 供外部操作
 * - 使用 CSS 变量适配主题，无需重建组件
 */

import { forwardRef, useMemo, memo } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { createDaisyUITheme } from '../../lib/codemirror/themes';

export interface CodeMirrorEditorProps {
  /** 编辑器内容 */
  value: string;
  /** 内容变更回调 */
  onChange: (value: string) => void;
  /** 自定义快捷键 extension (应使用 useMemo 缓存) */
  keymap?: Extension;
  /** 额外的 extensions */
  extensions?: Extension[];
  /** CSS 类名 */
  className?: string;
  /** 占位文本 */
  placeholder?: string;
  /** 是否只读 */
  readOnly?: boolean;
}

/**
 * CodeMirror 编辑器组件
 * 
 * @example
 * ```tsx
 * const editorRef = useRef<ReactCodeMirrorRef>(null);
 * 
 * <CodeMirrorEditor
 *   ref={editorRef}
 *   value={content}
 *   onChange={setContent}
 *   className="flex-1"
 *   placeholder="Start typing..."
 * />
 * ```
 */
// PERFORMANCE: 基础 extensions 在模块级别创建，避免重复创建
const BASE_EXTENSIONS: Extension[] = [
  // Markdown 语言支持 + 代码块语法高亮
  markdown({ 
    base: markdownLanguage, 
    codeLanguages: languages,
  }),
  // 自动换行
  EditorView.lineWrapping,
  // DaisyUI 主题
  createDaisyUITheme(),
];

export const CodeMirrorEditor = memo(forwardRef<ReactCodeMirrorRef, CodeMirrorEditorProps>(
  (
    {
      value,
      onChange,
      keymap: keymapExtension,
      extensions: extraExtensions,
      className = '',
      placeholder,
      readOnly = false,
    },
    ref
  ) => {
    // PERFORMANCE: 只在 extensions 变化时重新计算
    // keymap 需要高优先级，放在最前面
    const allExtensions = useMemo(() => {
      const exts: Extension[] = [];
      
      // 1. 自定义 keymap (高优先级)
      if (keymapExtension) {
        exts.push(keymapExtension);
      }
      
      // 2. 基础 extensions
      exts.push(...BASE_EXTENSIONS);
      
      // 3. 额外 extensions
      if (extraExtensions && extraExtensions.length > 0) {
        exts.push(...extraExtensions);
      }
      
      return exts;
    }, [keymapExtension, extraExtensions]);

    return (
      <CodeMirror
        ref={ref}
        value={value}
        height="100%"
        className={`cm-editor-wrapper ${className}`}
        extensions={allExtensions}
        onChange={onChange}
        readOnly={readOnly}
        editable={!readOnly}
        placeholder={placeholder}
        basicSetup={{
          // 行号
          lineNumbers: true,
          // 折叠
          foldGutter: true,
          // 当前行高亮 - 使用较浅的样式
          highlightActiveLine: false, // 禁用，在 theme 中自定义
          highlightActiveLineGutter: false,
          // 括号匹配
          bracketMatching: true,
          // 选中文本匹配高亮 - 禁用避免多重叠加
          highlightSelectionMatches: false,
          // 关闭自动补全 (Markdown 不需要)
          autocompletion: false,
          // 关闭关闭括号补全 (Markdown 中可能干扰)
          closeBrackets: false,
          // 允许多光标
          allowMultipleSelections: true,
          // Tab 缩进
          indentOnInput: true,
          // 语法高亮
          syntaxHighlighting: true,
          // 撤销历史
          history: true,
          // 搜索
          searchKeymap: true,
          // 折叠快捷键
          foldKeymap: true,
          // 历史快捷键
          historyKeymap: true,
          // 默认快捷键
          defaultKeymap: true,
          // Tab 大小
          tabSize: 2,
        }}
      />
    );
  }
));

CodeMirrorEditor.displayName = 'CodeMirrorEditor';

export default CodeMirrorEditor;
