# Buzz Web/PWA iPad 控制台方案

> 更新日期：2026-08-08
> 更新说明：开始实现 Desktop Web Pair 模式与 Remote Signer；Remote Signer 改为复用 buzz-pair-relay 的安全单播核心、使用独立 5001 监听器和 `/signer` 路由，与短时 Pair 端口隔离。

## 一、产品结论

Buzz 可以提供一个可安装到 iPad 主屏幕的 Web/PWA 控制台，但不采用“把 Desktop App 原样打包成网页”的方式，而是在现有 `web/` React 应用上增加工作台能力。

目标架构：

```text
iPad Safari / PWA
├── Pair 与设备授权
├── Channels / Thread / DM
├── Calendar（只读）
├── Tasks（只读）
├── Tracks（只读）
├── Agent Activity
└── 通过消息或执行请求操作 Agent
                  ↕
                Relay
                  ↕
Mac Desktop
├── 持有 User Key
├── 远程签名
└── 运行 Agent / Codex / Hermes / 本地工具
```

这条路线的主要价值：

- 不需要 Apple Developer 签名、TestFlight 或 App Store；
- iPad 可以从 Safari 添加到主屏幕；
- 同一套网页可在 iPad、Mac、Windows 和其他浏览器使用；
- 发布后用户刷新即可获得更新；
- Calendar、Task、Track 已经是 Relay/Nostr Event，不需要新建业务 HTTP API；
- 第一版只读工作数据，能显著降低权限、冲突和误操作风险。

### 1.1 UI 硬约束

Web/PWA 可以删减功能，但所有保留功能的 UI 必须与 Desktop 客户端一致：

- 同一信息架构和页面层级；
- 同一 Sidebar、顶部 chrome、主内容表面和辅助详情面板；
- 同一 Catppuccin Latte/Macchiato 语义 token；
- 同一 Inter 字体、rem 字号阶梯、4px 间距节奏、圆角、边框和阴影；
- 同一 loading、empty、error、offline、selected、hover、focus 和 disabled 表达；
- Channels、Calendar、Tasks、Tracks 的可见结构与 Desktop 对应页面一致；
- iPad 只因屏幕宽度、触控和 Safari 能力调整排列方式，不重新设计一套“移动风格”外观。

视觉事实源按优先级为：

1. Desktop 当前真实页面与截图；
2. `docs/2026-07-31-buzz-client-ui-design-standard.md`；
3. `desktop/src/shared/styles/globals/theme.css`、`desktop/tailwind.config.js`；
4. `desktop/src/shared/ui/` 和各业务 feature 的 presentational components；
5. Web 已有主题只能在与以上事实源一致时保留。

“功能简化”允许隐藏创建、编辑、删除和本地 runtime 控件；不允许用另一种卡片、导航、配色或排版替代客户端原 UI。

## 二、当前实现与差距

### 2.1 已有能力

现有 `web/` 已具备：

- React 19、Vite、TanStack Router、React Query 和 Tailwind；
- Nostr Event 类型与签名封装；
- WebSocket NIP-01 查询；
- NIP-42 Relay AUTH；
- NIP-98 HTTP Auth；
- NIP-07 浏览器扩展签名；
- 邀请加入和 Git 仓库浏览页面；
- Playwright E2E 基础。

现有 NIP-AB Pair 协议已定义：

- SAS 双端确认；
- NIP-44 加密传输；
- `nsec`、`bunker`、`connect` 和 `custom` payload；
- NIP-46 远程签名会话的引导能力。

### 2.2 不能直接复用 Desktop 构建

Desktop 前端有大量模块依赖 Tauri：

- macOS Keychain；
- Tauri WebSocket plugin；
- 本地签名命令；
- Agent 进程管理；
- 文件、媒体代理、窗口与深链；
- Codex/Hermes runtime 和工作目录。

浏览器不能提供这些原生能力。因此应该迁移领域协议和 UI 意图，不复制 Desktop 的本地运行层。

### 2.3 Web 当前缺口

- 没有登录后的工作台 Shell；
- 没有 Pair target；
- 没有 NIP-46 远程 signer；
- 没有频道、Thread、DM；
- 没有 Calendar、Task、Track；
- 没有 Agent Activity；
- 没有 PWA manifest、service worker 和安装引导；
- 没有针对 iPad 横竖屏、Split View 和触控的响应式布局。

## 三、第一版产品范围

### 3.1 Pair 与会话

- Web 扫描 Desktop 二维码或打开配对链接；
- 两端显示并确认相同 SAS；
- Desktop 不发送 User nsec；
- Pair payload 使用 NIP-46 `bunker` 或 `connect`；
- Web 保存的是可撤销的设备连接信息，不是 User 主私钥；
- 页面明确展示“签名 Mac 在线/离线”；
- 用户可以在 Desktop 撤销 Web 设备。

### 3.2 Channels、Thread、DM

- 查看频道列表和未读状态；
- 查看频道消息和 Thread；
- 查看 DM；
- 搜索或过滤近期消息；
- 发送普通文本消息；
- 回复 Thread；
- 通过消息 `@Agent` 操作在线 Agent；
- 查看 Agent Working/Activity 状态。

第一版不包含完整媒体编辑、相机、复杂附件、频道管理和所有 Desktop 右键菜单。

### 3.3 Calendar（只读）

- 月视图和当日 Agenda；
- 查看 User 个人日历；
- 查看已拥有 Agent 的日历；
- Personal/Agent 来源筛选；
- 查看标题、描述、地点、参与人和起止时间；
- 不提供创建、编辑、拖拽和删除。

### 3.4 Tasks（只读）

- List 与 Board；
- 查看标题、描述、状态、优先级、负责人、截止日期、标签和 Track；
- 查看 Task 历史和 Agent 执行状态；
- 筛选、搜索和排序；
- 不提供创建、编辑、归档、删除；
- “让 Agent 执行”属于写操作，第一版不直接做专用按钮；用户可以在频道中要求 Agent 操作。后续如增加按钮，必须通过远程 signer 签署 `42503`。

### 3.5 Tracks（只读）

- Track 列表；
- 查看名称、描述、Owner、成员、起止日期和状态；
- 查看按 Task 派生的进度；
- 查看 Track 下关联的 Tasks；
- 不提供创建、编辑、归档。

### 3.6 明确不支持

- 在浏览器或 iPad 上运行 Agent runtime；
- 启动 Codex、Hermes、Goose 或 MCP；
- 访问 Mac 本地文件和 Git worktree；
- 管理 Agent 私钥、模型 API Key 和 runtime 安装；
- 查看 Desktop 本地原始日志文件；
- 把 User nsec 写入 LocalStorage、SessionStorage、IndexedDB、Cache Storage 或 service worker。

## 四、安全 Pair 与签名方案

### 4.1 为什么不把 nsec 存进网页

Web 页面可能受到 XSS、恶意依赖、浏览器扩展、共享设备和站点存储泄露影响。一旦 User nsec 泄露，攻击者可以永久冒充 User；清除浏览器数据或撤销某台设备无法让已复制的 nsec 失效。

所以 Web/PWA 第一版必须遵守：

> 浏览器永远不接收、不解密、不持久化 User nsec。

### 4.2 MVP：Mac 在线远程签名

复用 NIP-AB + NIP-46：

1. Web 生成临时或设备级 NIP-46 client key；
2. Desktop 展示 NIP-AB Pair 二维码；
3. Web 扫码并完成 ECDH、SAS 双确认；
4. Pair payload 传递 `bunker://` 或 `nostrconnect://`，不传 nsec；
5. Web 需要 NIP-42 AUTH、NIP-98 或消息签名时，向 Desktop signer 请求；
6. Desktop 按授权策略签名并返回结果；
7. Web 验证返回事件的 pubkey、字段、id 和签名；
8. Desktop 可随时撤销该连接。

优势：

- 不改 User 身份模型；
- Relay 最终看到的仍是 User Pubkey签名事件；
- community membership 和现有权限继续成立；
- Web 设备泄露不会直接泄露 User nsec。

限制：

- Desktop signer 必须在线；
- 首次 NIP-42 AUTH 和需要签名的操作会依赖 Mac；
- Desktop signer 崩溃或睡眠时，Web 无法建立需要 User 身份的受保护 Relay 会话；
- 产品必须显示“Mac 签名端离线”，不能伪装成普通网络错误。

### 4.3 签名授权策略

Desktop 对 Web 设备至少区分：

| 能力 | 第一版默认 |
|---|---|
| NIP-42 Relay AUTH | 允许 |
| NIP-98 `/query`、`/count` | 允许 |
| 读取频道、Calendar、Task、Track | 允许 |
| 发送普通消息 | 允许，可在首次使用时确认 |
| Task 执行 `42503` | 禁止，后续单独授权 |
| Calendar/Task/Track 修改 | 禁止 |
| Agent 配置和私钥操作 | 永久禁止 |
| Git push、管理操作 | 永久禁止 |

Desktop signer 不能只判断“这是一个待签事件”；它必须解析 kind、tags、content 大小、community 和目标，拒绝超出授权范围的签名请求。

### 4.4 Web 设备私钥

Web 仍需要一份 NIP-46 client/device key来标识配对连接。这不是 User Key，权限可撤销。

第一阶段提供两种模式：

- **此设备保持登录**：设备 key保存在 IndexedDB，用户可从 Settings 清除；
- **临时会话**：只保存在页面内存，关闭所有页面后失效。

安全要求：

- 不在日志、错误上报和 analytics 中记录 key；
- 不通过 LocalStorage 保存；
- 配对记录显示设备名、创建时间、最后使用时间和权限；
- Desktop 撤销后所有签名请求 fail closed；
- Web 丢失连接时不自动降级为明文 nsec 登录。

### 4.5 后续：Mac 离线只读

如果未来要求 Desktop 离线时仍可读取受保护数据，应设计 User 签发、Relay 可验证、可撤销、有限期、有限 scope 的设备能力。它需要 Relay 鉴权模型扩展，不能用前端本地标记冒充权限。

第一版不做，避免同时引入新的 delegated identity 安全边界。

### 4.6 NIP-46 传输通道

现有 Pair Relay 只服务短时 `kind:24134` 配对，连接和事件数量都有严格限制，不能在配对完成后继续承载长期 NIP-46 RPC。主业务 Relay 虽可转发 ephemeral event，但 Web device key 不是 community member，不能为了远程签名绕过 NIP-42/NIP-43 membership；把它伪装成 Agent 或普通成员会扩大权限。

因此第一版增加独立 Remote Signer 通道：

- 仅允许 NIP-46 `kind:24133`；
- 严格按 `p` tag 单播，不做 community 广播；
- 不持久化请求和响应；
- 校验 event 签名、接收方、连接 secret、request id 和时效；
- 限制连接数、帧大小、请求频率和在途请求；
- Pair 完成后从短时 Pair Relay 切换到 signer 通道；
- signer 通道只负责密文转发，不能读取 NIP-44 plaintext；
- 撤销设备后立即断开连接并拒绝重连；
- 不改变业务 Relay 的 community membership 规则。

这条通道可以作为 Relay 的独立 route/sidecar 部署，但必须与业务 event ingest 分离，不能让 `24133` 进入 Postgres、搜索、普通订阅或审计正文。

## 五、Desktop 视觉一致性与 iPad 布局

### 5.1 一致性基线

Web 不创建独立设计系统，而是把 Desktop 视觉系统移植到浏览器：

| 区域 | Desktop 事实源 | Web/PWA 要求 |
|---|---|---|
| App 外壳 | `AppShell`、`BuzzThemeSurfaces`、`AppTopChrome` | 保持 Sidebar 背景、圆角内容表面、边缘阴影和层级 |
| Sidebar | `AppSidebar`、`SidebarSection` | 保持分组、选中、未读、Agent working、头像和 footer 结构 |
| 会话 | `MessageTimeline`、`TimelineMessageList` | 保持作者、时间、正文、连续消息、系统行和 Thread 层级 |
| Calendar | `CalendarScreen`、`CalendarSidebar`、`CalendarMonthView` | 保持 toolbar、来源侧栏、月历网格、事件块和详情 popover |
| Tasks | `TasksScreen`、`TaskListView`、`TaskBoardView`、`TaskDetailPanel` | 保持 filter toolbar、List/Board、状态 badge 和右侧详情 |
| Tracks | `TracksScreen`、`TrackList`、`TrackDetailScreen` | 保持列表密度、状态、进度和详情布局 |
| 主题 | Desktop theme CSS 和 Tailwind tokens | Light/Dark/accent 的语义 token 值保持一致 |
| 基础组件 | Desktop `shared/ui` | Button、Badge、Avatar、Tooltip、Popover、Skeleton 等视觉一致 |

实现时优先移植纯呈现组件和 token；涉及 Tauri 的数据访问、窗口控制和本地副作用必须替换为 Web adapter，不能把 Tauri import 带入 Web bundle。

### 5.2 视觉一致性的含义

必须一致：

- 组件尺寸、内容密度和对齐；
- 字体、字号、字重和行高；
- 背景、前景、边框和状态颜色；
- 圆角、阴影和分隔方式；
- icon 家族、尺寸和语义；
- 页面标题、toolbar、filter 和 detail panel 位置；
- skeleton 与最终内容结构；
- hover、pressed、focus-visible、selected 和 unread 状态；
- Light/Dark 主题及 accent 切换。

允许平台适配：

- macOS 窗口拖动区在 Web 隐藏；
- iPad 没有 hover 时，必要操作常显或通过同视觉风格的菜单触发；
- 宽度不足时，Desktop 右侧详情面板变为同样式的覆盖面板或独立路由；
- Safari 不支持的原生窗口、Keychain 和文件能力不显示；
- 只读模块隐藏编辑按钮，但保留页面骨架、toolbar、筛选和详情视觉。

不允许：

- 用 Material/iOS NavigationRail 替换 Desktop Sidebar；
- 为 PWA 重新设计一套卡片和配色；
- 因为只读而把 Calendar、Tasks、Tracks 简化成通用文本列表；
- 使用任意 px/rem 字号绕开 Desktop 命名 token；
- 用浏览器默认按钮、表单、tooltip 或 focus 样式混入产品界面。

### 5.3 路由

建议新增：

```text
/pair
/app/channels
/app/channels/:channelId
/app/channels/:channelId/thread/:eventId
/app/dm/:conversationId
/app/calendar
/app/tasks
/app/tasks/:taskId
/app/tracks
/app/tracks/:trackId
/app/activity
/app/search
/app/settings
```

`/repos` 和 `/invite` 保持现有公开入口，不强制进入工作台 Shell。

### 5.4 响应式断点

| 模式 | 建议宽度 | 布局 |
|---|---:|---|
| Compact | `< 700px` | Desktop 视觉的折叠 Sidebar + 单内容区 |
| Medium | `700–1099px` | Desktop Sidebar + 主内容，详情使用覆盖面板 |
| Expanded | `>= 1100px` | Desktop Sidebar + 主内容 + Desktop 风格详情面板 |

按可用宽度判断，不用 User-Agent 猜测 iPad。Safari Split View 缩窄时自动降级，选中项、筛选和滚动位置保留。

### 5.5 主导航

主导航复刻 Desktop `AppSidebar`，不使用另一套 NavigationRail。入口按 Web 第一版能力裁剪：

- Channels；
- Calendar；
- Tasks；
- Tracks；
- Activity；
- Search；
- Settings。

### 5.6 Expanded 三栏

```text
┌──────────┬────────────────────┬──────────────────────────┐
│ AppSidebar│ 列表 / 月历         │ Desktop 风格详情面板      │
│ Channels │ Channel List       │ Conversation             │
│ Calendar │ Month / Agenda     │ Event Detail             │
│ Tasks    │ Task List / Board  │ Task Detail / Execution  │
│ Tracks   │ Track List         │ Track + Child Tasks      │
└──────────┴────────────────────┴──────────────────────────┘
```

### 5.7 iPad 交互要求

- 触控目标不小于合理可点面积；
- 支持触控板 hover，但关键操作不能依赖 hover 才出现；
- 支持键盘焦点、Enter、Escape 和 Cmd+K 搜索；
- 处理横屏、竖屏和 Split View；
- 文本输入时不让关键导航被虚拟键盘遮挡；
- loading、empty、error、permission、signer offline 都有独立状态。

## 六、数据与协议

### 6.1 Relay 访问

- 历史读取优先复用 `/query`，通过 NIP-98 认证；
- 实时数据使用单一受控 WebSocket session，而不是每个组件各开连接；
- WebSocket 使用 NIP-42 AUTH；
- 所有 filter 必须明确指定 kinds；
- HTTP 与 WebSocket URL 从当前 community 配置派生，不在组件硬编码；
- community 切换时关闭旧连接并清理所有 query cache、subscription 和选中状态。

### 6.2 Calendar

- 全天事件：`31922`；
- 定时事件：`31923`；
- 删除：`5`；
- Personal 来源按 User Pubkey；
- Agent 来源按 User 拥有的 Agent Pubkey；
- 参数化可替换事件按 `(author, kind, d-tag)` 选最新头；
- 第一版不发布写事件。

### 6.3 Tasks

- 状态：`30500`；
- 执行状态：`30501`；
- 历史：`42500`、`42501`、`42502`；
- 第一版只解析和展示，不发布 Task mutation；
- 字段语义、默认值、tag 解析必须与 Desktop `taskEvents.ts` 对齐。

### 6.4 Tracks

- 状态：`30510`；
- 历史：`42510`、`42511`；
- 进度从已加载 Tasks 派生；
- 第一版只解析和展示；
- Owner 和 Member 保持具体 Pubkey语义。

### 6.5 Channels 和 Agent Activity

- Channel 继续使用 NIP-29 `h` tag；
- Thread 遵守现有 reply root/parent 规则；
- DM 遵守现有线性会话语义；
- 发送消息必须经授权 signer；
- Agent Activity 使用现有 observer events，不创建新的网页专属事实来源；
- Web 只展示 Relay 可见的 Activity，不读取 Mac 本地日志。

## 七、前端架构

### 7.1 分层

```text
web/src/app/              Router、Providers、PWA Shell
web/src/features/pairing/ Pair target 与 signer 状态
web/src/features/channels/
web/src/features/calendar/
web/src/features/tasks/
web/src/features/tracks/
web/src/features/activity/
web/src/shared/api/       Relay session、NIP-46、查询和发布
web/src/shared/domain/    跨 feature 的 event kinds、tags 和 profile 类型
web/src/shared/ui/        响应式 Shell、状态页和基础组件
```

### 7.2 状态规则

- React Query 保存 Relay 派生的 server state；
- 路由保存可分享的选择和筛选；
- 纯局部交互使用组件 state；
- signer、community 和 WebSocket lifecycle 由顶层 provider 管理；
- 不为同一事件建立多个相互独立的数据源；
- community query key 必须包含 relay/identity scope；
- logout、撤销和 community 切换必须清除敏感内存与 cache。

### 7.3 协议复用

不从 Desktop feature 深层 import。将稳定的纯协议逻辑按 Web 自己的 shared/domain 边界实现，并用相同 fixture 验证：

- Calendar event codec；
- Task event codec；
- Track event codec；
- Profile/Pubkey 显示；
- message/thread tags。

后续如果 Desktop 与 Web 的协议实现持续重复，再单独评估抽成 workspace package；第一版不为抽象而阻塞交付。

## 八、PWA 与发布

### 8.1 PWA 能力

- Web App Manifest；
- iPad 主屏幕图标、名称、主题色和启动样式；
- standalone display；
- service worker 缓存静态应用壳；
- 新版本更新提示；
- 离线时显示明确状态。

### 8.2 缓存边界

service worker 只缓存：

- hashed JS/CSS；
- 字体；
- 图标；
- 不含用户数据的静态 HTML 壳。

禁止缓存：

- `/query`、`/events`、`/count` 响应；
- NIP-46 请求和响应；
- User/Agent event 明文；
- DM、Task、Track、Calendar 和 Activity 数据；
- signer 连接秘密。

### 8.3 Hosting

优先由现有 Buzz Relay 的 Web 静态资源入口发布，保证 community host、NIP-98 URL 和 WebSocket origin 一致。部署要求：

- HTTPS/WSS；
- 正确 SPA fallback；
- 严格 CSP；
- 禁止不必要的第三方脚本；
- immutable hashed assets；
- `manifest.webmanifest` 和 service worker 使用正确 MIME/cache headers；
- 对版本和构建 SHA 提供可见诊断信息。

## 九、安全要求

- User nsec 永不进入 Web；
- signer 返回的签名事件必须重新验证；
- Desktop signer 使用 allowlist，而不是 record-minus-denylist；
- 所有签名请求限制 kind、tags、content 大小和 community；
- Pair SAS 拒绝后立即清理 session；
- Pair payload 不记录到 console、analytics 或错误上报；
- CSP 默认拒绝内联脚本和未知 origin；
- React 渲染用户内容时禁止不受控 HTML；
- Markdown 链接、媒体和深链需要协议 allowlist；
- IndexedDB 只保存可撤销 device key和非敏感偏好；
- Settings 提供“清除此设备”和 Desktop 端“撤销设备”；
- signer offline、授权拒绝、Relay 拒绝必须分别展示。

## 十、阶段计划

### Phase 1：Desktop 视觉基线与 PWA Shell

- 冻结 Desktop 对照截图、viewport、主题和测试数据；
- 把 Desktop 主题 token、字体和基础组件视觉移植到 Web；
- 建立认证后工作台路由；
- 复刻 Desktop AppShell、AppSidebar、主内容表面和详情面板；
- 响应式只改变折叠/覆盖方式，不改变视觉语言；
- PWA manifest、service worker 和安装引导；
- 保持 `/repos`、`/invite` 行为不变。

### Phase 2：安全 Pair 与远程 signer

- Web 实现 NIP-AB target；
- Desktop 增加 NIP-46 signer Pair 模式；
- 增加专用 Remote Signer 单播通道，不复用短时 Pair Relay；
- signer policy、设备列表、撤销和在线状态；
- NIP-42/NIP-98 通过远程 signer 完成；
- 不传 nsec。

### Phase 3：Channels 与 Agent 操作

- 先复刻 Desktop Channel/Message 的视觉 fixture；
- Channel/Thread/DM 查询和实时订阅；
- 发送消息；
- Agent Activity；
- signer offline、授权拒绝和 reconnect。

### Phase 4：Calendar、Tasks、Tracks 只读

- 共享 kinds 和 event codecs；
- 三个 feature 的查询和订阅；
- 复刻 Desktop Calendar、Tasks、Tracks 的页面、列表/Board/月历和详情视觉；
- iPad 三栏与 Compact 回退；
- Desktop/Web fixture 对齐测试。

### Phase 5：部署与安全验收

- CSP、service worker 缓存审计；
- Pair/撤销/重放/跨 community 测试；
- iPad Safari 和主屏幕 PWA 真机测试；
- Desktop/Web 同 viewport 截图对比和视觉回归门禁；
- 性能、断网、睡眠恢复和版本更新。

## 十一、验收矩阵

| 场景 | 预期结果 |
|---|---|
| iPad Safari 打开 | 展示与 Desktop 一致的 AppShell、Sidebar、内容表面和主题 |
| Desktop/Web 同数据截图 | 页面结构、颜色、字号、间距、圆角和组件状态一致 |
| Light/Dark/accent | 与 Desktop 相同 token 和切换结果 |
| 功能被裁剪 | 仅隐藏不可用控件，不改变剩余页面视觉结构 |
| 添加到主屏幕 | standalone 启动，图标和主题正确 |
| Pair | 两端 SAS 相同后建立 NIP-46，不传 nsec |
| Desktop signer 在线 | Web 完成 NIP-42/NIP-98 并读取数据 |
| Desktop signer 离线 | 明确提示，禁止假登录和秘密降级 |
| Desktop 撤销设备 | Web 下一次签名立即失败并退出受保护会话 |
| User nsec 检查 | Storage、Cache、日志、bundle 均不存在 nsec |
| Desktop 新消息 | Web 实时出现 |
| Web 发送消息 | Desktop/其他客户端收到 User Pubkey签名消息 |
| Desktop 创建日程 | Web Calendar 实时出现，只读 |
| Agent 创建日程 | Web 归入对应 Agent 来源，只读 |
| Desktop 创建 Task | Web List/Board 实时出现 |
| Agent 更新执行状态 | Web Task 详情实时更新 |
| Desktop 创建 Track | Web Track 和关联 Task 正确 |
| Split View | 自动降级布局，状态不丢失 |
| community 切换 | 旧连接、cache、订阅和选择被清理 |
| 离线启动 | 静态壳可打开，业务数据不从 service worker 泄露 |

## 十二、关键取舍与建设性建议

1. **第一版选择 Mac 在线 signer。** 它牺牲离线独立性，但不引入 User nsec 浏览器托管和 Relay delegated identity 新安全边界。
2. **Task/Track/Calendar 严格只读。** Agent 可以在 Mac 上创建和修改；Web 优先做观察、沟通和控制。
3. **消息写入保留。** 如果 Web 完全不能发消息，就无法真正操作 Agent；消息签名由远程 signer 的独立授权覆盖。
4. **不要同时建设 Flutter iPad 和完整 PWA。** 两条客户端路线并行会重复 UI、协议和测试工作。先用 PWA 验证 iPad 控制台需求，再决定原生 Mobile 是否继续扩展。
5. **不要把 Desktop React 直接改成双运行环境。** 当前 Tauri 依赖较深，强行兼容会增加大量条件分支；扩展现有 `web/` 更清晰。
6. **Mac 离线访问后置。** 真有需求时再设计可撤销、短期、scope-limited 的设备授权，不能用长期 nsec 作为捷径。
7. **UI 一致性优先于快速拼页面。** 协议可独立实现，但所有用户可见组件必须从 Desktop 事实源逐项对照；无法复用时也要视觉等价实现。
8. **建立截图门禁。** 每个页面用相同 fixture、主题和 viewport 生成 Desktop/Web 对照截图；明显差异不能以“平台不同”为由直接接受。

## 十三、代码规范检查

已检查：

- `wiki/index.md`；
- `wiki/code-spec.md`；
- `achoverse-code-spec`；
- 现有 Web Router、Nostr signer、NIP-42 client 和 NIP-98 helper；
- NIP-AB 的 SAS、NIP-44、`bunker`/`connect` payload；
- Relay `/query`、`/events`、`/count` 的 NIP-98 鉴权；
- Desktop Calendar、Task、Track 和 Tauri 依赖边界。

后续实现遵守：页面层保持薄；先定义 TypeScript 类型和协议；Relay 访问集中在 shared/api；不在组件散写连接和 URL；敏感信息不进入日志；新增 module-level community state 必须有 reset；UI 以 Desktop 当前实现为视觉事实源，覆盖 loading、empty、error、permission、offline 和 signer-offline；运行 Web lint、typecheck、build、E2E 和 Desktop/Web 视觉回归。

Task Progress:

- [x] 1. 对齐需求与影响范围（Web + Desktop signer + Relay 现有协议）
- [ ] 2. 先补类型和 Pair/NIP-46 接口
- [ ] 3. 按 shared/api、feature、page 分层实现
- [ ] 4. 完成 Desktop 视觉复刻、PWA 和 iPad 响应式状态
- [ ] 5. 补充安全、协议和 E2E 测试
- [ ] 6. 运行 lint、typecheck、build、test

## 十四、实施 Todo List

> 每个 Todo 只对应一个文件。鹿鹿子大王确认方案后才修改代码。具体实现前若发现文件职责需要调整，先更新本文 Todo，不把多个 public 职责堆入同一文件。

### Phase 1：PWA Shell

- [x] `web/tailwind.config.js`：对齐 Desktop 字号、阴影、圆角、字体和语义颜色 token。
- [x] `web/src/shared/styles/globals.css`：对齐 Desktop Light/Dark/accent、Sidebar 和内容表面变量。
- [ ] `web/src/shared/styles/desktop-parity.css`：承载 Web 环境所需但与 Desktop 等价的 shell 和触控适配。
- [ ] `web/package.json`：增加 PWA 构建、测试和依赖配置。
- [ ] `web/vite.config.ts`：配置 manifest、service worker 和构建缓存策略。
- [x] `web/index.html`：增加 iPad/PWA meta、主题色和图标声明。
- [x] `web/public/manifest.webmanifest`：定义名称、图标、启动路径和 standalone display。
- [x] `web/src/app/routes.ts`：登记 Pair 和认证后工作台路由。
- [ ] `web/src/app/routes/app.tsx`：建立认证、community 和 signer 状态门。
- [x] `web/src/shared/ui/DesktopParityAppShell.tsx`：建立 Desktop AppShell、AppSidebar 与内容表面的第一版浏览器骨架；完整视觉回归仍在 Phase 6 验收。
- [ ] `web/src/shared/hooks/useAdaptiveLayout.ts`：集中管理断点和 Split View 变化。
- [ ] `web/src/shared/ui/DesktopParityButton.tsx`：对齐 Desktop Button 的尺寸、variant 和交互状态。
- [ ] `web/src/shared/ui/DesktopParityBadge.tsx`：对齐 Desktop Badge 和状态语义。
- [ ] `web/src/shared/ui/DesktopParityAvatar.tsx`：对齐 User/Agent Avatar 和 fallback。
- [ ] `web/src/shared/ui/DesktopParitySkeleton.tsx`：对齐 Desktop 页面 skeleton 结构和动效。
- [ ] `web/src/features/pwa/PwaInstallPrompt.tsx`：提供 iPad 添加到主屏幕说明和更新提示。
- [ ] `web/src/features/pwa/serviceWorkerPolicy.ts`：限制只缓存静态壳和 hashed assets。

### Phase 2：Pair 与远程签名

- [x] `web/src/features/pairing/types.ts`：定义 NIP-AB、NIP-46、SAS 和设备状态类型。
- [x] `web/src/features/pairing/pairingCrypto.ts`：实现浏览器端 ECDH、HKDF、NIP-44 和会话密钥边界。
- [x] `web/src/features/pairing/pairingSession.ts`：实现 NIP-AB target 状态机和重复事件幂等。
- [x] `web/src/features/pairing/PairPage.tsx`：实现链接导入、SAS、确认、拒绝、signer 激活和错误恢复。
- [x] `web/src/shared/api/nip46Client.ts`：实现远程 signer 请求、响应验证、超时和连接错误。
- [ ] `web/src/shared/api/signer.ts`：统一 NIP-07、NIP-46 和无 signer 状态，不允许 nsec fallback。
- [x] `web/src/shared/storage/deviceCredentials.ts`：在 IndexedDB 保存可撤销 device key 和已验证 signer 连接。
- [ ] `web/src/features/settings/PairedDeviceSettings.tsx`：展示本 Web 设备和清除操作。
- [x] `desktop/src-tauri/src/commands/pairing.rs`：增加 NIP-46 signer Pair payload，不再为 Web 发送 nsec。
- [x] `crates/buzz-core/src/pairing/session.rs`：向 Desktop Pair source 暴露已验证 target 设备公钥。
- [x] `desktop/src/shared/api/tauri.ts`：为 Pair 命令增加 Mobile/Web 模式类型。
- [x] `desktop/src/features/settings/ui/MobilePairingCard.tsx`：增加 Web Pair 选择、复制链接和安全说明。
- [x] `desktop/src-tauri/src/commands/remote_signer.rs`：实现设备授权、首版 AUTH 签名 policy 和运行时撤销。
- [x] `desktop/src-tauri/src/commands/mod.rs`：导出 Remote Signer 命令与受管状态。
- [x] `desktop/src-tauri/src/lib.rs`：注册 Remote Signer 受管状态和撤销命令。
- [ ] `desktop/src/features/settings/PairedWebDevices.tsx`：展示权限、在线状态、最后使用和撤销。
- [x] `crates/buzz-pair-relay/src/lib.rs`：参数化安全单播策略，分别承载 24134 Pair 与 24133 signer。
- [x] `crates/buzz-pair-relay/src/main.rs`：增加独立 Remote Signer 监听器。
- [x] `crates/buzz-pair-relay/tests/integration.rs`：覆盖 signer 定向单播与错误 kind 隔离，并复用已有订阅、限流和背压回归。

### Phase 3：Relay Session 与共享领域

- [ ] `web/src/shared/api/relaySession.ts`：提供单一 NIP-42 WebSocket session、REQ 和实时订阅。
- [ ] `web/src/shared/api/relayHttp.ts`：集中实现 NIP-98 `/query`、`/count` 和错误类型。
- [ ] `web/src/shared/api/communitySession.ts`：管理 relay、identity、signer、reset 和 reconnect。
- [ ] `web/src/shared/domain/eventKinds.ts`：登记消息、Calendar、Task、Track 和 Activity kinds。
- [ ] `web/src/shared/domain/eventTags.ts`：提供安全 tag 读取、scope 和参数化事件坐标工具。
- [ ] `web/src/shared/domain/profiles.ts`：定义 User/Agent Profile 和 Pubkey 显示类型。
- [ ] `web/src/shared/api/profileQueries.ts`：批量加载 User 与 Agent 显示信息。
- [ ] `web/src/shared/ui/AsyncStateView.tsx`：统一 loading、empty、error、permission 和 signer offline。

### Phase 4：Channels 与 Agent Activity

- [ ] `web/src/features/channels/types.ts`：定义 Channel、Message、Thread 和 DM 类型。
- [ ] `web/src/features/channels/eventCodec.ts`：解析频道、消息、Thread 和 DM 事件。
- [ ] `web/src/features/channels/queries.ts`：实现历史查询和实时订阅。
- [ ] `web/src/features/channels/sendMessage.ts`：经远程 signer 构建和发送普通消息。
- [ ] `web/src/features/channels/ChannelsPage.tsx`：组装三栏和 Compact 路由。
- [ ] `web/src/features/channels/ChannelList.tsx`：展示频道、DM 和未读。
- [ ] `web/src/features/channels/ConversationView.tsx`：展示消息和 Thread。
- [ ] `web/src/features/channels/MessageComposer.tsx`：实现文本发送、mention 和 signer 状态。
- [ ] `web/src/features/activity/types.ts`：定义 Relay 可见的 Agent Activity 类型。
- [ ] `web/src/features/activity/queries.ts`：查询和订阅 Agent Activity。
- [ ] `web/src/features/activity/ActivityPage.tsx`：展示 Agent 状态和活动详情。

### Phase 5：Calendar、Tasks、Tracks 只读

- [ ] `web/src/features/calendar/types.ts`：定义 Calendar Event、Range 和 Source。
- [ ] `web/src/features/calendar/eventCodec.ts`：解析 NIP-52 全天、定时和删除事件。
- [ ] `web/src/features/calendar/queries.ts`：实现 User/Agent 多来源查询和订阅。
- [ ] `web/src/features/calendar/CalendarPage.tsx`：组装月历、Agenda 和详情。
- [ ] `web/src/features/calendar/MonthView.tsx`：实现响应式月历网格。
- [ ] `web/src/features/calendar/EventDetail.tsx`：展示只读日程详情。
- [ ] `web/src/features/tasks/types.ts`：定义 Task、History 和 Execution。
- [ ] `web/src/features/tasks/eventCodec.ts`：解析 Task 状态、历史和执行事件。
- [ ] `web/src/features/tasks/queries.ts`：实现 Task 查询、订阅、筛选和缓存。
- [ ] `web/src/features/tasks/TasksPage.tsx`：组装 List、Board 和详情。
- [ ] `web/src/features/tasks/TaskList.tsx`：展示筛选和排序后的 Task。
- [ ] `web/src/features/tasks/TaskBoard.tsx`：展示只读状态 Board。
- [ ] `web/src/features/tasks/TaskDetail.tsx`：展示详情、历史和执行状态。
- [ ] `web/src/features/tracks/types.ts`：定义 Track 和派生进度类型。
- [ ] `web/src/features/tracks/eventCodec.ts`：解析 Track 状态和历史事件。
- [ ] `web/src/features/tracks/queries.ts`：实现 Track 查询、订阅和关联 Task。
- [ ] `web/src/features/tracks/TracksPage.tsx`：组装 Track 列表和详情。
- [ ] `web/src/features/tracks/TrackList.tsx`：展示状态和进度。
- [ ] `web/src/features/tracks/TrackDetail.tsx`：展示成员、日期和关联 Tasks。

### Phase 6：测试、安全与文档

- [ ] `web/tests/e2e/pwa-install.spec.ts`：验证 manifest、service worker 和静态缓存边界。
- [ ] `web/tests/e2e/pairing.spec.ts`：验证 SAS、拒绝、重放、撤销和不传 nsec。
- [ ] `web/tests/e2e/ipad-layout.spec.ts`：验证横竖屏、Split View 和三栏降级。
- [ ] `web/tests/e2e/work-console.spec.ts`：验证频道、Calendar、Task、Track 和 Activity。
- [ ] `web/tests/e2e/desktop-visual-parity.spec.ts`：使用固定 fixture 对比 AppShell、频道和三个工作页面。
- [ ] `web/tests/helpers/desktopParityFixtures.ts`：定义 Desktop/Web 共用的确定性视觉测试数据。
- [ ] `web/tests/helpers/visualDiff.ts`：执行截图差异阈值、产物和失败报告。
- [ ] `web/src/features/pairing/pairingSession.test.ts`：覆盖 NIP-AB 状态机和幂等。
- [ ] `web/src/shared/api/nip46Client.test.ts`：覆盖签名字段校验、超时和恶意响应。
- [ ] `web/src/features/calendar/eventCodec.test.ts`：与 Desktop Calendar fixture 对齐。
- [ ] `web/src/features/tasks/eventCodec.test.ts`：与 Desktop Task fixture 对齐。
- [ ] `web/src/features/tracks/eventCodec.test.ts`：与 Desktop Track fixture 对齐。
- [ ] `web/public/_headers`：配置 CSP、nosniff、referrer 和 PWA 缓存 headers。
- [ ] `web/README.md`：补充 PWA 本地开发、部署、Pair 和安全边界。
- [ ] `wiki/clients.md`：补充 Web/PWA iPad 控制台定位。
- [ ] `wiki/flows.md`：补充 NIP-AB → NIP-46 Pair、远程签名和撤销流程。
- [ ] `wiki/architecture.md`：补充 Web signer、Relay session 和浏览器数据边界。
- [ ] `docs/2026-08-08-web-pwa-ipad-control-console-verification.md`：记录检查命令、真机结果、截图和未覆盖项。
