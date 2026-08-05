# Task 再次执行与看板负责人展示调整方案

> 更新日期：2026-08-05
> 更新说明：已完成已结束 Task 的再次执行能力、独立执行历史验证，并移除看板卡片上的 Assignee 下拉操作。

## 1. 需求结论

本次调整包含两项：

1. 当 Task 状态为 `Backlog`、`Todo`、`In progress` 或 `Blocked` 时，即使此前已经执行成功或失败，也可以再次 Execute；
2. Task 看板卡片不再提供 Assignee 下拉框，只展示负责人信息。需要修改负责人时，用户可以打开 Task 详情；按 Assignee 分组时仍可通过拖动卡片完成转派。

`Done`、已归档或已删除的 Task 仍不能启动新执行。

## 2. 再次执行的功能规则

### 2.1 什么时候可以执行

| Task 状态 | 最近一次 Execution 状态 | 是否允许 Execute |
| --- | --- | --- |
| Backlog / Todo / In progress / Blocked | 无记录 | 允许 |
| Backlog / Todo / In progress / Blocked | Finished / Failed | 允许，创建新一轮 |
| 任意可执行状态 | Queued / Running | 不允许，防止重复执行 |
| Done | 任意状态 | 不允许 |
| Archived / Deleted | 任意状态 | 不允许 |

Agent 离线时仍保持现有规则：Execute 按钮不可用，并提示先启动 Agent。

### 2.2 页面表现

上一轮已经结束时，Task 详情同时展示两个入口：

```text
Execution finished                 [View result in Inbox]
[ Execute again ]
```

- `View result in Inbox` 打开上一轮的结果；
- `Execute again` 创建全新的执行，不覆盖上一轮；
- 新一轮进入 `Queued / Running` 后，按钮禁用并显示当前状态；
- 新一轮结束后，详情中的结果入口指向最新一轮，历史结果继续保留在 Inbox。

建议按钮在已有结果时写成 `Execute again`，而不是仍写 `Execute`，让用户明确知道这是新一轮工作。

## 3. 多轮执行如何保存

现有底层设计已经具备多轮执行能力，不需要新增数据库表或事件类型：

- 每次 Execute 都生成新的 Execution UUID；
- 每轮执行使用独立的 kind `30501` Task Execution State；
- 同一轮的 `Queued → Running → Finished/Failed` 状态更新使用同一个 Execution UUID；
- 新一轮使用新的 UUID，因此不会覆盖旧一轮；
- PostgreSQL 仍保存在现有 `events` 表中；
- 数据库已经按 Task 加锁，并拒绝在已有 `Queued / Running` 时创建另一轮。

本次不改变 kind：

| Kind | 用途 |
| --- | --- |
| `42503` | 发起一次新的 Task Execution Request |
| `42504` | Agent 更新这一轮执行状态 |
| `30501` | Relay 保存这一轮 Execution State |

当前 Desktop 的 Task 详情只取该 Task 最新一轮 Execution，用于显示当前状态；Inbox 则保留每个独立 Execution UUID 的终态结果，因此可以同时看到多轮历史结果。

## 4. Inbox 历史结果

每次执行完成或失败后，Inbox 产生一条独立 Task result：

```text
Task completed · 第一次执行结果
Task completed · 第二次执行结果
```

- 每条结果按 Execution UUID 独立定位；
- 新一轮执行不会修改旧结果正文；
- Task 详情的 `View result in Inbox` 默认打开最新一轮；
- Inbox 中旧结果仍可单独打开；
- Description 继续保持任务要求，不写入任何一轮执行结果。

## 5. 看板卡片移除 Assignee 下拉框

### 5.1 卡片展示

卡片继续显示负责人，但改为只读文字或头像加名称：

```text
┌──────────────────────────────┐
│ Prepare investor list        │
│ 整理投资人分类和联系节奏……   │
│ Todo · High · Due Aug 8      │
│ bumble · Agent               │
└──────────────────────────────┘
```

卡片上不再出现下拉箭头，也不能直接选择另一个人或 Agent。

### 5.2 如何修改负责人

- 点击卡片打开 Task 详情，通过详情中的 Assignee 选择器修改；
- Board 按 Assignee 分组时，拖到另一负责人列仍表示转派；
- Board 按 Status 分组时，拖动只修改状态；需要转派必须进入 Task 详情；
- List 视图维持只读负责人展示，不受本次影响。

这样卡片负责快速浏览和拖动，详细编辑统一放回 Task 详情，减少误触和视觉噪音。

## 6. 权限与异常

- Execute 发起人仍严格限制为负责人 Agent 自己或该 Agent 的 Owner；
- 再次执行不会扩大任何权限；
- Task 在点击前被编辑或转派时，继续使用现有版本检查并拒绝旧请求；
- 两个客户端同时点击时，数据库只接受一轮，另一个收到“已有执行正在进行”的提示；
- 上一轮 `Failed` 和 `Finished` 都是终态，不阻止下一轮；
- 上一轮结果读取失败不应阻止新一轮执行，但应保留可理解的错误提示。

## 7. 测试范围

1. `Finished` 后将 Task 保持或改回 Todo，可以看到 `Execute again`。
2. `Failed` 后可以重新执行。
3. 每次 Execute 生成不同 Execution UUID。
4. 同一 Task 在 `Queued / Running` 时不能重复执行。
5. 两个并发请求只有一个成功。
6. 两轮完成结果在 Inbox 中分别存在，内容和跳转互不覆盖。
7. Task 详情的结果入口指向最新一轮。
8. Done、Archived 和 Deleted Task 仍不能执行。
9. Agent 离线时仍不能执行。
10. 看板卡片不再出现 Assignee 下拉框。
11. 卡片仍显示负责人名称。
12. Assignee 分组拖动仍可转派，Status 分组拖动仍只修改状态。
13. Task 详情中的 Assignee 选择器仍可正常转派。

## 8. Todo List

- [x] `desktop/src/features/tasks/ui/TaskExecutionControl.tsx`：终态后恢复执行入口，并将按钮文案改为 `Execute again`；仅在 Queued/Running 时禁用重复执行。
- [x] `desktop/src/features/tasks/ui/TaskDetailPanel.tsx`：确认现有 Task 状态、归档状态和权限判断可直接复用，无需修改，同时保留最新结果深链。
- [x] `desktop/src/features/tasks/lib/taskEvents.test.mjs`：验证连续两次构建 Execute Request 会产生不同 Execution UUID。
- [x] `desktop/src/features/home/lib/taskExecutionInbox.test.mjs`：验证同一 Task 的多个 Execution UUID 会生成多条独立 Inbox 结果。
- [x] `desktop/src/features/tasks/ui/TaskCard.tsx`：移除 Assignee 下拉框，改为只读负责人展示；无法解析名称时展示截断公钥而不是错误显示 Unassigned。
- [x] `desktop/src/features/tasks/ui/TaskBoardView.tsx`：不再向卡片提供下拉转派能力，保留 Assignee 分组的拖拽转派。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖 Finished 后再次执行、最新结果入口、卡片无 Assignee 下拉框，以及从 Task 详情转派的唯一编辑路径。
- [x] `crates/buzz-db/src/tasks.rs`：补充多轮独立 Execution 与同一 Task 活跃执行互斥的数据库测试；生产逻辑无需改变。
- [x] `docs/2026-08-05-task-reexecution-and-card-assignee-plan.md`：更新 Todo 和实际验证结果。

## 9. 验收标准

1. 可执行状态的 Task 在上一轮结束后能启动全新一轮。
2. 任意时刻同一个 Task 最多只有一轮 Queued 或 Running。
3. 每轮执行结果具有独立 UUID，并在 Inbox 中长期保留。
4. 旧结果不会被新结果覆盖，Description 也不会被执行结果改写。
5. Task 卡片没有 Assignee 下拉操作，但负责人信息仍清晰可见。
6. Task 详情编辑负责人和 Assignee 分组拖动转派继续正常工作。
7. 不新增数据库表、migration 或事件 kind。

## 10. 验证结果

- Desktop TypeScript 类型检查与 E2E 构建通过；
- Desktop 单元测试通过：3839 项通过，0 项失败；
- Task E2E 通过：20 项通过，覆盖再次执行、卡片只读负责人、详情转派和既有拖拽语义；
- PostgreSQL 数据库测试通过：上一轮 Finished 后可以创建新 Execution，第二轮 Queued 时第三轮请求被拒绝，两轮独立 Execution State 均保留；
- `pnpm check` 通过；仅输出两条与本功能无关的既有 template-literal 信息提示；
- 未新增数据库表、migration 或事件 kind。
