> 更新日期：2026-08-10
> 更新说明：完成 Agent 自我指派、Task Execution 断线补收和主动取消实现；补充修复 Channel Task Request 未进入 Agent Global 控制订阅的问题。

# Agent 自我指派与 Task Execution 卡队列修复方案

## 一、用户问题

当前 Task 执行存在两个相互放大的故障：

1. Agent 不能把一个尚未分配给自己的 Task 指派给自己，Relay 返回 403；
2. 用户点击 `Execute` 后，Execution 可能永久停留在 `Queued`，既不会开始，也没有取消入口。

这会破坏完整工作闭环：Agent 无法主动认领工作，Owner 即使代为指派并执行，也可能留下一个永久占用 Task 的活动 Execution，使后续 Execute 被“已有 queued/running execution”阻止。

## 二、现场证据与根因

### 2.1 Agent 自我指派被旧状态权限提前拒绝

Agent 日志中的实际错误是：

```text
relay error 403: restricted: task may only be edited by its creator, assignee, or agent owner
```

Relay 当前先根据旧 Task State 检查操作者是否已经是 creator、assignee、creator owner 或 assignee owner，然后才检查新负责人及 Agent assignment policy。

对于“未分配 Task → Agent 将负责人改成自己”这条路径，Agent 在旧状态中还不是 assignee，因此在新 `p` tag 被识别前就被拒绝。后面的 `agent_assignment_allowed(actor == agent)` 虽然允许自我指派，但实际上没有机会生效。

修复边界应严格限定为：目标负责人确实是当前签名 Agent 时，允许它从未分配或其他可编辑状态认领自己；不能借自我指派绕过 Track、Channel、community membership、archived identity、optimistic concurrency 或其他 Agent 的 assignment policy。

### 2.2 控制订阅重连时使用当前时间，断线窗口内的 Request 永久丢失

运行日志显示多个 ACP harness 反复出现：

```text
no pong received within 10s — connection dead, reconnecting
relay event stream ended — requesting reconnect
resubscribing to ... channel(s) after reconnect
```

Task Execution Request 已由 Relay 持久化并生成 `queued` State，但 Agent 领取任务依赖 WebSocket 控制订阅收到 kind `42503` 的实时事件。

当前控制订阅每次发送 REQ 时都设置：

```text
since = SystemTime::now()
```

因此 Request 如果在断线、重连或重新注册 REQ 的窗口内提交，重连后的 Agent 只接收“重连完成之后”的新事件，不会补收已经持久化的 queued Request。Relay 的 presence 又可能在短时间内仍显示 online，于是 Execute 能成功创建 queued，却永远没有 Agent claim 为 running。

修复应给控制订阅维护可回放 watermark，并在首次连接、断线重连和 CLOSED 恢复时从最近已确认时间减去小幅时钟偏差回放。重复 Request 由现有 Execution 原子状态转换去重：只有第一个 `queued -> running` claim 成功，旧请求或重复投递不能启动第二个 turn。

### 2.3 当前协议没有可用的取消终态

现有产品文档曾把 `Cancelled` 作为后续预留，但当前实现只接受：

```text
queued -> running
running -> finished | failed
```

Relay 只允许 assignee Agent 发布 Execution Update；Desktop Owner 无法结束 queued。Desktop 类型、事件解析和按钮也只认识 queued/running/finished/failed。

只在前端隐藏 queued 会制造更严重的不一致：Relay 仍认为它是活动 Execution，Agent 重连后仍可能执行，Task 也不能再次 Execute。因此新增按钮必须产生 Relay 持久化的 `cancelled` 终态。

## 三、产品方案

### 3.1 Agent 自我指派

- Agent 可以把当前可见、可访问且未归档的 Task 指派给自己的 pubkey；
- 自我指派仍使用 Task Mutate event 和 `previous` 乐观锁；
- Agent 不能借此指派给另一个 Agent、修改不可见 Track、进入无权访问的私密 Channel，或绕过 community identity 检查；
- Relay 错误继续区分权限拒绝、版本冲突和无效负责人。

### 3.2 Queued 自动恢复

- Agent 启动或断线重连后补收遗漏的定向 Task Execution Request；
- 同一 Request 被重复回放时最多启动一次；
- 已 `cancelled/finished/failed` 的 Execution 不得被旧 Request 重新 claim；
- 日志增加 execution ID 和 replay/claim 结果，方便区分未收到、重复、状态冲突和真正开始。

### 3.3 Cancel execution 按钮

建设性建议使用 `Cancel execution`，不要使用语义模糊的 `End`：

- `Queued`：Owner 或 requester 点击后立即转为 `Cancelled`，释放 Task 的活动 Execution 占用；
- `Running`：先把取消请求可靠送达目标 Agent，Agent 调用现有 ACP `session/cancel` 停止对应 execution UUID 的 turn，然后持久化 `Cancelled`；
- `Cancelling…`：按钮提交期间禁用，防止重复操作；
- `Cancelled`：显示终态和取消原因，可再次点击 `Execute` 创建新一轮 execution；
- `Finished/Failed`：不显示取消按钮；
- 如果 running turn 已自然结束，取消与 finished/failed 竞争时只允许一个合法终态获胜，UI 刷新为 Relay 最终状态。

取消不能把 Task 自动改为 Done。Task status 与 Execution status 继续保持两条独立状态线。

## 四、协议与状态机设计

不新增事件 kind，复用 kind `42504` Task Execution Update：

- 增加 `status=cancelled`；
- Owner/requester 可以针对自己发起且仍 active 的 execution 请求取消；
- assignee Agent 仍可确认取消完成；
- Relay 从当前 Execution State 解析真实 assignee、owner、requester，不信任客户端伪造身份标签；
- 允许 `queued -> cancelled`、`running -> cancelled`；
- `cancelled` 为终态，不允许再回到 running/finished/failed；
- Relay 持久化状态后广播 cancellation update/state，使 Desktop 和目标 ACP 同时收敛。

对于 running execution，ACP 已使用 execution UUID 作为隔离的 queue/session key，可用同一个 UUID 精确触发现有 `ControlSignal::Cancel`，避免误停同 Agent 的其他频道工作。

## 五、测试方案

### 5.1 Relay 与数据库

- 未分配 Task 上，签名 Agent 把 assignee 改为自己成功；
- Agent 指派给其他 Agent仍受 policy 限制；
- 自我指派不绕过 Track、Channel、membership、archived 和 previous-event 校验；
- queued/running 可转 cancelled；
- cancelled 不能回到 running；
- Owner/requester 可取消，其他成员不能取消；
- cancel 与 claim/finish 并发时只产生一个合法终态。

### 5.2 ACP

- 控制订阅重连使用保存的 watermark，不使用裸 `now`；
- 断线窗口内创建的 Request 在重连后被补收；
- 重复回放不会启动第二个 turn；
- queued 已 cancelled 时 Agent claim 失败且不入队；
- running cancellation 精确取消 execution UUID 对应 turn并清理 execution 映射；
- Agent 自然结束与取消竞争时不会再发布矛盾的 finished/failed。

### 5.3 Desktop

- queued/running 显示 `Cancel execution`；
- 提交时显示 `Cancelling…`；
- cancelled 显示终态并恢复 `Execute`；
- finished/failed 不显示取消按钮；
- Relay 拒绝取消时保留真实 active 状态并展示错误；
- E2E 覆盖 queued 卡住后取消、重新 Execute，以及 running cancellation。

## 六、验收标准

1. Agent 能把符合访问规则的 Task 指派给自己。
2. Agent 断线窗口内创建的 execution 在重连后自动从 queued 进入 running。
3. 同一 execution 不会因 replay 被执行两次。
4. queued/running 状态均有 `Cancel execution` 操作。
5. queued 取消后立即释放 Task，可再次 Execute。
6. running 取消会真正停止 Agent turn，不只是改变 UI 标签。
7. cancelled execution 不会在 Agent 后续重连时复活。
8. 普通 Channel/DM turn 和既有 Task finished/result Inbox 行为不受影响。

## 七、Todo List

- [x] `crates/buzz-relay/src/handlers/command_executor.rs`：允许严格限定的 Agent 自我指派，授权 active execution cancel，并验证服务端真实 owner/requester/assignee。
- [x] `crates/buzz-db/src/tasks.rs`：增加 queued/running 到 cancelled 的原子状态转换和并发终态保护。
- [x] `crates/buzz-sdk/src/lib.rs`：为 Task Execution lifecycle 增加 `Cancelled` 状态。
- [x] `crates/buzz-sdk/src/builders.rs`：生成 cancelled update 并覆盖事件标签测试。
- [x] `crates/buzz-acp/src/relay.rs`：为控制订阅保存和回放 watermark，补收断线窗口内的 execution request 和 cancellation state。
- [x] `crates/buzz-acp/src/lib.rs`：处理 cancellation，精确停止 execution UUID 对应 turn，并避免取消后发布矛盾终态。
- [x] `desktop/src/features/tasks/types.ts`：增加 cancelled execution 类型。
- [x] `desktop/src/features/tasks/lib/taskEvents.ts`：构建取消事件并解析 cancelled state。
- [x] `desktop/src/features/tasks/lib/taskEvents.test.mjs`：覆盖取消事件、cancelled 解析和标签完整性。
- [x] `desktop/src/features/tasks/hooks.ts`：增加取消 mutation、错误恢复和 query 刷新。
- [x] `desktop/src/features/tasks/ui/TaskExecutionControl.tsx`：增加 `Cancel execution`、`Cancelling…` 和 Cancelled 终态。
- [x] `desktop/src/features/tasks/lib/taskExecutionPresentation.ts`：统一 cancelled 的卡片、列表和详情展示语义。
- [x] `desktop/src/features/tasks/lib/taskExecutionPresentation.test.mjs`：覆盖 cancelled 终态展示。
- [x] `desktop/src/features/tasks/ui/TaskDetailPanel.tsx`：向执行控制区传入取消回调和 pending/error 状态。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖 queued 取消事件和 cancelled 后重新执行。
- [x] `docs/2026-08-10-task-self-assignment-queued-cancellation-fix-plan.md`：记录验证结果、完成 Todo 并更新说明。

## 八、确认门

鹿鹿子大王确认本文后才修改代码。确认后从最新本地 `dev` 创建 `codex/` 修复分支，按 Todo 实施并运行 Rust、Desktop、ACP 定向测试与完整质量门；完成后使用 signed-off commit，并合并回 `dev`。

## 九、实现与验证结果

- Relay 仅对“未分配 Task 的 Agent 自我认领”开放旧状态权限例外，不扩大普通编辑权限；定向权限测试通过。
- Channel Task 的原始 Execute Request 固定发布到 Global control topic，并继续通过 `#p` read gate 限定目标 Agent；Execution State 仍发布到 Channel topic供客户端收敛。
- ACP 控制订阅保存最后成功投递的时间，并带时钟偏差窗口回放；重复事件继续由去重和数据库原子状态转换保护。
- queued/running 均可进入 Relay 持久化的 cancelled 终态；目标 Agent 收到 cancellation state 后按 execution UUID 取消 turn 并阻止迟到结果覆盖终态。
- Desktop 已提供 `Cancel execution`，并支持 `Cancelling…`、`Cancelled` 与再次 Execute。
- Rust 定向测试、ACP 全量测试、Desktop 单元测试、类型检查、E2E build 和 Tasks Playwright smoke 均通过。
- 定向 Clippy 仅命中 `buzz-db` 原有两个 `too_many_arguments` 警告；本次改动未新增 Clippy 告警。
