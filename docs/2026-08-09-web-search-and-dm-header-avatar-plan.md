# Buzz Web 全局搜索与 DM Header 头像修复方案

> 更新日期：2026-08-09
>
> 更新说明：完成 Web 全局搜索、历史消息定位、一对一/群组 DM Header 头像、自动化测试、Cloudflare Pages 部署与正式域名产物核验。

## 一、用户体验目标

### 1.1 搜索必须能够完成任务

用户点击侧边栏 Search 或按 `⌘K` 后，应打开与 Desktop 同一视觉语言的全局搜索面板。用户可以搜索：

- 已加入的 Channel 和 DM；
- 已加载的用户与 Agent；
- Relay 历史消息全文。

搜索结果必须显示类型、名称、头像、所在 Channel/DM、消息摘要和时间。点击 Channel 或 DM 结果应进入对应会话；点击消息结果应进入对应会话并定位、短暂高亮该消息。加载中、无结果、Relay/Signer 不可用必须有明确状态，不能继续表现成一个没有行为的装饰框。

### 1.2 DM Header 必须表达对话对象

一对一 DM Header 左侧应显示另一位参与者的真实头像；头像缺失或加载失败时，使用其名称首字母和 Agent/User 对应的回退色。群组 DM 使用 Desktop 的叠放头像语义并显示超出人数。普通 Channel 继续显示公开/私密 Channel 图标，不误用成员头像。

## 二、现状与根因

### 2.1 Search 当前确实是静态占位

`WebAppSidebar` 里的 Search 目前是一个普通 `div`，没有按钮语义、点击事件、输入框、快捷键监听、搜索状态或 Relay 查询。因此它不是连接失败，而是功能从未实现。

Relay 已支持 NIP-50 全文搜索，Web 现有配对 signer 与 NIP-98 `/query` 调用也可复用；缺口位于 Web 的搜索会话、结果投影和交互层。搜索请求仍必须带明确 `kinds`，不能发送无 kinds 的开放过滤器，以免触发 Relay p-gate 或扩大读取范围。

### 2.2 DM Header 使用了状态图标代替头像

Web 的 DM Sidebar 已经从 `participantPubkeys + profilesByPubkey` 计算并显示真实头像，但 `ChannelsPage` Header 对所有 DM 固定渲染绿色 `CircleDot`，没有复用同一参与者与 profile 投影。数据已经存在，问题是 Header 呈现层没有消费。

Desktop 一对一 DM 使用 32px 参与者头像并叠加 presence；群组 DM 使用参与者头像栈。Web 当前没有可靠 presence 数据，本轮不虚构在线状态，只对齐头像、尺寸、叠放和回退规则。

## 三、产品与技术方案

### 3.1 搜索入口

- Search 区域改为真实按钮，支持点击、触控、键盘聚焦与 `aria` 描述。
- 全局注册 `⌘K` / `Ctrl+K`，但不劫持正在输入文本的常规按键行为。
- 展开和收起侧边栏时都保留可访问的搜索入口；紧凑 iPad 侧边栏显示搜索图标按钮。

### 3.2 搜索数据范围

- Channel/DM：对当前可见、未归档、未隐藏的会话做即时本地匹配。
- 用户/Agent：对已验签 profile 的 `display_name`、`name`、`nip05` 做即时本地匹配，并排除无上下文的未知身份。
- 消息：输入达到最小长度后，使用配对 signer 生成 NIP-98 授权，请求 Relay `/query` 的 NIP-50 搜索；过滤器明确限定 Web 支持的消息 kinds 和结果数量。
- 所有 Relay 返回事件继续验签，再投影成消息结果；结果只显示当前用户可访问的 Channel/DM 上下文。
- 输入变化使用 debounce，并通过请求序号或 `AbortSignal` 防止旧请求覆盖新关键词结果。

### 3.3 搜索结果与导航

- 结果按 Channels、People、Messages 分区，复用 Web 现有 `ProfileAvatar`、名称回退和 Markdown 纯文本摘要规则。
- 支持方向键选择、Enter 打开、Escape 关闭和触控点击。
- 消息结果导航到 `/app/channels/:channelId?message=:eventId`。
- 会话页在消息存在时滚动到目标并短暂高亮；目标不在现有快照时，以搜索返回的已验签事件作为定位依据，不能假装成功后停在无关位置。
- 搜索错误只影响搜索面板，不清空已加载侧边栏或工作台数据。

### 3.4 DM Header 头像

- 一对一 DM 从参与者中排除当前用户，读取另一位参与者 profile，使用 32px `ProfileAvatar`。
- 群组 DM 使用最多三位可见参与者头像的紧凑叠放，额外人数以 `+N` 表示。
- Header 与 Sidebar 对同一 pubkey 使用相同 profile、名称和 `isAgent`，避免同一个 Agent 在两个位置显示不同头像。
- 本轮不增加伪造 presence 圆点；未来拿到真实 presence 数据后再叠加状态。

## 四、安全与性能约束

- Relay 搜索过滤器必须包含 `MESSAGE_KINDS`，禁止 kinds 为空。
- 不在浏览器存储搜索结果、搜索历史或新的密钥材料。
- 查询结果必须通过现有签名验证，并受当前社区和可访问 Channel 范围约束。
- 搜索关键词做最小长度、长度上限、debounce 和结果数量限制。
- 切换关键词或关闭面板后，过期响应不能改写当前 UI。
- 头像继续受已部署的 CSP 图片源白名单保护。

## 五、验收标准

- 点击 Search 和按 `⌘K`/`Ctrl+K` 都能打开搜索面板并聚焦输入框。
- 输入 Channel、DM、用户或 Agent 名称能立即得到对应结果。
- 输入消息关键词能得到 Relay 历史消息结果，且请求带明确消息 kinds。
- 点击消息结果进入正确会话、滚动到正确消息并显示短暂高亮。
- 搜索 loading、empty、error 状态清晰，失败不影响侧边栏已有数据。
- 一对一 DM Header 显示对方真实头像；缺失头像时显示正确 initials 和 Agent/User 回退色。
- 群组 DM Header 显示头像栈与 `+N`，普通 Channel Header 图标保持不变。
- Desktop、iPad 横屏和 iPad 竖屏无横向溢出，搜索面板可触控关闭。
- 自动化覆盖搜索请求约束、竞态、导航、键盘操作和 DM Header 头像。

## 六、Todo

- [x] `web/src/shared/lib/nostr-client.ts`：为 Web 使用的 Nostr filter 类型补充 NIP-50 `search`、搜索模式和分页字段，保持 kinds 强约束由调用层执行。
- [x] `web/src/features/search/types.ts`：定义 Channel、People、Message 搜索结果及加载、空、错误状态。
- [x] `web/src/features/search/searchSession.ts`：实现本地实体匹配、NIP-50 Relay 查询、验签后结果投影、debounce 竞态保护所需的纯逻辑接口。
- [x] `web/src/features/search/WebGlobalSearch.tsx`：实现与 Desktop 对齐的搜索 Dialog、分区结果、头像、键盘/触控交互和状态反馈。
- [x] `web/src/features/sidebar/WebAppSidebar.tsx`：把静态 Search 改为可访问入口，接入 Dialog 与 `⌘K`/`Ctrl+K`。
- [x] `web/src/features/channels/ChannelsPage.tsx`：增加一对一/群组 DM Header 头像，并支持搜索消息目标的滚动与高亮。
- [x] `web/tests/e2e/search-session.spec.ts`：覆盖搜索过滤器 kinds、实体可见范围、输入归一化与长度上限。
- [x] `web/tests/e2e/work-console.spec.ts`：覆盖 Search 点击/快捷键、历史消息精确导航和一对一/群组 DM Header 头像。
- [x] `web/tests/e2e/ipad-layout.spec.ts`：覆盖紧凑侧边栏搜索入口、搜索面板和无横向溢出。
- [x] `web/tests/e2e/desktop-parity.visual.spec.ts`：增加 Search Dialog 与 DM Header 的 Light/Dark 视觉基线。
- [x] `web/playwright.config.ts`：把新增搜索逻辑测试纳入 smoke project。
- [x] `docs/2026-08-09-web-search-and-dm-header-avatar-plan.md`：记录测试结果、commit、部署号和线上验收结果。

## 七、建设性建议

不建议只给 Search `div` 加一个简单本地过滤弹窗。这样虽然能“点开”，但仍然搜不到未加载的历史消息，会再次形成半成品。应一次完成“本地实体即时搜索 + Relay NIP-50 历史消息搜索 + 结果导航定位”的闭环；同时严格限制消息 kinds 和可见 Channel 范围。

## 八、实现与验收记录

- 实现 commit：`07f42ee0f feat(web): add global search and DM header avatars`。
- Cloudflare Pages 部署：`ee7fa872-9639-4410-99c4-ea8dfd9103c9`。
- 单次部署地址：`https://ee7fa872.achoverse-app.pages.dev`。
- 正式入口：`https://app.achoverse.xyz`。
- 单次部署地址与正式入口均返回生产产物 `index-DPWJJbSP.js`，确认自定义域名已切换。
- `pnpm typecheck`、`pnpm check`、`pnpm test:e2e:smoke` 和 `pnpm build` 全部通过；smoke 共 `86 passed`。
- 自动化已覆盖 NIP-50 kind-scoped filter、本地可见实体、Search 点击与快捷键、历史消息精确定位/高亮、群组 `+N` 头像栈、iPad 布局及 Light/Dark 视觉回归。
- 真实账号的 Relay FTS 结果依赖浏览器 Pair 状态、Mac signer 和 Relay 索引；部署后由用户刷新已 Pair 的正式入口进行最终数据验收。
