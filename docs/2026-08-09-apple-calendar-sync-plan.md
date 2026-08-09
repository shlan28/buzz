> 更新日期：2026-08-09
> 更新说明：首次形成 Buzz Desktop 与 Apple 日历同步方案，明确首期采用 macOS EventKit 双向桥接、可选 ICS 只读订阅，并将服务端 CalDAV 延后。

# Buzz Desktop 与 Apple 日历同步方案

## 一、背景与目标

Buzz Calendar 当前以 Relay 中的 NIP-52 日历事件为事实来源。用户可以在 Desktop 中查看、创建、编辑和删除个人日程，也可以查看归属于自己的 Agent 日程；但这些日程不会自动出现在 macOS、iPhone 或 iPad 的 Apple 日历中，用户在 Apple 日历中的修改也不会回到 Buzz。

本方案希望实现以下产品结果：

1. 用户可以主动把 Buzz 个人日历连接到 Apple 日历。
2. Buzz 日程可以出现在用户选定的 iCloud 日历中，并由 iCloud 同步到其他 Apple 设备。
3. 用户在 Apple 日历中修改由 Buzz 同步的个人日程后，修改可以回写 Buzz。
4. 用户在指定 Apple 日历中新建日程后，可以选择让它进入 Buzz。
5. 同步不得泄露其他 Apple 日历、其他 Buzz community 或 Agent 的私有数据。
6. 网络中断、Desktop 未运行或一端暂时失败时允许稍后恢复，不制造重复日程。

本方案不把“导出一次 `.ics` 文件”称为同步。一次性导出只产生静态副本，之后任一端变化都不会传播。

## 二、方案结论

建议分成两条能力，但首期重点只做 EventKit：

### 2.1 主方案：macOS EventKit 双向同步

Buzz Desktop 通过 macOS EventKit 访问用户授权的系统日历。用户选择一个可写日历，推荐选择 iCloud 下专门创建的 `Buzz` 日历。Buzz Desktop 在本地桥接 Buzz Relay 与该系统日历；保存到 iCloud 日历后的跨 Apple 设备分发由系统完成。

```text
Buzz Relay / Nostr
        ↕
Buzz Desktop 同步引擎
        ↕
macOS EventKit
        ↕
iCloud Calendar
        ↕
iPhone / iPad / 其他 Mac
```

此方案不要求 Buzz 保存 Apple ID、iCloud 密码或 app-specific password，权限由 macOS 管理。

限制是：Apple 侧的修改必须先到达运行 Buzz Desktop 的 Mac，Desktop 才能把它回写 Relay。Desktop 长时间未运行时，回写不是实时的，但重新启动后可以进行增量补偿。

### 2.2 辅助方案：ICS 只读订阅

Relay 可以后续提供带撤销令牌的私有 `.ics` 订阅地址，让没有安装 Desktop 或只需要查看的用户将 Buzz 日历加入 Apple 日历。

ICS 订阅只解决 Buzz 到 Apple 的只读展示：

- Apple 日历定期拉取，刷新频率由 Apple 控制；
- Apple 侧不能编辑订阅源；
- URL 中的访问令牌必须按密码处理并支持撤销；
- 不应使用永久公开 URL 暴露私人日程。

### 2.3 延后方案：服务端 CalDAV

只有当产品要求“Desktop 不运行时，iPhone 修改仍可直接、及时回写 Buzz”，才应建设 Buzz CalDAV 服务端。它需要额外处理 WebDAV、认证、calendar-home discovery、ETag、sync-token、增量集合查询、重复日程和协议兼容性，首期投入与风险都明显高于 EventKit。

因此首期不实现 CalDAV，也不把 ICS 包装成双向同步。

## 三、首期产品体验

### 3.1 入口

在 Desktop `Settings > Integrations > Apple Calendar` 提供：

- 连接 Apple 日历；
- 当前系统权限状态；
- 目标 Apple 日历选择；
- 同步方向；
- 最近同步时间和同步状态；
- 立即同步；
- 断开连接。

首期同步方向提供两种：

1. `仅导出到 Apple 日历`：Buzz 变更写入 Apple，Apple 侧修改不回写 Buzz。
2. `双向同步`：Buzz 与选定 Apple 日历互相同步。

默认建议选择“仅导出”，由用户明确开启“双向同步”。原因是双向模式会将 Apple 侧修改发布为用户签名的 Buzz 事件，影响 Relay 中的事实状态。

### 3.2 首次连接

首次连接流程：

1. 解释 Buzz 需要访问日历的原因，以及只处理用户选定的目标日历。
2. 请求 macOS 日历完整访问权限。
3. 列出 EventKit 返回的可写日历，并显示它所属的账户来源。
4. 推荐用户选择或创建 iCloud 下的 `Buzz` 日历。
5. 选择同步方向。
6. 展示首次同步摘要：Buzz 待导出数量、Apple 待导入数量、被跳过的重复日程数量。
7. 用户确认后开始首次同步。

没有权限、权限被拒绝或目标日历只读时，不进入半连接状态；页面应提供前往系统设置或重新选择日历的恢复入口。

### 3.3 日常状态

设置页至少显示：

- `已同步`；
- `正在同步`；
- `等待网络`；
- `Apple 日历权限已关闭`；
- `目标日历不可用`；
- `存在冲突`；
- `部分日程同步失败`。

失败不能只写入日志。用户应能查看失败数量、失败原因和重试动作，但界面不展示 Apple 账户敏感信息或 Buzz 私钥材料。

### 3.4 断开连接

断开时让用户选择：

- 保留已经写入 Apple 日历的日程；
- 删除由 Buzz 创建且仍能确认归属的 Apple 日程。

删除范围必须根据同步映射精确计算，不得清空整个 Apple 日历。断开连接默认保留事件，以避免意外数据丢失。

## 四、同步范围与权限边界

### 4.1 Buzz 侧范围

首期只允许同步当前用户自己签名的 Personal 日程：

- 支持 kind `31922` 日期型日程；
- 支持 kind `31923` 时间型日程；
- 不默认同步 owned Agent 日程；
- 不同步其他成员日程；
- 不因 Calendar 左栏当前隐藏或显示状态改变同步范围。

Agent 日程由 Agent pubkey 签名，用户不能在 Apple 日历中修改后冒充 Agent 回写。因此如果后续开放 Agent 日程导出，应始终作为 Apple 侧只读镜像：Apple 修改不回写 Agent 事件，必要时由下一次 Buzz 同步恢复 Relay 版本。

### 4.2 Apple 侧范围

同步引擎只扫描用户明确选择的一个目标日历，不读取或上传其他系统日历的标题、参与者、备注和时间安排。

如果用户切换目标日历，应视为一次迁移：先给出旧日历保留/清理选项，再对新日历执行首次同步，不能直接复用旧日历的 EventKit identifier。

### 4.3 Community 隔离

同步配置和映射必须包含稳定的 community 标识。切换 Relay/community 时：

- 不复用上一 community 的事件映射；
- 不把上一 community 的事件写入当前 community；
- 当前 community 可以选择独立 Apple 日历；
- 后台同步任务必须随 community 切换取消并重新建立。

Relay 仍是 Buzz 数据的事实来源；EventKit 是用户主动连接的外部副本和输入渠道，不能绕过 Relay 的签名、ACL 和事件校验。

## 五、字段映射

### 5.1 Buzz 到 Apple

| Buzz NIP-52 字段 | Apple EventKit 字段 | 规则 |
|---|---|---|
| `title` tag | `title` | 必填；空标题不进入同步 |
| event `content` | `notes` | 保存描述；不得覆盖用户同步后新增的未知文本而不做冲突判断 |
| `start` / `end` | `startDate` / `endDate` | 时间型使用 Unix 时间，日期型按本地日期处理 |
| kind `31922` | `isAllDay = true` | 保持 end 为排他结束日期 |
| kind `31923` | `isAllDay = false` | 使用开始/结束时区 |
| `start_tzid` | `timeZone` | 保留 IANA 时区，缺失时记录创建端时区 |
| `location` | `location` | 普通文本位置 |
| Buzz coordinate | `url` + 本地映射 | URL 使用 `buzz://calendar?...` 作为恢复标记 |

Apple alarms、attachments、availability、travel time 和会议链接首期不回写 Buzz，因为现有 `CalendarEvent` 没有完整对应字段。

### 5.2 Apple 到 Buzz

Apple 事件转换为 Buzz 日程时：

- 全天事件发布为 `31922`；
- 定时事件发布为 `31923`；
- 新建时生成稳定随机 `d` tag；
- 后续编辑沿用原 kind、author 和 `d` tag，发布 replacement head；
- 删除发布现有 kind `5` deletion event，并引用完整 coordinate；
- 所有写入使用当前 Buzz 用户身份签名；
- Apple calendar title 不直接转换为 Buzz `calendarId`，首期统一进入 Personal。

Apple attendee 与 Buzz `p` tag 不是完全等价关系。首期不从 Apple attendee 自动生成 Buzz participant，也不承诺 RSVP 状态同步，避免把邮件邀请和 Nostr pubkey 错误对应。

## 六、本地映射与状态模型

每一个同步关系都需要本地持久映射，建议至少保存：

```text
community_id
buzz_kind
buzz_author
buzz_d_tag
buzz_event_id
apple_calendar_identifier
apple_event_identifier
last_buzz_created_at
last_apple_modified_at
last_synced_fingerprint
sync_status
last_error_code
last_attempted_at
last_succeeded_at
```

映射唯一键：

```text
community_id + buzz_kind + buzz_author + buzz_d_tag
```

不能用标题、开始时间或 Apple event identifier 单独作为业务主键：标题和时间可编辑，EventKit identifier 在系统数据库迁移、账户重建或事件复制后也可能失效。

为支持映射恢复，写入 Apple 时在 `url` 中保存 Buzz deep link，例如：

```text
buzz://calendar?kind=31923&author=<pubkey>&id=<d-tag>
```

URL 只包含公开事件坐标，不包含 private key、认证 token 或事件正文。

`last_synced_fingerprint` 由实际参与同步的规范化字段计算，例如标题、描述、开始、结束、全天、时区和地点。它用于判断哪一端自上次成功同步后发生变化，并阻止 Buzz → Apple → Buzz 回环。

## 七、增量同步流程

### 7.1 触发条件

同步由以下事件触发：

- Desktop 启动并完成 community 初始化；
- Relay 收到当前用户的日历 replacement 或 deletion；
- EventKit 发出 event store changed 通知；
- 网络恢复；
- 用户点击“立即同步”；
- 定时兜底扫描。

多个触发需要合并和防抖，同一 community 同一时间只运行一个同步事务。新的触发在当前事务完成后再执行一次，不并发写同一事件。

### 7.2 Buzz 到 Apple

1. 获取当前用户 NIP-52 日程的 replacement heads。
2. 按同步时间窗口筛选，例如过去 90 天至未来 365 天；映射中已有的更远事件仍处理删除和更新。
3. 使用 coordinate 查询本地映射。
4. 对比 Buzz 字段指纹与上次同步指纹。
5. 创建、更新或删除对应 EventKit 事件。
6. EventKit 保存成功后更新本地映射；失败时保留可重试状态。

### 7.3 Apple 到 Buzz

1. 只查询目标日历和同步时间窗口。
2. 通过 Apple identifier、本地映射和 `buzz://` URL 恢复对应关系。
3. 对比 Apple 字段指纹与上次同步指纹。
4. 新 Apple 事件在用户启用双向同步时创建 Buzz 事件。
5. 已映射事件的修改发布新的 replacement event。
6. 已映射事件在 Apple 消失时，不立即视为删除；先重新查询并区分移动、账户暂不可用和真实删除。
7. Relay 接受事件后才更新本地成功状态。

### 7.4 幂等和重试

- 同一个 Buzz coordinate 在一个 Apple 日历中最多对应一个活动事件；
- 发布 Apple 新建事件到 Buzz 前先持久化待提交操作及生成的 `d` tag；
- Relay 超时后需要查询 replacement head，不能直接生成另一个 `d` tag 重试；
- EventKit 保存成功、Relay 写入失败时保留 pending 状态，下一次继续使用同一身份；
- 重试采用有上限的指数退避，手工“立即同步”可提前触发；
- 不可恢复错误进入用户可见状态，不无限后台重试。

## 八、冲突处理

冲突定义为：Buzz 与 Apple 两端的可同步字段都相对 `last_synced_fingerprint` 发生变化，而两端结果不一致。

首期建议不使用静默 last-write-wins。时间戳可能受到设备时钟、Relay 接收延迟和 iCloud 同步延迟影响，自动覆盖容易丢失用户输入。

冲突列表提供：

- 日程标题与时间；
- Buzz 版本摘要；
- Apple 版本摘要；
- `保留 Buzz 版本`；
- `保留 Apple 版本`。

选择后将选定版本写入另一端，并保存新的共同 fingerprint。

特殊冲突同样进入列表：

- Buzz 已修改、Apple 已删除；
- Apple 已修改、Buzz 已删除；
- Apple 事件被移动到非目标日历；
- Buzz 全天事件与 Apple 定时事件互相转换；
- 原目标 Apple 日历变为只读或消失。

## 九、重复日程与首期降级

Buzz 当前 Calendar 首版明确不支持 RRULE，而 Apple Calendar 支持重复日程。首期规则建议为：

- Buzz 日程不会生成 Apple recurrence rule；
- Apple 中已有重复日程不自动导入 Buzz；
- 用户尝试导入时显示“不支持重复日程”，不要静默只导入一次；
- 不把每个 occurrence 展开为独立 Buzz 日程，否则无法可靠同步系列编辑、单次例外和删除未来实例。

真正支持重复日程前，需要先扩展 Buzz Calendar 的领域模型、NIP-52 标签处理、编辑体验和测试，再开放 Apple recurrence 同步。

## 十、安全与隐私

1. macOS 申请完整日历权限，并提供明确用途描述。
2. Sandboxed macOS 应用加入 calendar personal-information entitlement。
3. 只读取用户选定的目标日历；日历选择列表只在本机展示。
4. Apple 账户标识、日程内容和同步映射不得写入普通日志。
5. Apple 日历数据不经过新的旁路服务；回写 Buzz 必须走现有签名和 Relay publish 管线。
6. 不允许同步引擎以 Agent 私钥代签用户从 Apple 发起的修改。
7. ICS 订阅若后续实现，令牌应可撤销、可轮换、作用域限制到单一用户与 community，并避免出现在分析埋点和访问日志中。
8. 删除和批量首次同步前展示影响范围；清理 Apple 副本时只处理有可靠映射或 Buzz URL 标记的事件。

## 十一、技术边界设计

### 11.1 Desktop 前端

React 层负责：

- 权限与连接设置界面；
- 日历选择、同步方向和状态展示；
- 冲突处理界面；
- 触发 Tauri commands；
- 通过现有 Relay 查询和发布能力完成用户签名写入。

React 层不直接持有 EventKit 对象，也不自行实现后台同步队列。

### 11.2 Tauri 后端与 macOS 原生桥

Tauri 层负责：

- 封装 EventKit 权限请求；
- 列出可写日历；
- 查询、创建、更新和删除 EKEvent；
- 接收 event store changed 通知；
- 保存本地同步配置、映射和 pending operation；
- 将变化以稳定、最小化的数据结构传给前端。

EventKit 访问建议通过一个边界清晰的 Swift 原生模块实现，再由 Tauri Rust command 调用。不要在多个 Rust command 中散落 Objective-C runtime 调用；原生模块应把 Apple 类型转换为 Buzz 自有 DTO，便于测试和未来替换。

### 11.3 Relay

EventKit 首期不需要新增专用 HTTP endpoint，也不需要新 Nostr kind。它复用现有 NIP-52 event、kind `5` deletion、replacement 和 ACL 管线。

如果后续做 ICS 订阅，才需要设计 HTTP surface；如果后续做 CalDAV，则应作为独立、经过鉴权的协议适配层，而不是让 Apple 客户端绕过 Relay 直接写数据库。

## 十二、可观测性

建议记录不含正文的结构化指标：

- sync run 开始、结束、耗时和触发原因；
- scanned、created、updated、deleted、unchanged、conflicted、failed 数量；
- community 的不可逆匿名标识；
- 错误类别：permission、calendar_missing、read_only、eventkit、relay_auth、relay_conflict、network、invalid_data；
- pending operation 数量和最老等待时间。

日志不得记录日程标题、备注、参与者、Apple 账户名称、private key 或 ICS token。

## 十三、测试方案

### 13.1 纯逻辑测试

- NIP-52 与 Apple DTO 双向字段转换；
- 全天 end-date 排他语义；
- IANA 时区与夏令时边界；
- fingerprint 稳定性；
- 同步决策矩阵；
- pending operation 幂等重试；
- conflict 分类；
- community 隔离。

### 13.2 macOS 集成测试

- 权限未决定、允许、拒绝和系统设置撤销；
- 可写、只读和消失的 Apple 日历；
- EventKit 新建、修改、删除；
- EventKit change notification；
- Desktop 重启后的映射恢复；
- iCloud 暂不可用后的补偿同步。

自动化测试优先使用专用本地测试日历，不能访问开发者真实个人日历。涉及系统授权弹窗的场景需要独立手工验收清单。

### 13.3 Desktop E2E

- 设置入口和权限状态；
- 目标日历选择；
- 首次同步确认；
- 同步中、成功、失败、冲突；
- 断开与保留/删除副本；
- community 切换不串数据。

### 13.4 手工验收

至少覆盖：

1. Buzz Desktop 创建事件后出现在 Mac Calendar。
2. 事件通过 iCloud 出现在 iPhone。
3. iPhone 修改事件，Mac 收到后 Buzz Desktop 回写 Relay。
4. Buzz 在另一台客户端修改，当前 Mac 的 Apple 日历更新。
5. Desktop 离线期间两端分别修改，重连后出现冲突而非静默覆盖。
6. 撤销权限后不继续读取，并展示恢复入口。
7. 切换 community 后不复用上一 community 映射。

## 十四、发布阶段

### Phase 0：技术验证

- 验证当前 Tauri 签名、sandbox 和 EventKit entitlement；
- 验证 Swift 原生桥与 Rust command 的可行性；
- 在专用测试日历完成 create/read/update/delete；
- 验证 iCloud 跨设备延迟和 event store changed 行为。

### Phase 1：Buzz 到 Apple 单向导出

- 权限、日历选择、映射和状态页；
- Personal 日程增量创建、更新、删除；
- 失败重试与断开；
- 不扫描 Apple 新建事件，不回写 Buzz。

### Phase 2：EventKit 双向同步

- Apple 新建、修改、删除回写；
- pending operation；
- conflict UI；
- Desktop 重启与网络恢复补偿。

### Phase 3：可选 ICS 只读订阅

- 私有订阅令牌；
- iCalendar 序列化、缓存与撤销；
- Apple Calendar 添加订阅指引。

### Phase 4：评估 CalDAV

根据“Desktop 不在线时仍需双向同步”的真实使用量决定是否进入 CalDAV，不提前承诺。

## 十五、Todolist

以下 Todo 是实施范围草案，每项只对应一个文件；开始修改前仍需确认最终范围和实际文件落点。

- [ ] `docs/2026-08-09-apple-calendar-sync-plan.md`：记录确认后的产品决策、实施结果和方案偏差。
- [ ] `desktop/src-tauri/tauri.conf.json`：补充 macOS Calendar 权限用途描述与打包配置。
- [ ] `desktop/src-tauri/Entitlements.plist`：增加 macOS Calendar sandbox entitlement。
- [ ] `desktop/src-tauri/src/apple_calendar.rs`：定义 Tauri commands、Apple Calendar DTO 和原生桥边界。
- [ ] `desktop/src-tauri/src/lib.rs`：注册 Apple Calendar commands 和应用生命周期同步入口。
- [ ] `desktop/src-tauri/src/apple_calendar_store.rs`：持久化 community-scoped 同步配置、事件映射和 pending operations。
- [ ] `desktop/src-tauri/swift/AppleCalendarBridge.swift`：实现 EventKit 权限、日历枚举、事件 CRUD 和变更通知。
- [ ] `desktop/src/shared/api/tauriAppleCalendar.ts`：提供前端类型化 Apple Calendar command 封装。
- [ ] `desktop/src/features/calendar-sync/lib/calendarSyncTypes.ts`：定义同步配置、状态、字段指纹和冲突类型。
- [ ] `desktop/src/features/calendar-sync/lib/calendarEventMapper.ts`：实现 NIP-52 与 Apple DTO 的双向字段转换。
- [ ] `desktop/src/features/calendar-sync/lib/calendarSyncDecision.ts`：实现幂等、删除确认和冲突决策矩阵。
- [ ] `desktop/src/features/calendar-sync/hooks.ts`：编排 Relay 事件、EventKit 变化、重试和 community 生命周期。
- [ ] `desktop/src/features/calendar-sync/ui/AppleCalendarSettings.tsx`：实现权限、日历选择、同步方向、状态和断开界面。
- [ ] `desktop/src/features/calendar-sync/ui/CalendarSyncConflictDialog.tsx`：实现双端冲突比较与选择。
- [ ] `desktop/src/features/settings/ui/SettingsDialog.tsx`：增加 Apple Calendar integrations 入口。
- [ ] `desktop/src/features/communities/useCommunityInit.ts`：在 community 切换时停止旧同步任务并重建当前作用域。
- [ ] `desktop/src/testing/e2eBridge.ts`：增加 EventKit mock commands、权限状态和变化事件。
- [ ] `desktop/tests/e2e/apple-calendar-sync.spec.ts`：覆盖设置、单向同步、双向同步、冲突和断开旅程。
- [ ] `desktop/src/features/calendar-sync/lib/calendarEventMapper.test.mjs`：覆盖字段、全天和时区转换。
- [ ] `desktop/src/features/calendar-sync/lib/calendarSyncDecision.test.mjs`：覆盖幂等、冲突、删除和恢复决策。

具体实施时应先确认 Tauri 配置、entitlement 和 settings 的真实文件结构；若实际边界不同，先更新本方案，再开始改代码。

## 十六、验收标准

Phase 1 完成标准：

- 用户可授权并选择一个可写 Apple 日历；
- Buzz Personal 日程能增量创建、更新和删除 Apple 副本；
- iCloud 可以把这些事件显示到同 Apple Account 的其他设备；
- 重启和网络恢复不产生重复事件；
- 关闭权限、日历消失和 Relay 失败均有可恢复状态；
- community 切换无数据串扰；
- 断开不会误删非 Buzz 日程。

Phase 2 完成标准：

- Apple 目标日历中新建、修改和删除能由当前用户身份回写 Buzz；
- 双端同时修改时不静默丢数据；
- Agent 和其他成员事件不会被用户代签；
- unsupported recurrence、attendee 和 alarm 有明确降级，不产生错误语义；
- 所有相关 unit、Tauri、Desktop E2E 和手工跨设备验收通过。

## 十七、待确认产品决策

进入代码实施前需要确认：

1. 首次交付只做 Phase 1，还是同时交付 Phase 2 双向同步？建议先 Phase 1。
2. 用户必须选择已有日历，还是允许 Buzz 创建 iCloud 下的 `Buzz` 日历？建议优先允许选择，并提供创建专用日历的便捷动作。
3. Apple 目标日历中新建的所有事件是否都导入 Buzz？建议双向模式下导入，但首次连接时必须单独确认历史范围。
4. 初始时间窗口采用过去 90 天、未来 365 天是否合适？建议以此作为默认并保持可调整空间。
5. 断开同步时默认保留 Apple 副本是否确认？建议默认保留。
6. owned Agent 日程是否需要只读导出？建议不进入首期，先保证 Personal 的签名和冲突语义正确。

## 十八、建设性建议

“像 Google Calendar 一样”容易被理解成永久在线的账户级同步，但 EventKit 方案实际上依赖至少一台运行 Buzz Desktop 的 Mac。产品文案应明确它是“通过这台 Mac 同步到 Apple Calendar”，不能宣传成完全独立于 Desktop 的云同步。

此外，不建议为了更快展示而把 `.ics` 订阅和双向同步放在同一个开关下。二者的刷新速度、编辑权限和安全模型不同，应作为两个清晰能力呈现，否则用户会在 Apple 日历修改后误以为 Buzz 会收到更新。

## 十九、参考依据

- Apple EventKit：访问、创建、修改和删除系统日历事件，并接收外部变化通知。
- Apple Calendar access levels：读取已有事件需要 full access；仅新增可使用 write-only。
- macOS sandbox：访问日历需要 calendar personal-information entitlement。
- Apple Calendar subscription：URL 订阅可经 iCloud 显示到多个设备，但外部订阅为只读。
- RFC 4791：CalDAV 的服务端协议基础，仅作为后续阶段参考。
- Buzz `wiki/code-spec.md`：Relay 是事实来源、优先复用 Nostr event、community 隔离和失败可恢复。
- Buzz `docs/2026-08-01-calendar-module-plan.md`：现有 Calendar 首版边界，包括 NIP-52、Agent 署名、无重复日程和外部同步延期。
