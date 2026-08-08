> 更新日期：2026-08-08
> 更新说明：在已部署的身份、DM 和实时消息修复基础上，补充 Agent/User 默认头像、消息 Markdown、会话底部定位、统一窄边距与发送/等待回复状态、安全内容面板、Calendar 轻边框及 Task 完整呈现要求。

# Web 身份、DM、Channel 与 Sidebar 一致性修复方案

## 一、问题结论

当前 Web 虽然能读取 Relay 数据，但没有复刻 Desktop 的“数据投影规则”，导致同一个 user key 在两个端看到不同结果。

### 1.1 用户名错误

Web Sidebar 和 Settings 直接写死为 `Buzz User`，只使用 signer 返回的 user pubkey，没有读取当前用户最新的 kind `0` profile。Desktop 使用 `display_name -> name -> pubkey` 的回退顺序，因此 Web 必须采用同一规则。

### 1.2 DM 没有显示 Agent 名称

Web 当前直接显示 kind `39000` channel metadata 的 `name`。对于名称为 `dm`、`direct message` 或 `group dm` 的通用 DM，Desktop 会：

1. 从 channel 的 participant pubkeys 排除当前用户；
2. 批量读取参与者最新 kind `0` profile；
3. 使用 `display_name -> nip05 -> metadata fallback -> pubkey` 生成名称；
4. 通过经过验证的 NIP-OA owner 信息识别 Agent。

Web 没有执行这条解析链，所以无法显示 Hermes、Codex 等 Agent 名称。

### 1.3 DM/Channel 数量不一致

Web 当前把 Relay 返回的所有 kind `39000` metadata 都放进 Sidebar。Desktop Sidebar 实际只显示：

- 当前用户仍在最新 kind `39002` membership snapshot 中的 channel；
- `archived_at` 为空的 channel；
- DM 还要排除当前用户 kind `30622` visibility snapshot 中隐藏的 channel id；
- 同一 addressable coordinate 只保留最新事件；
- 被 Relay 删除、归档、离开或隐藏的项目不进入 Sidebar。

因此 Web 当前会多显示公开但未加入的 Channel、已归档 Channel、已隐藏 DM，并可能保留旧 metadata。

### 1.4 切换标签时 Sidebar 清空

每个 Calendar/Tasks/Tracks/Inbox/Channel 页面都独立挂载 `useWorkConsoleData()` 和 `DesktopParityAppShell`。切换路由时旧页面卸载，新页面状态从 `loading` 开始，Sidebar 收到空数组；等全量查询完成后才恢复。

正确结构是 `/app` 只有一个持久 App Shell 和一个共享数据 Provider。切换标签只替换右侧 Outlet，Sidebar 与上一份成功数据不能卸载。

### 1.5 Channel 时间线没有 Agent 名称

Web 时间线目前把非自己的 author 显示成 `${pubkey.slice(0, 12)}…`，没有使用 profile lookup。因此即使 DM 标题修好，Channel 内 Agent 发出的消息仍显示公钥。时间线作者、头像、DM 标题和 `@` 候选必须消费同一份经过验证的 profile lookup，避免四处产生不同名称。

### 1.6 Composer 无法 `@Agent`

Web 当前只有普通 textarea，没有 mention candidate、名称匹配和选中状态。发送函数虽然已经支持传入 `mentionPubkeys` 并生成 `p` tags，但 UI 从未提供这些 pubkeys，所以普通 Channel 消息无法通知 Agent。

Desktop 的产品语义是：

- 普通 Channel 只通知显式选择的 `@mention`；
- DM 自动把其他参与者加入 recipient p tags，即使正文没有 `@`；
- 候选来自当前 Channel 最新 membership，而不是全 Relay 用户；
- 候选显示 profile 名称和 Agent 状态，最终发送时携带精确 pubkey；
- 只输入无法唯一解析的 `@名字` 不能悄悄发成没有 p tag 的普通文本。

### 1.7 消息发出后没有 Agent 回复

当前 Web 只有“发送成功后立即执行一次全量 refresh”，没有订阅当前 Channel 的 kind `9/40002` 实时事件。Agent 通常在这次 refresh 完成之后才回复，因此回复不会进入当前页面，只有再次手动刷新才可能看到。

完整消息闭环必须包含：

1. 发送成功后立即把已签名事件合并进时间线，避免等待 Relay 回读；
2. 当前 Channel 建立带明确 `kinds` 和 `#h` 的实时 WebSocket 订阅；
3. 收到经过验签的 Agent 回复后按 event id 去重并追加；
4. 路由切换时只切换 Channel subscription，不重建整个工作台数据；
5. WebSocket 断线重连后执行一次 HTTP catch-up，再恢复实时订阅；
6. 页面从后台或设备睡眠恢复时执行 catch-up，避免漏掉 Agent 回复。

### 1.8 DM 消息聚合和展示顺序错误

Web 当前没有对消息排序，只按 `/query` 返回数组顺序展示；同时用“同 author 且相差小于 300 秒”自行隐藏头像和作者。这不是 Desktop 的时间线规则，因此会出现：

- 同秒消息顺序不稳定；
- 历史查询和实时消息合并后前后颠倒；
- thread reply 被当成普通顶层消息；
- deletion/edit/reaction 等事件没有经过投影；
- 日期分隔缺失；
- 连续消息被错误聚合。

本轮不再维护 Web 专属的简化时间线。直接以 Desktop 下列纯逻辑与 DOM/class 为事实源：

- `messageQueryKeys.ts`：按 `created_at ASC, event id ASC` 去重并稳定排序；
- `formatTimelineMessages.ts`：过滤 deletion target、投影 edit/reaction/system/content；
- `threadPanel.ts`：区分顶层消息、thread reply 和 summary；
- `timelineItems.ts`：日期分组与系统消息分组；
- `messageGrouping.ts`：连续消息作者/时间边界；
- `TimelineMessageList.tsx`、`MessageRow.tsx`、`DayDivider.tsx`：保持 Desktop DOM、间距、头像、作者、时间与正文样式。

这些 browser-safe 纯逻辑应提取到共享包或逐文件移植；不能直接从 Web 跨目录 import Desktop 的 Tauri hooks，但不能再次自行发明另一套规则。

### 1.9 DM 与消息行没有使用 Agent 头像

Web 已经查询并解析 kind `0.picture`，但 Sidebar 的 DM 仍固定显示状态图标，时间线与 `@` 候选仍显示文字缩写，数据没有进入最终呈现层。Desktop 的一对一 DM 使用另一位参与者的头像并叠加 presence 状态；消息行使用作者的 `avatarUrl`，仅在图片缺失或加载失败时回退到名称首字母。

Web 必须统一使用 `profilesByPubkey[pubkey].avatarUrl`，并覆盖 Sidebar DM、Channel 顶栏、消息行和 mention 候选。群组 DM 保持 Desktop 的参与者数量图标规则，不能随意选择某一个 Agent 头像冒充整个群组。

### 1.10 DM 与 Channel 正文没有 Markdown

Web 当前使用纯 `<p>` 输出 `message.content`，所以标题、列表、引用、链接、行内代码、代码块和 GFM 表格都不会按 Desktop 消息样式呈现。Web 已安装 `react-markdown` 与 `remark-gfm`，本轮建立消息专用 `MessageMarkdown`，复刻 Desktop 的正文排版和链接行为。

安全边界如下：

- 不启用原始 HTML，避免 Relay 消息注入脚本或任意 DOM；
- 链接只允许安全协议，外链使用新窗口和 `noopener noreferrer`；
- 图片只允许明确支持的远程协议，并限制最大尺寸，加载失败不能破坏时间线；
- 代码块、表格和长 URL 在 iPad 上横向滚动，不能撑宽整个内容面板；
- `@mention`、Channel 链接、自定义 emoji 和附件增强后续按 Desktop 插件逐项移植，本轮不能宣称已经具备完整 Desktop Markdown 扩展能力。

### 1.11 浅色内容与右侧详情面板背景错误

Web 把 Catppuccin Latte 的灰色 `--background` 同时用作应用外层和内容卡片，导致主内容及 Task、Track、Calendar 等右侧详情区域呈灰色。Desktop 的 Buzz Light 视觉语义是：外层保留渐变和灰色层次，`data-buzz-content-surface` 及其内部详情画布为白色；Buzz Dark 继续使用 `--buzz-content-dark`，不能被强制改白。

本轮增加独立的内容面板语义色，并让主 content surface、Task detail、Track detail、Calendar event detail 和 Settings 内容区域消费同一语义。Sidebar、hover、muted、卡片和深色主题不做全局漂白，避免丢失层级。

### 1.12 Tasks 与 Tracks 导航图标错误

Desktop Sidebar 的 Tasks 使用 Lucide `ListTodo`，Tracks 使用 Lucide `Route`，图标尺寸均为 16px。Web 当前分别使用 `CheckSquare2` 和 `Waypoints`，即使文字、间距和激活色一致，轮廓语义仍明显不同。

Web 应直接使用 Desktop 的同名 Lucide 图标，并保持 `size-4`、`shrink-0`、激活态颜色和折叠态位置不变；不要通过 CSS 或自制 SVG 模拟。

### 1.13 Task 卡片边框过重且缺少 Track 筛选

Web Task Board 当前把白色卡片直接放在白色内容画布上，使用 `border-border`、`shadow-sm`，hover 时上浮并增强阴影。Desktop 则用 `bg-muted/40` 的圆角列承载卡片，卡片使用 `shadow-xs`，hover 为 `border-primary/30 + bg-muted/30`，不做位移。边框观感差异来自整套层级关系，不能只随意降低一条边框透明度。

Web 还缺少 Desktop 顶部的 `Filter by track`：当存在 Track 时显示下拉框，默认 `All tracks`，选择后只显示 `task.trackId` 精确匹配的任务，并同时作用于 Board 与 List。选择应写入 `track` URL search，刷新、前进后退和分享链接后仍能恢复；清除筛选则移除该参数。Track 本身存在但当前没有任务时，应显示明确空状态，而不是悄悄退回全部任务。

Desktop Board 还提供 `Group by Assignee / Status / Track`，默认是 Assignee。Web 当前固定按 Status 分列，因此也不一致。Assignee 分组必须包含 `Unassigned`，并按 Desktop 顺序排列：未分配优先、当前用户优先、其余按任务数降序再按名称排序；默认隐藏空列，可通过 `Show empty groups` 显示。每列标题显示真实名称、Agent/Person/No owner 类型和任务数。Web 首版保持只读，不加入 Desktop 的拖拽改派行为。

`group` 选择同步到 URL，允许值仅为 `assignee`、`status`、`track`；非法值回退 `assignee`。List 视图不显示分组列，但必须保留当前 group 参数，切回 Board 后恢复原分组。

### 1.14 Task 卡片内容不完整

Web 卡片目前只有标题、可选描述、全部 labels 和 priority，缺少 Desktop 的主要工作状态信息。Desktop `TaskCard` 的固定信息结构为：

1. 标题，两行截断；
2. 描述，两行且保留固定高度，无描述时显示弱化的 `No description`；
3. 状态 badge；
4. 执行状态为 queued、running、failed 时显示 execution badge；
5. Track 名称；
6. 最多两个 labels，超出显示 `+N`；
7. 非 `none` priority，urgent 使用 destructive 色；
8. due date，逾期使用警告图标和 destructive 色；
9. assignee 名称与 person/Agent 图标，Agent 额外标记 `· Agent`。

Web 已解析 status、priority、assignee、due、trackId 和 labels，但还没有把 Track id 映射为名称，也没有为 task assignee 补齐 profile lookup；kind `30501` task execution state 也尚未进入 Web 工作数据。因此本轮需要补齐数据投影后再复刻卡片，不能用公钥截断或写死占位冒充 Desktop 信息。执行状态必须只接受 Relay 签发的最新 replaceable state，不能信任任意作者伪造的 kind `30501`。

### 1.15 Agent 与 User 默认头像缺少身份区分

Web 统一头像组件当前无论身份都使用 `bg-muted`，Agent 和普通 User 在没有 profile picture 或图片加载失败时完全相同。Desktop 通用 `UserAvatar` 已提供 accent/secondary 两套 fallback：Agent 身份列表通常使用 primary 强调色，普通用户使用 secondary。

Web 将身份色规则统一为：真实头像优先且不染色；默认头像中 Agent 使用 `bg-primary text-primary-foreground`，普通 User（包括当前用户）使用 `bg-secondary text-secondary-foreground`。`isAgent` 必须来自已有的 profile/NIP-OA 验证投影，不能根据名称、DM 类型或是否回复消息猜测。图片加载失败后仍保持对应身份色；Sidebar DM、消息行、mention 候选、Task assignee 和当前用户资料卡必须消费同一组件规则。

### 1.16 进入 DM 后没有定位到最新消息

Web 时间线当前没有滚动锚点逻辑，进入长 DM 时停留在列表顶部，用户必须手动滚到最新消息。Desktop 在首次进入或切换 Channel 时，等待首批消息真实布局完成后定位到底部；DM 与普通 Channel 使用相同时间线策略。

实现不能变成每次更新都无条件 `scrollToBottom()`。正确边界是：

- 首次进入会话、首批消息渲染完成后无动画定位到物理底部；
- 从一个 DM/Channel 切换到另一个时，为新 channel id 重置并定位其底部；
- 用户处于底部附近时，新消息到达继续贴底；
- 用户已向上阅读历史时，新消息不抢滚动位置，并保留“有新消息/回到底部”的后续扩展接口；
- 用户发送自己的消息时，即使此前向上阅读，也应回到底部看到发送结果；
- Markdown、头像或图片加载导致行高变化时，如果仍处于贴底状态，应在布局稳定后继续追到底部；若正在阅读历史，则保持可见消息锚点；
- 空会话、短于视口的会话、iPad 软键盘收起/展开不能产生错误跳动。

### 1.17 Calendar 三种视图边框过重

Web 的 Day、Week、Month 网格目前都使用不透明 `border-border`，在已改为白色的内容画布上对比明显过强。Desktop 对 Calendar 的结构线统一使用 `border-border/60`：Toolbar、Sidebar 分隔、Day/Week 顶栏与日期列、Month 星期标题与日期单元格均如此；Day/Week 小时线进一步使用 `hsl(var(--border) / .5)` 的半透明背景渐变，而不是每个小时格同时画完整横线和竖线。

Web 应复刻这一层级：结构分隔线使用 `/60`，小时刻度线使用 `/50`，事件块继续保留清晰的 primary 左边框；今天、选中事件和 hover 通过背景色表达，不能再靠加重网格边框。Day 与 Week 共用同一 TimeGrid 规则，Month 单独覆盖 7×6 网格，三种视图都要在 Light/Dark 下验收。

### 1.18 DM/Channel 消息与输入框左右留白过宽

Web 当前为消息列表和 Composer 分别套了 `mx-auto max-w-4xl px-5`。在 Desktop 宽屏或 iPad 横屏上，`max-w-4xl` 会产生大块无效留白；消息行内部又额外 `px-2`，导致消息正文边界和输入框边界看似相近但并未精确对齐。

Desktop 时间线采用接近全宽的小 gutter：滚动区 `px-2`、消息 row `mx-1`，Composer 也只保留必要的外侧触控间距。Web 本轮移除消息区与输入区的居中最大宽度，建立一个共享的 conversation gutter。消息时间线容器、日期分隔、空状态、mention 浮层和 Composer 外框都以同一左右边界为准；消息 row 内部的头像与正文间距保持 Desktop 结构，不把内容贴到屏幕边缘。

建议共享 gutter 为窄屏 8px、常规宽度 12px，输入框和消息 hover row 的外沿必须像素级一致。安全区仍由页面根部 `env(safe-area-inset-*)` 负责，不能在会话内部重复叠加。

### 1.19 DM 发送后缺少可视化反馈

Web 当前只有 `sending: boolean`，效果仅是暂时禁用 textarea 和发送按钮；Relay 接受后立即清除该状态并执行全量 refresh，没有乐观消息、送达元信息或等待回复提示。网络和远程 signer 稍慢时，用户会觉得点击没有生效；发送完成但 Agent 尚未回复时，页面又恢复成完全静止。

Web 应建立明确的发送状态机：

```text
idle
  -> signing-and-sending
  -> accepted / failed
accepted
  -> optimistic message shown with sent acknowledgement
  -> waiting-for-reply (DM with another participant)
  -> replied / still-waiting
```

产品语义：

- 点击发送后立即保留消息内容并显示 `正在签名并发送…`，防止重复提交；
- Relay 返回已接受后，用真实签名 event id 将本人消息立即合并到当前时间线，显示短暂 `已发送`，不能等待全量查询；
- Relay 回放同一个 event id 时只去重/确认，不生成第二条消息；
- 一对一或群组 DM 在已发送后显示 `等待 <参与者> 回复…`；普通 Channel 只显示发送状态，不假设某个 Agent 必须回复；
- 收到 createdAt 晚于本次发送、作者不是当前用户的当前 Channel 新消息后，清除等待状态；
- 30 秒后文案变为 `仍在等待回复`，这是等待超时而不是发送失败；切换 Channel 后状态按 channel id 保留或恢复，不能串到别的会话；
- signer、Relay、HTTP 或验签失败时不清空草稿，显示可读错误和 `重试`；重试复用正文与 mention pubkeys，但生成新的签名事件，避免重复复用旧 AUTH；
- 页面刷新后不能凭空恢复“正在工作”状态；只可根据 Relay 已确认消息展示已发送内容。

Desktop 本地 Agent observer 能提供真实 working signal，但 Web 当前没有该远程事件源。因此本轮文案使用 `等待回复`，不能虚假显示 `Agent 正在思考/工作`。后续只有接入经过验证的 typing/observer 事件后，才升级为真实 working indicator。

## 二、产品目标

- Sidebar profile 显示当前 Buzz 用户真实名字与头像；
- 通用 DM 显示另一位参与者/Agent 的真实 profile 名称；
- Web Sidebar 的 DM、Channel 数量与 Desktop 使用同一过滤规则；
- 切换 Inbox、Calendar、Tasks、Tracks、DM、Channel 时 Sidebar 不闪空、不重置滚动位置；
- 后台刷新时保留旧数据，只显示轻量 refreshing 状态；
- Relay 查询失败不能清空已加载 Sidebar。
- Channel 与 DM 时间线显示真实用户/Agent 名称和头像；
- 输入 `@` 出现当前 Channel 成员候选，选择 Agent 后正文保留可读名称且事件携带对应 `p` tag。
- 消息发出后立即回显，Agent 回复无需手动刷新即可出现在当前 DM/Channel。
- 一对一 DM、消息作者和 mention 候选显示 kind `0.picture` 头像，加载失败时稳定回退；
- DM/Channel 正文支持安全 Markdown 与 GFM，排版和 Desktop 保持一致；
- 浅色模式主内容和所有右侧详情区域为白色，深色模式保持 Desktop 暖黑内容画布。
- Tasks 使用 `ListTodo`、Tracks 使用 `Route`，尺寸和导航状态与 Desktop 一致。
- Task Board 的列背景、卡片边框、阴影和 hover 层级与 Desktop 一致；可按 Track 筛选 Board 与 List，并按 Assignee、Status、Track 分组。
- Task 卡片完整显示 Desktop 的描述、状态、执行状态、Track、标签计数、优先级、到期日和 assignee 信息。
- 无真实头像时 Agent 使用 primary 默认头像、普通 User 使用 secondary，所有页面保持一致。
- 首次进入或切换 DM/Channel 时默认显示最新消息，阅读历史时不被实时回复强制拉回底部。
- Calendar Day、Week、Month 使用 Desktop 的轻量结构线与小时刻度，白色画布上不再出现重网格。
- DM/Channel 移除宽屏最大宽度限制，消息与输入框使用同一窄 gutter 并严格对齐。
- DM 发送后立即显示签名/发送、乐观消息、已发送、等待回复或失败重试状态，不再出现无反馈空窗。

## 三、统一数据模型

`WorkConsoleData` 增加：

- `currentProfile`：当前用户 profile；
- `profilesByPubkey`：DM 参与者、消息作者和 Agent profile；
- `membersByChannelId`：每个可见 Channel 最新 membership pubkeys；
- `messagesByChannelId`：HTTP 初始快照、发送回显和实时事件按 id 合并后的消息集合；
- `memberChannelIds`：当前用户最新 membership 投影；
- `hiddenDmIds`：当前用户最新 kind `30622` 隐藏列表；
- Channel 增加 `isMember`、`archivedAt`、`displayName`；
- Sidebar 只消费投影后的 `sidebarChannels`，不直接消费全部 metadata。

数据加载分两段：

1. 第一段读取 channel metadata、当前用户 membership、DM visibility、消息、工作数据和当前 profile；
2. 从可见 DM 与消息中收集 pubkeys，再批量读取这些 pubkeys 的 kind `0` profile；
3. 合并最新 replaceable state，生成与 Desktop 相同的 Sidebar snapshot。
4. 使用同一 profile lookup 生成 DM label、timeline author 和 mention candidates。

## 四、过滤规则

```text
latest channel metadata by d tag
  -> channel id 必须存在于 current user's latest membership snapshots
  -> archived != true
  -> DM additionally not in latest kind 30622 hidden h tags
  -> generic DM name resolved from other participants' profiles
  -> sort with Desktop sidebar ordering
```

公开但未加入的 Channel 仍可在未来的 Channel Browser 中显示，但不能进入主 Sidebar。

对于删除：Relay 已执行的 NIP-09/软删除结果应以查询结果为准；客户端额外处理 `archived=true`、membership 移除和 DM visibility，不用本地猜测已删除记录。

## 五、持久 App 布局

新增 `/app` 父路由布局：

```text
AppWorkConsoleLayout
  -> WorkConsoleProvider (mounted once)
  -> DesktopParityAppShell (mounted once)
     -> WebAppSidebar (keeps last successful snapshot)
     -> Outlet (only page body changes)
```

页面不再各自创建 Shell。Provider 使用 stale-while-refresh 策略：

- 首次加载才显示 loading；
- 已有数据时 refresh 不替换为 loading；
- refresh 失败保留旧 snapshot；
- 同一时间只允许一个全量加载 promise；
- route 切换不触发重复全量加载；
- Pair 身份变化时显式 reset，防止跨身份数据泄漏。

Settings 使用同一个父布局，但可注入 Settings 专用 sidebar presenter；Pair 页面不读取工作数据。

## 六、测试要求

- kind `0` 同时有 `display_name` 和 `name` 时优先 `display_name`；
- 用户 profile 缺失时回退到 pubkey，不显示写死的 `Buzz User`；
- generic DM 使用另一参与者的 profile 名称；自聊和 group DM 有稳定回退；
- membership 中不存在的公开 Channel 不进入 Sidebar；
- `archived=true` Channel 不进入 Sidebar；
- kind `30622` 隐藏的 DM 不进入 Sidebar；
- 新旧 metadata、membership、visibility 同时存在时只采用最新 replaceable state；
- 连续切换六个路由时 `app-sidebar` DOM 不卸载、宽度和内容不闪空；
- refresh 失败时保留上次成功数据；
- Pair user key 改变时清空旧 profile/channel snapshot。
- Channel 中 Agent 消息显示 profile `display_name`，不显示截断 pubkey；
- 输入 `@` 后只列出当前 Channel 成员，Agent 候选有明确标识；
- 选择 `@Hermes` 后发送事件正文包含可读名称，tags 包含 Hermes 的完整 pubkey；
- 同名候选必须通过选择绑定 pubkey，不能仅按文本猜测；
- DM 不输入 `@` 仍自动携带其他参与者 p tags；普通 Channel 不选择候选则不添加 p tag；
- 已离开、已归档 Agent 不进入 mention candidates。
- 发送成功后时间线立即出现该 event id，Relay 回放不得生成重复消息；
- Agent 延迟回复通过实时 subscription 自动出现；
- 强制断开实时 WebSocket、期间注入回复、恢复后 catch-up 不丢消息；
- 切换 DM/Channel 时旧 `#h` 订阅被关闭，新订阅只接收当前 channel；
- 伪造签名、错误 `h` tag、错误 subscription id 的事件必须忽略；
- iPad 切后台再回来能够补回后台期间的回复。
- 输入顺序随机的消息必须输出为 `created_at ASC, event id ASC`；
- HTTP 快照、发送回显和实时事件合并后顺序稳定且 event id 唯一；
- thread reply 不作为普通顶层消息重复展示；
- deletion target 消失，edit/reaction 不作为普通正文行；
- 日期分隔和连续消息分组与 Desktop 固定 fixture 的投影完全一致；
- Web 与 Desktop 使用相同 fixture 时，时间线 row keys、row kinds、作者、时间和顺序逐项相等。
- Agent profile 含 `picture` 时，DM Sidebar、消息行和 mention 候选都显示同一头像 URL；图片 404 时显示稳定首字母回退。
- 群组 DM 显示参与者数量而不是错误使用首位参与者头像。
- Markdown 覆盖标题、强调、列表、引用、链接、行内代码、代码块、表格与换行；原始 HTML 和危险协议不能生成可执行内容。
- 超长代码、表格和 URL 在 iPad 竖屏中不造成页面级横向溢出。
- 浅色模式 `content-surface`、Task detail、Track detail、Calendar detail 和 Settings 内容画布的计算背景为白色；Sidebar 仍保留原主题色。
- 深色模式上述区域保持 Desktop 暖黑背景，不被白色规则覆盖。
- Sidebar 的 Tasks 图标 SVG 对应 `ListTodo`，Tracks 图标 SVG 对应 `Route`，并在普通、激活和折叠状态保持 16px 几何尺寸。
- Task Board 列使用 Desktop 的 muted 容器层级，卡片不再使用上浮和重阴影；普通与 hover 边框计算颜色纳入视觉回归。
- 存在 Track 时显示 `Filter by track`，默认 `All tracks`；选择 Track 后 Board、List 仅显示匹配 `trackId` 的任务。
- Track 筛选同步到 URL `track` 参数，刷新和浏览器前进后退可恢复；清除后移除参数。
- 所选 Track 没有任务时显示筛选空状态；任务没有 `trackId` 时不进入任一具体 Track 筛选结果。
- Task 卡片各字段顺序、两行截断、描述占位与 Desktop 一致；labels 最多两个并显示剩余数量。
- Track id 映射为 Track 名称；assignee pubkey 映射为真实 profile 名称和 Agent/person 类型，不显示截断公钥作为正常结果。
- due date 使用本地日期并区分逾期；priority 为 `none` 时隐藏、urgent 使用警告色。
- queued、running、failed execution badge 只来自 Relay 签发的最新 kind `30501`；伪造作者和旧状态必须忽略。
- Board 默认按 Assignee 分组，包含 `Unassigned`，并遵循 Desktop 的当前用户、任务数和名称排序规则。
- `Group by` 支持 Assignee、Status、Track，选择写入 URL `group`；刷新、前进后退及 List/Board 切换后保持。
- 默认隐藏无任务分组；`Show empty groups` 开启后显示完整 assignee/status/track 列，非法 group 参数安全回退 Assignee。
- 有真实 picture 时 Agent/User 均原样显示图片；没有图片或加载失败时，Agent 使用 primary、User 使用 secondary。
- Sidebar DM、消息行、mention、Task assignee 和个人资料卡对同一 pubkey 的默认头像颜色必须一致。
- `isAgent=false` 或身份未验证时保守按普通 User 呈现，不能通过名称或所在 DM 推断为 Agent。
- 长会话首次进入和 channel id 切换后，消息容器停在物理底部，最新消息及 composer 可见。
- 用户主动上滚超过 Desktop 的 32px 底部阈值后，新消息不改变当前阅读锚点；回到底部后恢复贴底。
- 从 Web 发送消息时触发一次性到底部意图；历史补载和同一批数据刷新不能误触发。
- Markdown/图片异步增高、iPad viewport/软键盘变化时，贴底状态继续落在底部，历史阅读状态保持原锚点。
- Calendar Sidebar/Toolbar/Day/Week/Month 结构线计算颜色为 `border/60`，小时刻度为 `border/50`；事件 primary 边框不被弱化。
- 三种 Calendar 视图在 Light/Dark 与 iPad 横竖屏下均保持可辨识但不抢眼的网格层级。
- 消息列表和 Composer 不再包含 `max-w-4xl` 居中约束；常规宽度左右 gutter 约 12px，紧凑宽度约 8px。
- 消息 hover row、日期分隔、空状态、mention 浮层和输入框外框的左右边界一致，误差不超过 1px。
- 1366px Desktop、iPad 横屏和竖屏下，会话正文可用宽度明显增加且无页面级横向溢出。
- 点击发送后一个渲染帧内出现发送状态；Relay 接受后本人消息立即按真实 event id 回显并显示 `已发送`。
- Relay 回放不得重复乐观消息；DM 收到对方更新消息后清除等待状态，30 秒无回复改为 `仍在等待回复`。
- 失败时草稿、mentions 和错误信息保留，可明确重试；Channel 切换时各会话状态互不污染。
- 普通 Channel 不显示虚假的 Agent working；没有验证信号时统一使用 `等待回复` 语义。

## 七、Todo List

- [ ] `web/src/shared/domain/eventKinds.ts`：保留已有 profile/visibility 常量，并补充 Desktop 的 kind `30501` task execution state。
- [x] `web/src/features/profile/types.ts`：定义 Web profile 与 profile lookup 类型。
- [x] `web/src/features/profile/eventCodec.ts`：解析并合并最新 kind `0` profile，使用 Desktop 的名称回退规则。
- [x] `web/src/features/channels/types.ts`：补充 `isMember`、`archivedAt`、`displayName` 和 Sidebar 投影字段。
- [x] `web/src/features/channels/eventCodec.ts`：解析 archived 状态并支持 Sidebar 投影。
- [x] `web/src/features/channels/channelLabels.ts`：移植 Desktop generic DM 名称与参与者 profile 解析规则。
- [ ] `web/src/features/messages/mentionCandidates.ts`：从当前 Channel membership 与 profile lookup 生成唯一、可搜索的用户/Agent 候选。
- [ ] `web/src/features/messages/MentionAutocomplete.tsx`：实现键盘、触控可用的 `@` 候选浮层和明确选择。
- [ ] `web/src/features/messages/MessageComposer.tsx`：维护已选择 mention 的名称到 pubkey 绑定，并把 pubkeys 交给发送层。
- [ ] `web/src/features/messages/messageProjection.ts`：移植 Desktop 去重、`created_at + id` 稳定排序、删除/edit/reaction 和 thread 顶层投影规则。
- [ ] `web/src/features/messages/messageGrouping.ts`：移植 Desktop 连续消息与日期分组边界，不再使用 Web 的 5 分钟简化判断。
- [ ] `web/src/features/messages/MessageRow.tsx`：按 Desktop DOM/class 渲染头像、作者、时间、正文和连续消息状态。
- [x] `web/src/features/messages/MessageMarkdown.tsx`：使用现有 Markdown 依赖实现安全协议、GFM 与 Desktop 正文组件映射。
- [x] `web/src/shared/ui/ProfileAvatar.tsx`：在已有图片/首字母回退上增加经过验证的 Agent primary 与 User secondary 默认身份色。
- [ ] `web/src/features/messages/DayDivider.tsx`：按 Desktop 时间格式与布局渲染日期分隔。
- [x] `web/src/features/messages/channelMessageSession.ts`：实现当前 Channel 的实时订阅、验签、断线重连和事件触发 catch-up。
- [ ] `web/src/features/messages/useChannelMessages.ts`：合并初始快照、发送回显与实时回复，并在 channel id 变化时切换订阅。
- [ ] `web/src/features/messages/useMessageDelivery.ts`：管理按 channel 隔离的 signing、accepted、waiting、still-waiting、failed 状态与 event-id 去重。
- [ ] `web/src/features/messages/MessageDeliveryStatus.tsx`：呈现发送、已发送、等待回复、超时和失败重试状态，保持 Desktop 消息元信息样式。
- [x] `web/src/features/messages/useMessageScroll.ts`：实现 Desktop 32px 贴底阈值、首次/切换定位和一次性发送贴底策略。
- [ ] `web/src/shared/api/communitySession.ts`：保留已有工作数据投影，补查 assignee profile 与 Relay 签发的最新 task execution state。
- [ ] `web/src/shared/hooks/WorkConsoleProvider.tsx`：建立持久共享状态、请求去重、last-good snapshot 和身份 reset。
- [x] `web/src/shared/hooks/useWorkConsoleData.ts`：改为模块级共享请求与 last-good snapshot，路由切换不再闪空。
- [ ] `web/src/app/routes/app.tsx`：新增持久 `/app` 父布局与 Outlet，Pair/Settings 处理明确边界。
- [ ] `web/src/shared/ui/DesktopParityAppShell.tsx`：支持持久 Outlet 与 Settings sidebar，而不在业务页重复挂载。
- [x] `web/src/features/sidebar/WebAppSidebar.tsx`：保留 DM 头像和导航图标，并向 DM/当前用户头像传递真实 `isAgent` 身份。
- [ ] `web/src/features/settings/SettingsPage.tsx`：保留已完成的真实用户 profile，并让 Settings 主内容区域使用统一内容面板背景语义。
- [ ] `web/src/features/inbox/InboxPage.tsx`：移除页面级 Shell，消费共享 Provider。
- [ ] `web/src/features/channels/ChannelsPage.tsx`：统一 conversation gutter，并接入乐观消息、真实 event id、DM 等待回复、失败草稿与重试交互。
- [x] `web/src/features/calendar/CalendarPage.tsx`：对齐 Sidebar/Toolbar、Day/Week 与 Month 的 `/60` 轻量结构线并保持白色详情画布。
- [x] `web/src/features/tasks/TasksPage.tsx`：复刻 Desktop 列/卡片视觉层级，增加 Track 筛选、Assignee/Status/Track 分组、空列开关及 URL search 同步。
- [ ] `web/src/features/tasks/types.ts`：对齐 Desktop Task priority、due timestamp 与 TaskExecution 类型，使用明确 null 语义。
- [ ] `web/src/features/tasks/eventCodec.ts`：对齐 Desktop Task 字段解析，并严格解析、验证最新 task execution state。
- [ ] `web/src/features/tasks/taskPresentation.ts`：提供 Track 名称、assignee profile、due/overdue 和状态 badge 的 browser-safe 纯呈现投影。
- [ ] `web/src/features/tasks/taskBoard.ts`：移植 Desktop assignee/status/track 列构建、列排序、卡片排序与空列规则。
- [ ] `web/src/features/tracks/TracksPage.tsx`：移除页面级 Shell、保留 Sidebar，并让 Track 列表与右侧详情使用统一内容面板背景语义。
- [x] `web/src/shared/styles/globals.css`：增加 Desktop Light 白色内容面板和 Dark 暖黑画布语义，并补齐消息 Markdown 排版规则。
- [x] `web/tests/e2e/domain-codecs.spec.ts`：覆盖 profile、Agent DM label、最新 profile 和稳定消息排序。
- [ ] `web/tests/e2e/task-presentation.spec.ts`：覆盖完整卡片字段、Agent assignee 默认色、三种分组、列排序、URL 恢复、Track 筛选和 execution 防伪。
- [ ] `web/tests/e2e/avatar-identity.spec.ts`：覆盖 Agent/User 默认色、真实图片优先、图片失败回退及跨 Sidebar/消息/mention 的一致性。
- [ ] `web/tests/e2e/message-scroll.spec.ts`：覆盖长 DM 首次进入、会话切换、底部新消息、历史阅读不抢位、发送贴底、异步行高和 iPad viewport。
- [ ] `web/tests/e2e/message-layout.spec.ts`：覆盖 Desktop/iPad 三种视口的消息行与输入框边界对齐、可用宽度和无横向溢出。
- [ ] `web/tests/e2e/message-delivery.spec.ts`：覆盖慢 signer、Relay 接受、乐观去重、DM 回复、30 秒等待、失败重试、Channel 隔离和刷新边界。
- [x] `web/tests/e2e/work-console.spec.ts`：覆盖 Task 完整卡片、Track 筛选、三种分组、Board/List、会话底部定位和 Agent/User 默认头像色。
- [ ] `web/tests/e2e/message-mentions.spec.ts`：覆盖 Channel `@Agent` 候选、键盘/触控选择、p tag、同名歧义和 DM 自动 recipient。
- [ ] `web/tests/e2e/message-timeline.spec.ts`：用乱序、同秒、reply、delete、edit、reaction fixture 对照 Desktop 投影与 row 顺序。
- [ ] `web/tests/e2e/message-presentation.spec.ts`：覆盖 Agent 头像、图片失败回退、Markdown/GFM、危险输入和 iPad 横向溢出。
- [ ] `web/tests/e2e/desktop-parity.visual.spec.ts`：覆盖内容画布、Sidebar、导航图标及 Calendar Day/Week/Month 在 Light/Dark 下的边框透明度。
- [ ] `web/tests/helpers/desktopParityFixtures.ts`：增加 profile、未加入、已归档和隐藏 DM fixture。
- [ ] `docs/2026-08-08-web-identity-dm-channel-sidebar-consistency-plan.md`：记录验证、部署号和 commit。

## 八、验收标准

- Web profile 名称与 Desktop 当前用户一致；
- Web DM 名称与 Desktop 同一个 DM 的名称一致；
- Web Channel/DM 时间线中的 Agent 作者名称与 Desktop 一致；
- Web 一对一 DM、消息行和 mention 候选中的 Agent 头像与 Desktop 使用同一 profile picture；
- Web 消息 Markdown 的常用语法、代码与表格样式和 Desktop 一致，危险 HTML/协议不可执行；
- Channel 中可以通过 `@` 候选准确提及 Agent，发布事件含正确 p tag；
- 从 Web 发出 DM/Channel 消息后立即回显，Agent 延迟回复无需刷新自动出现；
- DM/Channel 消息顺序、日期分组、连续消息聚合和顶层/thread 投影与 Desktop 一致；
- Web Sidebar 的 Channel/DM id 集合与 Desktop 一致，而不只比较数量；
- 六个标签连续切换时 Sidebar 内容始终可见且 DOM identity 不变；
- 浅色模式主内容及右侧详情为白色、深色模式保持暖黑，Sidebar 和层级色不受影响；
- Tasks 与 Tracks 的 Sidebar 图标、尺寸、激活态和折叠态与 Desktop 一致；
- Task 卡片边框、阴影、列背景与 Desktop 一致；Track 筛选及 Assignee/Status/Track 分组在 Board、List、刷新和浏览器历史中行为一致；
- Task 卡片在相同 fixture 下与 Desktop 显示相同的信息集合、顺序、状态颜色和缺省规则；
- 无真实头像时 Agent 与 User 可通过一致的 primary/secondary 默认头像视觉区分，且身份判断不依赖名称猜测；
- 首次进入长 DM/Channel 时直接看到最新消息；实时回复、发送、历史阅读与布局变化遵循 Desktop 的锚点策略；
- Calendar Day、Week、Month 的结构线、小时刻度、事件强调和 hover 层级与 Desktop 一致；
- DM/Channel 的时间线和 Composer 全宽利用率与 Desktop 一致，左右留白缩小且两者边界像素级对齐；
- DM 发送全过程始终有准确可视状态，乐观回显与 Relay 真实事件去重，等待回复和发送失败不会混淆；
- 完整 Chrome、iPad 横屏、iPad 竖屏 E2E 与视觉回归通过后再部署。

## 九、建设性建议

不建议继续在 Web 里增加零散 filter 修补。Sidebar、DM label 和 current profile 应统一由一个纯投影函数产生，并用 Desktop fixture 做集合级对照；否则以后增加 archive、leave、group DM 或多设备隐藏状态时仍会再次漂移。

## 十、确认门

鹿鹿子大王确认本方案后，再修改代码、补齐测试、提交并部署。

## 十一、实施验证记录

- Web typecheck、Biome、文件大小和 pubkey 展示检查通过；
- Chrome、iPad 横屏、iPad 竖屏完整矩阵共 59 项通过；
- 已覆盖真实 profile label、generic DM Agent label、消息 event-id 去重、`created_at + id` 稳定排序和 `@Agent` 交互；
- 当前 Channel 通过经过 NIP-42 AUTH 的 `#h` 实时订阅触发回复 catch-up，断线采用 500ms–5s 有界重连；
- 实现 commit：`c1b15e023 fix(web): align conversations with desktop data`；
- Cloudflare Pages 部署：`9eaf7013`；
- 单次部署与生产域名均确认加载 `index-DaHiymgG.js`；
- Desktop 与 Pair/Signer sidecar 保持运行，发布过程未重启或清除现有 Pair。
- 本轮新增统一 `ProfileAvatar` 与安全 `MessageMarkdown`，DM Sidebar、消息行和 mention 候选已消费 Agent profile picture。
- Tasks、Tracks Sidebar 图标已分别替换为 Desktop 使用的 `ListTodo` 与 `Route`。
- Buzz Light 的 content surface 与内部详情画布统一为白色；Buzz Dark 使用 Desktop 的暖黑内容背景。
- Web check、E2E build 通过；Chrome、iPad 横屏、iPad 竖屏完整矩阵 62 项通过。
- 本轮实现 commit：`12fb89756 fix(web): match desktop message presentation`；
- Cloudflare Pages 部署：`0c218edf`，生产域名确认加载 `index-DqqnDaEf.js` 与 `index-CgyV829m.css`。
- 本轮实现 commit：`5e47071fe fix(web): align task and conversation views`；
- Task Board 默认按 Assignee 分组，支持 Status/Track 分组、Track 筛选、空列开关，并显示描述、状态、Track、标签计数、priority、due 和真实 assignee。
- Agent/User 无图片回退分别使用 primary/secondary；DM/Channel 首次进入定位底部；Calendar 三种视图结构线已弱化。
- Web check 通过；本轮相关 Chrome/iPad 用例全部通过，完整矩阵 70/71 首轮通过，唯一外部 GitHub 新窗口超时用例单独复跑通过。
- Cloudflare Pages 部署：`26490388`，生产域名确认加载 `index-Dn7rCuJO.js` 与 `index-peKl3Z-b.css`。
