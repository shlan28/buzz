# Task 执行结果进入 Inbox 方案

> 更新日期：2026-08-04
> 更新说明：已完成 Agent 执行 Task 后的结果回传、Owner 可见性、Inbox 展示与 Task 跳转；补充实际验证结果。

## 1. 产品目标

用户启动 Agent 负责的 Task 后，不仅能看到 `Running` 或 `Finished`，还能在 Inbox 中收到一条带 Task 上下文的执行结果。

本次完成后：

- Agent 成功完成 Task：Inbox 出现一条 `Task completed`；
- Agent 执行失败：Inbox 出现一条 `Task failed`；
- 条目带上 Task 标题、负责 Agent、状态、完成时间和执行结果；
- 点击条目直接打开对应 Task 详情。

## 2. Inbox 中展示什么

Inbox 列表行建议展示：

```text
[Agent avatar]  Task completed · Strategic Advisor
                列一个 14 天的 pitch 投资人计划
                已完成投资人分类、联系节奏和每日行动清单…
                                                        19:42
```

详情区展示：

- Task 标题；
- 负责 Agent；
- Task 当前状态、优先级和截止时间；
- 本次执行是成功还是失败；
- Agent 的最终输出，或者可理解的失败原因；
- `Open task` 按钮。

建设性建议：Inbox 只接收终态结果，不为 `Queued` 和 `Running` 分别生成条目。这两个中间状态仍在 Task 页面实时展示，避免一次执行制造多条 Inbox 消息。

## 3. 谁会收到

首版严格限定为：

- 点击 Execute 的人；
- 如果是 Agent 自己启动，则展示给该 Agent 的 Owner。

不向 community 全员展示，也不因为 Task 关联了 Channel 就自动通知整个 Channel。这避免执行结果意外扩散。

## 4. 数据如何保存

不新增数据库表，也不把结果另存为 DM。

现有 Task Execution State 事件（kind `30501`）已保存执行状态、Task ID、Agent 和启动人。本次让 Agent 在执行结束时，把最终输出写入该执行事件的 `content`：

- `finished`：`content` 是 Agent 的最终结果；
- `failed`：`content` 是失败原因；
- `queued/running`：`content` 保持为空。

Inbox 读取已有 Task State 和 Task Execution State，把执行结果与当前 Task 信息组合展示。这不是 NIP-34 Issue，仍然是 Buzz 自定义 Task 事件。

## 5. 关键行为

### 5.1 保留最终回复

当前 ACP 运行层能接收 Agent 的文本输出，但执行成功时仅上报空的 `Finished`。需要在单次执行期间收集 Agent 的最终回复，并在轮次结束时随 `finished` 状态一起发布。

只保存面向用户的最终文本，不保存内部思考、密钥、原始工具协议帧或调试日志。结果过长时在安全边界截断，并添加“内容已截断”提示，防止单个事件无限增长。

### 5.2 Inbox 组合而不是伪造 DM

Desktop 将终态 Task Execution 映射为 Inbox 条目，但它仍然是 `Task result`，不标记为 DM，也不进入与 Agent 的日常对话历史。

同一次 execution 只有一个 Inbox 会话键。状态从 `running` 更新为 `finished/failed` 时更新同一条记录，不产生重复结果。

### 5.3 已读和跳转

- 新的完成/失败结果计入 Inbox 未读数；
- 在 Inbox 打开后可标记已读、未读或 Done，复用现有 Inbox 行为；
- 点击 `Open task` 跳转到 `/tasks?task=<task-id>`；
- Task 后续被编辑时，Inbox 保留当时的执行结果，Task 字段则展示当前最新值。

### 5.4 软删除 Task

如果 Task 已软删除，历史执行结果不再出现在 Inbox，避免用户点击后进入无法打开的 Task。

## 6. 测试范围

1. Agent 执行成功后，最终文本进入 Task Execution State。
2. 失败、超时和 Agent 退出时，失败原因正确保存。
3. 内部思考和工具协议不会进入用户可见结果。
4. Inbox 只展示 `finished/failed`，不展示 `queued/running`。
5. Inbox 条目正确展示 Task 标题、Agent、状态、优先级、截止时间和结果。
6. 只有启动人或 Agent Owner 能看到结果条目。
7. 重连和重复事件不会创建重复 Inbox 条目。
8. 未读数、标记已读/Done 和 `Open task` 跳转正常。
9. 已删除 Task 的结果不再展示。

## 7. Todo List

- [x] `crates/buzz-acp/src/lib.rs`：复用现有只采集 Agent 可见回复的 delivery tracker，Task 成功时写入最终输出，并安全截断过长结果。
- [x] `crates/buzz-relay/src/handlers/command_executor.rs`：在 Relay 签名的 Execution State 中携带已验证 Agent Owner，保证 Agent 自启动时 Owner 跨设备可见。
- [x] `desktop/src/features/tasks/types.ts`：补充 Execution Owner 类型。
- [x] `desktop/src/features/tasks/lib/taskEvents.ts`：解析 Relay 签名的 Owner 和最终结果。
- [x] `desktop/src/features/home/lib/taskExecutionInbox.ts`：查询并实时更新 Task/Execution，将对当前用户可见的终态结果组合为 Inbox 条目。
- [x] `desktop/src/features/home/lib/taskExecutionInbox.test.mjs`：覆盖终态过滤、发起人/Owner 可见性、Task 信息和删除过滤。
- [x] `desktop/src/features/home/lib/inbox.ts`：增加 `Task completed` / `Task failed` 标题，列表预览同时显示 Task 标题和结果。
- [x] `desktop/src/app/AppShellContext.tsx`：向 Home 界面共享 Task result 条目，避免重复订阅。
- [x] `desktop/src/app/AppShell.tsx`：在应用层加载 Task result，同时接入 Inbox 侧边栏未读 badge。
- [x] `desktop/src/features/home/ui/HomeView.tsx`：把 Task 结果合并到 Inbox、未读与选中状态。
- [x] `desktop/src/features/home/ui/InboxDetailPane.tsx`：将 Task result 选中项路由到专用详情。
- [x] `desktop/src/features/home/ui/TaskExecutionInboxDetail.tsx`：展示 Task 信息、Agent 最终结果、失败原因和 `Open task` 操作。
- [x] `desktop/src/testing/e2eBridge.ts`：增加可注入的终态 Task Execution mock。
- [x] `desktop/tests/helpers/bridge.ts`：对 Playwright 暴露 Task Execution 测试配置。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖成功/失败 Inbox 展示与跳转 Task 详情。
- [x] `docs/2026-08-04-task-execution-result-inbox-plan.md`：更新 Todo 和实际验证结果。

## 8. 验收标准

1. Agent 完成或失败后，授权用户无需打开日志即可在 Inbox 看到结果。
2. Inbox 条目必须带 Task 标题、负责 Agent、执行状态和结果正文。
3. 点击 `Open task` 能打开对应 Task 详情。
4. 不产生伪 DM，不向无关 community 成员暴露结果。
5. 不展示 Agent 内部思考、工具协议帧或私密调试信息。
6. 同一次 execution 在 Inbox 只有一条结果。
7. 不新增数据库表或 migration。

## 9. 实际验证结果

- ACP 结果整理单元测试：2 项通过，覆盖首尾空白和 Unicode 安全截断。
- Inbox 结果映射单元测试：5 项通过，覆盖终态、发起人、Agent Owner、无关成员和已删除 Task。
- Desktop Tasks E2E：16 项全部通过，包含新增的成功结果、失败结果和 `Open task` 深链，以及原有创建、编辑、转派、删除和 Execute 权限场景。
- `cargo check -p buzz-acp -p buzz-relay` 通过。
- Desktop TypeScript、Biome 和 E2E build 通过。
- 本次未新增数据库表或 migration。
