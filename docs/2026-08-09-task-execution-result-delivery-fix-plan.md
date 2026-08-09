# Task Execution Result 误触发频道投递修复方案

> 更新日期：2026-08-09
> 更新说明：完成 Task Execution 专属结果交付、虚假频道投递隔离和 Done/Execution 收尾状态展示，并记录测试与基线门禁结果。

## 1. 问题与用户影响

用户为 Agent 指派 Task 并点击 `Execute` 后，Agent 已经能够领取并执行任务，但执行结束时出现了错误的频道投递流程：

1. 系统使用本次 Execution ID 作为隔离的内部队列与会话 key；
2. 通用 Agent turn 收尾逻辑把这个内部 key 当成真实 Channel ID；
3. Agent 被要求调用 `buzz messages send --channel <execution-id>`；
4. Relay 正确返回 `channel not found` 或 `restricted: not a channel member`；
5. Agent 尝试查询或加入这个不存在的频道，并把权限排查过程作为最终 Execution result 返回。

最终用户看到的不是 Task 的实际交付结果，而是一段要求创建频道、恢复成员权限的错误说明。这会让用户误以为 Task 执行依赖一个缺失频道，也可能诱导用户创建没有产品意义的“Execution 频道”。

此外，Task 状态与 Execution 状态当前是两条独立事件流。Agent 可以在 turn 内先把 Task 更新为 `done`，但 Execution 只有在整个 turn 结束、最终文本写入 Execution State 后才进入 `finished`。因此用户可能先看到 Task 已 Done，稍后才能在 Inbox 看到 result。错误的频道投递重试会显著拉长这个窗口，让“工作完成”和“结果已交付”看起来相互矛盾。

## 2. 产品预期

Task Execution 与普通 Channel/DM 对话有不同的交付语义：

- Task Description 是执行输入；
- Agent 的最终 ACP 回复由 Buzz 自动保存为本次只读 Execution result；
- Task Execution 不创建专属 Channel 或 DM；
- Agent 不需要调用 `buzz messages send` 才能完成 Task result 交付；
- 如果 Task 本身关联了真实 Channel，只有任务要求明确要求发布消息时，Agent 才应根据真实 Task 上下文主动发送；系统不能把内部 Execution ID 当成该频道；
- 普通 Channel/DM turn 仍必须保留现有的 relay-visible 消息送达检查和 fallback，不能因本次修复出现静默回复回归。
- Task `done` 表示工作状态，Execution `finished` 表示本轮结果已经持久化并可以进入 Inbox；两者不可伪装成同一个状态。
- 当 Task 已是 `done`、Execution 仍是 `queued/running` 时，界面统一显示 `Finishing result…`，明确说明工作已完成但结果仍在保存。
- 只有 Execution 进入 `finished/failed` 后，界面才显示 `View result in Inbox`，并将本轮交付表现为终态。

## 3. 根因

### 3.1 内部会话 key 与频道 ID 共用类型

`task_execution_prompt()` 为避免 Task execution 与真实频道中的普通 mention 合并，使用 `execution_id` 作为独立的 queue/session key。该隔离策略本身合理，但变量和后续 `PromptSource::Channel` 路径仍将其表现为 `channel_id`。

### 3.2 通用收尾逻辑未区分 prompt 类型

Agent turn 以 `EndTurn` 正常结束时，pool 对所有带 batch 的 turn 调用 `ensure_channel_message_delivery()`。这个函数只判断 Agent 是否成功调用过消息发送工具，不判断 batch 是普通会话还是 `task-execution`。

因此，当 Task Agent 只返回应被保存为 Execution result 的 ACP 文本时，pool 会追加 `[Delivery Required]` 纠正提示，并把 `batch.channel_id` 插入 `buzz messages send` 命令。此处的 `batch.channel_id` 实际是 Execution ID。

### 3.3 全局交付提示与 Task result 语义冲突

Agent 的通用基础提示要求“有价值的结果必须通过 `buzz messages send` 发布”。Task execution 的启动提示当前没有显式声明本轮交付例外，导致即使 harness 不再强制纠正，Agent 仍可能主动尝试向内部 ID 发送消息。

### 3.4 Task 与 Execution 的终态时序未被产品化表达

Agent 在 turn 内通过 CLI 更新 Task，所以 `task-status:done` 可以先于 `TaskExecutionStatus::Finished` 到达 Relay。Execution result 则必须等 turn 返回后，由 ACP harness 读取最终 visible text 并发布 finished state。

这个顺序不是简单调整两行调用就能原子交换：如果禁止 running execution 更新 Done，Agent 在当前 turn 内将无法完成任务；如果 harness 在 turn 结束后一律自动 Done，又会错误关闭只完成调研、需要用户确认或应该 Blocked 的任务。当前真正缺失的是组合状态的清晰呈现，以及对异常延迟的消除。

## 4. 修复设计

### 4.1 在 Task execution prompt 中声明交付边界

Task 启动提示需要明确告诉 Agent：

- 最终回复会自动保存为 Execution result；
- 不要仅为了交付 Execution result 调用 `buzz messages send`；
- 当前 Execution ID 不是 Channel ID，禁止用它执行 `channels get`、`channels join` 或 `messages send`；
- 如果任务内容明确要求向真实频道发布，必须从最新 Task 的关联信息取得真实 Channel ID，并以 Relay 成功响应验证那次业务投递。

该说明应位于本轮结构化 Task prompt 中，作为比通用会话交付规则更具体的场景约束。

### 4.2 Task execution 跳过通用频道送达纠正

`ensure_channel_message_delivery()` 应根据 `FlushBatch.prompt_tag` 识别 `task-execution`：

- 对 `task-execution`，直接结束送达检查并保留本轮 usage；
- 不追加 `[Delivery Required]`；
- 不调用频道 fallback publisher；
- 不把 `message_sent == false` 视为交付失败。

Task execution 的真实交付完成条件仍是：Agent turn 正常结束，随后 ACP harness 将最终可见文本写入 `Task Execution Update/State` 的 content。现有 `task_execution_result_message()` 长度限制继续生效。

### 4.3 保持普通消息行为不变

以下场景继续执行原有送达保障：

- 普通频道 mention；
- 普通频道 thread reply；
- DM；
- 其他需要 relay-visible conversation message 的带 batch turn。

修复不放宽 Relay membership 校验，不允许向不存在或无权访问的频道发送消息，也不创建新的频道或事件 kind。

### 4.4 增加 `Done + active execution` 收尾呈现

Desktop 根据已有 Task 与 Execution 数据派生展示状态，不修改 Relay 中的真实 Task State：

| Task 状态 | Execution 状态 | 用户看到的执行反馈 |
|---|---|---|
| `in-progress` | `running` | `Running` |
| `done` | `queued/running` | `Finishing result…` |
| `done` | `finished` | `Done`，并提供 `View result in Inbox` |
| `done` | `failed` | `Done · Result delivery failed`，并提供失败详情/重试入口 |

Task 卡片、List row 和详情执行区应使用同一派生规则，避免一个位置显示 Done、另一个位置只显示 Running。Task 的真实 status selector 仍可显示 `Done`，但详情执行区必须紧邻说明“工作状态已完成，结果仍在保存”，不能让 Done 被理解为结果已经可读。

本次不让 Desktop 猜测或回滚 Relay 状态，也不为了制造原子视觉效果延迟 Task State 的订阅。只要 Execution finished state 到达，现有 Inbox live subscription 会刷新并生成 result；虚假频道投递被移除后，该收尾窗口应只包含正常的 execution state 发布与查询刷新时间。

## 5. 测试方案

### 5.1 Task execution 回归测试

增加回归覆盖，证明 `prompt_tag == "task-execution"` 且 Agent 只产生 ACP visible text 时：

- 不产生 delivery correction prompt；
- 不调用 fallback channel publisher；
- turn 仍按正常结果完成；
- 最终可见文本仍可作为 Execution result 保存。

同时校验 Task prompt 明确包含：Execution ID 不是 Channel ID、最终回复自动保存、无需为结果调用 `buzz messages send`。

### 5.2 普通频道防回归测试

保留并补强普通 channel batch 的既有断言：当 Agent 未发送 relay-visible 消息时，仍会触发一次 delivery correction，并在必要时执行 fallback。这样确保本修复只改变 Task execution，不削弱普通对话的可靠送达。

### 5.3 Desktop 收尾状态测试

增加纯逻辑和组件测试，覆盖：

- Task `done` + Execution `running` 显示 `Finishing result…`，不显示 `View result in Inbox`；
- Execution 变为 `finished` 后显示最终 Done 与 Inbox 入口；
- Execution 变为 `failed` 时不伪装成交付成功，并展示 result delivery failure；
- Task 卡片、List row、详情执行区使用一致文案；
- 普通 `in-progress + running` 仍显示 `Running`。

### 5.4 验证命令

实现后至少运行：

```bash
. ./bin/activate-hermit
cargo test -p buzz-acp
cargo fmt --all -- --check
cargo clippy -p buzz-acp --all-targets -- -D warnings
cd desktop && pnpm test
```

提交前运行完整门禁：

```bash
. ./bin/activate-hermit
just ci
```

## 6. 验收标准

1. 点击 `Execute` 后，Agent 的最终答案直接显示为 Execution result。
2. Execution result 中不再出现因内部 Execution ID 导致的 `channel not found`、`not a channel member` 或请求创建频道的说明。
3. Agent 不会对 Execution ID 调用 `channels get`、`channels join` 或 `messages send`。
4. Task execution 没有真实频道消息发送成功，也可以正常标记为 `Finished`，因为结果由 Execution State 承载。
5. 当 Task 明确要求向真实关联频道发布内容时，该业务动作仍必须使用真实 Channel ID，并取得 Relay 成功响应。
6. 普通 Channel/DM turn 未调用 `buzz messages send` 时，现有纠正与 fallback 行为保持不变。
7. 不创建虚假的 Execution 频道，不修改 Relay membership 权限规则。
8. Task 已 Done、Execution 仍 queued/running 时，卡片、List 和详情显示 `Finishing result…`，不再表现为完整交付。
9. `View result in Inbox` 只在 Execution `finished/failed` 且存在对应终态 event 后出现。
10. Execution finished 到达后，界面切换为最终 Done，Inbox 可打开并显示本轮结果。

## 7. Todo List

- [x] `crates/buzz-acp/src/lib.rs`：补充 Task execution 专属交付指令，并增加 prompt 与 Execution result 保存语义的回归测试。
- [x] `crates/buzz-acp/src/pool.rs`：让 `task-execution` batch 跳过通用频道送达纠正，并增加 Task execution 隔离及普通频道防回归测试。
- [x] `desktop/src/features/tasks/lib/taskExecutionPresentation.ts`：集中定义 Task status 与 Execution status 的组合展示语义，避免各界面自行判断。
- [x] `desktop/src/features/tasks/lib/taskExecutionPresentation.test.mjs`：覆盖 Running、Finishing result、Finished 与 result delivery failed 的派生规则。
- [x] `desktop/src/features/tasks/ui/TaskCard.tsx`：使用统一派生规则呈现卡片上的执行收尾状态。
- [x] `desktop/src/features/tasks/ui/TaskListView.tsx`：使用统一派生规则呈现 List row 的执行收尾状态。
- [x] `desktop/src/features/tasks/ui/TaskExecutionControl.tsx`：在详情中区分 Running、Finishing result、finished 和 result delivery failed，并严格控制 Inbox 入口。
- [x] `desktop/src/features/tasks/ui/TaskDetailPanel.tsx`：把 Task status 传入执行控制区，使详情能够表达 Done 但结果仍在保存。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖 Task 先 Done、Execution 后 finished 时的界面过渡和 Inbox result 入口。
- [x] `docs/2026-08-09-task-execution-result-delivery-fix-plan.md`：实现和验证完成后更新 Todo、验证结果与最终变更说明。

## 8. 实际验证结果

已通过：

- `cargo test -p buzz-acp`：664 个 library 单测、9 个 pool lifecycle 测试及 doc tests 通过；
- `cargo clippy -p buzz-acp --all-targets -- -D warnings`；
- Desktop `pnpm test`：3878 个测试通过；
- Desktop `pnpm typecheck`；
- Desktop `pnpm build:e2e`；
- `playwright test tests/e2e/tasks.spec.ts --project=smoke`：21/21 通过；
- `cargo fmt --all`、目标 Desktop 文件 Biome 格式化和 `git diff --check`。

全量 Desktop `pnpm check` 未通过，但阻塞项均位于本次未修改的基线文件：

- `desktop/src-tauri/src/commands/agents.rs` 超过既有 file-size ratchet 16 行；
- `desktop/src/shared/api/tauri.ts` 超过既有 file-size ratchet 1 行；
- `desktop/src/features/agents/lib/personaCatalogRelay.test.mjs` 有两条既存 `useTemplate` info。

本次新增和修改的 Desktop 文件已单独通过 Biome、typecheck、unit tests、E2E build 与 Tasks smoke tests。

## 9. 非本次范围

- 不把 Execution ID 改成真实 Task Channel ID；这会重新引入 Task execution 与普通 mention 合并、错误归属 turn 的风险。
- 不为每次 Task execution 创建 Channel 或 DM。
- 不修改 Desktop 的 Execution result 展示结构。
- 不改变 Task execution event kinds、Relay 权限或数据库 schema。
- 不自动替 Agent 判断任务是否应标记为 `Done`；Agent 仍按实际完成情况选择 `done` 或 `blocked`。
- 不把 Task State 与 Execution State 合并成一个事件，也不声称二者可以跨事件原子提交。
