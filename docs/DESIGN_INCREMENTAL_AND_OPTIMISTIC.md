# 设计文档：增量同步与乐观 UI

## 0. 目标 & 约束

### 0.1 设计目标

- **性能**：在 `10k+ cards` 规模下，启动和同步仍然流畅，避免每次全量扫描/传输。
- **健壮性**：
  - 删除、重命名、文件迁移等场景下，不产生“僵尸卡片”或重复卡片。
  - 网络抖动、Token 过期、部分失败时，不损坏本地状态。
- **一致性**：
  - 单一事实来源：一切与复习相关的真相以 Supabase 为准，本地为缓存+视图。
  - FSRS 状态和卡片内容的关系在各种变更路径下都自洽。
- **体验**：
  - 首屏加载用**乐观认证**去掉多余的白屏等待。
  - 编辑、复习等操作保持“先本地、后同步”的顺畅感。

### 0.2 约束

- 后端：Postgres + Supabase，已存在 `notes` / `cards` / `vaults` / `review_logs` 等表。
- 前端：
  - [DataService](cci:2://file:///d:/memory-player/src/lib/storage/types.ts:36:0-128:1) 接口稳定对外，具体实现为 [SupabaseAdapter](cci:2://file:///d:/memory-player/src/lib/storage/SupabaseAdapter.ts:7:0-901:1) / [MockAdapter](cci:2://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:16:0-260:1)。
  - 状态管理统一在 [appStore.ts](cci:7://file:///d:/memory-player/src/store/appStore.ts:0:0-0:0)（Zustand）中维护。
  - 桌面端通过 Tauri 访问本地文件系统（`useVaultWatcher`、`fileSystem` 服务）。

---

## 1. 增量同步 (Incremental Sync)

### 1.1 数据库 Schema 设计

**现状**

- `cards` 表：
  - 有 `updated_at`（触发器自动维护）。
  - 没有软删除字段。
- `notes` 表：
  - 有 `is_deleted`。
- 当前删除逻辑：
  - Note 删除 → 可能级联硬删 Cards。
  - [syncNote](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:117:2-136:3) 里对“多余 cloze”使用硬删 `DELETE FROM cards ...`。

**目标**

- 所有“卡片删除”统一走 **软删除**，通过 `updated_at` + `is_deleted` 暴露给增量协议。
- 允许“同一 note/clozeIndex 重生”（软删旧卡后再插入新的 active 卡）。

**Schema 变更**

```sql
-- 1. 给 Cards 表增加软删除标记
ALTER TABLE public.cards
ADD COLUMN is_deleted boolean DEFAULT false;

-- 2. 删除旧的唯一约束（阻止 deleted 卡片下重生同一 cloze）
ALTER TABLE public.cards DROP CONSTRAINT uq_card_identity;

-- 3. 创建新的部分唯一索引，只约束“未删除”的卡片
CREATE UNIQUE INDEX uq_card_identity_active
ON public.cards (note_id, cloze_index)
WHERE is_deleted = false;
```

**约束**

- 所有涉及 Notes / Cards 删除的后端逻辑，一律改为：
  - `UPDATE notes SET is_deleted = true`
  - `UPDATE cards SET is_deleted = true`
- **禁止**任何级联硬删（包括 Vault 删除时的 cascade）。

---

### 1.2 同步协议设计 (Server API)

协议遵循“上次同步时间”模型，以服务端时间为锚点。

**请求（Client → Server）**

```jsonc
// GET /api/sync
{
  "last_synced_at": "2023-11-24T10:00:00Z", // 首次启动传 null
  "limit": 1000                              // 分页支持
}
```

**查询（Server 内部）**

- Cards：

```sql
SELECT
  id, note_id, cloze_index, content_raw, state, due,
  stability, difficulty, reps, last_review,
  is_deleted, updated_at
FROM public.cards
WHERE
  user_id = $1
  AND updated_at > $2      -- last_synced_at
ORDER BY updated_at ASC
LIMIT $3;
```

- Notes（同理，包含 `is_deleted`，细节略）。

**响应（Server → Client）**

```jsonc
{
  "server_now": "2023-11-25T12:00:00Z", // 客户端必须保存此时间
  "has_more": false,
  "changes": {
    "notes": [ /* 包含 is_deleted = true 的记录 */ ],
    "cards": [ /* 包含 is_deleted = true 的记录 */ ]
  }
}
```

**语义**

- `server_now`：唯一可信时间锚，用来更新本地 `lastSyncedAt`。
- `changes.notes`：
  - `is_deleted=false` → Upsert 本地 Note。
  - `is_deleted=true`  → 本地删除整条 Note（及其卡片）。
- `changes.cards`：
  - `is_deleted=false` → Upsert 对应 `NoteMetadata.cards[clozeIndex]`。
  - `is_deleted=true`  → 从本地 `NoteMetadata.cards` 中移除条目。

---

### 1.3 客户端 DataService & Adapter 设计

#### 1.3.1 DataService 接口变更

在 [src/lib/storage/types.ts](cci:7://file:///d:/memory-player/src/lib/storage/types.ts:0:0-0:0) 中扩展：

```ts
getAllMetadata(
  vaultId?: string,
  after?: Date | string | null
): Promise<NoteMetadata[]>;
```

- 当 `after` 为 `null/undefined`：
  - 语义为“全量快照”（兼容现有实现）。
- 当 `after` 为有效时间：
  - 语义为“自该时间之后的增量变更”。

> 后续 Store 层不一定直接用这个接口拉“原始 changes”，也可以在 Adapter 中封装为 `syncChanges(after)`，这里是最小改动方案。

#### 1.3.2 SupabaseAdapter

**[syncNote](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:117:2-136:3)**

- 现有逻辑：
  - upsert `notes`
  - upsert `cards`
  - 删除 DB 中“多余 cloze”的卡片（硬删）。
- 目标逻辑：
  - Note 仍使用 upsert。
  - 卡片处理：
    - **存在且仍在当前解析结果中** → 更新 `content_raw` / `tags` / `updated_at` 等（保持 FSRS 状态）。
    - **存在但不在当前解析结果中** → `UPDATE is_deleted = true, updated_at = now()`。
    - **新卡片** → 插入 `state=0,due=now,stability=0...` 的默认 FSRS 状态。

**[getAllMetadata(vaultId, after?)](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:179:2-190:3)**

- 当 `after` 为空：
  - 行为类似现在：`SELECT cards JOIN notes`，过滤 `notes.is_deleted=false AND cards.is_deleted=false`。
- 当 `after` 存在：
  - 查询策略之一：
    - 针对指定 `vaultId`：
      - 从 `cards` / `notes` 增量表中查出 `updated_at > after` 的 rows。
      - 将变更折叠为 [NoteMetadata](cci:2://file:///d:/memory-player/src/lib/storage/types.ts:2:0-9:1) 级别（把新增/修改/删除应用到已有 map 上）。
  - 或者直接返回**完整** [NoteMetadata[]](cci:2://file:///d:/memory-player/src/lib/storage/types.ts:2:0-9:1) 快照给 Store，Store 再用 `after` 判断合并（较简单但传输量大）。

> 为简化前端，可以让 SupabaseAdapter 在内部做“cards/notes 的折叠”，对外仍然返回“新的完整快照”，再由 Store 负责合并。

#### 1.3.3 MockAdapter

- [getAllMetadata(vaultId, after?)](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:179:2-190:3)：
  - 参数上接受 `after`，但可以直接忽略，始终返回全量（本地数据量小）。
- 如需更真实的模拟，可为本地存储条目增加 `updatedAt` 字段并做类似合并，但不是硬性要求。

---

### 1.4 Store 中的增量合并逻辑

#### 1.4.1 新增状态字段

在 [appStore.ts](cci:7://file:///d:/memory-player/src/store/appStore.ts:0:0-0:0) / [AppState](cci:2://file:///d:/memory-player/src/store/appStore.ts:21:0-99:1) 中新增：

- `lastServerSyncAt: string | null`：增量协议游标（ISO 字符串）。
- 可选：`isSyncing: boolean`、`syncError?: string` 用于 UI 状态展示。

[NoteMetadata](cci:2://file:///d:/memory-player/src/lib/storage/types.ts:2:0-9:1) 建议扩展：

```ts
export interface NoteMetadata {
  noteId: string;
  filepath: string;
  cards: Record<number, Card>;
  lastReviews?: Record<number, ReviewLog>;

  // 新增（可选）
  remoteUpdatedAt?: string;  // 服务端视角最后一次变更时间
  isDeleted?: boolean;       // 软删除标记（主要用于回收站/合并）
}
```

> 字段保持可选，便于兼容现有持久化数据。

#### 1.4.2 合并算法（伪代码）

以 `loadAllMetadataIncremental` 为例（可包在 [loadAllMetadata](cci:1://file:///d:/memory-player/src/store/appStore.ts:355:2-369:3) 里）：

```ts
async function loadAllMetadata() {
  const { dataService, currentVault, lastServerSyncAt, fileMetadatas } = get();
  if (!currentVault) return;

  const after = lastServerSyncAt;
  const remoteMetas = await dataService.getAllMetadata(currentVault.id, after);

  set((state) => {
    const next = { ...state.fileMetadatas };

    for (const m of remoteMetas) {
      const existing = next[m.filepath];

      if (m.isDeleted) {
        // 软删除：移除本地条目
        delete next[m.filepath];
        continue;
      }

      if (!existing) {
        next[m.filepath] = m;  // 新 note
      } else {
        // 基于 remoteUpdatedAt/FSRS 状态做合并（简化：远端胜出）
        next[m.filepath] = {
          ...existing,
          ...m,
          cards: { ...existing.cards, ...m.cards },
        };
      }
    }

    return {
      fileMetadatas: next,
      lastServerSyncAt: /* response.server_now or now */,
    };
  });
}
```

**健壮性要点**

- 合并时，若本地在当前 `after` 之后有“纯本地修改”（几乎不会有，FSRS 状态都走 Supabase），才需要做时间戳比较；当前架构中**远端一般是唯一写入方**，因此可以简化为“远端胜出”。
- 删除（`isDeleted`）优先级最高，不允许被旧的非删除状态覆盖。

---

### 1.5 特殊场景防坑

1. **级联删除陷阱**
   - 必须保证：
     - Vault/Note 删除 → 只更新 `is_deleted` 字段，不 cascade DELETE。
   - 前端：
     - 收到 `note.is_deleted=true` 时，删除对应 `fileMetadatas[filepath]`。
2. **时钟偏差**
   - `lastServerSyncAt` 必须由后端下发（`server_now`），前端不得自主生成。
   - 所有增量查询都基于该时间。
3. **首次启动 (Bootstrap)**
   - 当 `lastServerSyncAt` 为空：
     - 视为全量同步；
     - 如数据量大，用 `limit + has_more` 分页拉取，直到 `has_more=false`。

---

## 2. 乐观 UI (Optimistic UI)

### 2.1 现状

- [initDataService('supabase')](cci:1://file:///d:/memory-player/src/store/appStore.ts:202:2-242:3)：
  - [service.init()](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:29:2-53:3) 后立即调用 `supabase.auth.getUser()`。
  - 约 700ms 的网络往返期间，应用还无法加载数据 → 白屏/Loading 过长。

### 2.2 乐观认证流程

利用 Supabase JS Client 持久化在 LocalStorage 的 Session：

**逻辑流**

1. 调用 `client.auth.getSession()`：
   - 同步或极快异步（本地读）。
2. 如果存在 Session：
   - 在 Store 中设置 `currentUser`（仅基于 Session 中的 user id/email，乐观）。
   - **立刻**：
     - [loadVaults()](cci:1://file:///d:/memory-player/src/store/appStore.ts:415:2-430:3)
     - [loadReviewHistory()](cci:1://file:///d:/memory-player/src/store/appStore.ts:553:2-569:3)
     - （需要时）触发 [loadAllMetadata()](cci:1://file:///d:/memory-player/src/store/appStore.ts:355:2-369:3)。
   - 并发启动 `client.auth.getUser()` 校验 Token：
     - 校验成功：更新 `currentUser`，一般无 UI 感知。
     - 校验失败：
       - 调用 [signOut()](cci:1://file:///d:/memory-player/src/store/appStore.ts:269:2-293:3) 清理本地状态和 Supabase Session。
       - 切回登录页。
       - Toast：“会话已过期，请重新登录”。
3. 如果 `getSession()` 无 Session：
   - 直接进入未登录流程（展示登录界面）。

### 2.3 错误处理 & 健壮性

- 在以下调用中捕获 Auth 错误（401/403）：
  - [SupabaseAdapter.getVaults](cci:1://file:///d:/memory-player/src/lib/storage/SupabaseAdapter.ts:64:2-91:3)
  - [getAllMetadata](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:179:2-190:3)
  - [getDueCards](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:219:2-242:3)
  - [searchCards](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:244:2-249:3)
  - [saveReview](cci:1://file:///d:/memory-player/src/lib/storage/types.ts:69:2-77:91)（通过 RPC）
- 统一逻辑：
  - 检测到 Auth 错误 → 调用 [signOut()](cci:1://file:///d:/memory-player/src/store/appStore.ts:269:2-293:3) → Toast 提示 → 导航到登录页。
- Mock 模式：
  - [initDataService('mock')](cci:1://file:///d:/memory-player/src/store/appStore.ts:202:2-242:3) 不应该做任何 Supabase 调用，保证完全离线可用。

---

## 3. 影响范围总览

### 3.1 高风险 / 显式回归

- **SupabaseAdapter**
  - [syncNote](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:117:2-136:3)
  - [getAllMetadata](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:179:2-190:3)
- **appStore**
  - [initDataService](cci:1://file:///d:/memory-player/src/store/appStore.ts:202:2-242:3)
  - [loadAllMetadata](cci:1://file:///d:/memory-player/src/store/appStore.ts:355:2-369:3)
  - `fileMetadatas` 持久化逻辑（[persist](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:208:2-210:3) 配置，迁移策略）。

### 3.2 中风险

- **LibraryView**
  - 手动同步流程（`handleManualSync` → [syncNote](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:117:2-136:3) + [loadAllMetadata](cci:1://file:///d:/memory-player/src/store/appStore.ts:355:2-369:3) + [fetchDueCards](cci:1://file:///d:/memory-player/src/store/appStore.ts:941:2-952:3)）。
- **useVaultWatcher**
  - 文件删除/修改 → [softDeleteNote](cci:1://file:///d:/memory-player/src/lib/storage/types.ts:54:2-57:47) + [syncNote](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:117:2-136:3) + [refreshMetadata](cci:1://file:///d:/memory-player/src/store/appStore.ts:371:2-413:3)。

### 3.3 低风险

- **Types**
  - [NoteMetadata](cci:2://file:///d:/memory-player/src/lib/storage/types.ts:2:0-9:1) 扩展（向后兼容即可）。
- **MockAdapter**
  - [getAllMetadata](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:179:2-190:3) 接受 `after` 参数；保持简单实现即可。

---

## 4. 实施计划（分阶段）

### 阶段 0：准备 & 防护

- [ ] 在 `appStore` 的 [persist](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:208:2-210:3) 配置中启用版本号和 `migrate` 函数：
  - 旧版本 `fileMetadatas` 若结构不兼容，清空或迁移。
- [ ] 添加必要的日志（console + Toast 文案）方便首轮调试。

### 阶段 1：数据库 & 后端

- [ ] 执行 `cards.is_deleted` 字段和部分唯一索引。
- [ ] 确保后端**不再使用**级联硬删除：
  - Vault/Note 删除改为设置 `is_deleted=true`。
- [ ] 若使用 RPC 或 View，保证新字段体现在查询结果中。

### 阶段 2：Types & Adapter

- [ ] 更新 [NoteMetadata](cci:2://file:///d:/memory-player/src/lib/storage/types.ts:2:0-9:1) 类型（新增可选字段：`remoteUpdatedAt?` / `isDeleted?` 等）。
- [ ] 扩展 [DataService.getAllMetadata(vaultId?, after?)](cci:1://file:///d:/memory-player/src/lib/storage/types.ts:87:2-90:59) 签名。
- [ ] SupabaseAdapter：
  - [ ] 调整 [syncNote](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:117:2-136:3)：
    - 多余 cloze → `UPDATE is_deleted=true` 而非 `DELETE`。
    - 插入新卡 → 填充默认 FSRS 字段（已在现有实现中做过，可复用）。
  - [ ] 扩展 [getAllMetadata](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:179:2-190:3) 支持 `after`：
    - 当 `after` 为空：沿用当前全量逻辑。
    - 当 `after` 存在：基于 `cards.updated_at`/`notes.updated_at` 查询变更。
- [ ] MockAdapter：
  - [ ] 接受 `after` 参数并忽略（返回全量），保证接口兼容。

### 阶段 3：Store 增量合并 & 持久化

- [ ] 在 [AppState](cci:2://file:///d:/memory-player/src/store/appStore.ts:21:0-99:1) 中添加 `lastServerSyncAt`。
- [ ] 更新 [updateLastSync](cci:1://file:///d:/memory-player/src/store/appStore.ts:244:2-246:3)（或新增 `updateLastServerSync`）：
  - 使用服务端返回的 `server_now`。
- [ ] 重写 [loadAllMetadata](cci:1://file:///d:/memory-player/src/store/appStore.ts:355:2-369:3)：
  - 第一次（`lastServerSyncAt` 为空）→ 全量拉取。
  - 后续 → 传 `lastServerSyncAt` 做增量拉取，并合并至 `fileMetadatas`。
- [ ] 启用/确认 `fileMetadatas` 被 [persist](cci:1://file:///d:/memory-player/src/lib/storage/MockAdapter.ts:208:2-210:3) 落盘。
- [ ] 确保 [signOut](cci:1://file:///d:/memory-player/src/store/appStore.ts:269:2-293:3) 时清理与用户相关的缓存（`fileMetadatas`、`lastServerSyncAt` 等）。

### 阶段 4：乐观认证 & 错误处理

- [ ] 在 [initDataService('supabase')](cci:1://file:///d:/memory-player/src/store/appStore.ts:202:2-242:3) 中实现新的乐观认证流程：
  - 使用 `getSession` → 乐观设置 `currentUser` → 并发 `getUser` 校验。
- [ ] 为所有 Supabase 调用增加 Auth 错误识别：
  - 捕获 401/403 → 调用 [signOut](cci:1://file:///d:/memory-player/src/store/appStore.ts:269:2-293:3)。
- [ ] 保证 `syncMode='mock'` 时路径完全不触 Supabase。

### 阶段 5：测试 & 回归

- [ ] 小数据集功能回归：
  - 创建/编辑/删除 Note，检查 Library、Review 队列一致性。
- [ ] 大数据模拟：
  - 生成 `10k+` 卡片，确认首屏时间和增量同步耗时。
- [ ] 异常场景：
  - Token 过期：
    - 启动时 `getSession` 有值但 `getUser` 报 401。
    - 中途操作（如手动同步、Review 保存）时 401。
  - 网络中断：
    - 增量拉取过程中失败，确认不会破坏现有 `fileMetadatas`。
- [ ] 手动“重建缓存”：
  - 预留一个“强制全量同步”入口（可在 Library 中加隐藏命令或调试菜单），在极端异常时可用。