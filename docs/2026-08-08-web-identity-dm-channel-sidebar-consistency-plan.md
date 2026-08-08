> 更新日期：2026-08-08
> 更新说明：补充 DM/Channel 消息作者未显示 Agent 名称与 Composer 无法 `@Agent` 的问题；方案覆盖 profile、成员投影、提及候选、p tags 和持久 Sidebar。

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

## 二、产品目标

- Sidebar profile 显示当前 Buzz 用户真实名字与头像；
- 通用 DM 显示另一位参与者/Agent 的真实 profile 名称；
- Web Sidebar 的 DM、Channel 数量与 Desktop 使用同一过滤规则；
- 切换 Inbox、Calendar、Tasks、Tracks、DM、Channel 时 Sidebar 不闪空、不重置滚动位置；
- 后台刷新时保留旧数据，只显示轻量 refreshing 状态；
- Relay 查询失败不能清空已加载 Sidebar。
- Channel 与 DM 时间线显示真实用户/Agent 名称和头像；
- 输入 `@` 出现当前 Channel 成员候选，选择 Agent 后正文保留可读名称且事件携带对应 `p` tag。

## 三、统一数据模型

`WorkConsoleData` 增加：

- `currentProfile`：当前用户 profile；
- `profilesByPubkey`：DM 参与者、消息作者和 Agent profile；
- `membersByChannelId`：每个可见 Channel 最新 membership pubkeys；
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

## 七、Todo List

- [ ] `web/src/shared/domain/eventKinds.ts`：补充 kind `0` profile、kind `30622` DM visibility 和必要 membership 常量。
- [ ] `web/src/features/profile/types.ts`：定义 Web profile 与 profile lookup 类型。
- [ ] `web/src/features/profile/eventCodec.ts`：解析并合并最新 kind `0` profile，使用 Desktop 的名称回退规则。
- [ ] `web/src/features/channels/types.ts`：补充 `isMember`、`archivedAt`、`displayName` 和 Sidebar 投影字段。
- [ ] `web/src/features/channels/eventCodec.ts`：解析 archived、membership、DM visibility，并实现 latest snapshot 投影。
- [ ] `web/src/features/channels/channelLabels.ts`：移植 Desktop generic DM 名称与参与者 profile 解析规则。
- [ ] `web/src/features/messages/mentionCandidates.ts`：从当前 Channel membership 与 profile lookup 生成唯一、可搜索的用户/Agent 候选。
- [ ] `web/src/features/messages/MentionAutocomplete.tsx`：实现键盘、触控可用的 `@` 候选浮层和明确选择。
- [ ] `web/src/features/messages/MessageComposer.tsx`：维护已选择 mention 的名称到 pubkey 绑定，并把 pubkeys 交给发送层。
- [ ] `web/src/features/messages/MessageTimeline.tsx`：使用共享 profile lookup 渲染真实作者名称、头像和 Agent 标识。
- [ ] `web/src/shared/api/communitySession.ts`：分段查询 profile/membership/visibility，生成与 Desktop 一致的可见 Channel/DM 数据。
- [ ] `web/src/shared/hooks/WorkConsoleProvider.tsx`：建立持久共享状态、请求去重、last-good snapshot 和身份 reset。
- [ ] `web/src/shared/hooks/useWorkConsoleData.ts`：改为读取 Provider，不再由每个页面独立请求。
- [ ] `web/src/app/routes/app.tsx`：新增持久 `/app` 父布局与 Outlet，Pair/Settings 处理明确边界。
- [ ] `web/src/shared/ui/DesktopParityAppShell.tsx`：支持持久 Outlet 与 Settings sidebar，而不在业务页重复挂载。
- [ ] `web/src/features/sidebar/WebAppSidebar.tsx`：显示真实 user profile、DM displayName，并只渲染 sidebar projection。
- [ ] `web/src/features/settings/SettingsPage.tsx`：显示真实用户 profile，移除 `Buzz User` 占位。
- [ ] `web/src/features/inbox/InboxPage.tsx`：移除页面级 Shell，消费共享 Provider。
- [ ] `web/src/features/channels/ChannelsPage.tsx`：移除页面级 Shell，使用解析后的 Channel/DM 名称。
- [ ] `web/src/features/calendar/CalendarPage.tsx`：移除页面级 Shell，切页时保留 Sidebar。
- [ ] `web/src/features/tasks/TasksPage.tsx`：移除页面级 Shell，切页时保留 Sidebar。
- [ ] `web/src/features/tracks/TracksPage.tsx`：移除页面级 Shell，切页时保留 Sidebar。
- [ ] `web/tests/e2e/domain-codecs.spec.ts`：覆盖 profile、membership、archived、hidden DM 和 latest-state 投影。
- [ ] `web/tests/e2e/work-console.spec.ts`：覆盖真实用户名、Agent DM 名称、数量一致和 Sidebar DOM 不卸载。
- [ ] `web/tests/e2e/message-mentions.spec.ts`：覆盖 Channel `@Agent` 候选、键盘/触控选择、p tag、同名歧义和 DM 自动 recipient。
- [ ] `web/tests/helpers/desktopParityFixtures.ts`：增加 profile、未加入、已归档和隐藏 DM fixture。
- [ ] `docs/2026-08-08-web-identity-dm-channel-sidebar-consistency-plan.md`：记录验证、部署号和 commit。

## 八、验收标准

- Web profile 名称与 Desktop 当前用户一致；
- Web DM 名称与 Desktop 同一个 DM 的名称一致；
- Web Channel/DM 时间线中的 Agent 作者名称与 Desktop 一致；
- Channel 中可以通过 `@` 候选准确提及 Agent，发布事件含正确 p tag；
- Web Sidebar 的 Channel/DM id 集合与 Desktop 一致，而不只比较数量；
- 六个标签连续切换时 Sidebar 内容始终可见且 DOM identity 不变；
- 完整 Chrome、iPad 横屏、iPad 竖屏 E2E 与视觉回归通过后再部署。

## 九、建设性建议

不建议继续在 Web 里增加零散 filter 修补。Sidebar、DM label 和 current profile 应统一由一个纯投影函数产生，并用 Desktop fixture 做集合级对照；否则以后增加 archive、leave、group DM 或多设备隐藏状态时仍会再次漂移。

## 十、确认门

鹿鹿子大王确认本方案后，再修改代码、补齐测试、提交并部署。
