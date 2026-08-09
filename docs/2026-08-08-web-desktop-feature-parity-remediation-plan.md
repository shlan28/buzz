> 更新日期：2026-08-08
> 更新说明：完成 Web 的真实 DM/Channel 导航与文本发送、独立 Inbox、Desktop 布局的只读 Calendar/Tasks/Tracks、可用 Settings、侧栏折叠和视觉回归测试。

# Web 与 Desktop 功能及 UI 同构整改方案

## 一、产品结论

当前 Web 只完成了“配对后读取部分 Relay 数据”的技术闭环，没有完成可代替 Desktop 的 iPad/Web 控制台。下列问题均为阻断使用的严重缺口：

1. Web 没有真实 DM 列表和 Channel 信息架构，也没有消息输入与发送，无法与 Agent 对话；
2. `/app/channels` 在侧栏被标成 Inbox，`general` 又是硬编码占位，产品语义错位；
3. Calendar、Tasks、Tracks 重新画了简化页，未使用 Desktop 的 toolbar、sidebar、board/list、filter、detail 结构；
4. Web 没有真实 Inbox 页，Activity 不能代替 Desktop Inbox；
5. Settings 是无 `onClick` 和无路由的普通按钮，用户无法进入任何设置。

本轮验收不再以“有页面、有数据”为完成标准，而以“信息架构、布局、样式、状态和主要交互均与 Desktop 对齐”为标准。

## 二、范围和产品边界

### 2.1 本轮必须完成

- Desktop 同构的 App top chrome、300px 侧栏、搜索、主导航、DM 分组、Channel 分组和底部 profile/settings；
- 真实 Inbox 页，保持 Desktop Home/Inbox 的 feed 布局和已读/未读表达；
- 真实 Channel 和 DM 路由，切换后展示对应消息时间线；
- Channel 和 Agent DM 的文本消息发送；
- Calendar、Tasks、Tracks 与 Desktop 同构，数据仍可保持只读；
- 可点击的 Settings 路由与 Desktop 同构 Settings shell；
- Settings 中 Web 真实能控制的项目：主题、Relay/Signer 状态、手动重连、配对设备信息、清除本机配对/退出；
- iPad 横屏、竖屏与 Desktop 宽屏的自适应布局。

### 2.2 本轮不伪装成可用的项目

Desktop 本机专属的 Agent runtime、大模型 API key、Harness、防休眠、本地归档、应用更新等设置，不能由纯 Web 页直接操作 Mac 本机。本轮在同构 Settings 导航中明确标记“在 Mac 上管理”，不放置假开关。如果未来要远程修改这些设置，应另行设计有权限白名单和用户确认的 Desktop RPC。

## 三、Desktop 视觉与结构事实源

| Web 区域 | Desktop 事实源 | 实施原则 |
| --- | --- | --- |
| App shell | `app/AppTopChrome.tsx`、`app/BuzzThemeSurfaces.tsx`、`shared/layout/chromeLayout.ts` | 保持高度、边距、圆角、阴影和双层 gradient |
| Sidebar | `features/sidebar/ui/AppSidebar*.tsx`、`SidebarSection.tsx`、`SidebarProfileCard.tsx` | 提取纯 presenter，保持 300/48px 尺寸和 Desktop DOM/class |
| Inbox | `features/home/ui/*`、`features/home/lib/*Inbox*` | 使用 Desktop feed/inbox card、分组和空状态 |
| Channel/DM | `features/channels/ui/ChannelScreen*.tsx`、`features/messages/ui/MessageTimeline.tsx`、`TimelineMessageList.tsx`、`MessageComposer.tsx` | 复用纯视图和样式，用 Web adapter 替代 Tauri hooks |
| Calendar | `features/calendar/ui/CalendarScreen.tsx`、`CalendarSidebar.tsx`、`CalendarToolbar.tsx`、`CalendarGrid.tsx`、`CalendarMonthView.tsx` | 保留 day/week/month、source sidebar 和 event popover，隐藏写入入口 |
| Tasks | `features/tasks/ui/TasksScreen.tsx`、`TaskBoardView.tsx`、`TaskListView.tsx`、`TaskCard.tsx`、`TaskDetailPanel.tsx` | 保留 board/list、group/filter/detail，只禁用 mutation |
| Tracks | `features/tracks/ui/TracksScreen.tsx`、`TrackList.tsx`、`TrackDetailScreen.tsx` | 保留 tabs、search、summary、list/detail，隐藏 editor/archive |
| Settings | `features/settings/ui/SettingsScreen.tsx`、`SettingsView.tsx`、`SettingsPanels.tsx`、`SettingsOptionGroup.tsx` | 保持左侧 section 和右侧 panel 布局，注入 Web settings model |
| Tokens | `shared/styles/globals/theme.css`、`shared/styles/globals.css`、`tailwind.config.js` | 逐 token 对齐，不在 Web 另建相似颜色 |

短期不允许 Web 通过 `@/` 跨目录直接 import Desktop，因为会把 Tauri API 和 Desktop hooks 带入浏览器 bundle。正确做法是将纯呈现层拆出或按事实源移植，并在文件头注明同步源。

## 四、DM、Channel 与消息发送

### 4.1 数据模型

Web 当前只读取 channel metadata 和部分 message kinds，但没有把它们组装成 Desktop 的 sidebar snapshot。需增加：

- 按真实 channel metadata 生成 Channel section；
- 根据 DM 事件参与者生成 Direct Messages section；
- Agent DM 使用已验证 owner-agent 关系和 profile 显示 Agent 名称/头像；
- route 必须包含 channel id 或 DM peer pubkey，刷新页面后仍停留在同一会话；
- 时间线按 Desktop 规则分组连续消息、显示作者、时间、日期分隔和 Agent 状态。

### 4.2 发送链路

Web composer 第一版支持纯文本与 Agent mention，不假装支持尚未接入的文件、媒体和富文本工具。

```text
Web Composer
  -> 构造与 Desktop 一致的 channel/DM Nostr event
  -> NIP-46 sign_event（Desktop 白名单校验 kind/tags/community）
  -> POST /events（NIP-98）
  -> Relay 验签、权限校验与 fan-out
  -> Web 重新查询/合并时间线
```

安全要求：

- Remote Signer 仅增加 Desktop 已有消息 kind，不开放任意 `sign_event`;
- Desktop 校验 `h`、`p`、reply/root 等 tags，防止 Web 篡改目标 community/channel/recipient；
- `/events` 使用 user 身份签署的 NIP-98，不引入 nsec 到浏览器；
- 发送超时后不自动重发，先按 event id 查询确认是否已被 Relay 接受，避免重复消息。

## 五、Inbox 与只读工作页

### 5.1 Inbox

Inbox 使用独立 `/app/inbox` 路由，不再指向 Channels。第一版数据包含：

- 对当前 user 的 mention/reply/DM；
- Agent 相关会话更新；
- Task execution 与线程活动中 Relay 可验证的部分；
- 本机 Desktop 独有、不同步的本地通知不伪装为全量 Inbox。

### 5.2 Calendar、Tasks、Tracks

“只读”只表示不创建/编辑/删除，不表示可以删减布局。下列交互仍必须保留：

- Calendar：day/week/month 切换、日期导航、source 筛选、事件详情 popover；
- Tasks：board/list 切换、group by、搜索、status/tag/track 筛选、右侧 task detail；
- Tracks：current/completed/archived tabs、搜索、progress summary、list 与 detail screen；
- 写入按钮应隐藏或标记 read only，不用 disabled 假按钮占据布局主位。

## 六、Settings

Settings 按钮改为真实 `/app/settings` 导航，页面保持 Desktop 的“左侧 section + 右侧 panel + close/back”布局。

第一版 section：

| Section | Web 行为 |
| --- | --- |
| Profile | 只读 user pubkey、设备名和 Relay |
| Appearance | 真实切换 light/dark/system，保存在浏览器 |
| Connection | 显示 Relay 健康、Mac signer 状态、Retry 和最后成功时间 |
| Paired device | 显示当前配对身份，支持清除本机凭据和重新 Pair |
| Desktop-only | 以说明卡告知 Agent/API key/runtime 需在 Mac 管理，不渲染可交互开关 |

## 七、视觉验收门禁

每个页面同时准备 Desktop 和 Web 的固定 fixture，使用相同 theme、viewport 和数据。验收分两层：

1. 硬几何断言：top chrome 高度、sidebar 300/48px、content surface 边距/圆角、toolbar 高度、panel 宽度、无横向溢出；
2. 视觉回归：1366x768 Desktop、1180x820 iPad 横屏、820x1180 iPad 竖屏，light/dark，页面全景与关键组件截图。

不能仅用“元素存在”的 smoke test 宣称 UI 一致。跨 WebKit/Chromium 的字体抗锯齿可设小容差，但 DOM 尺寸、token 颜色和布局必须精确断言。

## 八、实施顺序

1. 先完成共享 token、App shell 和真实 sidebar，否则所有页面都在错误基线上开发；
2. 接入 Channel/DM 数据和发送，使 Web 先恢复核心通信能力；
3. 完成 Inbox；
4. 按 Calendar -> Tasks -> Tracks 顺序移植只读 presenter；
5. 完成 Settings 和主题/配对管理；
6. 建立 Desktop/Web 视觉回归门禁，再进行公网部署。

## 九、Todo List

- [x] `web/src/shared/ui/DesktopParityAppShell.tsx`：对齐 Desktop 的 40px chrome、300/48px sidebar 和 content surface，并实现侧栏切换。
- [x] `web/src/features/sidebar/WebAppSidebar.tsx`：实现搜索、Inbox、DM、Channel、profile 和 Settings 导航。
- [x] `web/src/features/channels/types.ts`：补齐 Channel/DM/sidebar snapshot 类型。
- [x] `web/src/features/channels/eventCodec.ts`：解析 DM 类型、可见性和参与者。
- [x] `web/src/features/channels/ChannelsPage.tsx`：实现真实 Channel/DM header、消息时间线、composer 和刷新。
- [x] `web/src/shared/api/messagePublish.ts`：实现 NIP-46 签名和 NIP-98 `/events` 发布，失败不盲目重发。
- [x] `desktop/src-tauri/src/commands/remote_signer.rs`：把消息 kind 加入有限白名单并严格校验 `h`、`p`、`client` tags。
- [x] `web/src/features/inbox/InboxPage.tsx`：新增独立 Inbox feed。
- [x] `web/src/features/calendar/CalendarPage.tsx`：实现 source sidebar、day/week/month、日期导航和只读事件详情。
- [x] `web/src/features/tasks/TasksPage.tsx`：实现 board/list、搜索、完成项筛选和只读详情。
- [x] `web/src/features/tracks/TracksPage.tsx`：实现 tabs、搜索、progress、list 和只读详情。
- [x] `web/src/features/settings/SettingsPage.tsx`：实现独立 Settings sidebar 和 Web 可用 section。
- [x] `web/src/shared/storage/webPreferences.ts`：保存主题偏好，不存储模型 key。
- [x] `web/src/shared/theme/ThemeProvider.tsx`：让主题选择即时生效并跨刷新持久化。
- [x] `web/src/app/routes.ts`：增加 Inbox、Channel 和 Settings 路由。
- [x] `web/tests/e2e/message-send.spec.ts`：覆盖消息 scope、DM recipient 去重和非法输入拒绝。
- [x] `web/tests/e2e/work-console.spec.ts`：覆盖 Sidebar、Inbox、DM/Channel、只读页、Settings 和主题。
- [x] `web/tests/e2e/desktop-parity.visual.spec.ts`：建立 1366x768 light/dark 截图基线与硬几何断言。
- [x] `web/tests/e2e/ipad-layout.spec.ts`：覆盖 1180x820、820x1180 和紧凑宽度无横向溢出。
- [x] `web/playwright.config.ts`：把消息、Settings 和视觉回归纳入 smoke/iPad project。
- [x] `docs/2026-08-08-web-desktop-feature-parity-remediation-plan.md`：已记录公网部署号和 commit。

## 九点一、验证记录

- Web `pnpm typecheck` 与 `pnpm check` 通过；
- Playwright Chrome、iPad 横屏、iPad 竖屏共 56 项通过；
- Desktop Remote Signer 定向 Rust 测试 8 项通过；
- 视觉基线固定 Desktop 的 40px top chrome、300px 展开侧栏、48px 折叠侧栏、16px content surface 圆角和 light/dark 外观；
- 真实公网发送仍需部署新 Web、重启包含新白名单的 Desktop 后，用当前配对身份分别向 Channel 和 Agent DM 做一次人工端到端验收。

## 九点二、发布记录

- 实现 commit：`51deb7f35 feat(web): add desktop-parity work console`；
- Cloudflare Pages 部署：`8b68f1a2`；
- 单次部署地址：`https://8b68f1a2.achoverse-app.pages.dev`；
- 长期入口：`https://app.achoverse.xyz`；
- 生产 HTML 已确认加载 `index-DJwntci2.js`，与单次部署地址一致；
- Desktop dev 已重新编译启动，使用 `wss://achoverse.xyz` 和 `BUZZ_DEV_INSTANCE_SLUG=dev`。

## 十、验收标准

- Sidebar 真实显示 DM 和 Channel，不存在硬编码 `general`;
- Inbox 与 Channels 是两个独立、正确命名的入口；
- 从 Web 向普通 Channel 和 Agent DM 各发送一条消息，Desktop 与 Agent 都能收到；
- Calendar、Tasks、Tracks 在 Desktop 和 Web 使用同 fixture 时，核心 DOM 几何和 token 断言一致；
- Settings 可点击，主题、连接状态、重连、清除配对均真实生效；
- Desktop-only 设置不呈现虚假的可交互控件；
- 1366x768、1180x820、820x1180 均无横向溢出、遮挡或无法触摸的主要操作；
- 定向 Rust/Web 测试、完整 Web smoke/iPad E2E 和视觉回归通过后才部署。

## 十一、确认门

鹿鹿子大王确认本方案后才修改代码。这是一次跨 Shell、Messaging、五个业务页、Settings、Remote Signer 和测试体系的大型改造，实施时按章节分段提交，但只有上述整体验收完成才能宣称 Web 对齐 Desktop。
