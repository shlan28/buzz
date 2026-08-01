> 更新日期：2026-08-01
> 更新说明：已完成 Calendar 多来源筛选、局部失败隔离、Agent 指引修正及回归测试。

# Calendar 日历来源筛选实施方案

## 一、问题与产品目标

当前 Calendar 把用户本人和所有 owned Agents 放进同一个 Relay `authors` 查询。只要其中任意一个 Agent 的 owner 登记已过期、尚未同步或被 Relay 拒绝，整条请求就会关闭，页面只能显示：

```text
Calendar couldn't be loaded
The relay rejected or interrupted the calendar request.
```

同时，左栏现有 `Personal` 复选框只是视觉占位，没有控制查询或展示；daily-assistant 也不会作为独立日历来源出现。

本次调整后的产品行为：

1. 左栏显示 `Personal`、`daily-assistant` 和其他当前 Relay 识别出的 owned Agents。
2. 首次进入时默认勾选全部来源，因此用户无需额外操作即可看到 owned Agent 日程。
3. 取消勾选只隐藏该来源；重新勾选恢复显示，不修改或删除 Relay 中的数据。
4. Personal 与每个 Agent 独立查询。某个 Agent 查询失败时，只在该来源旁提示失败并允许重试，不影响 Personal 和其他 Agent。
5. 只有 Personal 自身查询失败时，主日历才显示全局加载错误。
6. Agent 创建的日程继续保留 Agent 署名，并在详情中显示 `Created by <Agent>`。

## 二、代码规范检查

已优先检查项目导航与代码规范：

- 项目当前规范入口为 `wiki/INDEX.md`，原 `docs/index.md` 当前不存在。
- `wiki/code-spec.md` 要求 Relay 作为事实来源、用户可见错误必须可恢复、UI 覆盖 error/permission 状态，并为 bug fix 增加回归测试。
- 本次不改变 Nostr kind、Relay ACL、数据库结构或 Agent 签名边界，只调整 Desktop 的查询拆分与展示筛选。

## 三、数据来源与权限边界

Calendar 来源集合为：

```text
Personal = 当前 Desktop 身份
Agent sources = 当前 Relay Agent 列表中，profile.ownerPubkey 等于当前身份的 Agent
```

本地 managed-agent 记录只用于补充名称，不单独授予 Relay 日历读取权限。Relay 仍对每个作者请求执行最终 ACL 校验。

`Who can talk to the agent` 不影响来源列表和日历权限；`anyone` 不会使 Agent 日程对其他成员可见。

## 四、查询与失败隔离

### 4.1 每个来源独立查询

不再发送：

```text
authors = [personal, agent-a, agent-b, agent-c]
```

而是按来源分别发送：

```text
authors = [personal]
authors = [agent-a]
authors = [agent-b]
authors = [agent-c]
```

各来源仍保持现有分页、replacement head 合并和当前日期范围过滤。已勾选来源的成功结果在客户端合并；未勾选来源不发起历史查询和实时订阅。

### 4.2 局部失败

- Personal 失败：主区域显示现有全局错误与 Retry。
- 单个 Agent 失败：保留其他来源事件，Agent 行显示错误状态和 Retry。
- Agent profile 尚未完成：显示来源列表 loading，不把空列表误认为没有 owned Agent。
- 重试只刷新对应来源，不重复请求所有成功来源。

### 4.3 选择状态

- 新发现的 owned Agent 默认勾选。
- 用户在当前 Calendar 页面内的勾选状态在视图和日期切换时保留。
- 本次不跨 Desktop 重启持久化筛选选择，避免引入新的 community-scoped 本地缓存；持久化可在确认需求后另行设计。
- community 切换依靠 Calendar 页面 remount 重建默认选择，不泄漏上一 Relay 的 Agent 来源。

## 五、UI 设计

左栏 `My calendars` 展示：

```text
☑ Personal
☑ daily-assistant
☑ <other owned agent>
```

每一行包含：

- 复选框；
- 与日程块一致的颜色标识；
- 来源名称；
- Agent 查询失败时的警告标识与 Retry。

来源名称过长时截断，并保留 title 供悬停查看。窄窗口下当前 sidebar 仍按既有行为隐藏，本次不扩展移动弹层。

## 六、Agent 指引

基础提示词应明确：

- owned Agent 日程在 owner 的 Calendar 中默认显示；
- 用户可以通过左栏来源复选框隐藏或恢复某个 Agent；
- Agent 不应把“勾选 Agent 日历”描述为首次看见日程的必要步骤；
- 若 owner 看不到日程，应先核对日期、Relay owner 登记和来源错误状态。

## 七、测试方案

1. Personal 和 owned Agent 默认均勾选，两个来源的日程同时可见。
2. 取消 daily-assistant 后只隐藏它的事件，Personal 保持可见；重新勾选后恢复。
3. 一个 Agent 查询被 Relay 拒绝时，Personal 和其他 Agent 仍可见，失败来源可独立 Retry。
4. Personal 查询失败时显示全局错误，Retry 后恢复。
5. 非当前 owner 的 Relay Agent 和仅存在于本地的 Agent 不进入来源列表。
6. 日期、日/周/月切换不重置当前页面的勾选状态。
7. 运行 Biome、TypeScript typecheck、Desktop E2E、px-text 与 file-size 检查。

## 八、Todolist

- [x] `desktop/src/features/calendar/lib/calendarTypes.ts`：增加日历来源、选择状态和来源错误类型。
- [x] `desktop/src/features/calendar/hooks.ts`：按 Personal/Agent 拆分历史查询与实时订阅，合并成功结果并隔离单来源错误。
- [x] `desktop/src/features/calendar/ui/CalendarSidebar.tsx`：渲染真实来源列表、复选框、局部错误与单来源 Retry。
- [x] `desktop/src/features/calendar/ui/CalendarScreen.tsx`：连接来源状态，并仅在 Personal 失败时显示全局错误。
- [x] `desktop/src/testing/e2eBridge.ts`：支持按指定日历作者返回或拒绝查询。
- [x] `desktop/tests/helpers/bridge.ts`：声明按作者模拟 Calendar 查询结果的测试配置。
- [x] `desktop/tests/e2e/calendar.spec.ts`：覆盖默认全选、独立隐藏、局部失败和重试。
- [x] `crates/buzz-acp/src/base_prompt.md`：修正 Agent 对 owner 端日历来源筛选的说明。
- [x] `crates/buzz-acp/src/lib.rs`：验证共享基础提示包含 owner 端默认展示与排错指引。
- [x] `docs/2026-08-01-calendar-source-filter-plan.md`：记录实施结果、测试结果与方案偏差。

## 九、验收标准

- 左栏真实显示 Personal、daily-assistant 和其他 owned Agents。
- 所有来源默认勾选，daily-assistant 日程无需手动开启即可显示。
- 每个复选框能独立控制对应来源的事件展示。
- 任一 Agent 被 Relay 拒绝不会再触发整个 Calendar 的全局错误。
- Personal 失败与 Agent 局部失败都有明确、可恢复的 Retry。
- 现有创建、详情、删除、24 小时时间轴及导航行为不回归。

## 十、建设性建议

来源复选框适合解决“我想看谁的日程”，但不应被用来掩盖 owner 登记错误。失败的 Agent 来源应该保留在列表中并明确显示错误，而不是静默消失；这样用户能区分“主动隐藏”和“Relay 没有授权”两种完全不同的状态。

## 十一、实施结果

- Personal 与每个 owned Agent 已拆成独立历史查询和独立实时订阅。
- 左栏已展示真实来源列表，默认全部开启；关闭来源只隐藏对应事件。
- Agent 来源失败时显示该行 Retry，成功来源继续展示；Personal 失败仍使用主区域错误状态。
- Agent 基础提示已明确 owner 默认能看到 owned Agent 来源，不再把手动勾选描述为必要条件。
- E2E mock 现在按作者执行 Calendar ACL，并能分别模拟 Personal 或指定 Agent 的失败与恢复。

验证结果：

- Desktop Biome：通过。
- `pnpm typecheck`：通过。
- `pnpm check:px-text`：通过。
- `pnpm check:file-sizes`：通过。
- `pnpm build:e2e`：通过。
- Calendar Playwright E2E：8/8 通过。
- `cargo test -p buzz-acp shared_base_prompt_teaches_private_calendar_contract`：通过。
