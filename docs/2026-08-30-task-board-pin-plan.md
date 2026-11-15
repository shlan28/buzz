> 更新日期：2026-08-30 12:05 CST
> 更新说明：新增 Task 按 Board 分组类型置顶方案，覆盖全局 Task Board 与 Track 详情 Task Board，并定义共享语义、协议、排序、权限和实施范围。

# Task Board 按分组类型置顶方案

## 1. 结论

为 Task 增加按 Board 分组类型独立置顶的能力。用户可以在当前 Board 的 Task 卡片上点击 Pin，使该 Task 在当前分组类型的所属列中持续排在普通 Task 之前。

现有三种 Board 类型分别保存置顶状态：

```text
assignee / status / track
```

例如：

- 在 Status Board 置顶，只影响 Status Board；
- 切换到 Assignee Board 或 Track Board 后，该 Task 不因此置顶；
- Track 详情里的 Task Board 固定使用 Status 分组，因此复用同一个 `status` 置顶状态；
- Task 从 Todo 移到 In progress 后，只要仍处于 Status Board，它会在新列继续置顶；
- Task 更换负责人或 Track 后，对应类型的置顶同样跟随 Task 进入新列。

一个 Task 可以同时在多个 Board 类型中置顶。置顶是 Task 的共享工作属性，而不是某台设备的本地偏好，因此对所有有权读取该 Task 的成员一致，并可跨设备保持。

## 2. 产品行为

### 2.1 置顶与取消置顶

- Board 卡片提供图钉按钮；未置顶时显示 `Pin in this board`，已置顶时显示 `Unpin from this board`；
- 点击只切换当前 Board 类型，不打开 Task 详情；
- 已置顶卡片保持可见的图钉标识，不能只靠颜色表达；
- 保存期间禁用重复点击；失败时恢复原状态并显示可恢复错误；
- 置顶与取消置顶写入 Task 历史，和其他 Task 修改使用同一并发版本约束；
- List 视图不应用置顶排序，也不显示置顶操作，避免把 Board 空间组织规则扩散成全局 Task 优先级。

### 2.2 排序

每一列先分为置顶与普通两段：

```text
Pinned Tasks
Normal Tasks
```

两段内部继续使用该 Board 已有排序，不增加手动拖拽排序：

- Assignee Board：状态 → 优先级 →更新时间；
- Status Board：优先级 → 更新时间；
- Track Board：状态 → 优先级 → 更新时间。

这能保证置顶只改变“是否排在顶部”，不引入第二套位置编号、冲突合并或拖拽重排协议。

### 2.3 筛选与生命周期

- 置顶不绕过搜索、Tag、Track、Project、Channel、Status 和 Show done 筛选；
- Done Task 在 `Show done` 关闭时仍隐藏；
- Archived Task 仍不进入 Board；
- 删除 Task 会自然删除其置顶状态；
- Pin 不改变 Task priority、status、assignee、Track 或执行状态；
- 一个列里没有可见 Task 时，仍遵循现有 Show empty groups 规则。

## 3. Track 详情 Board

Track 详情复用 `TaskBoardView` 并固定 `groupBy="status"`，不建立第二套置顶模型：

- 在全局 Status Board 置顶的 Task，进入所属 Track 详情时也位于对应状态列顶部；
- 在 Track 详情里置顶，回到全局 Status Board 后同样生效；
- 在全局 Assignee 或 Track Board 的置顶不会影响 Track 详情；
- Track archived 时 Board 已禁止 Task 修改，因此 Pin / Unpin 同样禁用；
- Track 详情 List 视图仍不应用置顶。

这种一致性比为每个 Track 再保存一份独立 Pin 更容易理解，也避免同一个 Task 出现“全局 Status 不置顶、Track Status 却置顶”的双重状态。

## 4. 权限与共享边界

Pin 是 Task mutation，因此沿用现有 Task 编辑权限、签名、Relay 鉴权和 latest State 冲突规则：

- 能修改该 Task 的操作者可以 Pin / Unpin；
- 只读用户可以看到置顶结果，但不显示可操作按钮；
- Relay 仍是最终权限边界，客户端隐藏按钮不能替代服务端校验；
- 关联私有 Channel 或受限 Track 的 Task 不因 Pin 扩大可见范围；
- Pin 事件和派生 Task State 都保持原 Task 的 community / Channel / Track ACL。

## 5. 协议设计

不新增 HTTP endpoint、数据库表或独立 Pin event kind。Pin 作为 Task 当前状态的一部分，继续使用现有 Task Create / Mutate / State 流程。

Task State 使用可重复专用 tag：

```text
["board-pin", "assignee"]
["board-pin", "status"]
["board-pin", "track"]
```

约束：

- 只接受 `assignee / status / track`；
- 重复值归一化为一个；
- Create 缺省为空集合；
- Mutate 未携带 Pin patch 时继承当前集合；
- Mutate 修改 Pin 时携带完整替换集合，空集合表示清除全部；
- Relay 派生的 Task State 输出规范化后的完整集合；
- 旧 Task 没有 `board-pin` tag 时按未置顶兼容。

使用稳定 Task UUID 所在的 Task State，而不是把易变化的 State event ID 写入 NIP-51 Pin List。这样 Task 更新后不会丢失置顶，也不会把 Board 专属共享状态混入个人 Profile Pin List。

## 6. 客户端数据流

Task 类型增加 `boardPins: TaskBoardGroup[]`，事件 codec 负责严格解析与构建。`taskBoard.ts` 提供统一的 pinned-first 比较器，三个列构建函数都复用，避免各页面自行排序。

`TaskBoardView` 只接收：

- 当前 `groupBy`；
- 每个 Task 的 `boardPins`；
- `onPinChange(task, groupBy, pinned)` mutation callback；
- 当前 mutation pending 状态。

全局 `TasksScreen` 和 `TrackDetailScreen` 都通过现有 `useTasks().update` 提交 patch。乐观更新、失败回滚、live State 刷新和 community 切换继续复用现有 Task Query 生命周期，不新增第二份共享状态源。

## 7. CLI 与 Agent

Task Create / Update 增加可重复参数：

```bash
buzz tasks create ... --board-pin status
buzz tasks update ... --board-pin status --board-pin assignee
buzz tasks update ... --clear-board-pins
```

语义为完整替换，和现有 labels / members 一样避免增删并发歧义。`tasks get/list` 输出 `board_pins` 数组，Agent 可以读取并管理同一共享状态。

首版不增加独立 `tasks pin` 子命令；Pin 本质仍是 Task 部分更新，单独命令会重复 expected-event、冲突和错误处理。

## 8. Constructive suggestion

建议首版不要支持“在某个具体列里单独置顶”或手动排列多个置顶 Task。Task 的 status、assignee、Track 都会变化；如果 Pin 绑定具体列 ID，移动 Task 时必须决定自动迁移、保留失效 Pin 还是清除，产品语义会变得不稳定。

按 Board 类型绑定更符合“在某一种 Board 里一直置顶”：Task 移列后仍置顶，同时 Status Pin 可以自然覆盖全局 Task Board 和 Track 详情 Board。

另外不建议用 `localStorage`。它实现快，但只在当前 Desktop 和当前设备生效，无法满足“一直置顶”的共享工作预期，也会让不同成员看到不同顺序却没有明显解释。

## 9. 验收标准

- Task 可分别在 Assignee、Status、Track Board Pin / Unpin；
- Pin 只影响当前 Board 类型，一个 Task 可同时 Pin 多种类型；
- Pinned Task 始终位于所属列的普通 Task 之前；
- 多个 Pinned Task 保持现有确定性排序；
- Task 跨状态、负责人或 Track 移动后，在对应 Board 类型的新列继续置顶；
- Status Pin 在全局 Status Board 与 Track 详情 Status Board 双向一致；
- 筛选、Show done、归档和 ACL 不被 Pin 绕过；
- List 视图不应用 Pin 排序；
- 失败回滚、stale State 冲突和实时刷新正确；
- 旧 Task 无需迁移且默认为未置顶；
- CLI / Agent 可以读取、完整替换和清空 Board Pins。

## 10. Task Progress

- [x] 1. 对齐需求与影响范围（Core、SDK、Relay、CLI、Desktop）
- [ ] 2. 先补类型与协议输入，再写实现
- [ ] 3. 按现有 Task command / derived State / hooks 分层落位
- [ ] 4. 对齐 Board 卡片交互、可访问状态和失败回滚
- [ ] 5. 补充协议、CLI 与 Wiki 文档
- [ ] 6. 运行 Rust、Desktop unit/E2E、live Relay 与完整质量门禁

## 11. Todolist

得到鹿鹿子大王确认后再修改代码；每个 Todo 只对应一个文件。

### Core、SDK 与 Relay

- [ ] `crates/buzz-core/src/task.rs`：定义 Board Pin 类型、合法值、规范化与解析测试。
- [ ] `crates/buzz-sdk/src/lib.rs`：为 Task Create / Mutate 输入增加 board pins 完整集合 patch。
- [ ] `crates/buzz-sdk/src/builders.rs`：构建 `board-pin` tags，覆盖多类型、去重、继承与清空协议测试。
- [ ] `crates/buzz-relay/src/handlers/command_executor.rs`：严格校验 board pins、在未修改时继承、在修改时完整替换并写入 Task State。
- [ ] `crates/buzz-test-client/tests/e2e_relay.rs`：覆盖 create、replace、clear、stale conflict、ACL 与旧 Task 兼容。

### CLI

- [ ] `crates/buzz-cli/src/lib.rs`：增加重复 `--board-pin` 与 `--clear-board-pins` 参数及冲突规则。
- [ ] `crates/buzz-cli/src/commands/tasks.rs`：解析、输出和完整替换 board pins。
- [ ] `crates/buzz-cli/TESTING.md`：增加真实 Relay Pin / Unpin、跨 Board 类型和 Track 详情一致性验收步骤。

### Desktop 类型与逻辑

- [ ] `desktop/src/features/tasks/types.ts`：为 Task / Draft / Patch 增加 `boardPins` 类型表达。
- [ ] `desktop/src/features/tasks/lib/taskEvents.ts`：严格解析和构建 `board-pin` tags。
- [ ] `desktop/src/features/tasks/lib/taskEvents.test.mjs`：覆盖旧 Task、多 Pin、去重、替换与清空。
- [ ] `desktop/src/features/tasks/lib/taskBoard.ts`：实现按当前 Board 类型 pinned-first 的稳定排序。
- [ ] `desktop/src/features/tasks/lib/taskBoard.test.mjs`：覆盖三种 Board、列迁移、多个 Pin、过滤和普通排序不回退。
- [ ] `desktop/src/features/tasks/hooks.ts`：通过现有 Task mutation 提交 Pin patch并复用乐观更新/失败回滚。

### Desktop UI 与 E2E

- [ ] `desktop/src/features/tasks/ui/TaskCard.tsx`：增加可访问的 Pin / Unpin 按钮和持久图钉标识。
- [ ] `desktop/src/features/tasks/ui/TaskBoardView.tsx`：按 groupBy 传递 Pin 状态、处理按钮事件并禁止冒泡/拖拽干扰。
- [ ] `desktop/src/features/tasks/ui/TasksScreen.tsx`：接入全局三种 Board 的 Pin mutation、错误和 pending 状态。
- [ ] `desktop/src/features/tracks/ui/TrackDetailScreen.tsx`：接入固定 Status Board Pin，并在 archived Track 禁用修改。
- [ ] `desktop/src/testing/e2eBridge.ts`：模拟 board pins 的 Task State、mutation、冲突与 live 更新。
- [ ] `desktop/tests/e2e/tasks.spec.ts`：覆盖三种全局 Board 的独立 Pin、移列保持、List 不受影响与失败回滚。
- [ ] `desktop/tests/e2e/tracks.spec.ts`：覆盖全局 Status 与 Track 详情 Status Pin 双向一致、archived 禁用。

### 文档

- [ ] `wiki/concepts.md`：补充 Board Pin 的共享、按类型和不绕过筛选/ACL语义。
- [ ] `docs/2026-08-06-tracks-work-management-plan.md`：追加 Track 详情 Status Board 复用 Pin 的能力演进说明。
- [ ] `docs/2026-08-30-task-board-pin-plan.md`：实施完成后记录测试结果、commit 与已知限制。

## 12. 非本期范围

- Web 和 Mobile 当前没有对应 Task Board，不新增不存在的 UI；
- 不提供个人私有 Pin、设备本地 Pin 或按成员分别排序；
- 不提供具体列级 Pin、Pin 分区折叠、多个 Pin 手动排序或 Pin 数量上限；
- 不让 Pin 触发通知、Agent Execution 或 Task priority 变化；
- 不修改 Track 进度算法。
