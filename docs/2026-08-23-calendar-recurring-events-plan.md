> 更新日期：2026-08-23 13:31 CST
> 更新说明：完成 Daily、自定义星期组合和自定义每月日期组合实现，记录 NIP-52 实例化方案、部分失败恢复、验证结果及 CLI 时区边界。

# Calendar 重复日程功能方案

## 一、产品目标

当前 Calendar 只能创建单次日程。用户需要在创建日程时设置重复规则，减少逐条创建例会、习惯安排和周期提醒的成本。

第一阶段完成后，用户可以：

1. 在 Desktop Calendar 创建不重复、每天、自定义星期组合或自定义每月日期组合的日程。
2. 选择重复次数，或选择重复截止日期；重复日程必须有明确终点。
3. 在日、周、月视图看到每一次实际发生的日程。
4. 打开某次日程时看到其重复规则，并能单独编辑或删除该次日程。
5. 使用 `buzz calendar create` 创建相同能力的重复日程，保证 Agent-facing 操作与 Desktop 一致。
6. 保持现有单次日程、owned Agent 日程、全天日程和时区行为不变。

## 二、协议结论与设计原则

### 2.1 NIP-52 不定义重复日程

官方 NIP-52 明确把重复日程列为 intentionally unsupported scenario，建议客户端把每次发生实例表示为具有重复元数据的独立 Calendar Event。

因此本功能不新增专用 HTTP API、不新增 Nostr event kind，也不把 `RRULE` 塞进一个其他客户端无法展示的“虚拟日程”。每次发生仍发布为合法的：

- `kind:31922` 全天日程；或
- `kind:31923` 定时日程。

其他 NIP-52 客户端即使不认识 Buzz 的系列标记，也能正常看到每个实例。

### 2.2 系列与实例

一次重复创建生成一个 series id，并展开为有限个独立实例。每个实例使用确定性的 `d` identifier，并附加 Buzz 自定义 tags：

```text
["buzz_series", "<series-uuid>"]
["buzz_occurrence", "<从 0 开始的序号>"]
["buzz_repeat", "daily|weekdays|month-days"]
["buzz_repeat_values", "<星期或月日期的规范化逗号列表>"]
["buzz_repeat_end", "count:<n>|until:<YYYY-MM-DD>"]
```

`d` identifier 由 series id 与 occurrence index 稳定生成。相同请求重试时覆盖同一组 NIP-33 坐标，不制造重复实例。

系列标记只是 Buzz 的产品关联信息，不改变 NIP-52 的 `start`、`end`、`D`、timezone、地址坐标或 Relay ACL 语义。

### 2.3 重复计算

- Daily：按本地日历日递增，保留原本地时间。
- 自定义星期组合：用户可以同时选择星期一至星期日中的一个或多个日期；从首次日程开始，只生成命中所选星期的实例。
- 自定义每月日期组合：用户可以同时选择每月 1–31 号中的一个或多个日期；从首次日程开始，只生成命中所选日期的实例。
- 星期与月日期组合在保存前排序并去重，使相同规则产生稳定 metadata 和实例顺序。
- 若某月不存在所选日期，则跳过该日期，不自动移动到月末。例如选择每月 31 号时，2 月不生成实例。
- 首次日程本身始终是第一个实例；创建表单会自动把首次日期对应的星期或月日期加入组合，避免规则与首个实例矛盾。
- 全天日程：保持原持续天数，按本地日期计算。
- 定时日程：以创建时的 IANA timezone 作为墙上时间基准，跨 DST 时保留用户看到的本地时刻，而不是固定增加秒数。
- 截止日期包含当天符合规则的实例。
- 为防止误操作和过量发布，单次最多生成 365 个实例；UI 和 CLI 在发布前完成校验。

## 三、第一阶段交互范围

### 3.1 创建

创建弹窗的 More options 增加 Repeat：

- Does not repeat（默认）
- Daily
- Custom weekdays
- Custom month days

选择 Custom weekdays 后显示星期一至星期日的多选控件，至少选择一天。首次日程对应的星期默认选中且不可在不调整首次日期的情况下移除。

选择 Custom month days 后显示 1–31 的多选控件，至少选择一天。首次日程对应的月日期默认选中且不可在不调整首次日期的情况下移除。界面明确提示：目标月份不存在的日期会被跳过。

选择重复后显示结束方式：

- After occurrences：2–365 次，包含首次日程；
- On date：截止日期不得早于首次发生日期，且展开后不得超过 365 次。

保存时先在客户端完整展开和校验，再逐条签名发布。保存期间弹窗保持不可关闭；全部成功后关闭并刷新 Calendar。

### 3.2 部分失败

Nostr Relay 不提供跨多个 event 的事务。若一组实例只发布成功一部分：

- 不把结果提示为完整成功；
- 弹窗保留并显示“已保存 X/Y 次”；
- Retry 复用同一 series id 和确定性实例 id，只补发/覆盖同一坐标，不创建额外副本；
- 已成功实例可立即出现在 Calendar；
- 错误信息保留 Relay 返回的可理解原因。

### 3.3 查看、编辑与删除

详情弹窗显示重复规则和该实例在系列中的序号，例如 `Every Monday and Wednesday` 或 `Monthly on 1, 15, and 31`。

第一阶段只支持编辑或删除当前实例。这样行为与 NIP-52 的独立事件模型一致，也避免在无事务 Relay 上批量覆盖或删除时产生不可恢复的半成功系列。

编辑当前实例时保留 series tags，但只替换该实例的坐标；删除当前实例使用现有 NIP-09 coordinate deletion。其他实例不受影响。

### 3.4 本阶段明确不做

- 永不结束的重复规则；
- 每 N 天/周/月；
- “每月最后一天”“每月最后一个工作日”等相对日期；
- “仅本次 / 本次及以后 / 整个系列”的批量编辑或删除；
- 单次例外后自动重算整个系列；
- Web 和 Mobile 的创建入口；它们仍可把实例当普通 NIP-52 日程读取。

以上能力需要系列版本、例外覆盖与批量失败恢复模型，建议在第一阶段真实使用验证后单独设计。

## 四、技术方案

### 4.1 共享 SDK

在 `buzz-sdk` 定义可选的 Calendar series metadata，并由现有 builder 输出自定义 tags。SDK 继续只构建一个 NIP-52 实例；重复展开属于调用端的日期/时区逻辑，避免 SDK 隐式执行批量发布。

SDK 校验：

- series id 非空且不包含控制字符；
- occurrence index 与 repeat metadata 必须成组出现；
- 单次日程不输出任何 series tag；
- 自定义 tag 不影响现有 NIP-52 builder 测试。

### 4.2 Desktop

新增纯函数模块负责：

- 校验重复规则；
- 以本地 calendar arithmetic 展开实例；
- 生成稳定的实例 id；
- 跨月末、闰年、DST 时保持产品语义；
- 解析和格式化详情中的重复规则。

`hooks.ts` 解析 series tags，保存 mutation 接收展开后的实例列表并汇总成功/失败。查询仍读取普通 31922/31923 events，不需要 Relay 新查询协议。

### 4.3 CLI

`buzz calendar create` 增加：

- `--repeat daily`
- `--weekdays mon,wed,fri`
- `--month-days 1,15,31`
- `--repeat-count <2..365>`
- `--repeat-until <YYYY-MM-DD>`

`--repeat`、`--weekdays`、`--month-days` 三种规则互斥；任一重复规则都必须同时提供 `--repeat-count` 或 `--repeat-until`，两种结束条件互斥。星期使用固定英文缩写 `mon` 至 `sun`，月日期限定为 1–31；输入会排序、去重并验证包含首次发生日。CLI 使用与 Desktop 相同的产品规则和稳定 series/occurrence metadata，输出总数、成功数和 series id。若部分失败，以非零退出码返回，并明确已成功数量，使 Agent 可以用相同参数安全重试。

考虑到 Desktop 是 TypeScript、CLI 是 Rust，两端无法直接复用实现文件；测试会用同一组边界 fixtures 固定跨端语义。

### 4.4 Relay 与数据库

现有 Relay 对 NIP-52 必需 tags、日期、时区和 `D` tags 做验证，并允许额外 tags；数据库按每个实例现有的 start/end 投影和查询。因此本阶段预计不修改 Relay、数据库或 migration。

实施时会先增加一项 Relay regression test，确认带 Buzz series tags 的合法 NIP-52 event 被接受、陌生客户端仍可按普通日程读取。若测试揭示额外 tag 被拒绝，再回到文档更新设计，不直接扩大协议改动。

## 五、测试与验收

### 5.1 纯逻辑测试

- 单次日程不产生系列 metadata。
- Daily、自定义星期组合、自定义月日期组合按次数正确展开。
- 星期组合与月日期组合会排序、去重，并包含首次发生日。
- 截止日期包含边界当日。
- 选择每月 29/30/31 号时，不存在该日期的月份会跳过；闰年 2 月 29 日按真实日历生成。
- 自定义星期组合跨周、跨年以及跨 DST 时保持墙上时间。
- 全天多日事件保持持续天数。
- 超过 365 次、无终点、非法截止日期被拒绝。
- 同一 series id 重试生成完全相同的 `d` identifiers。

### 5.2 Desktop E2E

- 创建星期一、三、五重复日程，三个视图范围内均能看到对应实例。
- 创建每月 1、15、31 号重复日程，确认短月份跳过 31 号。
- 详情展示可读的自定义规则和 occurrence 信息。
- 删除其中一次后，其他两次仍保留。
- 编辑其中一次后，其他实例不变化。
- 模拟第 N 次发布失败，显示 X/Y；Retry 不产生重复坐标并最终完成。
- 现有 Calendar navigation、owned Agent、全天、创建、编辑、删除和错误恢复测试继续通过。

### 5.3 CLI 与 Relay

- CLI 参数组合和边界校验单测。
- CLI 展开结果与 Desktop fixtures 一致。
- SDK builder 输出完整 NIP-52 tags 和系列 tags。
- Relay 接受带系列 tags 的 31922/31923，并继续拒绝非法 NIP-52 event。

### 5.4 质量门

- Desktop：Biome、typecheck、Calendar unit/E2E、E2E build。
- Rust：`cargo fmt --all -- --check`、`cargo test -p buzz-sdk`、`cargo test -p buzz-cli`、相关 Relay tests、Clippy。
- 提交前运行 `just ci`；若环境限制导致未完成，在实施结果中逐项记录。
- 用户可见 UI 完成后使用 E2E mock 截图验证创建、详情和部分失败状态，并检查图片 hash 不重复。

## 六、Todolist

每个 todo 只对应一个文件；未获得确认前均不修改。

- [x] `crates/buzz-sdk/src/lib.rs`：为 Calendar input 增加可选系列 metadata 类型与字段。
- [x] `crates/buzz-sdk/src/builders.rs`：校验并输出系列 tags，增加 builder 回归测试。
- [x] `crates/buzz-cli/src/lib.rs`：增加重复创建 CLI 参数与互斥规则。
- [x] `crates/buzz-cli/src/commands/calendar.rs`：实现重复展开、稳定实例 id、批量发布结果与单元测试。
- [x] `crates/buzz-relay/src/handlers/ingest.rs`：仅增加系列 tags 与 NIP-52 共存的验证测试；未改生产逻辑。
- [x] `desktop/src/features/calendar/lib/calendarTypes.ts`：定义重复规则、系列 metadata 与批量保存结果类型。
- [x] `desktop/src/features/calendar/lib/calendarRecurrence.ts`：实现规则校验、实例展开、稳定 id 与展示文案。
- [x] `desktop/src/features/calendar/lib/calendarRecurrence.test.mjs`：覆盖星期组合、月日期组合、排序去重、次数、截止日、缺失月日期和幂等 fixtures；Daily 与部分失败由 E2E 覆盖。
- [x] `desktop/src/features/calendar/hooks.ts`：解析系列 tags，并实现可重试的多实例保存 mutation。
- [x] `desktop/src/features/calendar/ui/CalendarEventDialog.tsx`：增加 Repeat 与结束条件控件、校验和部分失败反馈。
- [x] `desktop/src/features/calendar/ui/CalendarEventPopover.tsx`：展示重复信息并明确 Edit 只作用于当前实例；删除沿用单实例坐标删除。
- [x] `desktop/src/features/calendar/ui/CalendarScreen.tsx`：连接重复草稿、批量保存状态和当前实例编辑语义。
- [x] `desktop/src/features/calendar/ui/CalendarGrid.tsx`：为时间网格创建的草稿初始化不重复规则。
- [x] `desktop/src/testing/e2eBridge.ts`：支持可观测的重复实例发布、坐标 upsert 及中途失败模拟。
- [x] `desktop/tests/helpers/bridge.ts`：声明 Calendar 重复发布测试配置。
- [x] `desktop/tests/e2e/calendar.spec.ts`：覆盖星期组合、月日期跳过和部分失败进度。
- [x] `docs/2026-08-23-calendar-recurring-events-plan.md`：记录实施结果、方案偏差和验证证据。

## 七、验收标准

- Desktop 可以创建 Daily、自定义星期组合和自定义每月日期组合的有限重复日程。
- 次数和截止日期两种结束方式都正确，最多 365 次。
- 每个实例是可独立读取、编辑、删除的标准 NIP-52 event。
- 不认识 Buzz series tags 的客户端仍能把实例显示为普通日程。
- Retry 不产生重复实例；部分失败对用户可见且可恢复。
- Agent 能通过 `buzz calendar create` 创建同语义的重复日程。
- 现有单次、全天、owned Agent、时区、删除和查询行为无回归。
- 相关测试和质量门通过，代码提交使用 signed-off commit，并按项目分支流程合回 `dev`。

## 八、风险与后续建议

- 批量发布无事务：通过预展开、稳定坐标、进度反馈和幂等重试降低风险，但不能提供真正原子提交。
- 跨时区与 DST：按创建 timezone 的墙上时间生成；实现必须用边界 fixtures 验证，不能用固定毫秒递增代替。
- 月日期缺失语义：目标月份不存在所选日期时跳过该实例；UI 和 CLI 帮助必须明确，避免用户误以为会自动移到月末。
- 系列批量维护：建议后续引入系列版本与 exception 模型后，再支持“本次及以后/整个系列”，不要把当前所有相同 metadata 的实例直接无条件批量覆盖。
- 365 次上限是安全边界，不是长期产品承诺；真实使用数据可用于决定是否增加后台批量能力。

## 九、实施结果与方案偏差

已完成：

- Desktop 创建弹窗支持 Daily、Custom weekdays、Custom month days。
- 自定义组合自动排序、去重，并强制包含首次发生日期。
- 月份缺少所选日期时跳过，不移动到月末。
- 支持按 2–365 次或截止日期结束；截止日期包含当天。
- 每次发生发布为独立 31922/31923 event，并携带稳定系列 metadata。
- Desktop 与 CLI 的幂等实例 id 均为 `<series-id>-<occurrence-index>`。
- 详情展示重复规则和 occurrence 序号；编辑、删除只影响当前实例。
- 批量发布中途失败时显示 `Saved X/Y occurrences`，使用同一草稿重试会覆盖相同坐标。
- Relay 生产校验不需要修改；回归测试确认额外系列 tags 与合法 NIP-52 envelope 共存。

与原方案的偏差：

- 未增加额外时区依赖。Desktop 使用本地 calendar arithmetic，能够在当前 IANA timezone 下保持墙上时间；CLI 对 RFC3339 输入保留其固定 UTC offset，因此跨 DST 的长期 CLI 系列不会自动切换 offset。后续若 CLI 需要完整 IANA DST 展开，应单独引入 timezone database，而不是在本次扩大依赖面。
- 本次 E2E 直接验证创建、series tags、月日期跳过和部分失败，没有新增 PR 截图文件；现有 mock E2E build 已实际渲染并操作完整表单。

验证结果：

- Desktop TypeScript typecheck：通过。
- Desktop Biome（11 个相关文件）：通过。
- Calendar recurrence 单元测试：4/4 通过。
- Desktop Calendar Playwright smoke E2E：14/14 通过。
- Desktop E2E build：通过。
- `buzz-sdk` Calendar tests：5/5 通过。
- `buzz-cli` Calendar tests：6/6 通过。
- Relay NIP-52 series compatibility regression：1/1 通过。
- `buzz-sdk`、`buzz-cli` Clippy（all targets, deny warnings）：通过。
- `just ci`：Rust workspace fmt/Clippy 与 Desktop 全量 Biome 已通过，随后被当前 `dev` 已存在的 Desktop file-size ratchet 增长阻断；报告中的 `runtime.rs`、`runtime/tests.rs`、`AgentInstanceEditDialog.tsx`、`tauri.ts`、`types.ts`、`markdown.tsx` 均未被本功能修改。本次 Calendar 文件未触发 file-size guard。
