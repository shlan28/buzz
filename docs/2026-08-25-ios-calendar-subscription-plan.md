> 更新日期：2026-08-26 11:10 CST
> 更新说明：完成 WebKit CORS `Authorization` non-wildcard 修复及 Router 回归测试；记录 Release Relay 部署验证状态。

# Buzz Calendar iOS 订阅方案

## 一、产品目标

用户希望把 Buzz Calendar 作为订阅日历添加到 iPhone 或 iPad 的 Apple Calendar。完成后，Buzz 中的日程会持续出现在 iOS 日历里；Buzz 日程新增、修改或删除后，Apple Calendar 在下一次刷新订阅时同步变化。

第一版提供以下产品结果：

1. 用户可以为当前 community 的“我的全部 Buzz 日程”创建一个私密订阅链接。
2. 订阅范围同时包含用户自己的 Personal 日程和该用户拥有的 Agent 日程。
3. 用户可以复制 HTTPS 订阅地址，或使用 `webcal://` 地址在 Apple 设备上发起添加订阅。
4. 同一个 Buzz 日程在 Apple Calendar 中保持稳定身份；Buzz 修改不会生成重复副本。
5. 用户可以重新生成或撤销链接；旧链接立即失效。
6. 订阅是只读的，不把 Apple Calendar 中的编辑回写 Buzz。

本方案是 `docs/2026-08-09-apple-calendar-sync-plan.md` 中 Phase 3 的独立落地方案。它不实现该文档里的 macOS EventKit 双向同步，也不依赖 Buzz Desktop 持续运行。

## 二、产品范围

### 2.1 “我的全部 Buzz 日程”

订阅范围与当前 Calendar 的授权模型一致：

- 当前用户签名的 kind `31922` 全天日程；
- 当前用户签名的 kind `31923` 定时日程；
- `users.agent_owner_pubkey` 指向当前用户的 owned Agent 所签名的 `31922` / `31923` 日程；
- 当前 community 中上述日程的最新 NIP-33 replacement head。

Calendar 左栏的来源开关只是当前 Desktop 视图过滤，不改变订阅内容。关闭某个 Agent 的显示后，该 Agent 的日程仍属于“我的全部 Buzz 日程”，仍进入订阅。

不包含：

- 其他用户的日程，即使当前用户是参与者；
- 不属于当前用户的 Agent 日程；
- 其他 community 的任何日程；
- RSVP、Calendar metadata 或非日程事件。

### 2.2 第一版明确不做

- iOS 到 Buzz 的反向编辑；
- CalDAV；
- macOS EventKit 桥接；
- 按 Personal、Agent、频道或自定义 Calendar 分别生成多个 feed；
- 一次性导出静态 `.ics` 文件；
- 承诺即时刷新或后台推送。

Apple Calendar 自己决定外部订阅的刷新时间，Buzz 无法保证 Relay 更新后立即显示在 iOS。产品文案必须写“Apple Calendar 会定期刷新”，不能写“实时同步”。

## 三、用户体验

### 3.1 入口

在 Desktop Calendar 左栏的 `My calendars` 区域下方增加 `Subscribe on iPhone`。点击后打开订阅管理弹窗。

无订阅时：

- 解释这是只读订阅，并包含 Personal 与 owned Agent 日程；
- 提供 `Create subscription link`；
- 创建前提醒“拿到链接的人可以查看你的日程，请像密码一样保管”。

已有订阅时：

- 展示脱敏状态和创建时间，不在再次打开弹窗时回显完整 token；
- 说明完整链接不会再次显示，丢失时需要重新生成；
- 提供 `Regenerate link` 和 `Revoke link`。

完整订阅地址只在创建或重新生成成功后返回一次。Desktop 可以在当前弹窗生命周期内保留并复制；关闭后如用户丢失，只能重新生成，Relay 不保存可恢复的明文 token。

### 3.2 iOS 添加方式

弹窗给出两种方式：

1. 将 HTTPS 链接安全地发送到 iPhone，再点击或粘贴到“设置 > App > 日历 > 日历账户 > 添加账户 > 其他 > 添加已订阅的日历”。不同 iOS 版本的菜单名称可能略有差异，因此文案不依赖唯一固定路径。
2. 在 Apple 设备上打开对应的 `webcal://` 链接，交由系统确认订阅。

`webcal://` 只用于触发系统 UI；实际 feed 仍由同 host 的 HTTPS endpoint 提供。Relay 不响应明文 HTTP 的生产订阅请求，部署层应保持 HTTPS。

### 3.3 轮换与撤销

- `Regenerate`：创建新 token 并在同一数据库事务中撤销旧 token；旧 URL 不再可用。
- `Revoke`：撤销当前 token，之后访问返回 `404 Not Found`。
- 对不存在、错误 community 或已撤销的 token 统一返回 404，避免泄露订阅是否存在。

撤销链接不能主动删除 Apple Calendar 里已缓存的数据。产品需提示用户同时在 iOS 中删除该订阅；撤销只阻止后续拉取。

### 3.4 Desktop 前端示意图

以下示意图用于固定信息层级和交互位置，不代表新增一套视觉语言。最终尺寸、间距、颜色、圆角、阴影、字体和控件状态必须复用当前 Desktop token 与 shared UI components。

#### Calendar 页面入口

```text
┌──────────────────────── Calendar ───────────────────────────────────────────┐
│                                                                            │
│ ┌─ Calendar sidebar ───────┐  ┌─ Week / Month / Day view ────────────────┐ │
│ │     August 2026          │  │                                           │ │
│ │  M  T  W  T  F  S  S    │  │              Calendar grid                │ │
│ │        1  2  3  4  5    │  │                                           │ │
│ │  6  7  8  9 10 11 12    │  │                                           │ │
│ │                          │  │                                           │ │
│ │ MY CALENDARS             │  │                                           │ │
│ │ ● Personal               │  │                                           │ │
│ │ 🤖 Design Agent         │  │                                           │ │
│ │ 🤖 Research Agent       │  │                                           │ │
│ │                          │  │                                           │ │
│ │ [📅 Subscribe on iPhone] │  │                                           │ │
│ └──────────────────────────┘  └───────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

入口使用低强调的 secondary/outline 或 ghost button，不与 Calendar 顶部的日程创建主操作竞争。按钮必须有文字标签，不能只使用 Apple 图标或无解释的链条图标。

#### 首次创建订阅

```text
┌─────────────────────────────────────────────────────────┐
│ Subscribe on iPhone                                  ×  │
├─────────────────────────────────────────────────────────┤
│ See all of your Buzz events in Apple Calendar.          │
│                                                         │
│ Included                                                │
│ ● Personal calendar                                     │
│ 🤖 Calendars from agents you own                        │
│                                                         │
│ ┌─ Private link ──────────────────────────────────────┐  │
│ │ Anyone with this link can read your event titles,  │  │
│ │ times, descriptions, and locations. Treat it like  │  │
│ │ a password.                                         │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                         │
│ This is read-only. Apple Calendar refreshes it          │
│ periodically; changes may not appear immediately.       │
│                                                         │
│                         [Cancel] [Create private link]   │
└─────────────────────────────────────────────────────────┘
```

`Create private link` 是该 dialog 唯一 primary action。安全提示使用现有 warning 语义色、图标和文本，不依赖颜色单独表达风险。

#### 创建成功：一次性展示链接

```text
┌─────────────────────────────────────────────────────────┐
│ Subscribe on iPhone                                  ×  │
├─────────────────────────────────────────────────────────┤
│ ✓ Your private subscription link is ready               │
│                                                         │
│ Save it now. For security, Buzz won't show the full     │
│ link again after you close this window.                 │
│                                                         │
│ Subscription link                                       │
│ ┌──────────────────────────────────────────┐ [Copy]      │
│ │ https://achoverse.xyz/calendar/…••••••  │             │
│ └──────────────────────────────────────────┘             │
│                                                         │
│ [Open with Apple Calendar]                               │
│                                                         │
│ Or add manually on iPhone                               │
│ Settings → Apps → Calendar → Calendar Accounts →        │
│ Add Account → Other → Add Subscribed Calendar           │
│                                                         │
│                                                  [Done]  │
└─────────────────────────────────────────────────────────┘
```

链接控件默认避免在截图、肩窥或屏幕共享中完整裸露；用户执行复制时复制完整值，并出现可访问的 `Copied` 反馈。`Open with Apple Calendar` 使用 `webcal://`，视觉层级低于复制链接的主要完成路径。

#### 已有订阅状态

```text
┌─────────────────────────────────────────────────────────┐
│ Apple Calendar subscription                          ×  │
├─────────────────────────────────────────────────────────┤
│ ● Active                                                │
│ Created Aug 25, 2026                                    │
│                                                         │
│ Your full private link is no longer available. If you   │
│ did not save it, generate a new one.                    │
│                                                         │
│ [Generate new link]                                     │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│ Stop this subscription                                  │
│ Revoking prevents future refreshes. Events already      │
│ cached by Apple remain until you remove the calendar.   │
│                                          [Revoke link]  │
└─────────────────────────────────────────────────────────┘
```

`Generate new link` 是普通 secondary action；`Revoke link` 使用 destructive variant。两者都必须经过现有 AlertDialog 二次确认，且确认文案明确旧链接会立即失效。禁止在 dialog 内再打开一个普通同级 dialog。

#### Loading 与错误状态

```text
Loading
┌─────────────────────────────────────────────────────────┐
│ Apple Calendar subscription                          ×  │
│ ◌ Loading subscription status…                          │
└─────────────────────────────────────────────────────────┘

Recoverable error
┌─────────────────────────────────────────────────────────┐
│ Apple Calendar subscription                          ×  │
│ ⚠ Subscription status couldn't be loaded.               │
│ Check your connection and try again.          [Retry]   │
└─────────────────────────────────────────────────────────┘
```

加载时保持 dialog 尺寸稳定，避免内容跳动；远程操作期间按钮显示明确的动词 loading 文案并阻止重复提交。错误必须在 dialog 内提供恢复动作，toast 只能作为辅助反馈，不能成为唯一错误信息。

### 3.5 Desktop 视觉与交互一致性要求

前端实现必须符合 `docs/2026-07-31-buzz-client-ui-design-standard.md`、`wiki/code-spec.md` 与 AGENTS.md 的 Desktop 规范，并与当前 Calendar 页面保持一致。具体要求如下：

- 复用 `desktop/src/shared/ui/` 中现有的 Dialog、AlertDialog、Button、Input、Tooltip、状态反馈等组件；不得为本功能复制一套基础组件。
- 使用 `background`、`foreground`、`muted`、`border`、`primary`、`warning`、`destructive` 等语义 token；不得写死 HEX、HSL 或平台品牌色。
- 可读文字只能使用现有 rem-based 命名 token，如 `text-sm`、`text-xs`、`text-2xs`；禁止任意 px/rem 字号。
- 间距使用现有 Tailwind scale 和 4px 节奏；圆角、边框与阴影遵循当前 shadcn New York 风格，dialog 不增加独立的重阴影、渐变或营销式卡片。
- 常态界面保持 Buzz 的高密度、安静层级；一个 dialog 只保留一个 primary action，危险操作使用 destructive variant 并明确影响。
- 图标使用当前项目的 Lucide 体系；仅图标按钮必须有 accessible name 与 tooltip，但核心订阅动作必须保留文字标签。
- 状态不能只靠颜色区分；active、warning、error、loading 同时使用图标或文字。
- 完整覆盖 empty、loading、active、one-time-secret、error、regenerate-confirmation、revoke-confirmation 与 disabled 状态。
- 支持键盘导航、focus-visible、Escape 关闭、合理的初始焦点和屏幕阅读器标签；复制成功反馈需要进入可访问的 live region 或等效机制。
- 支持当前 Desktop 明暗主题、Cmd +/- 字体缩放、长 community host、长本地化文本与窄窗口；内容溢出必须在明确容器内滚动。
- community 切换后必须清除旧 community 的订阅状态和当前内存中的完整 secret，不得短暂闪现上一 community 的链接。
- UI 实现完成后使用现有 E2E mock bridge 和 screenshot 工作流验证；截图前等待动画结束，并检查多个状态的图片 hash 不重复。

如果现有 shared component 无法满足某一状态，应先判断能否以组合方式实现；只有形成可复用的 Desktop 通用能力时才扩展 shared UI，不能为 Calendar subscription 创建孤立视觉规则。

## 四、整体技术设计

```text
Desktop Calendar
  └─ NIP-98 管理请求 ──> Relay 创建 / 查询状态 / 轮换 / 撤销
                              │
                              └─ 仅保存 token SHA-256 与 owner

iOS Apple Calendar
  └─ GET 私密 .ics URL ─> Relay 校验 host + token
                              └─ 查询该 owner 的 Personal + owned Agent heads
                                  └─ 生成 text/calendar 快照
```

这项能力确实需要 HTTP surface：Apple Calendar 只能按 URL 拉取 iCalendar，不能签名 Nostr event 或 NIP-98 请求。因此新增 HTTP endpoint 不违背“业务动作优先使用 Nostr event”的原则；Buzz 日程本身仍以 Relay 中的 NIP-52 events 为事实来源，不建立旁路日程表。

## 五、接口设计

### 5.1 订阅管理接口

管理接口都要求当前用户签名的 NIP-98，并经过 host-derived community、relay membership 和 identity 校验：

```text
GET    /api/calendar/subscription
POST   /api/calendar/subscription
POST   /api/calendar/subscription/regenerate
DELETE /api/calendar/subscription
```

建议响应：

```json
{
  "active": true,
  "created_at": "2026-08-25T02:39:00Z"
}
```

只有创建和重新生成返回一次完整地址：

```json
{
  "active": true,
  "created_at": "2026-08-25T02:39:00Z",
  "https_url": "https://achoverse.xyz/calendar/subscriptions/<token>.ics",
  "webcal_url": "webcal://achoverse.xyz/calendar/subscriptions/<token>.ics"
}
```

管理接口不得接受客户端指定 owner pubkey 或 community；二者都从已验证的 NIP-98 signer 与请求 host 得出。

### 5.2 Feed 接口

```text
GET /calendar/subscriptions/{token}.ics
```

成功响应至少包含：

```text
Content-Type: text/calendar; charset=utf-8
Content-Disposition: inline; filename="buzz-calendar.ics"
Cache-Control: private, no-cache
ETag: "<snapshot-hash>"
```

支持 `If-None-Match`，内容未变化时返回 `304 Not Modified`。错误 token、错误 host、撤销状态和不存在的 owner 均返回相同的 404，不重定向到登录页，也不返回可区分的错误正文。

为防止 token URL 进入通用请求日志，feed handler 和 HTTP tracing 层只能记录脱敏 token 指纹，例如哈希前 8 位；不能记录 path 参数原文。若当前全局 access log 会记录完整 URI，实施时必须在路由或 trace span 中做明确脱敏，再开放该 endpoint。

## 六、订阅令牌与数据模型

新增专用 `calendar_subscription_tokens` 表，不复用 `api_tokens`。原因是 Calendar token 只能读取一个 iCalendar feed；把它放进通用 API token 体系会引入 scope 误配和权限升级风险。

建议字段：

```text
community_id
owner_pubkey
token_hash
created_at
last_used_at
revoked_at
```

约束：

- `(community_id, token_hash)` 唯一；
- 每个 `(community_id, owner_pubkey)` 最多一个 active token；
- `token_hash` 固定 32 bytes；
- community 与 owner 使用现有外键；
- community 删除时级联删除 token。

生成方式：

- 使用系统安全随机源生成 32 bytes；
- URL 使用无 padding 的 base64url 编码；
- 数据库只保存 `SHA-256(token)`；
- 比较基于固定长度 digest；
- token 不写入日志、指标、埋点、错误信息或 Nostr event。

轮换必须在数据库事务中撤销旧 token并插入新 token。并发创建或轮换通过 active-token 唯一约束和数据库锁串行化，不得返回两个同时有效的链接。

## 七、iCalendar 映射

Feed 使用 RFC 5545 文本格式、CRLF 换行、UTF-8、正确的文本 escaping 与 75 octets line folding。不得通过字符串直接拼接未转义的标题、描述或地点。

每个 Buzz occurrence 输出一个 `VEVENT`。当前重复日程已经展开为多个独立 NIP-52 event，因此第一版不合并为 `RRULE`，每个 occurrence 保持自己的稳定 UID。

### 7.1 Calendar 级字段

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Buzz//Buzz Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Buzz Calendar
X-WR-CALDESC:My Buzz calendar events
...
END:VCALENDAR
```

### 7.2 Event 级字段

| Buzz 字段 | iCalendar 字段 | 规则 |
|---|---|---|
| kind + author + `d` | `UID` | 稳定格式 `<kind>-<author>-<escaped-d>@<community-host>`，不得使用 replacement event id |
| `title` tag | `SUMMARY` | 必填并转义 |
| event `content` | `DESCRIPTION` | 可选并转义 |
| `location` tag | `LOCATION` | 可选并转义 |
| replacement `created_at` | `DTSTAMP` / `LAST-MODIFIED` | UTC 时间 |
| kind `31922` `start` / `end` | `DTSTART;VALUE=DATE` / `DTEND;VALUE=DATE` | 保持 NIP-52 与 RFC 5545 的排他结束日期 |
| kind `31923` `start` / `end` | `DTSTART` / `DTEND` | 转为 UTC `...Z`，避免生成不完整的 VTIMEZONE；Apple 按设备时区展示同一 instant |
| Buzz deep link | `URL` | 可选，仅含公开 event coordinate，不含 token |

修改后的 replacement head 使用同一个 UID，并更新 `LAST-MODIFIED`，Apple 将其识别为同一事件的新版本。第一版不伪造 `SEQUENCE` 计数，因为当前 Nostr 数据没有可靠的连续 revision number。

Buzz 删除或 replacement head 不再存在时，事件从下一次完整 feed 快照中消失。第一版不永久保留 `STATUS:CANCELLED` tombstone，否则需要额外的数据保留与清理模型；应通过 Apple Calendar 实机验证订阅刷新会移除缺失事件。

### 7.3 非法数据降级

Relay ingest 已验证 NIP-52 必需字段，但历史数据仍可能异常。单个事件序列化失败时：

- 跳过该事件并记录不含正文的结构化告警；
- 继续返回其余合法事件；
- 指标记录 skipped 数量和稳定错误类别；
- 不能因为一个坏事件把整个日历变成 500。

若数据库或 tenant resolution 失败，返回通用 503/500，不返回旧 community 或不完整鉴权结果。

## 八、查询、隔离与性能

数据库查询必须显式绑定：

1. host 解析出的 `community_id`；
2. token 解析出的 `owner_pubkey`；
3. kinds `31922` 与 `31923`；
4. Personal author 或 `agent_owner_pubkey = owner`；
5. 未删除的最新 replacement heads。

不能先跨 community 查 token 再依赖应用层过滤。相同 token hash 即使存在于两个 community，也只能在当前 host 的 community 内解析。

第一版返回全部有效日程，不用“最近 90 天 / 未来 365 天”截断“我的全部”。为防止极端 feed 无限增长，设置明确的最大事件数和最大响应字节数；超过上限时应返回可观测的服务错误，而不是静默截断，避免用户误以为订阅完整。具体上限在实施前依据现有 event 规模和内存压测确定并写入常量与测试。

ETag 由 canonical serialization 或确定性 snapshot metadata 计算。事件必须稳定排序，例如按开始时间、kind、author、`d` tag 排序，保证相同数据生成相同 bytes 和 ETag。

## 九、安全与隐私

- Calendar URL 是 bearer secret，任何持有者都能读取 feed。
- 只保存 token hash，完整 URL 只返回一次。
- 创建、轮换、撤销必须使用 NIP-98，feed GET 不接受 `X-Pubkey` 开发回退。
- token 不复用 Buzz private key、NIP-98 event、API token或 Relay membership credential。
- host-derived community 必须先于 token lookup 确立，未知 host fail closed。
- 已离开 community、owner 被删除或 community 被归档时，feed 不继续提供数据。
- 不设置宽泛 CORS；Apple Calendar 直接 GET 不需要浏览器跨域权限。
- 响应禁止公开缓存，CDN 配置不得缓存带 token 的 URL。
- 访问日志、错误追踪、分析平台和 UI telemetry 均不得收集完整订阅 URL。
- 创建和轮换应受现有用户级写限流；feed GET 应按 token 指纹与 IP 做适度限流，但不能把 token 作为 metric label。

建设性建议：订阅链接不会像账户密码一样自动出现在用户的密码管理器中，却能暴露标题、时间、地点和描述。第一版应默认不输出 participant pubkeys，并在 UI 明确提醒不要把链接贴到群聊、工单或公开 issue。

## 十、测试方案

### 10.1 序列化单元测试

- 全天事件与排他 `DTEND`；
- 定时事件 UTC 转换；
- 中文、逗号、分号、反斜杠和换行 escaping；
- UTF-8 多字节内容按 75 octets folding，不切断 code point；
- Personal 与 owned Agent 产生不同且稳定的 UID；
- replacement 修改保持 UID、更新内容与 `LAST-MODIFIED`；
- 展开的重复实例各自输出一个 VEVENT；
- 稳定排序与 ETag；
- 历史坏事件被跳过而不破坏整个 feed。

### 10.2 数据库集成测试

- token 只存 hash；
- 每个 community/user 只有一个 active token；
- 并发轮换只有新 token 有效；
- revoke 幂等；
- 相同 hash 在不同 community 不串读；
- 查询包含 Personal 与 owned Agent，排除其他用户和其他 Agent；
- community 删除和 owner 删除后的行为；
- replacement 与 deletion 只影响当前 community。

### 10.3 Relay HTTP 集成测试

- 管理接口的 NIP-98 method、URL、freshness、signer 和 membership 校验；
- 创建只返回一次 secret；
- active 状态接口不回显 token；
- 正确 token 返回 `text/calendar`；
- 无效、撤销、错误 host 统一 404；
- `If-None-Match` 返回 304；
- URL/token 不进入测试捕获的 tracing fields；
- archived community fail closed；
- 事件数和响应体上限。

### 10.4 Desktop E2E

- 无订阅、创建成功、已订阅三种状态；
- 复制 HTTPS 与 webcal 地址；
- 关闭重开后不回显 secret；
- regenerate 二次确认并展示新链接；
- revoke 二次确认和空状态；
- loading、网络失败、鉴权失败与恢复；
- community 切换后重新读取当前 community 状态，不显示上一 community 的链接。

### 10.5 iOS 手工验收

至少使用一台真实 iPhone 或 iOS Simulator（以真实 Apple Calendar 能访问测试 Relay 为准）完成：

1. 添加订阅并看到 Personal 与 owned Agent 日程。
2. Buzz 新建日程后，等待 Apple Calendar 刷新并出现。
3. Buzz 修改标题、时间、全天状态和地点后，同一事件更新且不重复。
4. Buzz 删除日程后，刷新订阅并确认事件消失。
5. 中文、长描述、换行和特殊字符正确显示。
6. 重复系列的多个 occurrence 都显示。
7. regenerate 后旧 URL 失败，新 URL 可重新订阅。
8. revoke 后 feed 无法继续刷新，并验证 UI 提醒用户从 iOS 删除缓存订阅。

由于 Apple 刷新周期不可控，验收需记录设备、iOS 版本、添加方式、实际等待时间和结果，不能只用 `curl` 成功代替真实 Apple Calendar 工作流。

## 十一、逐文件 Todolist

每个 todo 只对应一个文件。鹿鹿子大王确认本文档前，不修改以下代码文件。

- [x] `migrations/0035_calendar_subscription_tokens.sql`：新增 community-scoped Calendar token 表、active-token 唯一约束和删除级联。
- [x] `schema/schema.sql`：同步 Calendar subscription token 表、索引、外键与 community write fence，保持 desired-state schema 与 migration 一致。
- [x] `crates/buzz-db/src/calendar_subscription.rs`：实现 token 创建、状态查询、原子轮换、撤销、hash lookup、owner calendar heads 查询及真实 PostgreSQL 测试。
- [x] `crates/buzz-db/src/lib.rs`：导出 Calendar subscription 数据类型和带 doc comments 的数据库 API。
- [x] `crates/buzz-relay/src/api/calendar_subscription.rs`：实现 NIP-98 管理接口、私密 `.ics` feed、错误归一化、缓存头、上限及真实 Router 测试。
- [x] `crates/buzz-relay/src/icalendar.rs`：实现 RFC 5545 映射、escaping、UTF-8 line folding、稳定排序和 ETag。
- [x] `crates/buzz-relay/src/api/mod.rs`：注册 Calendar subscription API module。
- [x] `crates/buzz-relay/src/router.rs`：注册管理路由和 feed 路由；全局 trace span 不记录 URI，指标使用脱敏的 matched route。
- [x] `desktop/src/shared/api/calendarSubscription.ts`：实现类型化 NIP-98 管理请求，完整 secret 只保存在当前返回值。
- [x] `desktop/src/features/calendar/hooks.ts`：增加当前 community 的订阅状态、创建、轮换和撤销 mutations。
- [x] `desktop/src/features/calendar/ui/CalendarSubscriptionDialog.tsx`：实现安全说明、一次性链接、复制、iOS 指引、轮换和撤销状态。
- [x] `desktop/src/features/calendar/ui/CalendarSidebar.tsx`：使用现有 Desktop button、icon 与语义 token 增加 `Subscribe on iPhone` 入口。
- [x] `desktop/src/features/calendar/ui/CalendarScreen.tsx`：连接订阅弹窗及 mutation 状态，并在 community remount 后清空 secret。
- [x] `desktop/src/testing/e2eBridge.ts`：模拟 Calendar subscription HTTP 生命周期与一次性 secret。
- [x] `desktop/tests/e2e/calendar.spec.ts`：覆盖订阅创建、重开脱敏、轮换、撤销和失败恢复。
- [x] `desktop/tests/helpers/bridge.ts`：为 Calendar E2E 暴露复制内容读取能力。
- [x] `docs/2026-08-25-ios-calendar-subscription-plan.md`：记录方案偏差、验证命令与未完成风险。

实施前先确认测试文件是否更适合放在 crate 内现有 integration test 布局；若项目结构不接受 `crates/buzz-relay/tests/calendar_subscription_http.rs`，先更新本文档为真实落点，再写代码。

实际核对后，HTTP 测试落在 `crates/buzz-relay/src/api/calendar_subscription.rs` 的现有 `cfg(test)` 模块：它可以复用本项目按需连接本地 PostgreSQL 的 handler fixture，同时仍通过 `build_router(...).oneshot(...)` 走真实 Axum Router。未新增成本更高且重复组装完整 `AppState` 的独立 integration 文件。

## 十一点一、实施与验证记录

实现采用每个 community/owner 一个 active bearer credential。Relay 只持久化 SHA-256 hash；创建和重新生成时返回一次 HTTPS/webcal 地址；Feed 固定包含 Personal 与非停用 owned Agent 的最新 `31922` / `31923` heads。为避免静默缺失，第一版上限固定为 50,000 个事件或 20 MiB，超过时返回服务错误。

已完成验证：

- `cargo test -p buzz-db calendar_subscription::tests -- --ignored --nocapture`：4 个真实 PostgreSQL 生命周期、并发与 tenant/owner 隔离测试通过。
- `cargo test -p buzz-relay api::calendar_subscription::tests --lib`：7 个真实 Router、NIP-98 path/method、404 归一化、ICS headers、ETag/304 测试通过。
- `cargo test -p buzz-relay icalendar --lib`：6 个 RFC 5545 序列化测试通过。
- `cargo clippy -p buzz-db -p buzz-relay --lib -- -D warnings`、`cargo fmt --all -- --check`、Desktop Biome 与 TypeScript 检查通过。
- `pnpm exec playwright test tests/e2e/calendar.spec.ts --project=smoke`：17 个 Calendar E2E 通过，其中 3 个覆盖订阅生命周期。
- `just desktop-screenshot --name calendar-subscription --route /calendar --click calendar-subscription-trigger`：实图核对弹窗与当前 Desktop Calendar 的字体、间距、按钮、圆角及语义色一致。

仓库级检查结果：`just ci` 的 Rust workspace Clippy 与 Desktop Biome 通过，随后被本分支未修改的 6 个既有超长文件 ratchet 阻断；`just test` 的本功能相关套件通过，最终被本分支未修改的 Databricks/OAuth workspace 集成测试环境阻断（13 failed）。这些阻断不在 Calendar 变更文件中。

尚未完成真实 iPhone/Apple Calendar 的刷新周期验收。部署到 iOS 可访问的 HTTPS Relay 后，必须按 10.5 节验证添加、更新、删除、轮换和撤销；在完成前不能把“iOS 已实机通过”作为发布结论。

## 十二、验收标准

- 用户可为当前 community 创建一个私密、可撤销的 Calendar feed。
- iOS 能把 HTTPS/webcal URL 添加为订阅日历。
- feed 包含用户 Personal 与 owned Agent 的全部有效 `31922` / `31923` heads。
- 新增、replacement 修改和删除在 Apple 下一次刷新后正确反映，且不产生重复 UID。
- token 只保存 hash，完整 token 只返回一次且不进入日志。
- 轮换后旧 token 失效，撤销后所有 feed 读取 fail closed。
- community、identity 与 Agent ownership 隔离有数据库和 HTTP 集成测试证明。
- RFC 5545 特殊字符、UTF-8 folding、全天边界和定时 instant 通过单元测试。
- Desktop 完成 loading、error、empty、active、regenerate、revoke 状态与 community 切换 E2E。
- 相关 Rust fmt、Clippy、unit/integration tests、Desktop Biome/typecheck/E2E 和 `just ci` 通过，或明确记录与本改动无关的环境阻断。

## 十三、待确认事项

1. “我的全部 Buzz 日程”按本文定义包含 Personal + owned Agent，是否确认？建议确认，这与当前 Calendar 产品口径一致。
2. 第一版完整链接只展示一次，丢失后必须 regenerate，是否确认？建议确认，避免 Relay 可逆保存 bearer secret。
3. 第一版不输出 participant pubkeys，是否确认？建议不输出，Apple Calendar 不需要 Nostr pubkey，且能减少订阅链接泄露后的隐私影响。
4. 第一版入口放在 Desktop Calendar 左栏，不同步增加 Mobile 设置入口，是否确认？建议先完成 Desktop 管理入口和 iOS 订阅闭环；后续可在 Mobile 直接调用相同管理接口。
5. 第一版不设置时间窗口，输出全部有效日程，但用显式大小上限拒绝异常超大 feed，是否确认？建议确认，避免“我的全部”被静默截断。

## 十四、建设性建议

这个 MVP 的价值是“无须 Mac 常驻，iPhone 可以持续看到 Buzz 日程”，不是双向 Apple Calendar 同步。建议产品名称使用 `Subscribe on iPhone` 或 `Apple Calendar subscription`，不要使用 `Sync with Apple Calendar`，否则用户会合理地期待在 iPhone 编辑后回写 Buzz。

第二，建议上线前实际测量 Apple Calendar 对订阅更新和删除的刷新延迟。若真实延迟经常达到数小时，产品仍可用，但应在 UI 中给出预期；不要通过频繁改变 ETag 或响应头假装能够控制 Apple 的调度。

第三，若未来要按 Agent 或 Calendar 分别订阅，应扩展 token scope，而不是把筛选条件直接放进可篡改 URL query。服务端持久 scope 才能保证链接被转发后仍遵守最初授权。

## 十五、Desktop 实机联调故障与修复计划

2026-08-26 在真实 Tauri Desktop 中打开订阅弹窗时，状态请求持续显示 `Subscription status couldn't be loaded`。排查证据如下：

- Desktop WebView 来源 `http://localhost:1420` 已加入 `BUZZ_CORS_ORIGINS`；Relay 预检返回 `200` 和正确的 `Access-Control-Allow-Origin`。
- macOS WebKit Network 日志仍记录 `NetworkCORSPreflightChecker ... AccessControl error` 与 `success=0`。
- 预检响应的 `Access-Control-Allow-Headers` 为 `*`，但 Fetch/CORS 规范把 `Authorization` 视为 non-wildcard request-header name；Safari/WKWebView 不允许用通配符授权该 header。
- 因预检失败，带 NIP-98 `Authorization` 的 Calendar GET 没有到达 Relay handler；这不是 token 表、membership 或 NIP-98 签名失败。

修复应在全局 Relay CORS 层显式允许实际使用的请求头，至少包含 `Authorization` 与 `Content-Type`，而不是依赖 `allow_headers(Any)`。这同时修复 Calendar subscription 和其他 Desktop 直连的 NIP-98 HTTP API。允许来源仍严格由 `BUZZ_CORS_ORIGINS` 控制，不改成任意 origin。

逐文件 Todolist：

- [x] `crates/buzz-relay/src/router.rs`：显式配置 CORS allow headers，并新增测试证明带 `Authorization` 的 Desktop origin 预检返回可被 WebKit 接受的响应。
- [x] `docs/2026-08-25-ios-calendar-subscription-plan.md`：记录 Router 测试及 Release Relay 部署验证；真实 Desktop Retry 结果在用户复测后补充。

验收步骤：

1. Router 单元测试断言预检响应明确列出 `authorization`，不只返回 `*`。
2. 运行 Rust fmt、Clippy 与相关 Relay tests。
3. 构建 Release Relay，执行 migration-safe 的 LaunchAgent 重启。
4. 用 `curl OPTIONS` 检查公网响应头，并在真实 Tauri Desktop 点击 Retry。
5. Relay 日志应出现已签名 Calendar GET，弹窗进入 empty 或 active 状态。

修复验证：

- `cargo test -p buzz-relay router::tests::cors_preflight_explicitly_allows_nip98_authorization --lib`：通过。
- `cargo clippy -p buzz-relay --lib -- -D warnings`：通过。
- `cargo fmt --all -- --check`：通过。

进一步真实 Desktop 复测显示，当前 macOS WebKit 即使收到显式的 `authorization` allow-header，仍将该跨域预检判定为 `AccessControl error`，实际 GET 依旧未到达 Relay。最终修复不再让安全关键的 NIP-98 管理请求依赖 WebView CORS，而是复用 Desktop Rust 层现有的 Relay URL、签名密钥、`build_nip98_auth_header`、HTTP client 与错误分类能力。

原生请求修复 Todolist：

- [x] `desktop/src-tauri/src/commands/calendar_subscription.rs`：新增固定路由、固定 method/suffix 组合的原生 NIP-98 Calendar 管理命令，禁止任意 URL 代理。
- [x] `desktop/src-tauri/src/commands/mod.rs`：导出 Calendar subscription command。
- [x] `desktop/src-tauri/src/lib.rs`：注册 Calendar subscription Tauri command。
- [x] `desktop/src/shared/api/calendarSubscription.ts`：改用原生 command，不再从 WebView 直接 fetch Relay。
- [x] `desktop/src/testing/e2eBridge.ts`：让既有 Calendar subscription E2E mock 覆盖新的 Tauri command 路径。

原生请求验证：Tauri command 单测、Tauri Clippy、Desktop TypeScript、Biome 和 17 个 Calendar E2E 全部通过。该变更包含 Rust native command，真实 Desktop 必须完整重启并重新编译，Vite hot reload 不能加载它。
