# Agent Task 执行能力方案

> 更新日期：2026-08-04
> 更新说明：完成 Agent 负责人任务的执行按钮、Agent CLI 执行入口、唯一执行权、运行状态和严格权限实现，并记录本轮验证结果。

## 1. 产品目标

当 Task 的负责人是 Agent 时，用户可以在任务详情中点击 `Execute`，让这个 Agent 读取任务并立即开始执行。

Agent 也可以调用同一个能力：

```text
buzz tasks execute --id <task-id> --expected-event <state-event-id>
```

无论发起者是人还是 Agent，最终都走同一条 Relay 权限和执行流程，避免 Desktop 能执行、CLI 却是另一套逻辑。

本功能要让用户清楚回答四个问题：

1. 这个任务现在能不能执行；
2. 点击后请求有没有真正送达；
3. Agent 是否已经开始工作；
4. 如果没有开始，具体卡在哪里。

## 2. 界面方案

### 2.1 按钮放置

`Execute` 放在 Task 右侧详情面板的主要操作区，仅在负责人是 Agent 时出现。

首版不把执行按钮直接放进每张看板卡，原因是卡片已经包含状态、优先级、截止时间和负责人操作；再增加主按钮会显著提高视觉噪音，也更容易误触。卡片只显示执行状态，例如 `Queued`、`Running` 或 `Failed`。

```text
┌──────────────────────────────┐
│ Task details                 │
│                              │
│ Audit onboarding flow       │
│ Assignee   bumble · Agent    │
│ Status     Todo              │
│ Priority   High              │
│ Due date   Aug 10            │
│                              │
│ [ Execute ]                  │
│                              │
│ Execution                    │
│ Waiting / Running / Failed   │
│ Requested by lu · 10:24      │
└──────────────────────────────┘
```

### 2.2 按钮状态

| 场景 | 按钮表现 | 用户看到的说明 |
|---|---|---|
| 可以执行 | `Execute` | 启动当前负责人执行任务 |
| 正在提交 | `Sending…` | 防止重复点击 |
| Agent 已接单 | `Running`，不可重复点击 | 展示开始时间和 Agent |
| Agent 未启动或不在线 | 禁用 | `bumble is offline. Start the Agent before executing this task.` |
| Task 已被别人修改 | 不执行 | 要求刷新后针对最新内容重新确认 |
| 最近一次执行失败 | `Retry` | 展示失败原因，重试生成新的执行 ID |

`Done`、已归档或已删除任务不显示可执行按钮。`Blocked` 任务默认允许重新执行，因为执行本身可能就是解除阻碍；界面应明确这是一次新的执行。

## 3. Agent 收到什么

Agent 接单后收到结构化的 Task 上下文，而不是一段容易丢字段的普通聊天文本：

- Task ID 和本次执行 ID；
- 当前 Task State event ID；
- 标题与完整描述；
- 状态、优先级、截止时间和标签；
- Project、Channel、来源消息等关联信息；
- 发起执行的人或 Agent；
- 可用于重新读取最新任务的命令。

Agent 的启动提示会明确要求：

1. 先确认 Task ID 和 State ID 与执行请求一致；
2. 使用现有 Buzz CLI 读取必要上下文；
3. 真正开始后把任务推进到 `In progress`；
4. 完成时由 Agent 根据实际结果决定是否改为 `Done`；
5. 无法继续时改为 `Blocked`，并在描述或关联 Channel 中说明原因。

不建议在 Agent 一轮对话结束时自动把 Task 改成 `Done`。一轮结束可能只是完成调查、请求权限或等待外部输入，并不一定代表任务完成。

## 4. 为什么不能只发送一条 @mention

复用普通 Channel 或 DM 消息看似简单，但不能完整满足本功能：

- Agent 自己发起执行时，自己发送并 @自己的消息可能被来源过滤；
- 同一个 Agent 身份在两台设备运行时，两个进程都可能收到消息并重复执行；
- 消息只能证明“已发送”，不能证明某个 Agent 实例已经接单；
- 页面刷新后难以稳定恢复 `Queued`、`Running` 和 `Failed`；
- Task 在执行前被编辑时，普通消息无法阻止 Agent 按旧内容工作。

因此首版使用独立 Task Execution 事件，但 Agent 仍可在关联 Channel 中发布进展，聊天与执行控制保持各自清晰。

## 5. 完整执行流程

```text
用户或 Agent 点击/调用 Execute
        │
        ▼
Relay 检查任务、负责人、调用权限和最新 State ID
        │
        ▼
生成唯一 Execution ID，状态变为 Queued
        │
        ▼
目标 Agent 的 ACP harness 收到定向执行请求
        │
        ▼
Agent 实例向 Relay 申请唯一执行权
        │
        ├─ 未获得：不启动，避免重复执行
        │
        └─ 获得：状态变为 Running，开始 Agent turn
                         │
                         ▼
              Agent 使用 CLI 读取并处理 Task
                         │
                         ▼
              Execution 记录 Finished 或 Failed
```

同一个任务在 `Queued` 或 `Running` 时不能再次 Execute。失败或结束后可以发起新一轮执行，每一轮都有新的 Execution ID 和独立记录。

## 6. 权限规则

启动执行使用严格规则，只允许以下两种身份：

- 当前负责 Agent 自己；
- 当前负责 Agent 的 Owner。

其他人即使是 Task 创建者、具备 Task 编辑权、被允许给该 Agent 指派任务，或者是 community Owner/Admin，也不能启动执行。其他 Agent 也不能启动该 Agent 的任务。

这样明确区分两种权限：

- “可以指派任务”只代表可以把 Task 放入 Agent 的任务列表；
- “可以启动执行”可能调用 Agent 连接的代码、文件、工具和外部账号，因此仅限 Agent 自己和 Agent Owner。

无权用户打开任务详情时，可以看到该任务由 Agent 负责，但不显示可操作的 `Execute` 按钮。Relay 仍必须再次验证发起者身份，不依赖 Desktop 隐藏按钮作为安全保护。

## 7. Agent 在线与离线

- Agent 已在本机或远端运行：允许 Agent 自己或 Agent Owner 发布执行请求；
- Agent 未启动或当前不在线：不发布执行请求，不自动启动 Agent，页面提示 `Agent is offline. Start the Agent before executing this task.`；
- Agent Owner 启动 Agent 并确认其在线后，再回到 Task 点击 `Execute`；
- CLI 调用也执行相同检查，Agent 不在线时返回明确错误，不创建 `Queued` 记录。

首版不做“离线后无限期排队”。长时间排队容易让 Agent 几小时后按已经过期的任务内容突然开始工作。以后如果需要离线队列，应增加明确有效期和取消入口。

## 8. 执行状态与 Task 状态的关系

Execution 状态描述“这一轮 Agent 工作是否启动及如何结束”：

- `Queued`：Relay 已接受，等待 Agent 实例接单；
- `Running`：某个 Agent 实例已经获得唯一执行权；
- `Finished`：Agent turn 正常结束；
- `Failed`：启动、读取或执行过程失败；
- `Cancelled`：后续版本预留，首版不提供主动取消按钮。

Task 状态描述工作本身：`Backlog`、`Todo`、`In progress`、`Blocked`、`Done`。

两者不能混为一谈。Agent 获得执行权后，可将 `Backlog` 或 `Todo` 推进到 `In progress`；Execution 的 `Finished` 不自动等于 Task 的 `Done`。

## 9. 数据和事件设计

继续使用 PostgreSQL 现有 `events` 表，不新增传统任务执行表。每种事件有独立 kind，因此不会和普通消息或 Task State 混淆。

建议新增：

| Kind | 用途 |
|---|---|
| `42503` | Task Execution Request：人或 Agent 请求执行 |
| `42504` | Task Execution Update：目标 Agent 申请执行权并报告 Running/Finished/Failed |
| `30501` | Relay 生成的当前 Task Execution State |

Execution ID 使用 UUID。Request 必须包含 Task ID、最新 Task State ID、目标 Agent pubkey 和 Execution ID。Update 必须由目标 Agent 签名并指向 Execution ID。

Relay 在数据库事务中保证：

- 一个 Execution ID 只接受一次请求；
- 同一个 Task 同时最多一个 `Queued` 或 `Running` execution；
- 多个 Agent harness 同时抢单时只有一个可以进入 `Running`；
- Task 或负责人已经变化时，旧请求不能开始；
- 普通查询只返回当前 community 内有权查看的执行状态。

## 10. Agent 如何直接操作

新增 Agent CLI 命令：

```text
buzz tasks execute \
  --id <task-id> \
  --expected-event <task-state-event-id>
```

CLI 不要求调用者自己拼 Agent pubkey；Relay 从当前 Task State 读取负责人并验证它确实是 Agent。

返回稳定 JSON：

```json
{
  "task_id": "...",
  "execution_id": "...",
  "assignee": "<agent-pubkey>",
  "status": "queued",
  "accepted": true
}
```

“Agent 操作执行按钮”在无界面环境中的含义，就是调用这条与 Desktop 按钮完全等价的 CLI 命令。

## 11. 异常和边界情况

- Task 没有负责人或负责人是人：不显示 Execute，CLI 返回明确错误；
- Task 已 Done、归档或删除：拒绝执行；
- 请求提交前 Task 被编辑或转派：返回版本冲突，不按旧内容执行；
- 执行过程中 Task 被转派：原 Agent 后续状态更新会被拒绝；首版不自动取消已经开始的 Agent turn；
- 用户快速双击、Desktop 重试或 Agent 重试：Execution ID 幂等，不能产生两轮工作；
- 同一个 Agent 在两台设备运行：只有第一个成功 claim 的实例执行；
- 私密 Channel Task：目标 Agent 必须仍有 Channel 访问权；
- Agent 无权访问关联 Project 或来源消息：执行失败并指出缺少的访问范围；
- Relay 接受请求后由在线 Agent 立即 claim；首版依靠发起前在线检查，不提供离线排队和自动过期。自动取消卡住的 `Queued` execution 作为后续增强。

## 12. 首版范围

首版包含：

- Task 详情中的 Execute/Retry/Running 状态；
- Agent CLI `tasks execute`；
- Agent 在线检查，离线时提示先启动，不自动启动；
- Relay 权限、版本、唯一执行权和并发保护；
- ACP 收取结构化任务并启动 turn；
- Execution 的 Queued、Running、Finished、Failed 状态；
- 看板卡片显示轻量执行状态；
- Desktop 成功执行、离线禁用、事件解析和 Relay 严格权限测试。

首版不包含：

- 主动 Cancel/Stop 按钮；
- 自动重试和无限离线队列；
- 定时执行、周期执行和批量执行；
- 自动把 Finished Task 改成 Done；
- 多 Agent 协作执行同一 Task；
- Mobile/Web 界面。

## 13. Todo List

- [x] `crates/buzz-core/src/kind.rs`：注册 `42503`、`42504`、`30501` 并纳入协议分类。
- [x] `crates/buzz-sdk/src/lib.rs`：定义执行请求、执行更新和状态枚举输入结构。
- [x] `crates/buzz-sdk/src/builders.rs`：新增执行事件构造器和格式测试。
- [x] `crates/buzz-db/src/tasks.rs`：事务保存执行请求、唯一 claim、状态更新和并发约束。
- [x] `crates/buzz-db/src/lib.rs`：暴露 Task execution 数据能力。
- [x] `crates/buzz-relay/src/handlers/ingest.rs`：接入执行事件入口、kind 级权限范围和广播规则。
- [x] `crates/buzz-relay/src/handlers/command_executor.rs`：严格验证发起者、Agent 在线、Task 版本和执行状态，并生成 Relay execution state。
- [x] `crates/buzz-acp/src/relay.rs`：订阅定向 Task execution request。
- [x] `crates/buzz-acp/src/lib.rs`：claim 唯一执行权、构造结构化 Task prompt、启动 turn 并报告结束状态。
- [x] `crates/buzz-cli/src/lib.rs`：增加 `buzz tasks execute --id --expected-event` 参数。
- [x] `crates/buzz-cli/src/commands/tasks.rs`：发布执行请求并输出稳定 JSON。
- [x] `crates/buzz-cli/README.md`：补充 Agent 执行 Task 的命令示例。
- [x] `crates/buzz-cli/TESTING.md`：补充真实 Relay、重复执行和权限验收步骤。
- [x] `desktop/src/shared/constants/kinds.ts`：同步三种 execution kind。
- [x] `desktop/src/features/tasks/types.ts`：增加执行状态和最近一次执行模型。
- [x] `desktop/src/features/tasks/lib/taskEvents.ts`：构造、解析和校验 execution 事件。
- [x] `desktop/src/features/tasks/lib/taskEvents.test.mjs`：覆盖执行事件与状态解析。
- [x] `desktop/src/features/tasks/hooks.ts`：查询、实时订阅、执行 mutation、Agent 在线检查和失败恢复。
- [x] `desktop/src/features/tasks/ui/TaskExecutionControl.tsx`：实现 Execute、Running、Retry 和错误说明。
- [x] `desktop/src/features/tasks/ui/TaskDetailPanel.tsx`：在 Agent 负责人详情中接入执行区。
- [x] `desktop/src/features/tasks/ui/TaskCard.tsx`：显示轻量 Queued、Running 或 Failed 标识。
- [x] `desktop/src/features/tasks/ui/TasksScreen.tsx`：传递执行能力并统一展示 mutation 错误。
- [x] `desktop/src/testing/e2eBridge.ts`：模拟执行请求和 Agent 在线状态。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖在线执行和离线禁用。
- [x] `docs/2026-08-03-agent-operable-task-board-plan.md`：把“指派不等于执行”扩展为显式执行能力。
- [x] `docs/2026-08-04-agent-task-execution-plan.md`：更新 Todo、实际范围和验证结果。

后续增强项：补充真实基础设施下的 execution 集成测试、自动处理长时间停留在 `Queued` 的执行，以及执行中转派时主动停止 Agent turn。

## 14. 验证结果

- Rust：SDK 构造器、Relay 严格权限、ACP 定向订阅与生命周期测试通过。
- Desktop：Task 事件单元测试通过；Task 页面在线执行与离线禁用 E2E 通过。
- 产品约束：只有负责 Agent 或其 Owner 能发起；Agent 离线时不创建请求；Execution 结束不自动把 Task 改为 Done。

## 15. 验收标准

1. 只有当前负责 Agent 自己或其 Owner 可以 Execute，Task 创建者、可指派者和 community Owner/Admin 均不能绕过该限制。
2. 人和 Agent 调用的是同一套 Relay 执行协议。
3. 点击后能区分请求已发送、Agent 已接单和执行失败。
4. 双击、重试和多个 Agent 实例不会导致同一轮任务重复执行。
5. Task 被编辑或转派后，旧 State ID 的执行请求不会启动。
6. Agent 不在线时不创建执行请求，不自动启动，而是明确提示先启动 Agent。
7. Agent 能读取完整 Task 上下文，并使用现有 CLI 更新实际工作状态。
8. Execution Finished 不会错误地自动把未完成工作标为 Done。
