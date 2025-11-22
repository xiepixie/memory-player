# 数据库 Schema 设计与改造计划文档 (v2.0)

## 1. 现状深度调研与问题分析

### 1.1 当前架构现状
通过对 `src/store/appStore.ts`, `src/lib/storage/*` 以及 `src-tauri` 的代码审计，发现目前系统处于 **MVP (最小可行性产品)** 阶段：
*   **标识符依赖**：全系统严重依赖 `filepath`（绝对路径）作为唯一主键。
    *   `NoteMetadata` 接口直接绑定 `filepath`。
    *   Supabase `cards` 表直接使用 `filepath` 作为 Primary Key。
*   **数据持久化**：
    *   本地读取：通过 `@tauri-apps/plugin-fs` 直接在 `appStore` 中读取文件内容。
    *   云端同步：仅同步复习进度 (FSRS State)，未同步笔记元数据或内容。
*   **缺乏抽象**：`appStore.ts` 承担了过多职责（UI 状态、文件 I/O、复习逻辑、缓存管理），导致难以插入中间层来处理 ID 映射。

### 1.2 核心痛点
1.  **重命名即丢失**：用户在文件管理器或 IDE 中重命名文件后，Supabase 中的复习记录因 `filepath` 变更而断连，导致进度清零。
2.  **多端同步灾难**：不同设备（Windows vs macOS）路径格式不同，导致无法跨设备同步进度。
3.  **内容移动脆弱性**：用户整理文件夹结构会破坏所有关联。

---

## 2. 目标架构设计

### 2.1 核心原则：ID-First Strategy
系统将从 "Path-Based" 迁移至 "ID-Based"。
*   **Source of Truth**: 笔记文件的 Frontmatter 中的 `mp-id` (UUID)。
*   **Local Cache**: 运行时在内存中维护 `Map<ID, FilePath>`，启动时或扫描时构建。
*   **Cloud DB**: 仅存储 `ID` 关联的数据，不存储绝对路径。

### 2.2 架构分层
为了解耦，需重构前端架构：

```mermaid
graph TD
    UI[UI Components] --> Store[Zustand Store]
    Store --> Service[NoteService (Logic Layer)]
    Service --> FS[FileSystem Adapter]
    Service --> DB[Database Adapter]
    
    FS -- Read/Write --> LocalFiles[Local Markdown Files]
    DB -- Sync --> Supabase[Supabase DB]
```

---

## 3. 数据库 Schema 设计 (Supabase / Postgres)

### 3.1 Tables

#### `vaults` (笔记库 - 新增)
用于支持多库隔离，未来可扩展为团队协作。

| Column | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | `auth.uid()` | Owner |
| `name` | `text` | | Vault Name |
| `config` | `jsonb` | `{}` | 库级配置 (如 FSRS 参数) |

#### `notes` (笔记索引 - 核心变更)
将文件路径与业务逻辑解绑。

| Column | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | | **PK**, 对应 Frontmatter `mp-id` |
| `vault_id` | `uuid` | | FK -> vaults.id |
| `title` | `text` | | 笔记标题 (用于显示) |
| `relative_path` | `text` | | **仅用于提示**，不作为查找依据 |
| `checksum` | `text` | | 内容哈希，用于冲突检测 |
| `updated_at` | `timestamptz` | `now()` | |

#### `cards` (FSRS 状态 - 迁移)
主键由 filepath 变更为 note_id。

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `note_id` | `uuid` | `PK, FK -> notes.id` | 关联笔记 |
| `state` | `int` | `0` | 0=New, 1=Learning, 2=Review, 3=Relearning |
| `due` | `timestamptz` | | 下次复习时间 |
| `stability` | `float` | | S 值 |
| `difficulty` | `float` | | D 值 |
| `elapsed_days` | `float` | | |
| `scheduled_days` | `int` | | |
| `reps` | `int` | `0` | |
| `lapses` | `int` | `0` | |
| `last_review` | `timestamptz` | | |

#### `review_logs` (复习日志)
用于分析和回溯。

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | PK |
| `note_id` | `uuid` | FK -> notes.id |
| `grade` | `int` | 评分 (1-4) |
| `state` | `int` | 复习前状态 |
| `reviewed_at` | `timestamptz` | |
| `duration` | `int` | 耗时(ms) |

---

## 4. 实施路线图 (Roadmap)

### 阶段一：本地标识符注入 (Local ID Injection)
**目标**：不依赖数据库，先保证本地文件系统具备 ID 识别能力。

1.  **创建 `FileSystemService`** (`src/lib/services/fileSystem.ts`)
    *   封装 `readNote(path)` 和 `writeNote(path, content)`。
    *   实现 `ensureNoteId(path, content): string`：
        *   解析 Frontmatter。
        *   若无 `mp-id`，生成 UUID 并回写文件 (使用 `gray-matter` stringify)。
        *   返回 ID。
2.  **改造 `appStore` 加载逻辑**
    *   在 `loadNote` 时，调用 `FileSystemService`。
    *   在内存中建立 `pathMap: Record<string, string>` (Path -> ID) 和 `idMap: Record<string, string>` (ID -> Path)。

### 阶段二：数据库迁移与适配 (DB Migration)
**目标**：将 Supabase 的存储结构从 Path 切换到 ID。

1.  **Supabase Schema 部署**
    *   运行 SQL 脚本创建上述表结构。
    *   配置 RLS (Row Level Security) 确保用户只能访问自己的数据。
2.  **升级 `SupabaseAdapter`**
    *   修改 `saveReview(noteId, ...)` 接口。
    *   修改 `getMetadata(noteId)` 接口。
    *   实现 `syncNote(noteId, relativePath, title)`：每次复习时顺便更新 `notes` 表的元信息。

### 阶段三：数据清洗脚本 (Data Migration)
**目标**：挽救旧数据。

1.  **编写迁移工具 (UI 触发)**
    *   遍历用户本地所有 `.md` 文件。
    *   为每个文件生成/读取 `mp-id`。
    *   **Critical**: 查询 Supabase `cards` 表中是否存在该文件的 `filepath` 记录。
    *   若存在旧记录 -> 将旧记录的数据搬迁到新表 (插入 `notes` 和 `cards`，使用新 ID)，并删除旧记录。
    *   若不存在 -> 视为新笔记。

### 阶段四：双向绑定与扫描 (Scanning & Watcher)
**目标**：处理文件移动和重命名。

1.  **全量扫描优化**
    *   启动时遍历 Vault，构建 `ID <-> Path` 内存映射。
    *   若发现 `Duplicate ID` (复制文件导致)，提示用户或自动重置其中一个。
2.  **文件监听 (Watcher)**
    *   监听文件重命名事件，更新内存映射。

---

## 5. 下一步具体任务 (Todo)

- [ ] **Infra**: 安装 `uuid` 库 (`bun add uuid @types/uuid`)。
- [ ] **Refactor**: 拆分 `src/lib/services/fileSystem.ts`，将 `gray-matter` 逻辑从 Store 移出。
- [ ] **Refactor**: 修改 `DataService` 接口，将 `filepath` 参数改为 `noteId`。
- [ ] **Feat**: 在 Supabase Dashboard 执行 SQL 建表。
- [ ] **Feat**: 实现 "Upgrade Database" 按钮，执行迁移逻辑。
