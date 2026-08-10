# Desktop 与 Web Task 执行历史在 Inbox 中消失修复方案

> 更新日期：2026-08-10
> 更新说明：已完成 Desktop 历史结果身份修复和 Web Task result 对齐；补充最终根因、测试结果与既有门禁限制。

## 1. 问题结论

同一 Task 重新执行后，旧结果没有被 Relay 删除，但 Desktop Inbox 没有稳定展示全部历史结果。

本次现场数据已经确认：

- Task ID：`71cfb2da-d3da-440c-9cb3-4f709f4c17e9`；
- 第一条完成结果在 `2026-08-10 11:57:19` 写入；
- Execution ID：`80bd2db5-3e65-4744-b63b-f9298b33c943`；
- 结果事件 ID：`b71f0a047a87b1ef68c73574084a989a39185b0fa1a678f7f2c312153b89cc11`；
- 该事件的 `deleted_at` 为空，当前仍是可查询的 `finished` 状态；
- 同一 Task 在 `12:13:47` 产生一条独立的 `cancelled` Execution，并在 `12:37:02` 又产生一条独立的 `finished` Execution；
- 各轮执行使用不同 `d` tag / Execution UUID，没有发生数据库覆盖。

因此，这不是执行结果丢失，也不需要恢复数据库数据；问题位于 Desktop 从 Relay 获取多个 Execution、刷新缓存并投影到 Inbox 的客户端链路。

Web 当前虽然已经在 `WorkConsoleData` 中读取 `taskExecutions`，但 Inbox 只把 `messages` 投影为 DM、mention、thread、Agent 和 channel 条目，没有把 Task result 加入列表，也没有 Task result 专用详情。因此 Web 目前与 Desktop 不一致，本次一并补齐。

## 2. 产品行为

同一 Task 的每一轮终态执行都应形成独立的 Inbox 历史条目：

```text
11:57  Task completed · 第一轮结果
12:37  Task completed · 第三轮结果
```

规则如下：

- `finished` 和 `failed` 进入 Inbox；
- `queued`、`running` 和 `cancelled` 不产生结果条目；
- 每条结果以 Execution UUID 独立识别；
- 新一轮执行及其状态刷新不能覆盖或挤掉旧的终态结果；
- Task 详情中的 `View result in Inbox` 仍打开最新一轮结果；
- Inbox 中可以分别打开每一轮历史结果；
- Desktop 与 Web 对同一组 Task Execution 展示相同的历史结果；
- Web Task result 详情展示 Task 标题、Agent、执行状态、时间、结果正文和 `Open task`；
- Task 被软删除后，维持现有规则，不再展示其历史结果；
- 已读、未读和 Done 只影响对应 Execution 条目，不能连带隐藏同一 Task 的其他结果。

建设性建议：Inbox 列表可以继续按时间平铺，不在本次引入“按 Task 折叠历史”的新交互。先保证结果不消失，再单独评估是否需要执行历史分组，避免修复同时改变信息架构。

## 3. 技术方案

### 3.1 保持 Relay 事实来源

继续使用 kind `30501` Task Execution State，不新增 event kind、数据库表或 migration。Relay 已按 `(kind, relay pubkey, Execution UUID)` 保存每轮执行的当前状态，现场数据证明历史终态仍存在。

### 3.2 按 Execution UUID 归并查询结果

Desktop Inbox 查询拿到 Execution State 后，应先按 Execution UUID 归并：

- 同一个 Execution UUID 只保留最新状态；
- 不同 Execution UUID 必须同时保留；
- 排序只决定展示顺序，不参与去重；
- live subscription 刷新后用完整查询结果重建投影，不能按 Task ID 只保留最新一轮。

这里需要把“按 Execution UUID 选择最新状态”的规则做成可单测的纯函数，避免查询刷新、事件顺序或重复事件导致历史结果不稳定。

### 3.3 为 Task result 使用明确的会话身份

Inbox 的普通消息会按 thread/channel 归并，而 Task result 不是消息线程。Task result 的稳定会话身份应明确绑定 Execution UUID，不能从 Task ID、Channel `h` tag 或当前 Task 最新状态推导。

这样可以保证：

- 同一轮 Execution 的重复快照不会生成多条结果；
- 同一 Task 的不同 Execution 不会合并成一条；
- 已读和 Done 状态作用于单轮结果；
- 通过结果事件 ID 深链时仍能定位正确条目。

### 3.4 回归测试覆盖真实时间线

测试使用与现场一致的时间线：

1. 第一轮 `finished`；
2. 第二轮 `cancelled`；
3. 第三轮 `running → finished`；
4. 模拟 live invalidation 后重新投影。

最终 Inbox 必须同时保留第一轮和第三轮两条结果，且两条的 ID、正文和跳转目标互不覆盖。

### 3.5 Web 与 Desktop 使用相同的结果规则

Web 已经通过 `WorkConsoleData.taskExecutions` 获得 Relay Execution State，因此不增加新请求。Web Inbox 投影需要将授权用户可见的 `finished/failed` Execution 与当前 Task 组合为独立条目，并按 Execution UUID 定位。

Web 详情不能把 Task result 伪装成普通频道消息：

- 普通消息继续使用现有 Conversation detail；
- Task result 使用专用详情，展示本轮结果和 Task 上下文；
- `Open task` 跳转到 Web Tasks 页面并选中对应 Task；
- 同一 Task 的多轮结果分别显示，最新一轮不替换旧轮次；
- `cancelled` 不进入 Inbox，与 Desktop 保持一致。

## 4. 不在本次范围

- 不修改 Relay 中已保存的执行记录；
- 不把 `cancelled` Execution 加入 Inbox；
- 不新增 Task execution history 页面；
- 不调整 Agent 返回结果正文中已有的 skills context warning，该内容属于另一个结果质量问题。

## 5. Todo List

每个 todo 只对应一个文件：

- [x] `desktop/src/features/home/lib/taskExecutionInbox.ts`：按 Execution UUID 归并完整查询结果，确保 live 刷新后不同执行轮次都被保留。
- [x] `desktop/src/features/home/lib/inbox.ts`：为 Task execution result 使用 Execution UUID 级别的稳定 Inbox conversation identity，避免同一 Task 的多轮结果被普通线程规则合并。
- [x] `desktop/src/features/home/lib/taskExecutionInbox.test.mjs`：增加“完成、取消、再次完成并刷新”回归测试，验证两条完成结果都存在。
- [x] `desktop/src/features/home/lib/inbox.test.mjs`：验证同一 Task 的不同 Execution UUID 形成不同 Inbox 条目，并具有独立已读/Done identity。
- [x] `desktop/tests/e2e/tasks.spec.ts`：既有 Task Inbox 与再次执行场景通过，无需修改该文件。
- [x] `web/src/features/tasks/eventCodec.ts`：新增按 Execution UUID 选择最新状态的归并规则，同时保留 Task 页面按 Task 取最新一轮的规则。
- [x] `web/src/shared/api/communitySession.ts`：向 Work Console 返回全部 Execution UUID 的最新状态，不再按 Task ID 提前丢弃历史轮次。
- [x] `web/src/features/inbox/inboxProjection.ts`：把可见的 finished/failed Task Execution 按 Execution UUID 投影为独立 Inbox 条目，并与普通消息条目统一排序。
- [x] `web/src/features/inbox/TaskExecutionInboxDetail.tsx`：新增 Web Task result 专用详情，展示 Task 上下文、Agent 结果和 `Open task` 操作。
- [x] `web/src/features/inbox/InboxDetailPane.tsx`：识别 Task result 并路由到专用详情，普通消息保持现有行为。
- [x] `web/src/features/inbox/InboxListPane.tsx`：让消息和 Task result 使用统一的条目时间字段。
- [x] `web/src/features/inbox/InboxPage.tsx`：按条目类型保护普通 Conversation 跳转，并保持 Execution UUID 深链。
- [x] `web/src/features/tasks/TasksPage.tsx`：读取 `task` 查询参数并打开对应 Task，支持 Inbox 的 `Open task` 深链。
- [x] `web/tests/e2e/inbox-projection.spec.ts`：覆盖 Web 多轮完成结果、取消过滤、可见性、独立身份和旧结果保留。
- [x] `web/tests/e2e/work-console.spec.ts`：覆盖 Web Inbox 中两轮 Task result 同时展示、分别打开和跳转 Task。
- [x] `web/tests/helpers/desktopParityFixtures.ts`：保持共享视觉 fixture 不携带 Task result，由目标 E2E 单独注入历史执行数据。
- [x] `docs/2026-08-10-desktop-task-execution-inbox-history-fix-plan.md`：记录 Todo、最终根因和验证结果。

## 6. 验收标准

1. 现场 `11:57:19` 的旧结果无需恢复数据即可重新出现在 Inbox。
2. 同一 Task 两次或更多次完成时，每轮结果均为独立条目。
3. 新执行进入 Queued、Running、Cancelled 或 Finished 时，旧完成结果都不会消失。
4. 每轮结果的正文、时间、已读/Done 状态和详情跳转相互独立。
5. Task 详情的结果入口指向最新一轮，Inbox 仍保留旧轮次。
6. Web 与 Desktop 对 finished、failed 和 cancelled 的 Inbox 规则一致。
7. Web Task result 可以打开专用详情并跳转对应 Task。
8. 不新增数据库表、migration 或 event kind。

## 7. 计划验证

- Desktop 相关单元测试；
- Desktop TypeScript typecheck；
- Desktop Biome/check；
- Tasks E2E（使用 `pnpm build:e2e` 对应的仓库命令）；
- Web typecheck、Biome/check 和 production build；
- Web Inbox projection 与 work console E2E；
- 本地 Relay 上以同一 Task 连续执行两轮进行手工验收；
- 完成后使用 signed-off commit 提交修复，并合并回 `dev`。

## 8. 最终根因与验证结果

### 8.1 最终根因

- Relay 正确保留了每个 Execution UUID 的终态结果，现场 `11:57:19` 结果未被删除。
- Web 在 `communitySession` 读取阶段调用了“按 Task ID 取最新一轮”的归并函数，导致旧 Execution 在进入 Inbox 前已经被丢弃；同时 Web Inbox 原本完全没有 Task result 投影。
- Desktop 查询没有主动删除历史结果，但 Task result 沿用了普通 Inbox conversation identity 推导。修复后明确使用 `task-execution:<Execution UUID>`，并在查询结果进入投影前按 Execution UUID 归并快照，避免刷新顺序和普通线程规则影响历史轮次。

### 8.2 验证结果

- Desktop 历史投影相关单元测试：25 项通过；
- Desktop typecheck 通过；Biome、px text 和 pubkey 检查通过；
- Desktop Tasks smoke E2E 通过；
- Web typecheck、Biome、file-size 和 pubkey 检查通过；
- Web Inbox projection：4 项通过；
- Web work console 与视觉回归：34 项通过；
- Web production build 通过；
- Web 全量 smoke 中功能测试通过；首次运行因共享 fixture 增加结果导致 2 张既有 Inbox 视觉快照变化，随后将历史数据改为目标测试独立注入，相关视觉测试复跑通过。

Desktop 完整 `pnpm check` 仍会被本次分支基线中两个未修改文件的 file-size ratchet 阻止：`desktop/src-tauri/src/commands/agents.rs` 和 `desktop/src/shared/api/tauri.ts`。本次没有扩大这两个文件，也未夹带无关拆分。
