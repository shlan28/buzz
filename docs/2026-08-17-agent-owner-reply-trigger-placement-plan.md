# Agent 无需 @mention 回复开关放置方案

> 更新日期：2026-08-17
> 更新说明：确认采用 Agent 实例级开关；本次仅修复编辑页可见性，不增加 Channel 配置、状态或快捷入口。

## 1. 要解决的用户问题

用户希望在频道里直接对自己拥有的 Agent 说话，不必每次输入 `@Agent`。开关需要同时做到：

- 容易找到并开启；
- 用户清楚它影响一个 Agent、一个频道还是所有频道；
- 多个 Agent 在同一频道时，不会在用户无感知的情况下同时回复；
- 不影响 DM；
- 不扩大非 Owner 成员触发 Agent 的权限。

这里实际存在两个不同的问题：

1. **Agent 默认行为**：这个 Agent 是否默认把 Owner 的频道消息视为触发消息？
2. **Channel 局部行为**：这个 Agent 在当前频道是否无需 @mention 就回复 Owner？

如果只做一个布尔开关，必须明确选择其中一种语义，不能把 Agent 全局设置放到 Channel 页面并伪装成频道设置。

## 2. 现有回复触发机制

当前实现是 Agent 实例级布尔值 `respond_to_owner_messages`：

1. Desktop 保存 Agent 实例配置；
2. Tauri 启动 Agent 时写入 `BUZZ_ACP_RESPOND_TO_OWNER_MESSAGES`；
3. ACP 验证 Agent 的 Owner 身份；
4. 对每个 Agent 已加入的频道，在原有“必须 @mention”订阅之外增加一个仅限 Owner 作者、仅限频道消息 kind 的订阅分支；
5. 收到事件后再次检查消息作者确实是 Owner；
6. 满足条件后进入与 @mention 相同的 Agent queue 和回复流程。

因此当前开关的真实语义是：

> 这个 Agent 在所有已订阅频道中，都可以被其 Owner 的普通频道消息触发。

它不是 Channel 数据，也不会改变其他成员的触发权限。配置变化目前还会影响 Agent spawn snapshot，通常需要重启或重新加载 Agent 才能完整生效。

## 3. 方案 A：开关放在 Agent 编辑页面

### 产品语义

开关属于 Agent 实例，适合表达“这是我的个人助手，它在参与的频道里都应该听我说话”。

推荐文案：

> **Reply to my messages without an @mention**<br>
> Applies in every channel this Agent has joined. Other members must still @mention it.

### 用户操作

一次开启，对该 Agent 的所有频道生效。用户不需要进入每个频道重复设置。

### 优点

- 开启路径只执行一次，适合个人常驻 Agent；
- 与“Agent 如何响应”这一能力归属一致；
- 多频道场景配置成本最低；
- 现有数据结构、环境变量、Owner 验证和订阅逻辑可以直接复用；
- 不需要新增 Channel 配置事件、缓存、同步或权限模型；
- 实现和测试范围最小，失败面最少。

### 缺点

- 用户正在 Channel 中产生需求时，需要离开当前上下文去 Agent 页面设置；
- 全局影响范围较大，若 Agent 加入很多频道，可能产生意外回复；
- 同一频道多个 Agent 都开启时，Owner 的一条普通消息可能触发多个 Agent；
- Agent 页面无法直观看到某个频道内还有哪些 Agent 也开启了该行为。

### 适用场景

- Agent 是用户的个人助手；
- 用户希望它在所有工作频道保持一致行为；
- 追求最少配置步骤和最简单的运行机制。

## 4. 方案 B：开关放在 Channel 页面

### 产品语义

开关必须属于 `Agent × Channel`，表达“这个 Agent 只在当前频道无需 @mention 回复我”。

推荐呈现为 Channel 的 Agent 列表，每个 Agent 提供：

- `Only when @mentioned`；
- `Reply to my messages`；
- `Paused in this channel`（可作为后续能力）。

### 用户操作

用户在正在聊天的频道内直接设置，意图与结果距离最近；但每个 Agent、每个频道都要单独配置。

### 优点

- 配置发生在触发行为实际出现的地方，更符合上下文；
- 影响范围精确，不会让一个频道的决定扩散到其他频道；
- 可以展示“本频道有几个 Agent 会自动回复”，更容易预防群体响应；
- 适合会议频道、项目频道等局部工作模式。

### 缺点

- 多频道使用时操作次数显著增加；
- Channel 页面需要先选择目标 Agent，单个 Switch 不足以表达配置对象；
- 必须新增持久化的 `Agent × Channel` 配置，而不能复用现有全局布尔值；
- ACP 需要为每个频道解析不同的 Owner bypass，并在配置变化时动态更新订阅；
- 需要处理 Agent 加入/离开频道、Channel 删除、community 切换、跨设备同步和配置冲突；
- 如果配置只保存在 Desktop 本地，其他设备和远程 Agent 会看到不一致行为；如果建模为 event，则需要新增 kind/schema、权限和查询链路。

### 适用场景

- 同一个 Agent 在不同频道承担不同角色；
- 用户高度在意避免误触发；
- 频道内存在多个常驻 Agent，需要集中治理。

## 5. 对比结论

| 维度 | Agent 编辑页 | Channel 页面 |
|---|---|---|
| 一次开启后的覆盖 | Agent 的所有频道 | 当前频道的当前 Agent |
| 首次找到设置 | 较远，需进入 Agent 编辑 | 较近，就在对话上下文 |
| 多频道配置效率 | 高，一次完成 | 低，需要逐频道设置 |
| 误触发控制 | 较弱，范围较大 | 强，范围精确 |
| 多 Agent 可见性 | 较弱 | 强，可集中展示 |
| 与当前数据模型匹配 | 完全匹配 | 不匹配，需要新模型 |
| 运行时订阅复杂度 | 低 | 中高 |
| 跨设备一致性成本 | 低，随 Agent 配置 | 高，需要同步频道覆盖 |
| 最小交付风险 | 低 | 高 |

## 6. 推荐方案

### 6.1 当前版本：保留在 Agent 编辑页

如果核心目标是“以最少步骤让 Agent 回复，并保持机制简洁高效”，Agent 编辑页更优。

原因不是页面实现方便，而是设置语义与现有触发机制一致：当前能力本来就是 Agent 的全局 Owner bypass。一次配置即可覆盖所有已加入频道，同时只需要一个经过验证的 Owner pubkey 和一套订阅规则。

应同时修正文案与反馈：

- 明确写出“适用于该 Agent 加入的所有频道”；
- 明确“其他成员仍需 @mention”；
- 开启前提示：若同一频道多个 Agent 开启，它们可能同时回复；
- 保存后明确提示是否需要重启 Agent 才能生效。

### 6.2 本次修复：让开关在 Agent 编辑首屏可见

现有字段仍挂载在实例编辑表单中，但 Profile 页的 `Edit` 路由在官方合并后优先打开了关联 Definition 编辑器；即使本地实例存在，用户也无法进入拥有该设置的实例编辑器。E2E 已复现为：点击 `Edit` 后出现 Definition 表单，实例表单及开关均不存在。

本次恢复“存在实例时优先编辑实例、只有纯 Definition 时才编辑 Definition”的路由，并把 Owner 无需 mention 回复作为高频实例行为放在 Agent 名称之后、通用 author access 之前。不增加 Channel 页面入口，也不改变保存协议。

### 6.3 何时升级为真正的 Channel 级覆盖

只有出现以下明确需求时，才引入 `Agent × Channel` 配置：

- 用户频繁要求“只在这个频道自动回复”；
- 多 Agent 同频道导致群体响应成为常见问题；
- Agent 在不同频道需要明显不同的响应模式。

届时应采用“Agent 默认值 + Channel 覆盖值”模型，优先级为：

```text
Channel override > Agent default > mention-only system default
```

Channel 覆盖必须通过 Relay 可同步的事件持久化，不能只存在某一台 Desktop 的 localStorage 中。

## 7. 技术方案边界

本轮推荐不改变触发协议：

- Agent 编辑页继续写入 `respond_to_owner_messages`；
- Tauri 继续生成受保护的环境变量；
- ACP 只允许经过验证的 Owner 绕过 mention；
- Relay 订阅仍按 channel 带 `h` tag，并用 author-scoped OR filter 收取 Owner 消息；
- event 到达后继续进行本地二次验证，不能只依赖 Relay 查询过滤；
- DM、Task execution、非 Owner 消息均不受该开关影响。

Agent 实例编辑页继续作为唯一配置入口和状态来源。

## 8. 实施 Todo List

以下为后续获得确认后的候选改动；每项只对应一个文件。

- [x] `desktop/src/features/agents/ui/OwnerMessageReplyField.tsx`：增加明确分组、全频道作用域、非 Owner 边界和多 Agent 提示。
- [x] `desktop/src/features/agents/ui/AgentInstanceAccessFields.tsx`：把 Owner reply 开关移动到实例编辑访问设置首位。
- [x] `desktop/src/features/profile/ui/UserProfilePanel.tsx`：恢复有 Managed Agent 实例时优先打开实例编辑器的路由。
- [x] `desktop/tests/e2e/agent-owner-message-reply.spec.ts`：验证开关打开编辑页后位于可视区域，并继续覆盖实例隔离与保存。

验证结果：Biome、Desktop typecheck、E2E build 通过；`agent-owner-message-reply` integration E2E 在修复前稳定失败、修复后 1/1 通过。完整 `pnpm check` 的格式检查通过，但合并提交完成后文件大小 ratchet 以官方 `main` 为新基准，另有 6 个既有集成文件超限；本次修改的 `UserProfilePanel.tsx` 已压回 1000 行门禁以内。

## 9. 验收标准

- 用户能从 Agent 编辑页明确理解开关作用于所有已加入频道；
- 开关位于 Agent 实例编辑页首屏，不需要先展开 Advanced 或主动滚动寻找；
- Channel 页面不新增配置或快捷入口；
- Owner 普通消息能够触发，非 Owner 普通消息不能触发；
- DM 与 Task execution 行为不变；
- 多 Agent 风险在开启前和 Channel 状态中都可见；
- 配置保存、Agent 重启和 community 切换后状态一致。
