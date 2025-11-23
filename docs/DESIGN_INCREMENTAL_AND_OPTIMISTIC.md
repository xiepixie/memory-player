# 设计文档：增量同步与乐观 UI

## 1. 增量同步 (Incremental Sync)

### 现状分析
目前 `loadAllMetadata` 每次全量拉取 `cards` 表，包含关联 `notes` 表。
随着用户数据量增长（如 10k+ cards），这会导致：
1. **启动慢**：网络传输量大，DB 查询压力大。
2. **资源浪费**：大部分数据是未变更的，重复拉取无意义。

### 数据库现状 (v6.0)
- `cards` 表有 `updated_at` 字段，且有触发器自动更新。
- `cards` 表**没有**软删除字段（`is_deleted`）。
- `notes` 表有 `is_deleted` 字段。

### 优化方案：基于软删除的增量协议

#### 1.1 数据库 Schema 补全
必须为 `cards` 表引入软删除，并调整唯一约束以支持同名卡片的“重生”。

```sql
-- 1. 给 Cards 表增加软删除标记
ALTER TABLE public.cards
ADD COLUMN is_deleted boolean DEFAULT false;

-- 2. 删除旧的唯一约束（因为它会阻止插入一个新的 active 卡片，如果已经存在一个 deleted 的）
ALTER TABLE public.cards DROP CONSTRAINT uq_card_identity;

-- 3. 创建新的部分唯一索引，只约束“未删除”的卡片
CREATE UNIQUE INDEX uq_card_identity_active
ON public.cards (note_id, cloze_index)
WHERE is_deleted = false;
```

#### 1.2 同步协议设计 (The Protocol)
客户端与服务端的交互将遵循极简的“最后同步时间”协议。

**请求 (Client Request):**
客户端需持久化存储 `last_synced_at`（上一次同步成功的**服务端时间**）。

```json
// GET /api/sync
{
  "last_synced_at": "2023-11-24T10:00:00Z", // 首次启动传 null
  "limit": 1000 // 分页支持
}
```

**服务端查询 (Server Query):**
查找所有在 `last_synced_at` 之后变动过的数据（新增、修改、软删除）。

```sql
-- 查询 Cards
SELECT
  id, note_id, cloze_index, content_raw, state, due,
  stability, difficulty, reps, last_review,
  is_deleted, updated_at
FROM public.cards
WHERE
  user_id = $1
  AND updated_at > $2 -- 客户端传来的 last_synced_at
ORDER BY updated_at ASC
LIMIT $3;
```

**响应 (Server Response):**
服务端返回当前系统时间 `server_now` 作为下一次同步的锚点。

```json
{
  "server_now": "2023-11-25T12:00:00Z", // 客户端必须保存此时间
  "has_more": false,
  "changes": {
    "notes": [ ... ], // 包含 is_deleted = true 的记录
    "cards": [ ... ]  // 包含 is_deleted = true 的记录
  }
}
```

#### 1.3 客户端合并策略 (Client Merge)
客户端收到数据后，需在事务中执行“Upsert”或“Local Delete”。

1. **开启事务**：保证数据一致性。
2. **处理 Notes**:
   - 若 `remoteNote.is_deleted === true` → 本地删除。
   - 否则 → 本地 Upsert。
3. **处理 Cards**:
   - 若 `remoteCard.is_deleted === true` → 本地删除（从 `fileMetadatas` 中移除）。
   - 否则 → 本地 Upsert。
4. **更新游标**：事务成功后，将 `response.server_now` 写入 `last_sync_at`。

#### 1.4 特殊场景防坑

1. **级联删除陷阱 (Cascade Delete)**
   - **风险**：若直接硬删除 Vault/Note，DB 会自动级联硬删除 Cards。这些删除操作**不会**产生 `is_deleted=true` 的记录，导致增量同步无法感知，客户端残留僵尸数据。
   - **规避**：
     - **原则**：后端操作必须只用 **UPDATE is_deleted=true**。
     - `SupabaseAdapter.deleteNote` 必须改为软删除。
     - 客户端负责处理本地的级联清理（如收到 Note 删除，自动清理其下的 Cards）。

2. **时钟偏差**
   - **原则**：永远不要信任客户端时间。`last_sync_at` 必须由服务端下发 (`server_now`)，客户端仅负责存储和回传。

3. **首次启动 (Bootstrap)**
   - 当 `last_synced_at` 为空时，视为全量同步。
   - 若数据量大，需利用 `limit` + `has_more` 进行分页拉取，直到 `has_more: false`。

### 实施步骤
1. **Schema 变更**：执行上述 SQL 修改 `cards` 表。
2. **Adapter 修改**：
   - `syncNote`：将 delete 逻辑改为 `update is_deleted=true`。
   - `getAllMetadata`：升级为支持 `after` 参数的增量查询。
3. **Store 修改**：
   - 实现增量合并逻辑 (Merge Logic)。
   - 配置 `persist` 持久化 `fileMetadatas`。


---

## 2. 乐观 UI (Optimistic UI)

### 现状分析
`initDataService` 必须等待 `supabase.auth.getUser()` 返回（约 700ms）才开始加载数据。
即使用户上次已登录，也必须等待网络校验 Token 有效性，导致白屏或 Loading 状态过长。

### 设计方案

#### 2.1 乐观认证
Supabase JS Client 会将 Session 持久化在 LocalStorage。
我们可以先**假设** Session 有效，立即启动数据加载，同时在后台进行真实性校验。

**逻辑流**：
1. 检查 `supabase.auth.getSession()`（同步或极快异步，读本地）。
2. 如果有 Session：
   - 设置 `currentUser`（乐观）。
   - **立即** 触发 `loadVaults` 和 `loadReviewHistory`（乐观）。
   - **后台** 触发 `supabase.auth.getUser()`（真实校验）。
3. 校验结果回调：
   - **成功**：更新 `currentUser`（通常无感知）。
   - **失败**（Token 过期/无效）：
     - 调用 `signOut` 清理数据。
     - 弹回登录页。
     - Toast 提示“会话已过期，请重新登录”。

#### 2.2 风险控制
- **数据泄露风险**：Local Data 本身就存储在本地，乐观加载只是读取本地缓存或发起请求（如果 Token 失效，请求会在后端被 RLS 拒绝），所以安全风险可控。
- **RLS 拒绝**：如果 Token 确实失效，`loadVaults` 会报 401/403 错误。需要 `try-catch` 并在错误处理中判断是否为 Auth 错误，如果是则执行登出流程。

### 实施步骤
1. 修改 `initDataService`：
   - 使用 `getSession` 替代 `getUser` 作为初始判断。
   - 启动后台校验。
2. 增强错误处理：在 `loadVaults` / `getAllMetadata` 中捕获 Auth Error。

---

## 3. 综合任务清单

### 数据库
- [ ] 执行 SQL：给 `cards` 表添加 `is_deleted` 字段。

### 代码
- [ ] **Types**: 更新 `NoteMetadata` 或相关接口。
- [ ] **Adapter**:
  - 更新 `syncNote` 实现软删除。
  - 更新 `getAllMetadata` 支持 `after` 时间戳。
- [ ] **Store**:
  - 引入 `zustand/persist` 持久化 `fileMetadatas` (需评估大小)。
  - 修改 `initDataService` 实现乐观认证。
  - 实现增量合并逻辑。

