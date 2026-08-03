# Task 截止时间与负责人列表修复方案

> 更新日期：2026-08-04
> 更新说明：修复已完成；Desktop 支持创建、修改和清空截止日期，Agent 会保留明确截止时间，负责人列表只显示当前 community 成员，并已补齐自动化测试。

## 1. 要解决的问题

### 1.1 截止时间没有形成完整闭环

当前 Agent CLI 支持 `--due`，但 Agent 使用说明没有明确告诉 Agent 如何处理截止时间；Desktop 创建窗口使用日期字符串，而 Relay 要求 Unix 秒；任务详情又没有截止时间编辑入口。

用户实际感受到的是：Agent 创建的任务通常没有截止时间，即使之后手动打开任务，也无法补充或修改。

### 1.2 负责人列表出现多余 Agent

当前 Desktop 把以下数据直接合并为负责人候选：

- 当前 community 成员；
- 本机 Managed Agents；
- Relay 中查到的全部 Agent Profile。

代码虽然按 pubkey 去重，但仍会把不在当前成员列表中的历史 Agent Profile 加回来。同名 Agent 重建后会使用新的 pubkey，因此仅按 pubkey 去重也会同时显示旧身份和新身份。

## 2. 修复后的产品行为

### 2.1 截止时间

- 截止时间仍然是可选字段，不强迫每个任务填写，也不允许 Agent 自行猜测日期。
- 用户明确给出截止时间时，Agent 使用 `buzz tasks create --due ...` 保存。
- 用户没有给出日期时，Agent正常留空；如日期对任务明显重要，可以先向用户确认。
- Desktop 创建和编辑任务都提供 `Due date`。
- Desktop 日期输入统一转换为 Relay 接受的 Unix 秒；读取时再按本地时区显示为日期。
- 截止日期当天结束前不显示逾期，避免当天一开始就被标为 overdue。
- 用户可以在详情面板修改或清空截止时间。

### 2.2 负责人候选

- 人类候选只来自当前 community 的有效成员。
- Agent 候选必须同时满足：存在可识别的 Agent Profile，并且其 pubkey 仍在当前 community 的有效成员集合中。
- 不再把仅存在历史 Agent Profile、但已经不在成员集合中的 Agent 加回列表。
- 本机与 Relay 中同一 pubkey 的 Agent 合并为一个候选。
- 不按显示名称强行合并不同 pubkey，避免把两个真实身份误认为同一个 Agent。
- Agent 的 `online/offline/stopped` 是运行状态，不等于归档；只要身份仍是当前有效成员，就可以继续承担任务。
- Relay 继续作为最终权限校验，Desktop 过滤只负责避免用户看到明显无效的候选。

## 3. 技术方案

### 3.1 日期转换边界

Desktop 增加纯函数统一处理：

- `YYYY-MM-DD` → 本地日期当天 `23:59:59` 对应的 Unix 秒；
- Unix 秒 → 本地 `YYYY-MM-DD`；
- 逾期判断使用当前时间是否超过截止秒数，而不是比较不同格式的字符串。

Task State 内部继续保留 Relay 的 Unix 秒，避免界面日期格式进入协议层。

### 3.2 Agent 提示

补充 Agent 基础提示：截止时间是可选的；明确提供时必须传 `--due`；没有提供时不得猜测。

### 3.3 负责人集合

以当前 community 成员 pubkey 集合为边界，再利用 Managed/Relay Agent 数据标记哪些成员是 Agent、显示名称是什么、当前操作者是否有权指派。删除“将所有剩余 Relay Agent Profile 追加到列表”的逻辑。

## 4. 测试重点

- Desktop 创建任务选择日期后，发出的 `due` tag 是 Unix 秒。
- Task State 的 Unix 秒在详情页显示为正确的本地日期。
- 编辑详情可以修改和清空截止时间。
- 截止日期当天不显示逾期，超过当天结束后显示逾期。
- Agent 明确收到截止时间时能通过 CLI 保存；未给出时不会虚构日期。
- 同一 Agent 同时出现在 Managed 与 Relay 数据中时只显示一次。
- 不属于当前成员集合的历史 Agent Profile 不出现在负责人列表。
- 当前成员中的离线 Agent仍可以显示，最终能否指派继续由其任务指派策略和 Relay 决定。

## 5. Todo List

- [x] `desktop/src/features/tasks/lib/taskDates.ts`：新增本地日期、Unix 秒和逾期判断纯函数。
- [x] `desktop/src/features/tasks/lib/taskDates.test.mjs`：覆盖日期转换、清空、时区边界和逾期判断。
- [x] `desktop/src/features/tasks/types.ts`：让 Task 模型使用统一的截止时间类型。
- [x] `desktop/src/features/tasks/lib/taskEvents.ts`：解析 Unix 秒，并在 Create/Mutate Command 中输出 Relay 接受的 `due` tag。
- [x] `desktop/src/features/tasks/lib/taskEvents.test.mjs`：覆盖创建、修改和清空截止时间事件。
- [x] `desktop/src/features/tasks/ui/CreateTaskDialog.tsx`：使用统一日期转换提交截止时间。
- [x] `desktop/src/features/tasks/ui/TaskDetailPanel.tsx`：增加截止时间修改和清空入口。
- [x] `desktop/src/features/tasks/ui/TaskCard.tsx`：按统一截止时间规则显示日期与逾期状态。
- [x] `desktop/src/features/tasks/hooks.ts`：只从当前 community 有效成员构建负责人候选，并复用 Agent Profile 做身份标记与权限提示。
- [x] `desktop/src/features/tasks/lib/taskAssignees.ts`：抽取负责人合并与过滤纯逻辑。
- [x] `desktop/src/features/tasks/lib/taskAssignees.test.mjs`：覆盖历史 Agent 排除、同 pubkey 去重、离线 Agent保留和人类成员显示。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖截止时间创建/编辑/清空以及多余 Agent 不出现。
- [x] `desktop/src/testing/e2eBridge.ts`：让模拟 Relay 正确回写截止时间的新增、修改和清空结果；成员与 Agent fixtures 复用现有数据。
- [x] `crates/buzz-acp/src/base_prompt.md`：说明 Agent 对明确截止时间的处理规则，禁止猜测日期。
- [x] `docs/2026-08-04-task-due-date-and-assignee-fix-plan.md`：完成后同步 Todo 和验证结果。

## 6. 验收标准

1. Agent 按用户明确提供的日期创建任务后，Desktop 卡片和详情显示相同截止日期。
2. Desktop 可以创建、修改和清空截止日期，Relay 不再因日期格式拒绝操作。
3. 截止日期当天不误报逾期。
4. Assignee 只显示当前 community 的有效人类与 Agent 身份，不再显示已退出成员集合的历史 Agent Profile。
5. 负责人权限仍由 Relay 最终校验，Desktop 不会扩大任何人的指派权限。

## 7. 验证结果

- Desktop 单元测试：3815 项全部通过。
- Desktop TypeScript 类型检查：通过。
- Desktop 文件大小检查：通过。
- Tasks E2E：6 项全部通过，包含截止时间创建、编辑、清空及历史 Agent 排除。
- E2E 构建：通过；仅有项目原有的动态导入与大 chunk 提示，不影响本次功能。
