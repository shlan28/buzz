> 更新日期：2026-08-09
> 更新说明：新增 Web Channel 成员可见性方案，对齐 Desktop 的 header 成员数入口和只读 Channel members 面板；不增加邀请、移除、角色调整或 Agent runtime 操作。

# Web Channel 成员展示方案

## 一、问题与目标

当前 Web 已从 Relay kind `39002` 读取 Channel 成员，并将成员用于 Channel 可见性和 `@` 补全，但 Channel 页面没有成员入口。用户只能看到消息，无法确认 Channel 中有哪些人和 Agent。

本次目标：让 Web 与 Desktop 一样，在 Channel header 看到成员数量，并能打开成员面板查看完整成员列表。

## 二、Desktop 对齐结论

Desktop 的 `ChannelScreenHeader` 使用 `ChannelMembersBar`：

- header 右侧显示 Users 图标和成员总数；
- 点击打开标题为 `Channel members` 的成员面板；
- 成员展示头像、名称、本人 `You`、Agent 标识和 owner/admin 等角色；
- Desktop 面板还包含邀请、移除、角色、moderation 和 Agent runtime 操作。

Web 本阶段只复刻查看体验。所有管理操作继续留在 Desktop，避免把“只读成员查看”扩大成 Channel 管理功能。

## 三、成员事实来源

成员必须来自 Relay 自签的 NIP-29 kind `39002`，不能用以下数据推断：

- 最近发过消息的人；
- Channel metadata 的临时 participant；
- 全社区 profile 列表。

Web 当前 `membersByChannelId` 只保留 pubkey，丢弃了 kind `39002` 的角色。此次增加结构化成员数据：

- `pubkey`：成员身份；
- `role`：`owner/admin/member/guest/bot`，取 `p` tag 第四列；
- `isAgent`：以可信 profile 的 Agent 标记为主，`role=bot` 作为兼容信号；
- profile label/avatar：继续来自现有 profile lookup；
- 当前 user 显示 `You`，同时保留角色。

DM 使用同一成员面板，成员来源优先为 kind `39002`；若旧 DM 没有成员事件，才回退到不可变的 `participantPubkeys`，并明确不伪造角色。

## 四、Web 交互与布局

Channel header 右侧新增与 Desktop 相同语义的成员按钮：

- Users 图标 + 成员总数；
- aria label：`View channel members (N)`；
- 位于 Refresh 左侧；
- Channel 切换时自动关闭旧 Channel 的成员面板。

点击后打开只读 `Channel members` 面板：

- 桌面和 iPad 横屏使用右侧 320px panel，不覆盖消息输入框之外的布局；
- iPad 竖屏/窄屏使用全宽 overlay；
- 顶部显示标题、成员数、搜索框和关闭按钮；
- 列表先按角色 owner/admin/member/guest/bot 排序，同角色中 `You` 优先，再按显示名排序；
- 每行显示头像、名称、Agent/角色标签和本人标识；
- Agent 与普通用户继续使用不同的默认头像配色；
- 空数据、缺少 profile 和异常 pubkey 均有稳定 fallback；
- 面板不提供 Add、Remove、Edit、Manage、Start/Stop Agent 等按钮。

建设性建议：不要把所有头像永久堆在 header。成员多时会挤压 Channel 标题和 iPad 输入区域；“成员数按钮 + 可搜索面板”更接近 Desktop，也能支持大 Channel。

## 五、数据刷新

- 初次工作台加载时解析完整成员和角色；
- Channel 消息订阅触发 refresh 时同步获取最新 kind `39002`；
- 手动 Refresh 同步更新成员数和面板；
- 已打开面板在 refresh 期间保留旧成员，避免列表闪空；
- Channel 切换后立即使用对应 Channel 的缓存成员，不复用前一个 Channel 列表。

## 六、Todo List

- [x] `web/src/features/channels/types.ts`：增加只读 `ChannelMember` 与角色类型。
- [x] `web/src/shared/api/communitySession.ts`：解析 kind `39002` 的 pubkey/role，保留现有 mention pubkey lookup，并为旧 DM 提供 participant fallback。
- [x] `web/src/features/channels/channelMembers.ts`：实现成员去重、角色排序、本人/Agent label 和搜索投影。
- [x] `web/src/features/channels/ChannelMembersPanel.tsx`：实现 Desktop 对齐的只读成员面板、响应式布局、搜索和 fallback。
- [x] `web/src/features/channels/ChannelsPage.tsx`：在 header 增加成员数按钮，管理打开/关闭与 Channel 切换状态。
- [x] `web/tests/helpers/desktopParityFixtures.ts`：增加 owner、普通用户、Agent、缺失头像和角色 fixture。
- [x] `web/tests/e2e/channel-members.spec.ts`：覆盖去重、角色排序、搜索、只读面板和 Channel/DM 切换不串数据。
- [x] `web/tests/e2e/work-console.spec.ts`：完整工作台回归继续覆盖 Channel 消息、头像、mention 和页面切换；成员专项交互集中在 `channel-members.spec.ts`。
- [x] `web/tests/e2e/ipad-layout.spec.ts`：覆盖横屏右侧 panel、窄屏全内容面 overlay 和无横向溢出。
- [x] `web/tests/e2e/desktop-parity.visual.spec.ts`：增加 Channel members Light/Dark 视觉基线。
- [x] `web/playwright.config.ts`：将 Channel members 协议和视觉测试纳入 smoke project。
- [x] `docs/2026-08-09-web-channel-members-display-plan.md`：记录测试、commit、部署号和公网资源版本。

## 七、验收标准

- 每个可见 Channel header 都显示正确成员数；
- 点击后能查看完整成员，不依赖成员是否发过消息；
- 当前用户显示 `You`；Agent、owner/admin 等身份可辨认；
- 缺失头像时字母和 Agent/User 默认色正确；
- 搜索可按显示名、handle、角色和 pubkey 匹配；
- 切换 Channel 不闪空、不展示上一个 Channel 的成员；
- 面板不存在任何成员管理或 Agent runtime 操作；
- Chrome、iPad 横屏、iPad 竖屏完整矩阵和 Light/Dark 视觉回归通过后再部署。

## 八、确认门

鹿鹿子大王确认后，再修改 Web Channel 成员展示代码、补测试、提交并部署。

## 九、完成记录

- 功能提交：`557e5f472`；
- Channel header 已显示权威成员数，点击打开只读 `Channel members` 面板；
- 成员来自 Relay kind `39002`，保留 owner/admin/member/guest/bot 角色；旧 DM 支持 participant fallback；
- 面板支持头像、You、Agent/角色、搜索、关闭和 Channel/DM 切换隔离，不包含任何管理操作；
- `pnpm check`、TypeScript、production/E2E build 通过；完整 Chrome、iPad 横屏、iPad 竖屏矩阵 108/108 通过；边界修正后 smoke 65/65、成员专项 3/3 通过；
- Light/Dark Channel members 视觉基线已生成并复跑通过；
- Cloudflare Pages 部署：`f0646b11`；生产资源：`index-FO4UFRGu.js`、`index-CzI9vYGy.css`；自定义域名已确认切换。
