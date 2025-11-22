# Memory Player 开发者指南：从 Markdown 到 FSRS 卡片的全链路

> 本文面向开发者，说明 Memory Player 在 **多 Cloze / 卡级调度** 下，从本地 Markdown 文件到 Supabase/Postgres 的完整数据流与架构约定。

## 0. 总体架构鸟瞰

```text
本地 Markdown (.md)
    │  (Tauri FS / FileSystemService)
    ▼
ParsedNote (frontmatter + content + clozes)
    │  (MarkdownSplitter)
    ▼
Card Rows (note_id, cloze_index, content_raw, ...)
    │  (SupabaseAdapter.syncNote / MockAdapter.syncNote)
    ▼
Supabase.cards / Mock localStorage
    │
    ├─ Dashboard 生成 QueueItem[]（每个 cloze 一条）
    │
    ▼
Session 队列（QueueItem[]: noteId, filepath, clozeIndex）
    │  (appStore.startSession / loadNote)
    ▼
ClozeMode 显示当前卡片（currentClozeIndex）
    │  (GradingBar / 键盘快捷键)
    ▼
saveReview(rating)
    │  (FSRS 调度)
    ▼
DataService.saveReview(noteId, clozeIndex, card, log)
    │
    ├─ SupabaseAdapter.saveReview → submit_review(card_id, ...)
    └─ MockAdapter.saveReview    → 更新 localStorage
```

核心思想：

- **Note 身份**：`frontmatter["mp-id"]` ↔ Supabase `notes.id` ↔ Memory Player 内部 `noteId`。
- **Card 身份**：`(note_id, cloze_index)`，其中 `cloze_index` 即 `{{c1::...}}` 中的 `1`。
- **调度粒度**：**一条 card = 一个 cloze**，FSRS 状态和复习历史都是 card 级的。

---

## 1. 本地文件与 Note 身份

### 1.1 FileSystemService（`src/lib/services/fileSystem.ts`）

负责本地文件操作与 `mp-id` 注入：

- `ensureNoteId(filepath)`：
  - 读取 `.md` 文件，使用 `gray-matter` 解析 frontmatter。
  - 若缺少 `mp-id`，生成 UUID 写回 frontmatter。
  - 返回 `{ id: string; content: string; frontmatter: any }`。
- `readNote` / `writeNote`：封装 Tauri FS 插件的读写。
- `watchFile(filepath, onChange)`：
  - 通过 `@tauri-apps/plugin-fs.watch` 监听文件变更。
  - 内部做简单 debounce，触发 `onChange()`。

### 1.2 appStore 中对 Note 身份的使用

`src/store/appStore.ts`：

- `loadNote(filepath, targetClozeIndex?)` 中：
  - 若不是 DEMO_VAULT：
    - 调用 `fileSystem.ensureNoteId(filepath)` 获取 `noteId` + 内容。
    - 更新：
      - `idMap[noteId] = filepath`
      - `pathMap[filepath] = noteId`
  - 使用 `parseNote(content)` 得到 `ParsedNote`。
  - 调用 `dataService.getMetadata(noteId || '', filepath)` 获取该 note 的所有卡片状态。
  - 将 `noteId` 回写到 `NoteMetadata` 和 `fileMetadatas[filepath]`。

> 结论：**本地文件重命名/移动不会丢失复习进度**，因为云端和本地都以 `mp-id`（noteId）为身份锚点，路径只是展示信息。

---

## 2. Markdown 解析与 Cloze 提取

### 2.1 parseNote（`src/lib/markdown/parser.ts`）

- 输入：原始 Markdown（包括 frontmatter + content）。
- 步骤：
  - 使用 `gray-matter` 拆出 `frontmatter` 与正文 `content`。
  - 使用 `ClozeUtils.CLOZE_REGEX` 匹配 Anki 风格 cloze：
    - 语法：`{{c1::Answer::Hint}}`，`1` 即 `cloze_index`。
  - 构建：
    - `clozes: { id, original, answer, hint }[]`。
    - `renderableContent`：
      - 将 cloze 替换为 `[Answer](#cloze-1[-Hint])` 形式，供 ReactMarkdown 渲染。
      - 这样在 UI 中，`ClozeMode` 可以拦截 `a[href^="#cloze-"]`，自定义展示和交互。

### 2.2 ClozeUtils（`src/lib/markdown/clozeUtils.ts`）

- `CLOZE_REGEX`：统一 cloze 语法解析。
- `getMaxClozeNumber(text)`：在插入新 cloze 时自动选择下一个编号。
- `createCloze(text, number, hint?)`：在编辑器里生成标准 cloze 字符串。

> 这一层确保 **前端编辑 → Markdown → 渲染** 的 cloze 表达形式统一且可逆。

---

## 3. 制卡：从 Markdown 到 cards 表

### 3.1 MarkdownSplitter（`src/lib/markdown/splitter.ts`）

职责：将 `ParsedNote.content` 拆分为 CardData 段落，并展开为数据库可写的 card 行。

1. `split(content, globalTags)`：
   - 按段落/标题切分内容，构建：
     - `blockId`：基于内容 + salt 的稳定 hash，用于 UI grouping。
     - `sectionPath: string[]`：该段落所在的标题路径（H1/H2/...）。
     - `contentRaw`：整段原始文本。
     - `clozeIds: number[]`：本段所有 cloze 的编号集合。
   - 只保留含 cloze 的段落。

2. `flattenToCards(noteId, blocks)`：
   - 输出数组：
     ```ts
     {
       note_id: noteId,
       cloze_index: number,
       block_id: string,
       content_raw: string,
       section_path: string[],
       tags: string[],
     }[]
     ```
   - **每一个 cloze_index 对应一条记录**，这是 `(note_id, cloze_index)` 唯一约束的直接实现。

### 3.2 SupabaseAdapter.syncNote（`src/lib/storage/SupabaseAdapter.ts`）

简要流程：

1. 获取当前用户 `userId`，确保有一个默认 `vault_id`（`getOrCreateDefaultVault`）。
2. `parseNote(content)` 拿到 `frontmatter`、`content` 和 `tags`。
3. `notes` 表：
   - `upsert({ id: noteId, user_id, vault_id, relative_path: filepath, title, tags, content_hash, last_sync_at })`。
4. `cards` 表：
   - `cardsData = MarkdownSplitter.split(parsed.content, tags)`。
   - `flattenedCards = MarkdownSplitter.flattenToCards(noteId, cardsData)`。
   - 映射为 upsert rows（**不包含 FSRS 状态字段**）：
     - `note_id, cloze_index, block_id, user_id, content_raw, section_path, tags, updated_at`。
   - `upsert` 到 `cards`：
     - `onConflict: 'note_id,cloze_index'`，保证已有卡片状态不被覆盖。

> 这一层确保 **Markdown 内容 → cards 表** 的映射是稳定且可重复的：同一段落、同一 cloze_index 永远映射到同一条 card 行。

---

## 4. DataService 抽象与两种 Adapter

### 4.1 DataService 接口（`src/lib/storage/types.ts`）

```ts
export interface NoteMetadata {
  noteId: string;
  filepath: string;
  cards: Record<number, Card>;
  lastReviews?: Record<number, ReviewLog>;
}

export interface QueueItem {
  noteId: string;
  filepath: string;
  clozeIndex: number;
  due: Date;
}

export interface DataService {
  init(): Promise<void>;
  syncNote(filepath: string, content: string, noteId: string): Promise<void>;
  saveReview(noteId: string, clozeIndex: number, card: Card, log: ReviewLog): Promise<void>;
  getMetadata(noteId: string, filepath: string): Promise<NoteMetadata>;
  getAllMetadata(): Promise<NoteMetadata[]>;
}
```

> 关键：所有与 FSRS 状态相关的方法都已经提升到 **卡级（noteId + clozeIndex）**，而不是 note 级。

### 4.2 SupabaseAdapter：真实云端实现

核心方法：

- `getMetadata(noteId, filepath)`：
  - `select * from cards where note_id = noteId`。
  - 每行生成一个 `Card`：
    - 填充 `state, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review` 等。
  - 聚合为 `cards: Record<clozeIndex, Card>`。

- `saveReview(noteId, clozeIndex, card, log)`：
  - 用 `(note_id, cloze_index)` 找到唯一 card：
    - `select id from cards where note_id = noteId and cloze_index = clozeIndex limit 1`。
  - 调用 Supabase RPC：
    - `submit_review(card_id, p_card_update, p_review_log)`。
    - 在数据库事务中：
      1. 更新 `cards` 中该行的 FSRS 字段。
      2. 在 `review_logs` 中插入一行历史记录。

- `getAllMetadata()`：
  - 从 `cards` 出发，join `notes.relative_path`，再按 `note_id` 聚合为 `NoteMetadata[]`。

### 4.3 MockAdapter：本地开发/离线模式

当前实现（已去掉老的 filepath hack）：

- 内部存储：

  ```ts
  interface LocalStorageSchemaEntry {
    filepath: string;              // 真实路径
    cards: Record<number, Card>;  // 多 cloze
    history: ReviewLog[];
  }

  interface LocalStorageSchema {
    [key: string]: LocalStorageSchemaEntry; // key = noteId 或 fallback
  }
  ```

- `syncNote(filepath, content, noteId)`：
  - 不同步内容，只维护 `noteId ↔ filepath` 映射。
- `saveReview(noteId, clozeIndex, card, log)`：
  - 和 SupabaseAdapter 一致，按 `(noteId, clozeIndex)` 写入多卡状态。
- `getMetadata` / `getAllMetadata`：
  - 都返回带有 `filepath` 和 `cards` 的 `NoteMetadata`，**与 Supabase 模式结构完全一致**。

> 这样，上层 `appStore` / Dashboard / Library 不用关心是在 Supabase 还是 Mock 模式，逻辑全部复用。

---

## 5. 队列与 Session：如何按卡级生成与导航

### 5.1 队列类型：QueueItem

`QueueItem` 定义在 `types.ts`：

```ts
export interface QueueItem {
  noteId: string;
  filepath: string;
  clozeIndex: number;
  due: Date;
}
```

> 一条队列项就是「某篇 note 的某个 cloze」。

### 5.2 Dashboard：从元数据生成卡级队列

`src/components/Dashboard.tsx`：

- 遍历 `files` → `fileMetadatas[file]`：
  - 若 `meta.cards` 存在：
    - 对 `Object.entries(meta.cards)` 中的每个 `(clozeIndex, card)`：
      - 若 `card.due <= now` → 生成一条 `QueueItem`：
        - `{ noteId: meta.noteId, filepath: file, clozeIndex, due }`。
- `dueItems.sort` 按 `due` 升序。
- `handleStartSession`：
  - `setQueue(dueItems)`，然后 `startSession()`。

### 5.3 appStore：Session 状态与导航

`src/store/appStore.ts`：

- 状态：
  - `queue: QueueItem[]`。
  - `sessionIndex: number`，当前队列中的索引。
  - `currentFilepath: string | null`。
  - `currentMetadata: NoteMetadata | null`。
  - **`currentClozeIndex: number | null`**：当前正在复习的 cloze。

- `startSession()`：
  - 若 `queue.length > 0`：
    - 初始化 `sessionTotal/sessionIndex/sessionStats`。
    - 取 `const first = queue[0];`：
      - `loadNote(first.filepath, first.clozeIndex)`。
    - 设置 `viewMode = 'test'`。

- `loadNote(filepath, targetClozeIndex)`：
  - 如前所述，读取/解析 note，获取所有卡片状态。
  - 设置：

    ```ts
    set({
      currentFilepath: filepath,
      currentNote: parsed,
      currentMetadata: metadata,
      currentClozeIndex: targetClozeIndex,
      viewMode: targetMode,
    });
    ```

> 注意：**即使一篇 note 有多个 cloze，Session 一次只聚焦一个 `clozeIndex`**，其它 cloze 作为上下文存在。

---

## 6. 复习与 `saveReview`：卡级 FSRS 调度

### 6.1 触发链路

- `useKeyboardShortcuts`（`src/components/shared/useKeyboardShortcuts.ts`）：
  - 在 `viewMode in ['review','test','master']` 下：
    - 按下 `1/2/3/4` 调用 `saveReview(1..4)`。
  - 检查 `event.repeat` + `isGrading`，防止重复触发。

- `GradingBar`（`src/components/GradingBar.tsx`）：
  - 点击 UI 上的 Again/Hard/Good/Easy 按钮，同样调用 `saveReview(rating)`。

### 6.2 saveReview 实现（`appStore.ts`）

关键逻辑：

```ts
saveReview: async (rating) => {
  const { currentFilepath, currentMetadata, currentClozeIndex, dataService, queue, loadNote, fileMetadatas, sessionStats, isGrading, sessionIndex } = get();
  if (!currentFilepath || !currentMetadata || isGrading) return false;

  if (currentClozeIndex === null) {
    useToastStore.getState().addToast("No active cloze to grade", 'warning');
    return false;
  }

  if (sessionIndex >= queue.length && queue.length > 0) {
    useToastStore.getState().addToast("Session already complete", 'info');
    return false;
  }

  set({ isGrading: true });

  try {
    const f = fsrs();
    const currentCard = currentMetadata.cards[currentClozeIndex] || createEmptyCard();
    const scheduling_cards = f.repeat(currentCard, new Date());
    const record = scheduling_cards[rating as 1 | 2 | 3 | 4];

    if (!record) {
      useToastStore.getState().addToast("Grading failed", 'error');
      return false;
    }

    const noteId = currentMetadata.noteId || currentFilepath;
    await dataService.saveReview(noteId, currentClozeIndex, record.card, record.log);

    const newMetadata: NoteMetadata = {
      ...currentMetadata,
      cards: {
        ...currentMetadata.cards,
        [currentClozeIndex]: record.card,
      },
      lastReviews: {
        ...currentMetadata.lastReviews,
        [currentClozeIndex]: record.log,
      },
    };

    // Optimistic update & sessionStats...
    // 前进到 queue[nextIndex] 或结束 session
  } finally {
    set({ isGrading: false });
  }
}
```

> 这里最重要的是：**FSRS 调度完全基于当前 cloze 对应的 Card**，不会误更新同一 note 中其他 cloze 的状态。

---

## 7. ClozeMode UI：围绕当前卡片的学习体验

`src/components/modes/ClozeMode.tsx`：

- 获取 `currentNote` 与 `currentClozeIndex`：
  - 如果 `currentClozeIndex !== null`（Session 模式）：
    - **目标 cloze**：
      - 以高亮 badge 显示「Reviewing Cloze #X」。
      - 文本默认挖空，按空格或点击 reveal。
    - **非目标 cloze**：
      - 默认展示答案，采用弱化样式，作为上下文；点击不会触发 reveal。
    - 初次加载时：
      - `scrollIntoView('#cloze-X')`，自动滚动到当前 cloze 所在位置。
  - 如果 `currentClozeIndex === null`（自由浏览模式）：
    - 所有 cloze 按原先逻辑挖空。
    - `ModeActionHint` 支持「Show All / Hide All」。

> 这让「一篇长文中多处挖空」在体验上变成「当前题目 + 上下文」的形式，而不是一次考你所有空。

---

## 8. Supabase vs Mock：差异与一致性

- **共同点**：
  - 都实现了 `DataService` 接口。
  - 都以 `noteId` 和 `clozeIndex` 为 card 身份。
  - 都返回 `NoteMetadata`，其中 `cards: Record<number, Card>`。
  - 上层 `appStore`、`Dashboard`、`LibraryView` 完全复用同一套逻辑。

- **差异点**：
  - SupabaseAdapter：
    - 真实写入 `notes` / `cards` / `review_logs` 表，使用 `submit_review` RPC 做事务更新。
    - 适用于多端同步、真实用户数据。
  - MockAdapter：
    - 用 localStorage 模拟同样的数据结构和状态流。
    - 不访问网络，适合本地开发 / Demo 环境。

---

## 9. 开发/调试建议

1. **新增 cloze 逻辑测试**：
   - 在一篇 note 中插入多个 `{{cX::...}}`，保存并 sync。
   - 确认 Supabase `cards` 中生成多条 `(note_id, cloze_index)` 行，Mock 下 `cards` map 有多条记录。

2. **Session 队列验证**：
   - 在 Dashboard 启动 session：应看到「X Cards Due」，而非 Notes。
   - 每次打分后，应跳到下一个 cloze，直到队列结束。

3. **重命名文件**（Tauri 模式）：
   - 在文件管理器里改名，再回到应用中重新扫描/打开。
   - 确认：
     - `noteId` 不变。
     - Supabase 中复习历史仍然挂在同一 `note_id` 和各 `cloze_index` 上。

4. **Mock vs Supabase 对比**：
   - 用相同的 demo 笔记，在 Mock 模式下跑一轮 session，再在 Supabase 模式下跑一轮，观察行为是否一致。

---

以上就是从 Markdown → cloze → cards → 队列 → 复习 → submit_review 的完整开发者视角说明。建议将此文档与 `DATABASE_SCHEMA_PLAN.md` 一起阅读，可以快速掌握 Memory Player 的整体架构和扩展方向。
