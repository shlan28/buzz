# Buzz 日历模块实施计划

> 更新日期：2026-08-01
> 更新说明：实施前补充协议、权限、存储、CLI、日期数学、UI 交互、可访问性和视觉回归测试矩阵；确认首版不做重复日程，并支持在日/周时间网格中点击或拖拽快速创建。此前已确认日程默认仅作者可见、Agent 管理自己署名的日程、不做会议室与预约活动、外部同步延后。

## 1. 目标

在 Buzz 桌面客户端中增加一个与现有客户端视觉、导航和交互一致的日历模块，让成员和 Agent 都能查看日程，并通过统一的 Nostr 事件链路创建、查询、更新和删除日程。

参考图用于确定日历的信息架构：左侧迷你月历和日历筛选，右侧日/周/月主视图及快速创建入口。实现不复制参考产品的顶部导航、颜色或组件样式，而是复用 Buzz 的全局社区栏、主侧栏、主题 token、按钮、对话框和路由体系。

## 2. 首版产品范围

### 2.1 首版包含

- 在 Buzz 主侧栏增加一级入口“Calendar”，进入 `/calendar`。
- 日、周、月三种视图；默认进入周视图。
- Today、上一周期、下一周期、日期范围标题和日期选择。
- 左侧内部日历栏：迷你月历、“我的日历”列表、日历显示开关。
- 创建、查看、编辑、删除全天日程和定时日程。
- 点击日/周时间网格的空白时段，直接创建带默认时间范围的日程草稿；拖拽可选择自定义时间范围。
- 创建草稿时在网格中同步显示临时日程块，并打开轻量快速创建浮层。
- 日程字段：标题、说明、开始、结束、全天、IANA 时区、地点、参与者、所属日历。
- URL 保存视图状态，例如 `/calendar?view=week&date=2026-08-01&event=<coordinate>`。
- Relay 实时事件到达后刷新当前日历视图。
- Agent 通过 `buzz calendar` 命令直接创建、查询、更新和删除自己署名的日程。
- 所有日程按 Buzz community 隔离；首版默认仅日程作者可读取。

### 2.2 首版不包含

- 重复日程及 RRULE（已确认首版不做）。
- Google Calendar、Apple Calendar、Exchange 等外部同步。
- 会议室、设备等资源预约。
- “预约活动”公开报名页。
- RSVP、空闲/忙碌计算和冲突自动协调。
- Agent 冒充用户签名或静默修改用户署名日程。
- 日程提醒；后续可用现有 NIP-ER `kind:30300` 私有提醒引用日程坐标。

### 2.3 已确认的范围

- Agent 管理自己 pubkey 署名的日程，不代替用户签名。
- 不做会议室和预约活动。
- 外部日历同步延后。
- 不做重复日程。

## 3. 产品体验

### 3.1 页面结构

Buzz 原有全局壳层保持不变。Calendar 内容区采用内部两栏：

1. 内部左栏，宽约 `15rem`–`17rem`
   - 迷你月历。
   - 当前月份切换。
   - “我的日历”列表和颜色标识。
   - 日历可见性开关。
2. 主视图
   - 顶部工具栏：Today、前后导航、当前范围、Day/Week/Month、Create event。
   - 全天事件区。
   - 日/周视图的时间网格与当前时间线。
   - 月视图的日期网格与事件摘要。
   - 点击或拖拽空白时间段，快速带入开始/结束时间。
   - 点击日程显示详情浮层，可进入编辑或删除。

窄窗口下，内部左栏收进弹层；周/月视图允许退化到更适合窄屏的日视图。页面本身不滚动，只有日历主网格滚动。

### 3.2 时间网格快速创建

参考截图中的创建方式适用于日视图和周视图，具体规则如下：

1. 用户单击一个空白时间格时，以点击所在的时间刻度作为开始时间，默认创建 30 分钟的草稿。
2. 用户在时间网格中纵向拖拽时，以拖拽起止位置创建对应时长的草稿；时间吸附到 15 分钟刻度。
3. 操作开始后，网格原位置立即显示半透明临时日程块，并在其附近打开轻量创建浮层。
4. 浮层自动聚焦标题，首屏字段为：标题、参与者、开始/结束日期时间、描述、所属日历。
5. 首版不显示视频会议、会议室和重复规则入口；这些能力不使用禁用占位符干扰用户。
6. “保存”发布日程事件并把临时块替换为正式日程；“取消”、点击浮层外部或按 Escape 均移除未保存草稿。
7. “更多选项”打开完整日程编辑对话框，用于编辑时区、地点和多个参与者；已经选择的时间及输入内容必须保留。
8. 创建请求进行中时禁止重复提交；失败时保留草稿和用户输入，并显示可重试错误。
9. 点击已有日程只打开详情，不得误触发新建；点击全天区则创建全天日程草稿。
10. 月视图点击日期默认打开该日期的全天日程草稿；点击已有日程仍打开详情。

建设性建议：单击与拖拽应该同时支持。仅支持单击虽然开发简单，但用户创建 90 分钟或跨多个时间格的日程时必须再手动修改结束时间；拖拽选择能显著减少操作步骤。

### 3.3 Buzz 视觉一致性

- 复用 `background`、`card`、`border`、`muted`、`primary`、`sidebar` 等语义颜色。
- 复用 shared UI 的 Button、Dialog、Input、Checkbox、Tabs/segmented control。
- 所有可读文字使用 Tailwind 的 rem 字号 token；禁止任意 px/rem 字号。
- 复用现有顶部窗口 chrome、侧栏选中态、圆角、焦点环和明暗主题。
- 日程颜色表达日历归属，不能只依赖颜色；同时提供标题、状态或图标供无障碍识别。

## 4. 数据与协议设计

### 4.1 采用 NIP-52

不新造 Buzz 私有日程 kind，采用 Nostr NIP-52 的 addressable events：

| Kind | 用途 | 首版状态 |
| --- | --- | --- |
| `31922` | 全天或跨日事件 | 实现 |
| `31923` | 有明确时间的事件 | 实现 |
| `31924` | 日历集合 | 实现基础管理 |
| `31925` | RSVP | 登记并校验，UI 延后 |

每条日程使用稳定、随机的 `d` 标识。更新复用同一 `(kind, pubkey, d)` 坐标发布 replacement；删除发布 NIP-09 `kind:5`，用 `a` tag 指向日程坐标。

### 4.2 字段规则

- 全天日程：`start`/`end` 使用 `YYYY-MM-DD`；不转换成 UTC；`end` 为排他边界。
- 定时日程：`start`/`end` 使用 Unix 秒；同时保存 `start_tzid`/`end_tzid`。
- 时区必须是 IANA ID，例如 `Asia/Shanghai`，不持久化 `GMT+8` 这类固定偏移描述。
- `title`、`d`、`start` 必填；校验 `end > start`、tag 唯一性和时区合法性。
- 全天与定时事件属于不同 kind。类型转换创建新坐标后删除旧坐标，不把它伪装成同一 replacement。

### 4.3 存储、可见性和权限

- 日程以签名 Nostr event 形式存入 Buzz Relay 的 PostgreSQL `events` 表；桌面端只保留查询缓存，不作为唯一数据源。
- 日历事件是 community 内的 global event，不使用 channel `h` tag。
- `31922`–`31925` 加入 author-only 读取门禁；查询必须显式 `authors=[self]`，Relay 不向其他社区成员返回事件、计数或搜索结果。
- “仅自己可见”在首版定义为 Relay 访问控制，而不是端到端加密：Relay 服务端和数据库管理员仍可看到 NIP-52 的标题、时间、地点等公开 tag。若要求 Relay 也无法读取内容，需要单独设计加密 envelope，并会降低标准 NIP-52 互操作性和服务端范围查询能力。
- 写入使用 `UsersWrite` scope。
- 用户或 Agent 只能更新自己 pubkey 下的日程坐标。
- 用户可沿用现有 owner-agent 删除规则删除其所属 Agent 的日程，但不能以用户签名替换 Agent 署名的日程。
- 严格 author-only 模型下，用户默认看不到 Agent 署名的日程。若产品期望用户在自己的 Calendar 页面看到所属 Agent 创建的日程，需要额外增加“owner 可读 owned-agent 日程”的授权规则；这仍不赋予用户替换 Agent 签名的能力。
- UI 必须显示日程作者；仅作者可看到编辑入口，避免“看得到就能改”的错觉。

### 4.4 查询和数据库投影

日程发生时间与 Nostr `created_at` 无关。不能只查询 `kind` 后在客户端过滤：当前单次查询存在条数上限，长期会漏掉旧创建但未来才发生的日程。

在 `events` 增加可从公开 tag 派生的日历投影字段，并建立以 community 为前缀的活跃事件范围索引。协议仍返回标准 Nostr event，投影只用于 Relay 正确、高效地执行可见窗口查询。迁移需要回填历史 NIP-52 事件。

## 5. Agent 操作设计

### 5.1 CLI 命令

```text
buzz calendar create --title <text> --start <RFC3339|YYYY-MM-DD> [options]
buzz calendar list --from <value> --to <value> [--calendar <id>] [--author me|<pubkey>]
buzz calendar get --id <id> [--author me|<pubkey>]
buzz calendar update --id <id> [field patches]
buzz calendar delete --id <id>
```

`create` 支持 `--end`、`--timezone`、`--all-day`、`--description`、`--summary`、`--location`、`--participant`、`--calendar` 和可选 `--id`。

### 5.2 幂等与并发

- Agent 应为可重试创建提供稳定 `--id`，避免一次任务重跑后生成重复日程。
- `update`/`delete` 必须显式指定稳定 ID，并先读取当前 head。
- 更新只覆盖显式传入字段，未传字段保持不变；清空字段使用明确的 `--clear-*` 参数。
- 可选 `--expected-event` 用于发现旧版本覆盖；Relay 目前没有原子 CAS，因此它是冲突提示，不是假装强一致锁。

### 5.3 返回契约

写操作沿用统一结构，并增加稳定实体信息：

```json
{
  "event_id": "<nostr-event-id>",
  "accepted": true,
  "message": "stored",
  "calendar_event_id": "<d-tag>",
  "coordinate": "31923:<author-pubkey>:<d-tag>"
}
```

`list`/`get` 输出归一字段：`id`、`coordinate`、`author`、`kind`、`title`、`description`、`start`、`end`、`start_tzid`、`end_tzid`、`all_day`、`locations`、`participants`、`calendar_ids`、`updated_at`。

### 5.4 身份边界

ACP 已向 Agent 子进程注入 Relay URL、私钥和授权 tag，因此无需新增 Agent-Runtime 通道。Agent 发出的事件由 Agent 自己签名。

如果未来要让 Agent 代表用户更新用户署名日程，应单独设计可审计的 delegation/approval 事件流程；不能让 CLI 或 Relay 代签，否则会破坏现有身份和授权模型。

## 6. 实施阶段

### 阶段 A：协议与存储

- 登记 NIP-52 kinds 和校验规则。
- 增加日程时间投影、历史回填和范围索引。
- 打通窗口查询、replacement 和删除。

### 阶段 B：SDK、CLI 与 Agent

- 增加 typed builders。
- 实现 `buzz calendar` CRUD。
- 将命令、时区、幂等和署名边界加入 Agent 基础提示。

### 阶段 C：桌面 UI

- 接入 `/calendar` 和主侧栏入口。
- 实现日期数学、窗口查询和实时刷新。
- 实现日/周/月视图及创建、编辑、删除体验。

### 阶段 D：验证与发布

- 单元、Relay 集成和桌面 E2E 测试。
- 深浅主题、窄窗口、DST、跨日与跨月截图验证。
- 先以 preview feature 发布，验证后转稳定功能。

## 7. 逐文件 Todo

以下每条 Todo 只对应一个文件；实现前仍需按阶段拆分提交并逐项验证。

### 协议、Relay 与数据库

- [ ] `crates/buzz-core/src/kind.rs`：登记 `31922`–`31925`、加入 author-only registry 和 addressable compile-time assertions。
- [ ] `crates/buzz-relay/src/handlers/ingest.rs`：加入 `UsersWrite`、global-only 规则和 NIP-52 tag/时间/时区校验。
- [ ] `crates/buzz-db/src/event.rs`：解析日程投影并扩展按可见时间窗口查询的条件。
- [ ] `crates/buzz-db/src/lib.rs`：把日程投影接入 parameterized replacement 写入并增加并发 replacement 测试。
- [ ] `schema/schema.sql`：增加日程投影列和 community-leading 活跃事件范围索引。
- [ ] `migrations/0027_calendar_event_projection.sql`：增加线上迁移、历史 NIP-52 事件回填和部分索引。
- [ ] `crates/buzz-relay/src/handlers/req.rs`：把日历窗口过滤映射到数据库查询并保证分页不截断。
- [ ] `crates/buzz-relay/src/handlers/count.rs`：同步日历窗口和可见性规则，保持 COUNT 与 REQ 一致。
- [ ] `crates/buzz-relay/src/handlers/side_effects.rs`：增加日历坐标删除和 owner-agent 删除边界回归测试。
- [ ] `crates/buzz-search/tests/fts_integration.rs`：禁止私有日程进入 FTS，并验证 author-only 与 community 隔离。
- [ ] `docs/nips/NIP-52-BUZZ.md`：记录 Buzz 对 NIP-52 的采用范围、权限、时区、类型转换、删除和非目标。

### SDK、CLI 与 Agent

- [ ] `crates/buzz-sdk/src/lib.rs`：增加公开的日历输入、参与者和更新类型及文档。
- [ ] `crates/buzz-sdk/src/builders.rs`：增加全天/定时日程、日历集合和坐标删除 builders 及单测。
- [ ] `crates/buzz-cli/src/lib.rs`：注册 `CalendarCmd`、参数互斥关系和 parser surface 测试。
- [ ] `crates/buzz-cli/src/commands/mod.rs`：导出 calendar 命令模块。
- [ ] `crates/buzz-cli/src/commands/calendar.rs`：实现 CRUD、时间解析、区间归一、read-before-write 和 JSON 输出。
- [ ] `crates/buzz-acp/src/base_prompt.md`：告知 Agent 日历命令、时区、幂等和署名边界。
- [ ] `crates/buzz-acp/src/lib.rs`：补充基础提示包含日历契约的测试。
- [ ] `crates/buzz-cli/README.md`：增加可复制的日历命令和返回示例。
- [ ] `crates/buzz-cli/TESTING.md`：增加 live calendar CLI 验证流程。

### 桌面导航与功能入口

- [ ] `preview-features.json`：登记 calendar preview feature。
- [ ] `desktop/src/app/routes.ts`：注册 `/calendar` 路由。
- [ ] `desktop/src/app/routes/calendar.tsx`：定义搜索参数、懒加载和 loading fallback。
- [ ] `desktop/src/app/AppShell.helpers.ts`：让 `AppView` 和 `deriveShellRoute` 识别 calendar。
- [ ] `desktop/src/app/navigation/useAppNavigation.ts`：增加保留 view/date/event 状态的 `goCalendar`。
- [ ] `desktop/src/app/AppShell.tsx`：接入 Calendar 导航回调并传入侧栏。
- [ ] `desktop/src/features/sidebar/ui/AppSidebar.tsx`：扩展 selectedView 和 Calendar 回调 props。
- [ ] `desktop/src/features/sidebar/ui/AppSidebarPinnedHeader.tsx`：增加 Calendar 一级菜单、选中态和 test id。

### 桌面日历模块

- [ ] `desktop/src/features/calendar/lib/calendarTypes.ts`：定义视图、范围、日程 DTO 和 presentation 类型。
- [ ] `desktop/src/features/calendar/lib/calendarDateMath.ts`：实现周/月范围、slot、日期解析和 DST 安全计算。
- [ ] `desktop/src/features/calendar/lib/calendarDateMath.test.mjs`：覆盖跨月、跨年、DST 和本地日边界。
- [ ] `desktop/src/features/calendar/hooks.ts`：实现窗口查询、CRUD mutation、缓存与实时失效。
- [ ] `desktop/src/features/calendar/ui/CalendarScreen.tsx`：编排 URL 状态、响应式布局和对话框。
- [ ] `desktop/src/features/calendar/ui/CalendarToolbar.tsx`：实现 Today、翻页、范围标题、视图切换和创建按钮。
- [ ] `desktop/src/features/calendar/ui/CalendarSidebar.tsx`：实现迷你月历和日历显示筛选。
- [ ] `desktop/src/features/calendar/ui/CalendarGrid.tsx`：实现日/周时间网格、全天栏、当前时间线、点击/拖拽选时、临时日程块和重叠布局。
- [ ] `desktop/src/features/calendar/ui/CalendarMonthView.tsx`：实现月视图和日期溢出摘要。
- [ ] `desktop/src/features/calendar/ui/CalendarEventDialog.tsx`：实现轻量快速创建与完整编辑两种模式、草稿保留、字段校验和类型转换确认。
- [ ] `desktop/src/features/calendar/ui/CalendarEventPopover.tsx`：实现快速详情、作者标识、编辑和删除入口。

### 自动化验证

- [ ] `crates/buzz-test-client/tests/e2e_calendar.rs`：覆盖 CRUD、同坐标 replacement、删除、跨作者权限、范围查询和时区。
- [ ] `desktop/src/testing/e2eBridge.ts`：为日历查询、实时事件和 CRUD 增加 mock relay 数据。
- [ ] `desktop/tests/e2e/calendar.spec.ts`：覆盖导航、URL 恢复、三视图、单击/拖拽快速创建、取消草稿、CRUD、Agent 实时写入和响应式截图。
- [ ] `desktop/playwright.config.ts`：将 Calendar E2E 注册进 smoke 项目。

## 8. 验收标准

- 用户能从 Buzz 主侧栏进入 Calendar，侧栏选中态和前进/后退行为正确。
- 日、周、月视图均能显示全天及定时日程，跨日、跨月和重叠事件无明显错位。
- 单击空白时间格会创建默认 30 分钟草稿，拖拽会按 15 分钟刻度选择时间范围；取消后不产生 Relay 事件。
- 快速创建浮层默认聚焦标题，保存失败不丢失输入，“更多选项”可无损进入完整编辑。
- 创建、编辑、删除后无需刷新即可看到结果；另一客户端或 Agent 写入后也能实时出现。
- `buzz calendar create/list/get/update/delete` 的 JSON 契约稳定，可被 Agent 可靠解析。
- Agent 重试带同一 `--id` 的 create 不产生重复坐标。
- 其他社区成员无法读取、计数或搜索作者的日程。
- 用户不能替换其他成员或 Agent 署名的日程；Agent 不能替换用户署名的日程。
- 按时间窗口查询不会因 `created_at` 或单次 1000 条上限漏掉日程。
- `Asia/Shanghai` 及包含 DST 的 IANA 时区测试通过；全天事件不因 UTC 转换偏移日期。
- 明暗主题、键盘焦点、窄窗口和屏幕阅读器标签符合现有 Buzz UI 规范。
- 实现后通过相关单测、集成测试、桌面 E2E 和最终 `just ci`。

### 8.1 测试矩阵

| 层级 | 必测场景 |
| --- | --- |
| Kind registry | `31922`–`31925` 无碰撞、属于 addressable range、进入 author-only 集合 |
| Ingest 校验 | 缺少/重复 `d`、`title`、`start`；非法日期、时间戳、IANA 时区；`end <= start`；全天/定时 tag 混用；错误 channel `h` tag |
| 私有读取 | 未认证请求、其他成员、混合 kind filter、COUNT、HTTP `/query`、WebSocket REQ、实时 fan-out 均不能泄露事件或数量 |
| Agent 权限 | Agent 只能替换自己坐标；用户不能替换 Agent 坐标；owner 删除规则按最终产品决策验证 |
| Replacement | 同 `(kind,pubkey,d)` 新版本胜出、同秒 tie-break、旧 head 不再返回、失败事务不破坏旧 head |
| 删除 | NIP-09 `a` 坐标删除成功；错误 author/kind/d 被拒绝；删除后 REQ/COUNT/范围查询均不可见 |
| 范围投影 | 全天单日/多日、跨月/跨年、定时跨午夜、未来创建时间、历史回填和边界相交语义正确 |
| 查询性能 | 窗口内事件超过默认 100 条仍完整分页；窗口外大量事件不挤占结果；索引执行计划命中预期范围索引 |
| SDK builder | tag 形状、时区、参与者、日历引用、更新复用 ID、类型转换和坐标删除 |
| CLI parser | create/list/get/update/delete、互斥参数、必填参数、`--clear-*`、`--id` 幂等键 |
| CLI 行为 | RFC3339 与全天日期解析、read-before-write、部分更新、失败 JSON、compact/full 输出和稳定 coordinate |
| 日期数学 | 周起始、跨月/跨年、闰年、本地午夜、DST 缺失/重复小时、15 分钟吸附和 30 分钟默认时长 |
| 快速创建 | 单击、向上/向下拖拽、跨小时、全天区、月视图日期、取消、Escape、点击外部、保存失败重试 |
| 事件布局 | 重叠、相邻不重叠、跨日、超出可见范围裁剪、当前时间线和多日全天事件 |
| 路由状态 | `/calendar` 默认值、非法 search 参数修复、view/date/event 深链、刷新、前进/后退 |
| 实时同步 | 本客户端写入、Agent 写入、replacement、删除到达后缓存正确更新且不重复渲染 |
| 可访问性 | 键盘创建与保存、焦点圈、Dialog 焦点陷阱、Escape、ARIA 标签、颜色以外的日历区分方式 |
| 响应式与主题 | 窄窗口侧栏收起、Day 降级策略、浅色/深色主题、缩放后 rem 文本与网格仍可用 |
| 视觉回归 | 周视图、快速创建浮层、重叠日程、月视图、窄窗口分别截图并验证图片 hash 不重复 |

### 8.2 测试数据基线

- 固定时区至少覆盖 `Asia/Shanghai`、`America/Los_Angeles` 和 `UTC`。
- 固定日期至少覆盖闰日、月末、年末及美国 DST 春季跳时和秋季重复小时。
- 同一窗口同时准备用户日程、当前 Agent 日程、其他成员日程和已删除日程，验证没有隐私串流。
- 快速创建测试使用确定性的 15 分钟网格坐标，不依赖真实当前时间。
- E2E mock 必须模拟标准签名事件的 replacement 和 deletion，而不是直接修改 React 状态。

## 9. 产品决策状态

1. **已确认**：日程默认仅作者可见。
2. **已确认**：Agent 管理自己署名的日程，不代表用户签名。
3. **已确认**：不做会议室和预约活动，外部同步延后。
4. **已确认**：首版不做重复日程。
5. **已确认**：点击日/周时间网格可以直接按所选时间段快速创建日程。
6. **待确认**：用户是否需要读取其所属 Agent 创建的日程？严格“仅作者可见”时用户看不到 Agent 日程；建议增加 owner-read/agent-write 关系。
7. **待确认**：“仅自己可见”是否只要求其他成员看不到，还是要求 Relay 管理员也无法看到明文？建议首版采用 Relay ACL，端到端加密另行设计。
8. **待确认**：日/周/月是否都必须首发？建议三种都做，但以周视图为主要验收视图。
9. **待确认**：`31924` 多日历管理首版是否只提供“我的日历”，还是允许用户新建多个命名日历？

## 10. 什么是重复日程

重复日程是按规则自动持续出现的一组日程，而不是用户逐条创建。例如：

- 每周一 10:00 的团队例会。
- 每个工作日 09:30 的站会。
- 每月最后一个星期五的复盘。
- 每年 8 月 1 日的纪念日。

它不仅是“复制很多条事件”，还要处理结束条件、跳过节假日、修改“仅本次”或“本次及以后”、夏令时切换、跨时区和删除单次例外。NIP-52 当前刻意不定义重复规则，因此首版实现会需要 Buzz 自己承担这些复杂语义。建议先延后，首版允许 Agent 一次创建多条独立日程；验证需求后再设计正式的系列与例外模型。

## 11. 参考

- Nostr NIP-52 Calendar Events：<https://github.com/nostr-protocol/nips/blob/master/52.md>
- 仓库内 NIP-ER Event Reminders：`docs/nips/NIP-ER.md`
- 项目贡献规范：`CONTRIBUTING.md`
- Agent 贡献规范：`AGENTS.md`
