/**
 * CodeMirror 6 自定义快捷键配置
 * 
 * 实现 Anki 风格的 Cloze 编辑快捷键
 * 使用 Prec.high 确保自定义快捷键优先于默认快捷键
 * 
 * Best Practices:
 * - 使用 Prec.high 提升优先级避免冲突
 * - preventDefault: true 阻止浏览器默认行为
 * - 返回 true 表示已处理，阻止其他处理器
 */

import { keymap, KeyBinding } from '@codemirror/view';
import { Prec } from '@codemirror/state';

/**
 * Cloze 编辑器回调接口
 */
export interface ClozeKeymapHandlers {
  /** 创建新 Cloze (Ctrl+Shift+C) 或复用 ID (Ctrl+Alt+C) */
  insertCloze: (sameId?: boolean) => void;
  /** 移除 Cloze 格式 (Ctrl+Shift+X) */
  handleClearCloze: () => void;
  /** 跳转到相邻 Cloze (Alt+↑/↓) */
  jumpToSiblingCloze: (direction: 'next' | 'prev') => void;
  /** 保存文件 (Ctrl+S) */
  handleSave: () => void;
  /** 加粗 (Ctrl+B) */
  insertBold: () => void;
  /** 斜体 (Ctrl+I) */
  insertItalic: () => void;
}

/**
 * 创建 Cloze 编辑快捷键映射
 * 
 * @param handlers 快捷键回调函数
 * @returns CodeMirror Extension
 * 
 * @example
 * ```tsx
 * const keymap = useMemo(() => createClozeKeymap({
 *   insertCloze: (sameId) => { ... },
 *   handleClearCloze: () => { ... },
 *   // ...
 * }), [deps]);
 * 
 * <CodeMirror extensions={[keymap]} />
 * ```
 */
export function createClozeKeymap(handlers: ClozeKeymapHandlers) {
  const bindings: KeyBinding[] = [
    // === Cloze 操作 ===
    
    // 创建新 Cloze (自动递增 ID)
    {
      key: 'Mod-Shift-c',
      run: () => {
        handlers.insertCloze(false);
        return true;
      },
      preventDefault: true,
    },
    
    // 创建 Cloze (复用上一个 ID)
    {
      key: 'Mod-Alt-c',
      run: () => {
        handlers.insertCloze(true);
        return true;
      },
      preventDefault: true,
    },
    
    // 移除 Cloze 格式 (Uncloze)
    {
      key: 'Mod-Shift-x',
      run: () => {
        handlers.handleClearCloze();
        return true;
      },
      preventDefault: true,
    },
    
    // === 导航 ===
    
    // 跳转到下一个 Cloze
    {
      key: 'Alt-ArrowDown',
      run: () => {
        handlers.jumpToSiblingCloze('next');
        return true;
      },
    },
    
    // 跳转到上一个 Cloze
    {
      key: 'Alt-ArrowUp',
      run: () => {
        handlers.jumpToSiblingCloze('prev');
        return true;
      },
    },
    
    // === 文件操作 ===
    
    // 保存
    {
      key: 'Mod-s',
      run: () => {
        handlers.handleSave();
        return true;
      },
      preventDefault: true,
    },
    
    // === 文本格式化 ===
    
    // 加粗
    {
      key: 'Mod-b',
      run: () => {
        handlers.insertBold();
        return true;
      },
      preventDefault: true,
    },
    
    // 斜体
    {
      key: 'Mod-i',
      run: () => {
        handlers.insertItalic();
        return true;
      },
      preventDefault: true,
    },
  ];

  // 使用 Prec.high 确保优先级高于默认快捷键
  return Prec.high(keymap.of(bindings));
}

/**
 * 创建简单的格式化快捷键 (不依赖外部 handlers)
 * 用于独立的格式化操作
 */
export function createFormatKeymap() {
  return keymap.of([
    // 可以在这里添加不需要外部 handler 的简单格式化快捷键
  ]);
}
