/**
 * CodeMirror 6 编辑器操作 Hook
 * 
 * Best Practices:
 * - 所有方法通过 ref 访问 view，避免闭包陈旧
 * - 使用 useCallback 保证引用稳定性
 * - 批量操作通过单个 transaction 完成
 */

import { RefObject, useCallback } from 'react';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { EditorSelection, TransactionSpec } from '@codemirror/state';

export interface CodeMirrorSelection {
  from: number;
  to: number;
}

export function useCodeMirrorActions(ref: RefObject<ReactCodeMirrorRef | null>) {
  /**
   * 获取 EditorView 实例
   * 所有操作都通过此方法获取最新的 view
   */
  const getView = useCallback((): EditorView | undefined => {
    return ref.current?.view;
  }, [ref]);

  /**
   * 获取文档内容
   */
  const getContent = useCallback((): string => {
    return getView()?.state.doc.toString() ?? '';
  }, [getView]);

  /**
   * 获取当前选区位置
   */
  const getSelection = useCallback((): CodeMirrorSelection => {
    const sel = getView()?.state.selection.main;
    return sel ? { from: sel.from, to: sel.to } : { from: 0, to: 0 };
  }, [getView]);

  /**
   * 获取选中的文本
   */
  const getSelectedText = useCallback((): string => {
    const view = getView();
    if (!view) return '';
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  }, [getView]);

  /**
   * 替换指定范围的文本
   * @param from 起始位置
   * @param to 结束位置
   * @param text 替换文本
   * @param newSelection 可选的新选区位置
   */
  const replaceRange = useCallback((
    from: number, 
    to: number, 
    text: string,
    newSelection?: { anchor: number; head?: number }
  ) => {
    const view = getView();
    if (!view) return;
    
    const spec: TransactionSpec = {
      changes: { from, to, insert: text },
    };
    
    if (newSelection) {
      spec.selection = EditorSelection.single(
        newSelection.anchor, 
        newSelection.head ?? newSelection.anchor
      );
    }
    
    view.dispatch(spec);
  }, [getView]);

  /**
   * 替换当前选区文本
   * @param text 替换文本
   * @param selectInserted 是否选中插入的文本
   */
  const replaceSelection = useCallback((text: string, selectInserted = false) => {
    const view = getView();
    if (!view) return;
    
    const { from, to } = view.state.selection.main;
    
    if (selectInserted) {
      view.dispatch({
        changes: { from, to, insert: text },
        selection: EditorSelection.range(from, from + text.length),
      });
    } else {
      view.dispatch({
        changes: { from, to, insert: text },
        selection: EditorSelection.cursor(from + text.length),
      });
    }
  }, [getView]);

  /**
   * 设置选区
   * @param anchor 锚点位置
   * @param head 头部位置（可选，默认为锚点位置形成光标）
   */
  const setSelection = useCallback((anchor: number, head?: number) => {
    const view = getView();
    if (!view) return;
    
    // 确保位置在有效范围内
    const docLength = view.state.doc.length;
    const safeAnchor = Math.min(Math.max(0, anchor), docLength);
    const safeHead = head !== undefined 
      ? Math.min(Math.max(0, head), docLength) 
      : safeAnchor;
    
    view.dispatch({
      selection: EditorSelection.single(safeAnchor, safeHead),
    });
    view.focus();
  }, [getView]);

  /**
   * 滚动到指定位置并可选地设置选区
   * @param pos 目标位置
   * @param select 可选的选区范围
   */
  const scrollToPosition = useCallback((
    pos: number, 
    select?: { from: number; to: number }
  ) => {
    const view = getView();
    if (!view) return;
    
    const docLength = view.state.doc.length;
    const safePos = Math.min(Math.max(0, pos), docLength);
    
    const spec: TransactionSpec = {
      effects: EditorView.scrollIntoView(safePos, { y: 'center' }),
    };
    
    if (select) {
      const safeFrom = Math.min(Math.max(0, select.from), docLength);
      const safeTo = Math.min(Math.max(0, select.to), docLength);
      spec.selection = EditorSelection.single(safeFrom, safeTo);
    }
    
    view.dispatch(spec);
    view.focus();
  }, [getView]);

  /**
   * 在当前光标位置插入文本
   * @param text 要插入的文本
   */
  const insertAtCursor = useCallback((text: string) => {
    const view = getView();
    if (!view) return;
    
    const { from } = view.state.selection.main;
    view.dispatch({
      changes: { from, to: from, insert: text },
      selection: EditorSelection.cursor(from + text.length),
    });
  }, [getView]);

  /**
   * 用前后文本包裹当前选区
   * @param before 前缀文本
   * @param after 后缀文本
   * @param selectContent 是否选中被包裹的内容（默认 true）
   */
  const wrapSelection = useCallback((
    before: string, 
    after: string,
    selectContent = true
  ) => {
    const view = getView();
    if (!view) return;
    
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const newText = before + selected + after;
    
    view.dispatch({
      changes: { from, to, insert: newText },
      selection: selectContent 
        ? EditorSelection.range(from + before.length, from + before.length + selected.length)
        : EditorSelection.cursor(from + newText.length),
    });
  }, [getView]);

  /**
   * 聚焦编辑器
   */
  const focus = useCallback(() => {
    getView()?.focus();
  }, [getView]);

  /**
   * 替换整个文档内容
   * @param text 新内容
   * @param preserveCursor 是否尝试保持光标位置
   */
  const replaceAll = useCallback((text: string, preserveCursor = true) => {
    const view = getView();
    if (!view) return;
    
    const oldLength = view.state.doc.length;
    const { from } = view.state.selection.main;
    
    // 计算新的光标位置
    let newCursor = preserveCursor ? Math.min(from, text.length) : 0;
    
    view.dispatch({
      changes: { from: 0, to: oldLength, insert: text },
      selection: EditorSelection.cursor(newCursor),
    });
  }, [getView]);

  /**
   * 获取指定行号的位置信息
   * @param lineNumber 行号（1-indexed）
   */
  const getLineInfo = useCallback((lineNumber: number) => {
    const view = getView();
    if (!view) return null;
    
    try {
      const line = view.state.doc.line(lineNumber);
      return {
        from: line.from,
        to: line.to,
        text: line.text,
        number: line.number,
      };
    } catch {
      return null;
    }
  }, [getView]);

  /**
   * 获取指定位置所在的行信息
   * @param pos 文档位置
   */
  const getLineAt = useCallback((pos: number) => {
    const view = getView();
    if (!view) return null;
    
    try {
      const line = view.state.doc.lineAt(pos);
      return {
        from: line.from,
        to: line.to,
        text: line.text,
        number: line.number,
      };
    } catch {
      return null;
    }
  }, [getView]);

  return {
    // 读取操作
    getContent,
    getSelection,
    getSelectedText,
    getLineInfo,
    getLineAt,
    // 写入操作
    replaceRange,
    replaceSelection,
    replaceAll,
    setSelection,
    scrollToPosition,
    insertAtCursor,
    wrapSelection,
    // 其他
    focus,
    getView,
  };
}
