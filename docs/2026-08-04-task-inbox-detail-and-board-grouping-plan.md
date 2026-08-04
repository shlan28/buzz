# Task Inbox 完成详情与 Board 分组方案

> 更新日期：2026-08-05
> 更新说明：已完成 Inbox Task 结果详情、紧凑 header、Task 结果深链和 Board 分组切换，并补充单元测试、端到端测试及验证结果。

## 1. 需求结论

本次包含五项产品调整：

1. Inbox 中的 Task result 要展示完整的任务完成详情；
2. Agent 的执行结果不写入、不覆盖 Task Description；
3. Board 可在“按负责人”和“按状态”之间切换。
4. Task 详情中可直接跳到 Inbox 的对应执行结果。
5. Inbox 的 Task result 保持只读，不提供回复框。

## 2. Inbox 任务完成详情

### 2.1 列表信息

Inbox 列表保持简洁，一眼识别是哪个 Task：

```text
[Agent avatar]  Task completed · Strategic Advisor
                列一个 14 天的 pitch 投资人计划
                已整理投资人分类、每日节奏和外联模板…
```

列表不展开全部内容，避免单个结果占据过多空间。

### 2.2 详情信息

点击 Inbox 条目后，详情区分为两个清晰区块：

**Task information**

- Task 标题；
- 原始 Description；
- 负责人 Agent；
- Task 当前状态；
- Priority；
- Due date；
- 本次执行的发起人和完成时间。

**Execution result**

- 成功时展示 Agent 最终回复；
- 失败时展示失败原因；
- 内容保留换行，支持基本 Markdown 阅读；
- 成功时使用正常正文颜色，失败时使用克制的错误状态提示；
- 页面不提供回复框，避免用户误以为是在回复 Channel、DM 或修改 Task；
- `Open task` 入口放在 header 右侧，正文不再重复放置按钮。

这样用户无需先跳回 Task 页就能了解“原任务是什么”和“Agent 完成了什么”。

### 2.3 Header 设计

Task result header 必须沿用 Buzz 当前 Inbox 详情的视觉语言，而不是做成独立的项目管理卡片：

- 保持当前 Inbox 三栏结构：社区导航、Inbox 列表、详情区；
- header 高度、白色背景、底部分隔线与普通 Inbox 消息一致；
- 左侧使用小尺寸 Task 图标和 `Task result`，后接分隔点与 Task 标题；
- 标题使用当前 header 的字号和字重，不使用超大标题；
- 右侧只保留现有 icon button 风格的 `Open task`，不使用醒目的文字主按钮；
- 不增加大号成功图标、彩色背景、状态横幅或 header 内卡片；
- Agent、完成时间、状态、Priority、Due date 放在正文顶部的紧凑信息区；
- Task 类型页面底部不出现普通消息的回复框。

界面简图：

```text
┌──────────────┬──────────────────────┬──────────────────────────────────────────┐
│ Buzz sidebar │ Inbox                │ ☑ Task result · Prepare investor…     ↗ │
│              │                      ├──────────────────────────────────────────┤
│ Inbox        │ B  bumble      11:32 │ B  bumble  completed this task  11:32   │
│ Tasks        │    Task completed    │                                          │
│ Agents       │    Prepare investor… │ ✓ Done · High priority · Due Aug 8       │
│              │                      │                                          │
│ Channels     │                      │ Execution result                         │
│ …            │                      │ Agent 完成结果正文……                      │
│              │                      │                                          │
│              │                      │                       （无回复输入框）     │
└──────────────┴──────────────────────┴──────────────────────────────────────────┘
```

视觉原则：这是 Buzz Inbox 中一种特殊内容类型，不是另起一套 Task 应用界面。改动应尽量小，让用户仍然感觉自己处于同一个 Inbox。

### 2.4 Task 详情跳转 Inbox

Task 详情的 Execute 区域在已经有执行结果时显示：

```text
Execution finished                              [View result in Inbox]
```

- 按钮跳转到 Inbox，并直接选中该 Execution result；
- 使用 Execution State event ID 作为稳定定位值；
- 刷新、前进/后退后仍能恢复选中结果；
- `queued/running` 时不显示跳转，因为尚未形成可阅读的终态结果。

## 3. Task result 保持只读

Task result 的职责是通知用户“某次 Task 执行已经结束”并展示结果，不承担对话功能：

- 不显示回复框；
- 不创建 Task 专属 Channel 或 DM；
- 不新增 Execution conversation 消息类型；
- 如果用户需要继续讨论，可以点击 `Open task` 查看任务；后续是否提供明确的“与 Agent 继续讨论”能力，作为独立功能另行设计。

这样可以避免 Inbox 中三种语义混在一起：普通 Inbox 回复回到原 Channel，DM 回复回到原 DM，而 Task result 只负责展示执行结果。

## 4. Description 与 Execution result 严格分离

### 4.1 功能语义

- `Description`：任务要求和背景，是 Agent 开始工作前的输入；
- `Execution result`：Agent 完成工作后的产出摘要，是一次具体 execution 的输出。

两者不互相覆盖。一个 Task 未来可能被执行多次，Description 仍是同一份任务定义，每次结果则属于各自的 Execution State。

### 4.2 Agent 执行指令

Agent 收到 Execute 指令时，明确告知：

- 可以把 Task 状态改为 `in-progress` / `done` / `blocked`；
- 不要把进展、完成摘要或最终答案写回 Description；
- 最终答案直接作为本轮 Agent 回复，Buzz 会自动保存到 Execution result。

不建议在 Relay 上禁止 Agent 编辑所有 Description：Agent 在用户明确要求它修正任务定义时，仍可能需要该权限。本次约束的是 Execute 自动流程的行为，不是删除 Agent 的正常 Task 编辑能力。

## 5. Board 分组切换

### 5.1 界面位置

Board/List 视图切换保留。在 Board 模式下，在顶部增加：

```text
Group by  [Assignee ▾]
          - Assignee
          - Status
```

`Assignee` 是默认值，与现在行为一致。这里使用 Assignee，而不是只写 Agent，因为负责人同时可能是人、Agent 或 Unassigned。

### 5.2 按负责人分组

列为：

- Unassigned；
- 当前用户；
- 其他人；
- Agent。

拖动到另一列表示转派负责人，继续遵守现有指派权限。

### 5.3 按状态分组

列按固定顺序展示：

```text
Backlog → Todo → In progress → Blocked → Done
```

- 卡片仍显示 Assignee，不会因分组方式变化而丢失负责人信息；
- 拖动到另一状态列表示修改 Task status；
- 卡片内的 Assignee 选择器仍然可用，用于转派；
- `Show done` 关闭时隐藏 Done 任务及空的 Done 列；
- 原 `Show empty owners` 调整为 `Show empty groups`，同时适用于两种分组。

建设性建议：拖动语义必须跟当前分组一致。如果按状态分组却仍在拖动时修改负责人，用户会很难预测结果。

### 5.4 状态保留

分组选择写入 Tasks URL：

```text
/tasks?view=board&group=assignee
/tasks?view=board&group=status
```

这样刷新、前进/后退与分享链接都保留当前视图。不另外增加数据库配置。

## 6. 数据与事件影响

- 不新增数据库表或 migration；
- Description 继续保存在 Task State `content`；
- Execution result 继续保存在 Task Execution State（kind `30501`）`content`；
- Board 分组是 Desktop 展示方式，不复制 Task 数据；
- Inbox 详情使用当前可见 Task State 组合原始 Description 和其他 Task 信息。

- 本次不新增事件 kind；
- 不新增 Task Execution Message，也不需要 kind `42505`；
- 所有已有 Task 与 Execution 数据仍保存在现有 PostgreSQL `events` 表。

## 7. 测试范围

1. Agent 执行完成后，Task Description 保持原值。
2. Execution result 仅写入 Execution State。
3. Inbox 详情同时显示原始 Description 和单独的 Execution result。
4. 失败执行显示失败原因，不修改 Description。
5. Board 默认按 Assignee 分组，保持现有顺序。
6. Board 按 Status 分组时使用固定状态顺序。
7. Assignee 模式拖动修改负责人，Status 模式拖动修改状态。
8. 分组切换、筛选、Show done、Show empty groups 可正确组合。
9. 刷新或打开分享 URL 后保留 Board/List 和 Group by 状态。
10. List 视图不受 Board 分组选择影响。
11. Task 终态执行区可跳到 Inbox 的对应结果。
12. Task result header 与普通 Inbox header 保持相同高度、边框和按钮风格。
13. Header 不出现大图标、彩色横幅或重复的正文 `Open task` 按钮。
14. Task result 页面不显示回复输入框。
15. 成功和失败结果都能在不改变整体 UI 风格的前提下清楚区分。

## 8. Todo List

- [x] `desktop/src/features/home/lib/taskExecutionInbox.ts`：为 Inbox Task result 组合原始 Description、发起人和完整 Task 信息。
- [x] `desktop/src/features/home/lib/taskExecutionInbox.test.mjs`：覆盖 Description 与 Execution result 分离、Task 详情字段映射。
- [x] `desktop/src/features/home/ui/TaskExecutionInboxDetail.tsx`：按 Buzz 当前 Inbox 样式重做紧凑 header，分开展示 Task information / Execution result，并确保没有回复框和重复的正文跳转按钮。
- [x] `desktop/src/features/tasks/ui/TaskExecutionControl.tsx`：终态时显示 `View result in Inbox` 深链。
- [x] `desktop/src/features/tasks/types.ts`：增加 Board group 类型和可同时表达 Assignee/Status 列的模型。
- [x] `desktop/src/features/tasks/lib/taskBoard.ts`：增加固定顺序的 Status 分组，保留 Assignee 分组与共享卡片排序。
- [x] `desktop/src/features/tasks/lib/taskBoard.test.mjs`：覆盖两种分组、空列、Show done 与排序。
- [x] `desktop/src/features/tasks/ui/TasksScreen.tsx`：增加 Group by 控件、URL 状态、动态页面说明和对应变更操作。
- [x] `desktop/src/features/tasks/ui/TaskBoardView.tsx`：支持 Assignee/Status 列头和随当前分组变化的拖动语义。
- [x] `desktop/src/testing/e2eBridge.ts`：确认现有 mock 已将 Description 和 Execution result 分开，无需修改。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖 Inbox 完整详情、无回复框、两种 Board 分组、状态拖动和 URL 保留。
- [x] `docs/2026-08-04-task-inbox-detail-and-board-grouping-plan.md`：更新 Todo 与验证结果。

## 9. 验收标准

1. Inbox 详情能同时回答“Task 要求是什么”与“Agent 完成了什么”。
2. Task Description 不会因 Execute 的成功或失败结果而被改写。
3. Board 可随时在 Assignee 和 Status 分组之间切换。
4. 拖动语义与当前分组一致，且失败时卡片恢复原位并显示 Relay 原因。
5. 两种分组都不影响现有权限、实时更新、筛选和 List 视图。
6. 不新增数据库表或 migration。
7. Task 详情可稳定跳转到对应 Inbox execution result。
8. Task result header 看起来属于 Buzz 当前 Inbox，而不是一套独立的项目管理 UI。
9. `Open task` 在 header 中只出现一次，入口清晰但不过度抢眼。
10. Task result 保持只读，不出现回复框，也不引入新的对话事件类型。

## 10. 验证结果

- Desktop TypeScript 类型检查通过；
- Desktop 单元测试通过：3837 项通过，0 项失败；
- Desktop E2E 构建通过；
- Task E2E 测试通过：原有 17 项场景全部通过；
- 新增的“按 Status 分组后拖动修改状态”场景通过。
