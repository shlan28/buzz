# Task 软删除功能方案

> 更新日期：2026-08-04
> 更新说明：2026-08-04 已修复真实环境删除返回 500：人类账号没有 Agent 主人时会被正常识别，并已通过数据库回归测试和真实 Relay 端到端删除测试。

## 1. 目标

在 Task 详情中增加“删除任务”操作。删除成功后：

- 任务立即从看板、列表和任务详情中消失；
- Agent 和 CLI 再次读取该任务时返回不存在；
- 任务不会出现在归档列表，也没有恢复入口；
- 同一个任务 ID 不能被重新创建，避免旧事件重新同步后让任务复活；
- 可以使用相同标题重新创建一项新任务，但它会获得新的任务 ID。

本次不增加回收站、撤销、恢复、批量删除和自动清理。

## 2. 谁可以删除

删除比编辑权限更严格，只允许：

- 任务创建者；
- 如果任务由 Agent 创建，则该 Agent 的主人；
- community 的 Owner 或 Admin。

任务负责人仍然可以编辑、转派和归档，但不能仅凭“当前负责人”身份删除别人创建的任务。

这样可以满足“我的 Agent 创建的任务，我可以直接管理和删除”，同时避免负责人误删由其他人创建并交给自己的任务。

Relay 是最终权限判断者。Desktop 和 CLI 即使被绕过，也不能越权删除。

## 3. 界面行为

Task 详情底部保留现有 `Archive task`，并增加红色的 `Delete task`：

1. 点击后打开确认窗口；
2. 窗口展示任务标题，并明确提示“当前产品不支持恢复”；
3. 用户再次点击红色 `Delete task` 才会提交；
4. 删除期间按钮不可重复点击；
5. 成功后关闭详情，任务立即从当前界面消失；
6. 失败时任务保留，窗口显示 Relay 返回的具体原因。

不提供短暂撤销提示，因为这会形成事实上的回收站或恢复能力。

## 4. 数据如何处理

新增 Task Delete 事件类型 `42502`。删除请求只包含：

- Task ID；
- 用户确认删除时看到的最新 Task State ID；
- 删除操作本身的签名者和时间。

Relay 收到后会在同一个数据库事务中：

1. 确认任务仍然存在；
2. 确认任务没有在用户打开确认窗口后被别人修改；
3. 验证删除者权限；
4. 给该任务的当前状态及相关历史事件写入 `deleted_at` 删除时间，使其退出所有正常查询；
5. 保存最小删除标记，阻止相同 Task ID 被重新创建或因旧事件重放而复活。

这是软删除。PostgreSQL 的 `events` 表仍保留原事件行、标题、描述、tags 和签名，只是 `deleted_at` 不再为空；Desktop、CLI、Agent 和普通 Relay 查询都会排除这些事件。数据库管理员仍可通过数据库审计这些记录，但产品不提供查看或恢复入口。

Relay 另外保留一个不含任务标题和描述的 `42502` 删除标记，用于证明“这个 Task ID 已被删除”，并阻止旧事件重放或使用相同 ID 重新创建。它不是回收站入口。

## 5. 为什么需要独立类型 `42502`

归档仍属于“修改任务”，所以使用 `42501`。删除会让任务退出所有正常查询，含义和权限都不同，使用独立类型更清楚：

| 类型 ID | 用途 |
|---|---|
| `42500` | 创建 Task |
| `42501` | 编辑、转派、归档 Task |
| `42502` | 软删除 Task |
| `30500` | Relay 生成的 Task 当前状态 |

不能直接使用普通消息删除流程，因为 Task State 是 Relay 签名的，而删除者是用户或 Agent；Task Delete 需要 Relay 根据任务创建者和 Agent 主人关系单独判断权限。

## 6. 冲突和边界情况

- 删除请求必须携带最新 State ID；任务刚被别人修改时，删除失败并要求用户重新确认。
- 已删除任务再次删除时返回“任务不存在”，不伪装成成功。
- 已归档任务也可以删除，权限规则相同。
- 私密 Channel 中的任务，删除者仍须具有该任务的访问权。
- 删除 Task 不删除它引用的消息、项目、Channel、Agent 或人员。
- 其他内容中已存在的 Task 链接保留，但打开后显示“Task not found”。
- 删除成功后只广播删除标记，不广播已删除的标题或描述。

## 7. 测试范围

必须覆盖：

- 人创建的 Task 可以由创建者删除；
- Agent 创建的 Task 可以由 Agent 主人删除；
- community Owner/Admin 可以删除；
- 仅作为负责人的其他成员不能删除；
- 非相关成员不能删除；
- 私密 Channel 外的人不能删除；
- 旧 State ID 删除失败，且任务仍存在；
- 删除成功后 list/get/history 均不再返回任务；
- 相同 Task ID 不能重新创建；
- Desktop 确认窗口、失败提示和成功后移除任务；
- Agent CLI 可以执行软删除并获得稳定 JSON 结果。

## 8. Todo List

- [x] `crates/buzz-core/src/kind.rs`：新增 `KIND_TASK_DELETE = 42502`，纳入 Task 类型注册和协议约束测试。
- [x] `crates/buzz-sdk/src/lib.rs`：定义 Task Delete 的稳定输入结构。
- [x] `crates/buzz-sdk/src/builders.rs`：新增 Task Delete 构造器，并测试 Task ID 与最新 State ID 的事件格式。
- [x] `crates/buzz-db/src/tasks.rs`：在同一事务中为 Task 状态和历史事件写入 `deleted_at`、保存最小删除标记，并覆盖冲突、防重复创建和查询不可见测试。
- [x] `crates/buzz-db/src/lib.rs`：暴露 Task 软删除所需的数据库能力。
- [x] `crates/buzz-relay/src/handlers/ingest.rs`：为 Task Delete 接入命令权限范围和入口校验。
- [x] `crates/buzz-relay/src/handlers/command_executor.rs`：验证创建者、Agent 主人、管理员、Channel 访问权和最新版本，执行删除并发布删除通知。
- [x] `crates/buzz-test-client/tests/e2e_relay.rs`：覆盖创建者删除、删除后不可查询和同 ID 防复活；其他权限与冲突由 Relay/DB 定向测试覆盖。
- [x] `crates/buzz-cli/src/lib.rs`：增加 `buzz tasks delete --id --expected-event` 命令。
- [x] `crates/buzz-cli/src/commands/tasks.rs`：实现 Agent/CLI 软删除与稳定输出，并补充命令测试。
- [x] `crates/buzz-cli/README.md`：补充 Task Delete 使用说明。
- [x] `crates/buzz-cli/TESTING.md`：补充真实 Relay 的 Task 软删除验收步骤。
- [x] `desktop/src/shared/constants/kinds.ts`：同步 Task Delete 类型 ID。
- [x] `desktop/src/features/tasks/lib/taskEvents.ts`：构造并校验 Task Delete 请求。
- [x] `desktop/src/features/tasks/lib/taskEvents.test.mjs`：覆盖删除事件格式和最新 State ID。
- [x] `desktop/src/features/tasks/hooks.ts`：增加删除 mutation、成功移除缓存、失败保留任务及实时删除刷新。
- [x] `desktop/src/features/tasks/ui/TaskDetailPanel.tsx`：增加软删除入口、二次确认、等待状态和错误提示。
- [x] `desktop/src/features/tasks/ui/TasksScreen.tsx`：接入删除操作，成功后关闭详情，失败时保留任务。
- [x] `desktop/src/testing/e2eBridge.ts`：为测试环境模拟 Relay 接受、拒绝及实时发布删除标记。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖确认窗口、软删除成功、失败保留和任务从界面消失。
- [x] `docs/2026-08-03-agent-operable-task-board-plan.md`：把软删除补入总体功能、权限、事件类型和 CLI 说明。
- [x] `docs/2026-08-04-task-permanent-delete-plan.md`：完成后更新 Todo、测试结果和验收状态。

## 9. 验收标准

1. 有权限的人可以在 Task 详情中软删除，且必须二次确认。
2. 用户自己的 Agent 创建的 Task，用户可以直接删除。
3. 普通负责人不能删除别人创建的 Task。
4. 删除后 Desktop、CLI 和 Agent 都无法再读取任务或历史内容。
5. 产品不提供撤销和恢复，同一个 Task ID 不会复活；数据库事件行保留并带有 `deleted_at`。
6. 并发修改、越权和网络失败都不会造成界面显示已删、Relay 实际未删的不一致。

## 10. 验证结果

- Buzz Core、SDK、CLI 单元测试：共 757 项通过。
- Desktop 单元测试：3826 项通过。
- PostgreSQL Task 事务测试：3 项通过；覆盖软删除后不可见、删除标记自身被隐藏后仍防复活，以及并发冲突不落脏数据。
- Relay 删除权限定向测试：创建者、创建者 Agent 主人和管理员允许；仅负责人拒绝。
- Rust 相关模块全 targets Clippy：通过，`-D warnings`。
- Desktop TypeScript、Biome、文件大小、缩放字号和 pubkey 显示检查：通过；Biome 仅报告两条本次改动之外的既有提示。
- Desktop E2E 构建：通过。
- Tasks Playwright：10 项全部通过，包含删除确认、成功移除、失败保留和 Relay 原因展示。
- Relay E2E：新增创建者删除、删除后 State 不可查询和原始 Create 重放拒绝用例；最初只完成编译检查，本次修复测试地址和 TLS 初始化后已在真实 Relay 上执行通过。

## 11. 真实环境故障与根因

在 Desktop 中删除由人创建的任务“4”时，界面正确发出了删除请求，但 Relay 返回 `internal server error`。使用同一账号通过 CLI 重试后，Relay 日志给出了明确原因：

- 人类账号在用户记录中没有“所属主人”，这是正常情况，对应数据库空值；
- Relay 为了判断“删除者是否为创建任务 Agent 的主人”，读取了这个字段；
- 现有数据库读取函数错误地要求该字段必须有值，因此把正常空值当成数据库异常，返回 500；
- 异常发生在删除事务开始之前，所以任务“4”没有被标记删除，也没有产生部分写入。

这不是 Desktop 请求格式、软删除模型或权限规则的问题。修复后，人创建的任务会把“没有 Agent 主人”正常解释为“不适用”，继续按“任务创建者可以删除”的规则完成删除；Agent 创建任务时仍会正常检查其主人。

## 12. 修复与补测 Todo

- [x] `crates/buzz-db/src/user.rs`：允许 Agent 主人字段为空，并增加“人类账号返回无主人、Agent 账号返回实际主人”的数据库回归测试。
- [x] `crates/buzz-test-client/tests/e2e_relay.rs`：让测试跟随实际 Relay 地址准备权限并初始化 TLS，在真实 Relay 上执行创建者删除用例，确认完整请求链路不再返回 500。
- [x] `docs/2026-08-04-task-permanent-delete-plan.md`：记录修复内容和真实 Relay 测试结果。

本次漏测的直接原因是：此前数据库测试覆盖了软删除事务，Relay 单元测试覆盖了权限判断，但没有实际运行需要基础设施的 Relay 端到端用例；该用例只完成了编译检查。后续验收不能再用“编译通过”代替真实 Relay 执行。

修复后验证结果：

- 人类账号没有 Agent 主人：数据库正常返回“无主人”，测试通过；
- Agent 账号已经登记主人：数据库正常返回主人，测试通过；
- 真实 Relay 完整链路：创建任务、创建者删除、删除后查询不可见、同 ID 不可复活，测试通过；
- `buzz-db` 全 targets Clippy：通过，且启用了 `-D warnings`；
- 修复版 Relay 已重新启动，健康检查通过。
