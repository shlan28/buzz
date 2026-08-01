> 更新日期：2026-08-01
> 更新说明：已完成 daily-assistant 来源发现、删除缓存竞态修复、失败回滚及真实形态回归测试。

# Calendar 真实数据不可见与删除回弹修复方案

## 一、用户问题

当前真实环境同时出现：

1. Calendar 左栏没有 daily-assistant 来源复选框。
2. daily-assistant 已创建的 3 条历史日程没有展示。
3. 用户创建日程后点击 Delete，日程仍留在页面，可被重复删除。

## 二、真实数据证据

已直接检查 `achoverse.xyz` 对应 PostgreSQL 数据：

- daily-assistant pubkey 为 `5af288…c33e`。
- `users.agent_owner_pubkey` 正确指向当前 Desktop 身份 `b2fa03…3f4e`。
- 3 条 daily-assistant 日程均存在、未删除，发生时间都在 2026-08-02：
  - `提交BP到连尚网络`
  - `联系刘力`
  - `联系MOMA展览 舒总`
- daily-assistant 有 kind-0 profile，profile 的 `auth` tag 同样声明当前用户为 owner。
- 当前 community 没有任何 kind-10100 Agent profile，因此 `list_relay_agents` 返回空列表。
- 用户测试日程已经被 Relay 设置 `deleted_at`，并存在 7 条针对同一坐标的 kind-5 删除事件，证明 Delete 发布与 Relay 软删除成功，错误位于 Desktop 删除后的缓存刷新。

## 三、根因

### 3.1 Agent 来源候选集错误

上一版 Calendar 只把 `list_relay_agents` 的 kind-10100 结果交给 `getUsersBatch()` 读取 kind-0 owner profile。由于真实 Relay 没有 kind-10100 事件，候选集为空，即使 daily-assistant 的 kind-0 profile 和数据库 owner 绑定都正确，也不会进入来源列表或历史查询。

### 3.2 删除后立即 refetch 的竞态

Relay 接受 kind-5 发布后返回成功，再异步执行按坐标软删除。Desktop mutation 收到成功后立即 invalidate/refetch，可能在 `deleted_at` 写入前读回旧事件并重新写入 React Query 缓存。删除事件的实时通知也可能早于副作用完成，因此没有后续刷新纠正缓存。

## 四、修复设计

### 4.1 使用 managed + Relay Agents 作为候选，当前 Relay profile 做归属验证

来源发现改为：

```text
候选 Agent = 本机 managed Agents ∪ kind-10100 Relay Agents
owned Agent = 候选 Agent 在当前 Relay 的 kind-0 profile.ownerPubkey 等于当前用户
```

这样：

- daily-assistant 虽没有 kind-10100，但存在本机 managed 记录与当前 Relay kind-0 owner 声明，因此会出现。
- 只存在于其他 Relay 的本机 Agent在当前 Relay查不到 owner profile，不会进入列表。
- 属于其他用户的 Agent会因 owner 不匹配被排除。
- 最终日历读取仍由 Relay ACL 逐作者裁决，客户端 profile 不越过服务端权限。

建设性建议：长期应提供 Relay 签名或认证后的“我的 owned Agents”发现能力，直接使用数据库权威绑定；当前方案是在不新增协议/API 的范围内，使用现有 kind-0 owner 声明完成可靠发现。

### 4.2 删除采用乐观缓存移除

Delete mutation 在发布 kind-5 前后执行：

1. 取消 Calendar 来源查询的进行中 refetch。
2. 保存受影响查询缓存快照。
3. 立即按 `(kind, author, d-tag)` 从对应来源缓存移除事件。
4. 发布失败则恢复快照并保留错误。
5. 发布成功不立即执行可能撞上 Relay 异步副作用的 refetch；后续正常实时事件、重新进入页面或显式刷新会从 Relay 读取已软删除状态。

同一事件从 UI 消失后无法再次触发 Delete，因此不会继续产生重复删除事件。

## 五、测试方案

1. 只有 managed-agent + kind-0 owner profile、没有 kind-10100 时，daily-assistant 来源仍出现且默认勾选。
2. daily-assistant 的 3 条历史事件能合并进 2026-08-02 日历。
3. 其他 Relay 的 managed Agent 在当前 Relay 没有 profile 时不进入来源列表。
4. 删除成功后事件立即消失，不依赖即时 refetch。
5. 模拟 Relay 删除副作用延迟，确认旧事件不会回弹，且只发布一次 kind-5。
6. 删除发布失败时恢复原事件并显示错误。
7. 保持上一轮 8 个 Calendar E2E，以及类型、Biome、px-text、file-size 和 Agent 提示词测试通过。

## 六、Todolist

- [x] `desktop/src/features/calendar/hooks.ts`：扩展 profile 候选集，并为 Delete 增加可回滚的乐观缓存移除。
- [x] `desktop/src/features/calendar/ui/CalendarEventPopover.tsx`：显示 Delete 进行中状态与可恢复错误。
- [x] `desktop/src/features/calendar/ui/CalendarScreen.tsx`：连接 Delete pending/error 状态并在失败时保留详情。
- [x] `desktop/src/testing/e2eBridge.ts`：支持 managed-only owned Agent profile、删除副作用延迟与删除发布计数。
- [x] `desktop/tests/helpers/bridge.ts`：声明 Calendar 删除延迟和发布观测测试配置。
- [x] `desktop/tests/e2e/calendar.spec.ts`：覆盖 managed-only 来源发现、真实历史日程展示、删除不回弹及失败回滚。
- [x] `docs/2026-08-01-calendar-live-data-repair-plan.md`：记录实施结果、验证结果和方案偏差。

## 七、验收标准

- 左栏出现 daily-assistant，默认勾选。
- 打开 2026-08-02 能看到 3 条 daily-assistant 历史日程。
- 新建日程删除一次后立即消失，等待及切换视图后不回弹。
- 单个 Agent 来源失败仍不影响 Personal 和其他来源。
- 不修改或迁移现有日程数据；数据库中的 3 条历史日程保持原作者和原坐标。

## 八、实施结果

- Calendar profile 候选已改为本机 managed Agents 与 kind-10100 Relay Agents 的并集；当前 Relay kind-0 profile 继续负责 owner 过滤。
- managed-only 的 daily-assistant 现在能进入来源列表，其他 Relay 上没有当前 owner profile 的本机 Agent仍被排除。
- 历史迁移留下的空公钥或非法公钥 managed 记录会在 profile 查询前被过滤，不再污染整批来源发现；有效的 daily-assistant 记录保持参与查询。
- Personal 和 owned Agent 历史查询保持逐来源隔离，daily-assistant 的 3 条 2026-08-02 日程可同时展示。
- Delete 在发布前乐观移除目标坐标；实时 kind-5 同样直接移除缓存，不再立即 refetch 已知存在副作用竞态的坐标。
- Delete 失败会恢复全部受影响查询缓存，并在详情中展示 Relay 错误；进行中按钮禁用，避免重复提交。
- E2E mock 能延迟删除副作用 1 秒并记录发布次数，验证日程只删除一次、不会回弹，页面重载后仍保持删除状态。

验证结果：

- Desktop Biome：通过。
- `pnpm typecheck`：通过。
- `pnpm check:px-text`：通过。
- `pnpm check:file-sizes`：通过。
- `pnpm build:e2e`：通过。
- Calendar Playwright E2E：11/11 通过。
