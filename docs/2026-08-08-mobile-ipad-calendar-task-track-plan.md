# Buzz Mobile iPad 适配与 Calendar、Task、Track 能力方案

> 更新日期：2026-08-08
> 更新说明：首次形成基于现有 Flutter Mobile 的 iPad 产品化方案，覆盖响应式导航、Calendar、Task、Track、Relay 数据一致性、Pair 配对、权限边界、分阶段交付和逐文件 Todo。

## 一、方案结论

直接改造现有 `mobile/` Flutter App 是当前最合理的路线，不重新包装 Desktop App，也不新建第二套 iPad 客户端。

原因：

- Mobile 已经具备 Pair 扫码、SAS 确认、User Key 安全存储和 Relay 会话；
- Calendar、Task、Track 已经由 Relay/Nostr Event 承载，不需要为 iPad 新建业务后端；
- Flutter 可以用同一套业务代码支持 iPhone 和 iPad；
- iPad 应作为移动控制台，通过 Relay 操作运行在 Mac 上的 Agent，而不是在 iPadOS 本地运行 Codex/Hermes；
- 后续 Agent 身份和上下文同步上线后，现有 Mobile 也能自然消费同一套数据。

本方案目标是：

```text
Mac Desktop
  └─ 运行 Agent、Codex/Hermes、本地工具和工作目录
                 ↕ Relay
iPad Mobile
  └─ Pair 登录、聊天、Calendar、Task、Track、查看和调度 Agent
```

## 二、当前问题

### 2.1 iPad 大屏没有适配

当前 iOS 工程的 `TARGETED_DEVICE_FAMILY = 1`，只声明 iPhone 目标。Mobile 首页也是以手机为中心：

- 使用底部悬浮 Tab；
- 页面主要是单列 push 导航；
- 频道列表和消息详情不能同时显示；
- 大屏会出现内容被拉宽、信息密度偏低的问题；
- Calendar、Task、Track 加入后，底部 Tab 无法继续无限扩展。

### 2.2 Mobile 缺少工作管理能力

当前 `mobile/lib/features/` 没有 Calendar、Tasks、Tracks feature。Mobile 已能读取消息、Activity、提醒等 Relay 数据，但还没有实现：

- NIP-52 Calendar 日期事件和时间事件；
- Task 当前状态、创建、修改、删除和 Agent 执行；
- Track 当前状态、创建和修改；
- Task 与 Track 的关联筛选；
- 大屏列表与详情联动。

## 三、产品范围

### 3.1 iPad 第一版

- iPad 原生全屏安装，不以 iPhone 兼容模式运行；
- 支持横屏和竖屏；
- 左侧主导航常驻；
- 中间展示列表或月历；
- 右侧展示频道、Task、Track 或日程详情；
- 支持键盘、鼠标和触控板的基础交互；
- 保留现有 Pair 流程；
- iPhone 当前核心体验不退化。

### 3.2 Calendar 第一版

- 月视图；
- 查看个人日历事件；
- 查看已拥有 Agent 发布的日历事件；
- 来源筛选：Personal 和各 Agent；
- 创建、编辑、删除 User 自己的全天或定时事件；
- 展示标题、描述、地点、参与人、开始和结束时间；
- Agent 作者的事件默认只读，不能用 User Key 冒充 Agent 修改；
- loading、empty、error、无权限和离线重试状态。

第一版不包含复杂重复日程、外部系统日历双向同步和拖拽改变时间。

### 3.3 Task 第一版

- List 与 Board 两种视图；
- 查看 Task 标题、状态、优先级、负责人、截止时间、标签和所属 Track；
- 创建 Task；
- 编辑 Task；
- 归档或删除 Task；
- 按状态、负责人、Track 和关键字筛选；
- 查看修改历史；
- 对已分配 Agent 的 Task 发出执行请求；
- 查看 queued、running、finished、failed 执行状态；
- 使用 `previous` 事件进行写冲突检测；
- 发生冲突时刷新最新版本，不静默覆盖。

### 3.4 Track 第一版

- Track 列表；
- 查看名称、描述、Owner、成员、起止日期、状态和进度；
- 创建和编辑 Track；
- 查看 Track 下的 Task；
- Track 详情与 Task 详情在 iPad 右侧面板切换；
- 仅允许符合 Relay 权限的用户执行写操作；
- Track Owner/Member 是具体 Pubkey，不把“同配置 Agent”视为同一成员。

### 3.5 暂不在 iPad 本地提供

- 启动 Codex、Hermes 或 Goose 进程；
- 访问 Mac 项目目录；
- 本地 shell、Git、MCP 文件工具；
- Agent 私钥和模型 API Key 管理；
- Desktop 完整 Agent 创建和 runtime 配置；
- Desktop 原生运行日志文件查看。

iPad 可以通过消息、Task 执行请求和未来的远程控制事件驱动 Mac 上的 Agent。

## 四、iPad 信息架构

### 4.1 响应式断点

不按设备名称硬编码，而按可用宽度选择布局：

| 宽度模式 | 建议范围 | 布局 |
|---|---:|---|
| Compact | `< 700dp` | iPhone 单列 + 底部导航 |
| Medium | `700–1099dp` | NavigationRail + 单主内容区 |
| Expanded | `>= 1100dp` | NavigationRail + 列表/日历 + 详情面板 |

断点由统一响应式组件管理，业务页面不各自定义一套数字。Split View 缩窄时必须能自动退回 Medium 或 Compact。

### 4.2 主导航

iPad 使用左侧 NavigationRail：

- Home / Channels；
- Calendar；
- Tasks；
- Tracks；
- Activity；
- Search；
- Settings。

iPhone 不建议把七个入口都塞进底部导航。保留现有 Home、Activity、Search，并在 Home 增加 Work 入口，进入 Calendar、Tasks、Tracks 工作中心。这样不会破坏现有拇指操作习惯。

### 4.3 Expanded 布局

```text
┌──────────┬────────────────────┬──────────────────────────┐
│ 主导航    │ 列表 / 月历         │ 详情                     │
│ Channels │ Channel List       │ Conversation             │
│ Calendar │ Month / Agenda     │ Event Detail             │
│ Tasks    │ Task List / Board  │ Task Detail / Execution  │
│ Tracks   │ Track List         │ Track + Child Tasks      │
└──────────┴────────────────────┴──────────────────────────┘
```

没有选中项目时，右侧显示明确的空状态；不能为了填满空间自动选择并执行可能产生副作用的对象。

## 五、数据与协议方案

### 5.1 不新增专用 HTTP API

遵循 Buzz Code Spec，Mobile 直接使用已有 Relay bridge 和 WebSocket：

- 历史读取：`POST /query`；
- 实时更新：WebSocket subscription；
- 写入：使用当前 User Key 签名后 publish；
- community：继承 Pair 得到的 Relay 配置；
- 每个 query 必须指定明确 kinds。

### 5.2 Calendar

- 全天事件：kind `31922`；
- 定时事件：kind `31923`；
- 删除：kind `5`，使用目标坐标；
- 使用 `d`、`title`、`start`、`end`、`location`、`p`、`a` 等现有 Desktop tag 约定；
- User 事件由 User Key 签名；
- Agent 日历按 Agent Pubkey读取，只读展示；
- 以参数化可替换事件最新头为准；
- 日期事件按本地日期解释，定时事件按 Unix 秒和 tzid 解释。

### 5.3 Task

- 当前状态：kind `30500`；
- 创建：kind `42500`；
- 修改：kind `42501`；
- 删除：kind `42502`；
- Agent 执行请求：kind `42503`；
- 执行更新/状态：kind `42504` / `30501`；
- Mobile 的字段解析、tag 构建、默认值和校验必须与 Desktop `taskEvents.ts` 保持一致；
- 修改携带 `previous`，Relay 返回冲突时显示“Task 已在其他设备更新”。

### 5.4 Track

- 当前状态：kind `30510`；
- 创建：kind `42510`；
- 修改：kind `42511`；
- Mobile 的 Owner、Member、日期、状态、归档和唯一成员处理必须与 Desktop `trackEvents.ts` 保持一致；
- Track 进度由关联 Task 派生，不单独创建第二份进度事实来源。

### 5.5 Agent 与用户资料

Calendar 来源、Task Assignee、Track Owner/Member 都需要 Pubkey 到显示名称的解析。共享层提供批量 Profile 和 Owned Agent Pubkey 查询，三个 feature 只能依赖 shared，不能相互 import。

Mobile 不需要持有 Agent 私钥即可：

- 查看 Agent 日历；
- 把 Task 分配给 Agent；
- 向 Agent 发执行请求；
- 查看 Agent 的执行状态。

## 六、Flutter 架构

### 6.1 分层

每个 feature 内保持：

```text
models.dart       领域类型
event_codec.dart  Nostr Event 解析与构建
provider.dart     Riverpod 查询、订阅、写入和缓存
page.dart         页面组装
page/             小型私有组件 part 文件
```

约束：

- 页面使用 `HookConsumerWidget` 或 `ConsumerWidget`；
- 不新增 `StatefulWidget`；
- feature 不能 import 另一个 feature；
- 跨 Calendar/Task/Track 的 Pubkey、Profile、Relay 签名发布能力放入 `shared/`；
- 一个 public widget 一个文件；
- 文件接近 1000 行前按职责拆分，不提高限制；
- 同一个 Relay 状态只有一个 Riverpod 数据源；
- 订阅必须在 provider dispose 时取消；
- community 切换后 provider key 必须包含 identity/relay，不能泄漏旧 community 数据。

### 6.2 响应式 Shell

新增共享响应式 Shell，负责：

- 计算 Compact/Medium/Expanded；
- 在底部导航和 NavigationRail 之间切换；
- 管理 master/detail 选中状态；
- 处理 iPad Split View 和旋转；
- 保留各 destination 的滚动与筛选状态；
- 支持键盘焦点和 Escape/返回行为。

业务页面只声明 destination 和内容，不直接判断“是不是 iPad”。

## 七、Pair 与身份体验

现有 Desktop → Mobile Pair 流程继续复用：

1. Desktop 生成二维码；
2. iPad 扫码；
3. 两端确认相同 SAS；
4. iPad 接收 Relay URL、User Pubkey 和 User nsec；
5. iPad 使用同一 User 身份连接 Relay；
6. Calendar、Task、Track 根据同一身份加载。

Pair 后看到相同 Task/Track 和个人 Calendar，不代表 iPad 本地运行了同一个 Agent。Agent 仍由在线 Mac 执行。若 Mac 下线，iPad 仍可编辑工作数据，但 Agent 执行请求会等待或失败，UI 必须明确显示。

## 八、iOS/iPadOS 工程调整

- 把 `TARGETED_DEVICE_FAMILY` 从仅 iPhone 调整为 iPhone + iPad；
- 补充 iPad 横竖屏方向声明；
- 检查 iPad App Icon、Launch Screen 和权限文案；
- 设置合理的最低 iPadOS 版本；
- 在真机验证摄像头扫码、键盘、触控板、Split View 和后台恢复；
- 开发安装和分发仍需要 Apple 签名，建议先用开发签名真机安装，再走 TestFlight。

项目规则禁止 Agent 运行 `flutter build` 和 `flutter run`。代码阶段只执行 format、analyze、test；真机打包由鹿鹿子大王在 Xcode 或正式发布流程中完成。

## 九、分阶段实施

### Phase 1：iPad 壳与导航

- 打开 iPad target；
- 建立统一响应式断点；
- iPad 使用 NavigationRail；
- Channels 完成 master/detail；
- iPhone 保持现有导航；
- 补响应式 widget tests。

### Phase 2：Task 与 Track 只读

- 先实现共享 kinds、models、event codec 和 providers；
- Tasks/Tracks 从 Relay 拉取并实时订阅；
- iPad 列表 + 详情，iPhone 单列；
- 验证与 Desktop 同一数据集。

### Phase 3：Task 与 Track 写入

- 创建、编辑、归档和删除；
- Task 执行请求与执行状态；
- 冲突提示和刷新；
- 权限、离线和错误恢复。

### Phase 4：Calendar

- 月视图和来源筛选；
- 个人事件 CRUD；
- Agent 日历只读；
- 日期、时区、删除和实时订阅测试。

### Phase 5：iPad 打磨与发布

- 横竖屏、Split View、键盘和触控板；
- loading/empty/error/permission/offline；
- 性能和大数据量；
- 真机 Pair 与 TestFlight 验收。

## 十、验收矩阵

| 场景 | 预期结果 |
|---|---|
| iPad 横屏 | NavigationRail + master/detail，不出现手机放大版布局 |
| iPad 竖屏 | 根据宽度使用 Medium 或 Expanded，无溢出 |
| Split View 缩窄 | 自动切回单内容区，选择状态保留 |
| iPhone | 保持现有底部导航和单列体验 |
| Desktop 配对 iPad | SAS 成功后以同一 User Pubkey登录 |
| Desktop 创建 Task | iPad 实时出现 |
| iPad 修改 Task | Desktop 实时更新 |
| 两端同时修改 Task | 后写端收到冲突，不静默覆盖 |
| iPad 执行 Agent Task | 在线 Mac Agent 接收，状态实时返回 |
| Mac Agent 离线 | iPad 显示等待或失败，不假装执行成功 |
| Desktop 创建 Track | iPad 列表和关联 Task 正确 |
| iPad 创建个人日程 | Desktop Calendar 可见 |
| Agent 创建日程 | iPad 可见但默认只读 |
| community 切换 | 旧 Relay 的 Calendar/Task/Track 状态被释放 |
| 无权限写入 | 展示明确原因和恢复入口 |

## 十一、建设性建议

1. 不建议第一轮追求 Desktop 所有细节 1:1 复制。iPad 应优先完成查看、编辑和 Agent 调度，复杂管理继续留在 Mac。
2. 建议 Task/Track 先只读后写入。这样可以先验证协议解析和多端一致性，再承担冲突与权限风险。
3. Calendar 放在 Task/Track 之后。Task/Track 是 Agent 工作闭环的核心，Calendar 更偏展示和个人安排。
4. iPad 主导航不要沿用手机底部 Tab 的扩容方式。新增 NavigationRail 能避免入口过多，也更符合键盘和横屏使用。
5. 真正的“iPad 操作 Agent”依赖 Mac Agent 在线状态。后续应补 Agent 运行位置和在线状态，而不是让 iPad 按钮在离线时看起来仍能执行。

## 十二、代码规范检查

已检查：

- `wiki/index.md`；
- `wiki/code-spec.md`；
- `AGENTS.md` 的 Mobile App 规则；
- `achoverse-code-spec`；
- 现有 Mobile App、Home 导航、Pair、Relay provider；
- Desktop Calendar、Task、Track 的类型和事件协议。

后续实现将遵守：Riverpod + Hooks；不新增 `StatefulWidget`；feature 之间不直接 import；一个 public widget 一个文件；单文件不超过 1000 行；使用 `Grid`、`Radii`、`context.colors` 和 `context.textTheme`；只运行 `dart format`、`flutter analyze`、`flutter test`，不由 Agent 运行 Flutter build/run。

Task Progress:

- [x] 1. 对齐需求与影响范围（Mobile + iPad + Relay 现有协议）
- [ ] 2. 先补类型与事件 codec，再写 provider
- [ ] 3. 按 feature/shared 边界实现业务
- [ ] 4. 完成 Compact/Medium/Expanded 交互
- [ ] 5. 补充测试和相关文档
- [ ] 6. 运行 format、analyze、test

## 十三、实施 Todo List

> 每个 Todo 只对应一个文件。以下是拟定文件清单；鹿鹿子大王确认方案后才修改代码。实施时如果现有文件职责与拟定路径冲突，先更新本文再改代码。

### Phase 1：iPad 与响应式框架

- [ ] `mobile/ios/Runner.xcodeproj/project.pbxproj`：启用 iPhone + iPad device family。
- [ ] `mobile/ios/Runner/Info.plist`：补充 iPad 横竖屏和窗口能力声明。
- [ ] `mobile/lib/shared/layout/adaptive_layout.dart`：定义 Compact、Medium、Expanded 断点和布局信息。
- [ ] `mobile/lib/shared/widgets/adaptive_app_shell.dart`：实现底部导航、NavigationRail 和 master/detail Shell。
- [ ] `mobile/lib/features/home/home_page.dart`：接入响应式 Shell 和 Work 入口。
- [ ] `mobile/lib/features/channels/channels_page.dart`：适配 iPad channel master/detail 选择。
- [ ] `mobile/test/shared/layout/adaptive_layout_test.dart`：覆盖断点、旋转和 Split View。
- [ ] `mobile/test/features/home/home_page_adaptive_test.dart`：覆盖 iPhone 与 iPad 导航差异。

### Phase 2：共享工作数据能力

- [ ] `mobile/lib/shared/relay/event_kinds.dart`：登记 Calendar、Task、Track 和执行事件 kinds。
- [ ] `mobile/lib/shared/relay/work_event_helpers.dart`：提供共享 tag、时间、UUID、previous 和校验辅助函数。
- [ ] `mobile/lib/shared/identity/owned_agents_provider.dart`：提供当前 User 拥有的 Agent Pubkey和显示名。
- [ ] `mobile/lib/shared/profile/profile_batch_provider.dart`：提供跨 feature 的 Pubkey 批量资料解析。
- [ ] `mobile/lib/shared/widgets/async_state_view.dart`：统一 loading、empty、error 和 retry 状态。

### Phase 3：Tasks

- [ ] `mobile/lib/features/tasks/task_models.dart`：定义 Task、Draft、Patch、History 和 Execution 类型。
- [ ] `mobile/lib/features/tasks/task_event_codec.dart`：解析状态/历史并构建创建、修改、删除、执行事件。
- [ ] `mobile/lib/features/tasks/tasks_provider.dart`：实现历史查询、实时订阅、写入、冲突和刷新。
- [ ] `mobile/lib/features/tasks/tasks_page.dart`：组装 iPhone 单列和 iPad master/detail。
- [ ] `mobile/lib/features/tasks/tasks_page/task_list.dart`：实现列表、筛选和排序。
- [ ] `mobile/lib/features/tasks/tasks_page/task_board.dart`：实现状态 Board。
- [ ] `mobile/lib/features/tasks/tasks_page/task_detail.dart`：实现详情、历史和执行状态。
- [ ] `mobile/lib/features/tasks/tasks_page/task_editor.dart`：实现创建和编辑表单。
- [ ] `mobile/test/features/tasks/task_event_codec_test.dart`：与 Desktop fixture 对齐解析和构建。
- [ ] `mobile/test/features/tasks/tasks_provider_test.dart`：覆盖查询、订阅、冲突和执行状态。
- [ ] `mobile/test/features/tasks/tasks_page_test.dart`：覆盖列表、详情、编辑、错误和 iPad 布局。

### Phase 4：Tracks

- [ ] `mobile/lib/features/tracks/track_models.dart`：定义 Track、Draft、Patch、状态和进度类型。
- [ ] `mobile/lib/features/tracks/track_event_codec.dart`：解析 Track 状态并构建创建和修改事件。
- [ ] `mobile/lib/features/tracks/tracks_provider.dart`：实现历史查询、实时订阅、写入和冲突处理。
- [ ] `mobile/lib/features/tracks/tracks_page.dart`：组装 iPhone 单列和 iPad master/detail。
- [ ] `mobile/lib/features/tracks/tracks_page/track_list.dart`：实现列表、状态和进度展示。
- [ ] `mobile/lib/features/tracks/tracks_page/track_detail.dart`：实现详情和关联 Task 展示。
- [ ] `mobile/lib/features/tracks/tracks_page/track_editor.dart`：实现创建和编辑表单。
- [ ] `mobile/test/features/tracks/track_event_codec_test.dart`：与 Desktop fixture 对齐。
- [ ] `mobile/test/features/tracks/tracks_provider_test.dart`：覆盖查询、订阅和冲突。
- [ ] `mobile/test/features/tracks/tracks_page_test.dart`：覆盖详情、编辑、错误和 iPad 布局。

### Phase 5：Calendar

- [ ] `mobile/lib/features/calendar/calendar_models.dart`：定义事件、Draft、Range 和 Source 类型。
- [ ] `mobile/lib/features/calendar/calendar_event_codec.dart`：解析和构建 NIP-52 日期/时间事件及删除事件。
- [ ] `mobile/lib/features/calendar/calendar_provider.dart`：实现多来源查询、实时订阅、CRUD 和错误隔离。
- [ ] `mobile/lib/features/calendar/calendar_page.dart`：组装 iPhone 和 iPad Calendar 页面。
- [ ] `mobile/lib/features/calendar/calendar_page/month_view.dart`：实现月历网格和选中日期。
- [ ] `mobile/lib/features/calendar/calendar_page/agenda_list.dart`：实现日期议程列表。
- [ ] `mobile/lib/features/calendar/calendar_page/event_detail.dart`：实现详情和 Agent 事件只读状态。
- [ ] `mobile/lib/features/calendar/calendar_page/event_editor.dart`：实现个人事件创建与编辑。
- [ ] `mobile/lib/features/calendar/calendar_page/source_filter.dart`：实现 Personal/Agent 来源筛选。
- [ ] `mobile/test/features/calendar/calendar_event_codec_test.dart`：覆盖全天、定时、时区、替换和删除。
- [ ] `mobile/test/features/calendar/calendar_provider_test.dart`：覆盖多来源、订阅、权限和错误隔离。
- [ ] `mobile/test/features/calendar/calendar_page_test.dart`：覆盖月历、详情、编辑和响应式布局。

### Phase 6：文档与验收

- [ ] `mobile/README.md`：补充 iPad 开发签名、Pair 和真机验收流程。
- [ ] `wiki/clients.md`：补充 iPad 控制台能力与本地 Agent 运行边界。
- [ ] `wiki/flows.md`：补充 iPad Pair、Task 执行和 Calendar/Track 同步流程。
- [ ] `docs/2026-08-08-mobile-ipad-calendar-task-track-verification.md`：记录测试、真机截图和未覆盖项。

