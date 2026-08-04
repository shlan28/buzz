# Task 自我指派与信息展示优化方案

> 更新日期：2026-08-04
> 更新说明：2026-08-04 第三轮修复已完成：负责人改为应用内候选菜单，发布前后增加字段一致性保护，并补齐手动创建及 `lu → Unassigned → lu` 往返测试。Agent 数量清理继续有效。

## 1. 本次要解决的问题

### 1.1 选择当前用户后又变回未指派

当前选择 `lu（b2fa0399…3f4e）` 时，界面会先显示 `lu`，随后回到 `Unassigned`。

已确认这不是 Relay 权限拒绝。当前用户的 pubkey 同时出现在历史 Agent 数据中时，客户端会误把当前用户当成受 Agent 指派策略限制的身份，导致选择没有形成有效的负责人更新；界面随后收到 Relay 的原任务状态，又显示为未指派。

本次会重点修复“选择当前登录用户”这条路径，并补充自动化测试，避免只测试指派给其他成员、却遗漏指派给自己。

### 1.2 看板卡片缺少任务背景

卡片目前能显示标题、状态、优先级和已填写的截止日期，但不显示描述。用户必须打开详情才能判断任务内容，浏览看板的效率不够高。

### 1.3 列表视图信息太少

列表目前只有标题和状态，不能快速回答以下问题：

- 谁负责这个任务；
- 什么时候到期；
- 哪些任务优先级更高。

## 2. 修复后的产品行为

### 2.1 负责人选择

- 用户可以把任务指派给当前登录用户、其他人或可接受任务的 Agent。
- 选择 `lu（b2fa0399…3f4e）` 后，客户端发出的更新必须明确包含该 pubkey。
- Relay 保存成功后，负责人继续显示为 `lu`，不再跳回 `Unassigned`。
- 只有用户明确选择 `Unassigned` 时，才会清空负责人。
- 如果 Relay 确实拒绝操作，界面继续恢复原负责人并展示错误，不用短暂的乐观结果掩盖失败。

### 2.2 看板卡片

每张卡片展示：

- 标题；
- 描述，固定提供两行可见区域，超过两行省略；
- 截止日期；
- 当前状态和优先级；
- 现有的负责人快速调整入口。

建议描述为空时显示弱化的 `No description`，同时保留两行区域。这样每张卡片的信息位置更稳定，不会因为有无描述产生明显的高度跳动。

截止日期继续沿用现有规则：没有日期时不虚构日期；已过期且任务未完成时使用醒目提示。

### 2.3 列表视图

列表每行展示：

- 任务标题；
- 状态；
- 负责人；
- 截止日期；
- 优先级。

负责人优先显示名称；没有负责人时显示 `Unassigned`。没有截止日期或优先级时，也使用明确的空状态文字，避免用户误以为信息还在加载。

在窄窗口中，标题保持最优先展示，其余字段允许紧凑排列或换行，避免横向滚动。

## 3. 技术方案

### 3.1 修复负责人值的传递

把负责人选择值的转换集中到一个纯函数：

- 只有空字符串转换为 `null`；
- 任意非空 pubkey 原样保留；
- 创建窗口、详情面板和卡片快速调整统一使用同一规则。

负责人候选还会优先识别当前登录身份：即使 Relay 中残留了相同 pubkey 的 Agent 数据，当前登录用户仍按可指派的人类成员处理，不套用 Agent 的外部指派限制。

同时从界面选择、任务更新、事件签名到 Relay 回写逐段验证，确保当前用户 pubkey 最终进入任务更新事件的 `p` tag，而不是只让界面临时显示正确。

### 3.2 复用任务展示信息

- 卡片继续复用现有截止日期格式化和逾期判断。
- 列表通过 assignee pubkey 查找对应显示名称，不重复请求数据。
- 单独抽出列表视图组件，避免 `TasksScreen` 继续堆积显示细节，也便于以后增加排序或列设置。
- 所有文字继续使用项目现有的 rem 字号 token，保证 Desktop 缩放功能正常。

## 4. 测试重点

- 把未指派任务指派给当前登录用户后，Relay 回写后仍显示该用户。
- 发出的任务更新事件包含当前用户对应的 `p` tag。
- 明确选择 `Unassigned` 时仍能正常清空负责人。
- 指派给其他人或 Agent 的现有行为不受影响。
- 看板卡片显示描述和截止日期；长描述只占两行，空描述有稳定占位。
- 列表显示负责人、截止日期和优先级，并正确显示空状态。
- 看板和列表点击任务后仍能打开同一个详情面板。

## 5. Todo List

- [x] `desktop/src/features/tasks/lib/taskAssigneeSelection.ts`：新增负责人选择值的统一转换规则。
- [x] `desktop/src/features/tasks/lib/taskAssigneeSelection.test.mjs`：覆盖当前用户 pubkey、其他 pubkey 和明确清空三种转换。
- [x] `desktop/src/features/tasks/lib/taskAssignees.ts`：当前登录用户始终按可指派的人类成员处理，不受同 pubkey 历史 Agent 数据影响。
- [x] `desktop/src/features/tasks/lib/taskAssignees.test.mjs`：覆盖当前用户与历史 Agent 数据同 pubkey 时仍可指派。
- [x] `desktop/src/features/tasks/ui/TaskDetailPanel.tsx`：使用统一转换规则，修复详情面板选择当前用户后负责人丢失。
- [x] `desktop/src/features/tasks/ui/CreateTaskDialog.tsx`：创建任务时使用相同的负责人转换规则。
- [x] `desktop/src/features/tasks/ui/TaskCard.tsx`：展示两行描述区域和截止日期，并统一卡片快速指派的值转换。
- [x] `desktop/src/features/tasks/ui/TaskListView.tsx`：新增信息完整的列表视图，展示状态、负责人、截止日期和优先级。
- [x] `desktop/src/features/tasks/ui/TasksScreen.tsx`：接入新的列表视图并传入负责人信息。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖指派给当前用户、卡片描述/截止日期和列表新增字段。
- [x] `desktop/src/testing/e2eBridge.ts`：确认现有模拟 Relay 已记录签名事件并按 `p` tag 回写负责人，无需修改。
- [x] `docs/2026-08-04-task-self-assignment-and-view-density-fix-plan.md`：同步 Todo、验收结果和验证命令。

## 6. 验收标准

1. 选择 `lu（b2fa0399…3f4e）` 后不再跳回 `Unassigned`，刷新或收到 Relay 更新后仍保持正确负责人。
2. 看板卡片无需打开详情即可看到截止日期和至少两行描述区域。
3. 列表每行能直接看到 assignee、due date 和 priority，同时保留标题与状态。
4. 未填写描述、截止日期、负责人或优先级时，界面提供清楚且一致的空状态。
5. 新增自动化测试覆盖本次故障路径，现有 Task 测试全部通过。

## 7. 验证结果

- Desktop 单元测试：3819 项全部通过。
- Desktop TypeScript 类型检查：通过。
- Desktop 字号与文件大小检查：通过。
- Desktop E2E 构建：通过。
- Tasks E2E：8 项全部通过，包含指派给当前用户后检查签名事件 `p` tag、Relay 回写、卡片描述/截止日期和列表新增字段。

## 8. 第二轮现场核查（2026-08-04）

### 8.1 首次修复为什么没有解决

首次测试只模拟了一个干净的当前用户和少量 Agent，没有复现当前 community 中“旧 Agent 身份、当前 Agent 身份、空 Profile 成员同时存在”的真实数据，因此测试通过，但现场问题仍然存在。

当前数据库证明：

- 选择运行中的 Agent 时，任务更新事件会正确携带负责人 `p` tag；
- 选择 `lu（b2fa0399…3f4e）` 时，客户端仍生成了不含 `p` tag、也不含清空标记的空更新；
- Relay 没有拒绝 `lu`，故障仍发生在 Desktop 下拉选项到任务事件的传值阶段。

### 8.2 多余身份的真实来源

- 当前有效 Bumble：`1bcf94f9…3163`，存在于当前 Desktop Managed Agent 记录中，并有当前运行记录。
- 历史 Bumble：`d5f5cf02…6049`，仍是 community 成员并保留旧 Profile，但已不在当前 Managed Agent 列表；其旧头像地址仍指向 `localhost:3000`。
- 两个无名身份：`81d9781a…cc99`、`fc6d19b9…215d`，只有 community 成员记录，没有 Profile，也没有任何事件。

因此，单纯“只显示 community 成员”仍然会把历史身份和空身份带进负责人列表。

## 9. 第二轮修复方案

### 9.1 负责人选择不再直接相信 DOM 字符串

新增统一的负责人选择组件。下拉框内部使用候选位置作为稳定值，选中后再从当前候选对象中取得 pubkey：

- `Unassigned` 明确解析为 `null`；
- `lu` 明确解析为 `b2fa0399…3f4e`；
- Agent 明确解析为各自 pubkey；
- 找不到候选时不发送任务更新，并显示错误；
- 任务事件生成器拒绝没有任何实际字段的空更新，避免错误继续被 Relay 当作成功保存。

详情面板、卡片快速指派和创建任务共用同一个组件与解析规则，避免三个入口再次出现不同表现。

### 9.2 负责人候选必须是可识别的当前身份

候选规则调整为：

- 当前登录用户始终保留；
- 有 Profile 的普通 community 成员保留；
- 当前 Managed Agent 且仍是 community 成员的身份保留；
- 可识别的 Relay Agent 且仍是 community 成员的身份保留；
- 只有成员记录、没有 Profile、也不是任何有效 Agent 来源的空身份不显示；
- 当旧 Relay Agent 与当前本机 Managed Agent 的 owner 和标准化名称相同，优先当前本机 Agent，隐藏旧身份；
- 不对两个普通同名用户做合并，避免误删真实的人类成员。

这只清理负责人选择列表，不直接删除数据库成员或历史事件，数据操作仍然可恢复、可审计。

## 10. 第二轮 Todo List

- [x] `desktop/src/features/tasks/ui/TaskAssigneeSelect.tsx`：新增基于候选对象解析的统一负责人选择组件，并处理无效选项。
- [x] `desktop/src/features/tasks/ui/TaskDetailPanel.tsx`：改用统一负责人选择组件，确保 `lu` 产生明确 pubkey。
- [x] `desktop/src/features/tasks/ui/CreateTaskDialog.tsx`：改用统一负责人选择组件。
- [x] `desktop/src/features/tasks/ui/TaskCard.tsx`：卡片快速指派改用统一负责人选择组件。
- [x] `desktop/src/features/tasks/lib/taskEvents.ts`：拒绝没有任何实际变更字段的 Task Mutate 空更新。
- [x] `desktop/src/features/tasks/lib/taskEvents.test.mjs`：覆盖 `lu` 的 `p` tag、明确清空和空更新拒绝。
- [x] `desktop/src/features/tasks/lib/taskAssignees.ts`：过滤无 Profile 空成员，并优先同 owner 同名的当前 Managed Agent。
- [x] `desktop/src/features/tasks/lib/taskAssignees.test.mjs`：使用现场同构数据覆盖两个 Bumble、两个空身份和 `lu`；旧 Bumble 仅残留在成员 Profile 中也能识别。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖详情与卡片把任务指派给 `lu`，检查签名事件 `p` tag、Relay 回写和列表结果。
- [x] `docs/2026-08-04-task-self-assignment-and-view-density-fix-plan.md`：完成后更新第二轮 Todo 和验证结果。

## 11. 第二轮验收标准

1. 从详情面板和卡片下拉框选择 `lu（b2fa0399…3f4e）` 后，任务更新事件都包含该 pubkey 的 `p` tag，Relay 回写后不回退。
2. 负责人列表只显示当前 Bumble `1bcf94f9…3163`，不显示历史 Bumble `d5f5cf02…6049`。
3. `81d9781a…cc99` 和 `fc6d19b9…215d` 不再出现在负责人列表。
4. 当前可运行 Agent 和有 Profile 的真实成员仍可正常指派。
5. Desktop 不再向 Relay 发送没有任何实际变更字段的 Task Mutate 空更新。

## 12. 第二轮验证结果

- Desktop 单元测试：3823 项全部通过；现场同构用例包含当前 `lu`、当前 Bumble、仅残留 Profile 的旧 Bumble 和两个无资料身份。
- Desktop TypeScript 类型检查：通过。
- Desktop Biome、文件大小、字号和 pubkey 展示检查：通过；Biome 仅报告两条本次改动之外的既有提示。
- Tasks E2E：8 项全部通过；详情面板与卡片快速指派均验证 `lu` 的 `p` tag，Relay 回写后负责人保持为 `lu`。

## 13. 第三轮现场核查（2026-08-04）

### 13.1 用户补充的完整故障路径

- 手动创建任务时选择 `lu`，最终任务仍是未指派；
- Agent 创建任务并指派给 `lu` 时正常；
- 随后在 Desktop 手动改为 `Unassigned` 可以成功；
- 再从 Desktop 手动改回 `lu` 时失败。

这说明 `lu` 本身有任务访问权，Relay 也允许任务指派给 `lu`；故障只存在于 Desktop 的手动选择路径。

### 13.2 现场事件证据

完整重启 Desktop 后再次操作，数据库仍收到两条有效签名的空 Task Mutate 事件：

- 事件作者是 `lu（b2fa0399…3f4e）`；
- 事件中有任务 ID 和上一版本；
- 没有负责人 `p` tag，也没有清空负责人标记；
- 事件签名和事件 ID 校验均通过。

因此 Relay 没有删除负责人；Desktop 在签名前就丢失了手动选择结果。Agent 创建正常，是因为 Agent CLI 不经过 Desktop 的原生下拉框。

### 13.3 为什么现有测试没有发现

当前 Tasks E2E 使用浏览器模拟桥接层，模拟签名会原样保留测试传入的 tags。它能验证任务业务逻辑，却没有覆盖 macOS WebView 原生 `<select>` 控件的真实选择行为，因此出现自动化测试通过、真实 Desktop 失败。

## 14. 第三轮修复方案

### 14.1 用应用内负责人菜单替换原生下拉框

负责人入口改为应用内按钮与弹出菜单。每个菜单项直接持有对应候选对象：

- 点击 `lu`，直接提交 `b2fa0399…3f4e`；
- 点击 Agent，直接提交该 Agent pubkey；
- 点击 `Unassigned`，明确提交 `null`；
- 不再把候选位置或 pubkey 先写入原生 `<select>`，再从 DOM 字符串反向解析。

创建窗口、任务详情和卡片快捷指派继续共用同一个负责人组件，保证三个入口行为一致。

### 14.2 发布前增加负责人一致性检查

Desktop 在签名前后检查本次负责人操作：

- 选择具体负责人时，待发布事件必须包含完全相同的 `p` tag；
- 选择 `Unassigned` 时，更新事件必须包含明确的清空标记；
- 字段不一致时停止发布，并在界面显示错误，不能再把空事件保存为一次成功更新。

这层检查既用于修复，也作为以后修改签名或选择组件时的安全网。

## 15. 第三轮 Todo List

- [x] `desktop/src/features/tasks/ui/TaskAssigneeSelect.tsx`：把原生负责人下拉框改为直接绑定候选对象的应用内菜单。
- [x] `desktop/src/features/tasks/lib/taskAssigneeSelection.ts`：删除基于 DOM 候选位置的解析，改为校验明确的候选 pubkey/null。
- [x] `desktop/src/features/tasks/lib/taskAssigneeSelection.test.mjs`：覆盖 `lu`、Agent、Unassigned 和已失效候选。
- [x] `desktop/src/features/tasks/hooks.ts`：发布前后核对负责人操作与签名事件 tags，不一致时停止发布并显示错误。
- [x] `desktop/src/features/tasks/lib/taskEvents.test.mjs`：补充负责人发布一致性与空更新拒绝测试。
- [x] `desktop/tests/e2e/tasks.spec.ts`：改为点击负责人菜单项，覆盖手动创建指派给 `lu`，以及 `lu → Unassigned → lu` 的完整往返。
- [x] `docs/2026-08-04-task-self-assignment-and-view-density-fix-plan.md`：完成后更新第三轮 Todo 与真实 Desktop 验收结果。

## 16. 第三轮验收标准

1. 手动创建任务时选择 `lu`，创建完成后仍显示 `lu`。
2. Agent 创建并指派给 `lu` 的任务，可以从 Desktop 改为 `Unassigned`，再改回 `lu`。
3. 详情面板和卡片快捷指派结果一致。
4. Desktop 不再发布缺少负责人操作字段的空 Task 事件。
5. 当前 Bumble、其他可用 Agent 和真实成员仍可正常指派，旧 Bumble 与无资料身份不会重新出现。

## 17. 第三轮自动化验证结果

- Desktop 单元测试：3824 项全部通过。
- Desktop TypeScript 类型检查：通过。
- Desktop Biome、文件大小、字号和 pubkey 展示检查：通过；Biome 仅报告两条本次改动之外的既有提示。
- Desktop E2E 构建：通过。
- Tasks E2E：8 项全部通过；覆盖手动创建并指派给 `lu`、详情负责人 `lu → Unassigned → lu`、卡片快捷指派、其他成员和 Agent 候选。
- 真实 Desktop 验收：代码提交并完整重启客户端后，由现场操作确认。
