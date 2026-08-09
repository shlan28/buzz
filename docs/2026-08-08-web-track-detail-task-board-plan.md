> 更新日期：2026-08-09
> 更新说明：在已部署的只读 Task/Track 页面中，新增唯一写操作 Execute，并接入 Relay 可信的 Queued、Running、Finished、Failed 完整生命周期；不开放创建、编辑、拖拽、归档或删除。

# Web Track 详情与 Task 看板补齐方案

## 一、产品结论

当前 Web Tracks 只完成了 Track 列表和右侧简化信息抽屉。点击 Track 不会进入独立详情页，也看不到属于该 Track 的 Task 看板。这与 Desktop 的行为不一致，也让 Track 失去了“组织一组任务并查看推进状态”的核心价值。

本次补齐后，用户点击任一 Track 将进入可直接访问和刷新的详情地址：

`/app/tracks/{trackId}`

详情页保持只读，但“只读”只限制创建、编辑、拖拽和删除，不删减查看能力。页面应包含：

- 返回 Tracks 的入口；
- Track 名称、状态、描述、Owner、时间范围和任务进度；
- 只展示 `task.trackId === trackId` 且未归档的任务；
- 默认按任务状态展示与 Desktop 一致的 Task Board；
- Board/List 视图切换；
- 点击 Task 打开已有只读 Task 详情；
- Track 不存在、无任务、加载失败时的完整状态；
- Desktop、iPad 横屏和 iPad 竖屏布局。

文件预览不属于本次范围，不修改消息附件、媒体读取或本机文件访问逻辑。

## 二、现状与根因

### 2.1 Web 当前行为

`web/src/features/tracks/TracksPage.tsx` 使用组件内 `selected` 状态。点击 Track 后只打开 400px 右侧抽屉，抽屉仅显示基础字段。浏览器地址不变化，因此不能刷新恢复、复制链接或使用前进后退。

`web/src/app/routes.ts` 只有 `/app/tracks`，没有 Track 详情路由。

### 2.2 Desktop 事实源

Desktop 使用 `/tracks/$trackId` 独立路由和 `TrackDetailScreen`：

- 顶部为 Track 概览和进度；
- 任务按 `trackId` 精确过滤；
- Board 默认按 Status 分列；
- 支持 Board/List 切换；
- Task 点击进入 Task 详情；
- 无任务时呈现明确空状态。

Web 应复刻该产品结构和视觉层级，仅移除写操作。

## 三、交互设计

### 3.1 从列表进入详情

- 点击 Track 行导航至 `/app/tracks/$trackId`，不再打开右侧 Track 抽屉。
- 浏览器返回键回到原 Tracks 列表。
- 直接打开详情 URL 或刷新页面后仍能恢复同一 Track。

### 3.2 Track 详情头部

- 左侧返回按钮；
- Track 名称、状态 badge 和描述；
- Owner 显示 profile 名称，无法解析时才使用稳定回退值；
- 显示开始/结束日期；
- 显示已完成任务数、总任务数和进度条；
- 保留 `Read only` 标识，不显示 Edit、Archive、Restore 或 Create Task。

### 3.3 Task Board

- 默认 Board 视图，固定按 `backlog`、`todo`、`in-progress`、`blocked`、`done` 状态分列；
- 显示空状态列，确保 Track 工作流全貌与 Desktop 一致；
- 卡片复用 Web Tasks 已完成的 Desktop-parity 信息集合：描述、状态、Track、labels、priority、due、assignee 和身份类型；
- 禁用拖拽、改状态、改 Track 和改 assignee；
- 点击卡片打开 Task 只读详情；
- List 视图显示同一批任务，不能出现筛选差异。

### 3.4 响应式布局

- Desktop 和 iPad 横屏使用横向滚动的状态列看板；
- iPad 竖屏保持列宽和卡片信息，不压缩成不可读的小卡片；
- 页面本身不产生横向溢出，横向滚动只发生在 Board 容器内；
- Task 详情在窄屏覆盖内容区域，并保留明确关闭入口。

## 四、数据与状态规则

- Track 和 Task 继续来自现有 `useWorkConsoleData`，不新增 Relay API。
- Track 查找使用路由 `trackId` 精确匹配。
- 任务集合为 `!task.archived && task.trackId === track.id`。
- 进度只统计上述可见任务，`done` 为已完成。
- Task Board 和 List 使用同一份派生任务集合。
- Owner、assignee 使用现有 `profilesByPubkey` 解析，不能正常展示截断 pubkey 代替已有 profile。
- 路由切换不得清空共享 Sidebar 数据。

## 五、技术方案

新增 Web Track detail 路由和页面。Track 列表只负责筛选与导航；详情页负责根据参数投影 Track 与 Task。

为了避免 Track 详情复制一套逐渐漂移的 Task 卡片，先把 `TasksPage` 内已经对齐 Desktop 的只读看板、列表和详情呈现抽成 browser-safe 组件，再由 Tasks 和 Track detail 共同消费。数据获取、路由和筛选继续留在各自页面容器。

建设性建议：不要直接在 `TracksPage.tsx` 里再粘贴一份 Task Board JSX。短期看修改更少，但以后 Task 卡片字段、颜色或身份逻辑修复时，两处一定再次不一致。

## 六、异常与边界

- Track id 不存在：显示 `Track not found` 和返回 Tracks 按钮。
- Track 存在但无任务：显示 Desktop 对应空状态，不渲染伪造卡片。
- Track 已归档：详情仍可通过直接链接只读查看，但不出现任何写操作。
- Task 指向不存在 Track：不出现在本详情页。
- 数据加载失败：显示 Retry，并继续使用现有 last-good Sidebar 数据策略。
- Task 点击后关闭详情，应回到同一 Track，而不是跳回整个 Tasks 首页。

## 七、验收标准

- Tracks 列表点击任意 Track 后 URL 变为 `/app/tracks/{trackId}`。
- 刷新详情 URL 后仍显示正确 Track。
- Track 头部字段、进度和 Desktop 使用同一信息结构。
- Board 默认按 Status 分列，并且只包含该 Track 的未归档 Tasks。
- Board/List 的 Task id 集合完全一致。
- Task 卡片内容和 Web Tasks 页面保持一致。
- 点击 Task 能查看只读详情，关闭后仍处于当前 Track。
- 页面不存在 Create、Edit、Delete、Archive、拖拽或状态修改入口。
- Chrome、iPad 横屏、iPad 竖屏 E2E 和 Light/Dark 视觉回归通过。
- 不修改文件预览、消息附件和 Relay media 行为。

## 八、Todo List

- [x] `web/src/app/routes.ts`：注册 `/app/tracks/$trackId` 路由。
- [x] `web/src/app/routes/app.tracks.$trackId.tsx`：读取路由参数并挂载 Track 详情页。
- [x] `web/src/features/tasks/TaskCard.tsx`：提取 Desktop-parity 只读 Task 卡片供 Tasks 和 Track detail 复用。
- [x] `web/src/features/tasks/TaskBoardView.tsx`：提取只读状态/assignee/track 看板呈现，并支持 Track detail 固定按 Status 分组。
- [x] `web/src/features/tasks/TaskListView.tsx`：提取只读 Task 列表呈现，确保与 Board 使用相同字段和打开行为。
- [x] `web/src/features/tasks/TaskDetailPanel.tsx`：提取已有只读 Task 详情，并支持关闭后保留来源页面。
- [x] `web/src/features/tasks/TasksPage.tsx`：改为消费共享 Task 组件，保持现有筛选、分组和 URL 行为不变。
- [x] `web/src/features/tracks/TracksPage.tsx`：移除简化详情抽屉，改为路由导航。
- [x] `web/src/features/tracks/TrackDetailPage.tsx`：实现 Track 概览、进度、Board/List、空状态和 Task 详情。
- [x] `web/src/app/routeTree.gen.ts`：通过 TanStack Router 生成流程纳入 Track detail 路由。
- [x] `web/tests/e2e/work-console.spec.ts`：覆盖列表进入详情、刷新恢复、Track 任务过滤、Board/List 与 Task 详情。
- [x] `web/tests/e2e/ipad-layout.spec.ts`：覆盖 Track detail 在横屏、竖屏及紧凑宽度下的溢出边界。
- [x] `web/tests/e2e/desktop-parity.visual.spec.ts`：增加 Track detail Light/Dark 视觉基线。
- [ ] `web/tests/helpers/desktopParityFixtures.ts`：补充跨 Track、归档和空 Track 的验收数据。
- [x] `docs/2026-08-08-web-track-detail-task-board-plan.md`：记录测试结果、实现 commit 和 Cloudflare 部署号。

## 九、代码规范检查

- 已优先查找 `docs/index.md` / `docs/INDEX.md`，当前仓库未提供该入口文件。
- 参考 `AGENTS.md`、`CONTRIBUTING.md` 和 `docs/2026-07-31-buzz-client-ui-design-standard.md`。
- Web 使用现有 React 19、TanStack Router、Tailwind 和 Biome，不新增 UI 状态库。
- 可读文字继续使用 rem-based Tailwind 字号，不添加任意 px/rem 字号。
- 每个 Todo 只对应一个文件；实现完成后执行 Web check、完整 Playwright 矩阵、signed-off commit 和 Cloudflare 部署。

## 十、确认门

鹿鹿子大王确认本方案后，再修改 Web 代码、补齐测试、提交并部署。

## 十一、实施记录

- 实现 commit：`2dbeed347 feat(web): add track and inbox details`。
- Web check、TypeScript、production/E2E build 均通过。
- Chrome、iPad 横屏、iPad 竖屏完整 Playwright 矩阵 90/90 通过。
- Track 详情 Light/Dark 视觉基线已生成并复跑通过。
- Cloudflare Pages 部署：`bd3d5951`；公网深链接 `/app/tracks/track-1` 返回 200。
- 公网加载资源：`index-CklqprAl.js`、`index-80fqSw8x.css`。

## 十二、Task Execute 产品范围

Web Tasks 与 Track detail 继续保持只读，只新增一个明确操作：在 Task 详情面板执行分配给 Agent 的 Task。

按钮位置与 Desktop 一致，放在 Task 详情面板的 `Agent execution` 区域，不放在每张 Board 卡片上，避免误触和看板视觉噪音。

本次明确不增加：

- Create Task；
- Edit Task；
- 修改 Status、Assignee、Track、Priority 或 Due；
- Board 拖拽；
- Archive/Delete；
- Inbox 内回复或其他写操作。

## 十三、Execute 协议与权限

Execute 必须复用 Desktop/Relay 的正式协议，而不是发送一条普通消息：

- kind：`42503`；
- `t`：`task-id:{taskId}`；
- `d`：每次执行生成的新 UUID；
- `previous`：当前 Task state event id；
- `e`：当前 Task state event id，marker 为 `task-state`；
- `p`：当前 assignee Agent pubkey，marker 为 `agent`；
- Task 存在 channel 时附加 `h`。

Web 通过已 Pair 的 Mac signer 签名，再使用现有 NIP-98 授权提交 Relay `/events`。

Relay 是最终权限事实源，会验证：

- Task 当前 state 没有变化；
- Task 未完成且未归档；
- assignee 是 Agent；
- 当前签名用户是该 Agent 或 Agent owner；
- Agent 当前在线。

Web 当前数据没有完整 Agent owner/presence 权威集合，因此不能假装提前知道在线或 owner 权限。Web 只在“Task 已分配给验证 Agent且未完成”时展示 Execute，其他权限和在线错误使用 Relay 的明确返回文案。

## 十四、Execute 生命周期与可信来源

- 点击后立即显示 `Sending…` 并禁用重复点击；
- Relay 接受 Execute 后会落库并生成由 Relay 签名的 kind `30501`，状态为 `queued`；
- Agent 独占领取执行后提交 kind `42504`，Relay 验证 assigned Agent 身份后生成 `running` 状态；
- Agent 正常结束或失败后继续提交 kind `42504`，Relay 分别生成 `finished` 或 `failed` 状态；
- Web 查询已有 kind `30501`，并保持 live subscription；只解析 `event.pubkey === relaySelfPubkey` 的状态事件；
- Web 使用 `d` tag 的 execution UUID 关联同一次执行，使用 `t=task-id:{taskId}` 防止跨 Task 串状态；
- 同一 execution 只接受更晚的 Relay 状态事件；终态 `finished/failed` 不得被旧事件回退；
- `failed` 的 Relay event content 作为失败原因展示，但必须按普通文本处理；
- 页面刷新后，从 Relay 查询恢复当前 Task 最新一次执行状态，而不是退回未执行状态。

交互展示：

- 本地签名与提交期间显示 `Sending…`；
- 收到或查询到 Relay `queued` 状态后显示 `Queued`；
- 收到 Relay `running` 状态后显示 `Running`；
- 收到 Relay `finished` 状态后显示 `Finished`；
- 收到 Relay `failed` 状态后显示 `Failed` 和失败原因；
- `Queued/Running` 禁止对同一 Task 再次 Execute；
- `Finished/Failed` 后允许用户明确发起新的 execution UUID，作为新一次执行；
- Relay 返回 Agent offline 时显示“Agent is offline”；
- 403/权限拒绝显示“Only the assigned Agent or its owner may execute”；
- 409/previous 冲突提示刷新 Task 后重试；
- 网络结果不确定时不能自动重发，因为命令可能已经执行；
- WebSocket 断开后先重新查询 Relay 状态；查询不到时显示“状态暂不可用”，不推断 Failed，也不自动重发 Execute。

`Running / Finished / Failed` 不是前端计时器状态，也不是普通 Agent 消息。它们必须来自 Relay 自签的 kind `30501`，这是本次验收的硬门槛。

## 十五、Execute 数据改动

Web Task 投影必须保留：

- `eventId`：作为 optimistic concurrency 的 expected state；
- `channelId`：用于可选 `h` scope；
- assignee profile 的 `isAgent`：决定是否展示 Execute。

执行状态投影必须保留：

- `executionId`：kind `30501` 的 `d` tag；
- `taskId`：`t=task-id:*`；
- `status`：仅接受 queued/running/finished/failed；
- `assignee`、`owner`、`requester`；
- `eventId` 与 `created_at`：用于状态去重和新旧排序；
- `message`：失败原因或结果摘要；
- `source_event`：追溯对应 request/update。

执行请求使用独立 API 模块构造纯事件和发布签名事件；执行状态使用独立 parser 与 store，便于测试 tags、Relay 身份校验、断线恢复、乱序事件和“不得自动重试”。

## 十六、Execute Todo List

- [ ] `web/src/shared/domain/eventKinds.ts`：增加 task execution request `42503` 与 Relay execution state `30501`。
- [ ] `web/src/features/tasks/types.ts`：为 Task 增加 `eventId` 与 `channelId`。
- [ ] `web/src/features/tasks/eventCodec.ts`：从最新 Task state 保留 event id 与 `h` channel。
- [ ] `web/src/shared/api/publishSignedEvent.ts`：抽取 signer、NIP-98 与 `/events` 单次提交逻辑，不实现模糊失败自动重试。
- [ ] `web/src/shared/api/messagePublish.ts`：改为消费共享签名发布函数，保持现有消息行为不变。
- [ ] `web/src/features/tasks/taskExecution.ts`：构造并发布 kind `42503` Execute 请求，映射 offline、permission、conflict 和 delivery-unknown 错误。
- [ ] `web/src/features/tasks/taskExecutionCodec.ts`：只解析 Relay self pubkey 签名的 kind `30501`，校验 execution/task/status/tags 并处理乱序。
- [ ] `web/src/features/tasks/useTaskExecutions.ts`：初始查询并实时订阅 kind `30501`，断线重连后重新查询恢复状态。
- [ ] `web/src/features/tasks/TaskExecutionControl.tsx`：提供 Execute/Sending/Queued/Running/Finished/Failed/状态不可用展示。
- [ ] `web/src/features/tasks/TaskDetailPanel.tsx`：仅在未完成、未归档且 assignee 为验证 Agent 时挂载 Execute 控件。
- [ ] `web/src/features/tasks/TasksPage.tsx`：维护当前 Task 详情的单次执行状态并调用 Execute API。
- [ ] `web/src/features/tracks/TrackDetailPage.tsx`：让共享 Task 详情在 Track 页面具备同一 Execute 操作。
- [ ] `web/src/vite-env.d.ts`：增加 Execute E2E 发布 seam，不暴露真实 signer key。
- [ ] `web/tests/e2e/task-execution.spec.ts`：覆盖请求 kind/tags、UUID、expected event、channel scope、Relay self 验证、四状态、乱序/伪造状态和错误映射。
- [ ] `web/tests/e2e/work-console.spec.ts`：覆盖 Execute 唯一写操作、完整生命周期、活动执行禁止重复、终态再次执行及 Tasks/Track 两入口一致。
- [ ] `web/tests/helpers/desktopParityFixtures.ts`：补充 Task event id/channel、Relay self pubkey 与 Execute 生命周期 E2E 响应。
- [ ] `docs/2026-08-08-web-track-detail-task-board-plan.md`：记录 Execute 测试、commit 和部署号。

## 十七、Execute 验收标准

- 未分配或分配给普通用户的 Task 不显示 Execute；
- 已完成/归档 Task 不显示 Execute；
- 分配给验证 Agent 的可执行 Task 在详情中显示唯一 Execute；
- 发布事件 kind/tags 与 Desktop 完全一致；
- Relay 接受前不能重复点击，Relay 状态依次真实展示 Queued、Running、Finished/Failed；
- 刷新页面可从 Relay 恢复最新 execution 状态；
- 伪造 pubkey、错误 Task、非法状态和旧的乱序状态均不能改变 UI；
- WebSocket 断开不推断失败、不自动重复执行，重连后重新查询；
- Queued/Running 禁止重复执行，Finished/Failed 后允许创建新的 execution UUID；
- offline、permission、state conflict 和网络不确定错误文案准确；
- Tasks 与 Track detail 打开的同一 Task 行为一致；
- 页面不存在任何其他新增写操作；
- Chrome、iPad 横屏、iPad 竖屏完整矩阵通过后再部署。

## 十八、Execute 确认门

鹿鹿子大王确认后，再修改 Web Task Execute 代码、测试、提交并部署。
