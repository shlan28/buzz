# Agent 主动响应 Owner 消息方案

> 更新日期：2026-08-02
> 更新说明：补全订阅组合、身份安全、去重恢复、线程路由与 Desktop 持久化测试，并修正“触发后可静默结束”的错误假设。

## 一、需求与目标

当前 Channel 中的 Agent 默认只接收明确 `@Agent` 的消息。期望增加一个可配置机制：owner 在 Agent 所属 Channel 中发送普通消息时，即使没有 @Agent，也可以触发该 Agent 处理并回复。

回复的线程规则保持不变：

- owner 在 Channel 顶层发送消息，Agent 回复到以该消息为 root 的 thread；
- owner 在已有 thread 中发送消息，Agent 回复到该 thread；
- 不把普通回复发布到 Channel 顶层；
- owner 明确要求顶层或 broadcast 时，沿用现有例外规则。

## 二、产品定义

### 2.1 新增行为开关

建议新增 Agent 级开关 `respond_to_owner_messages`，默认关闭，以保持现有 Agent 的触发方式不变。

对应 harness 配置：

- CLI：`--respond-to-owner-messages`
- 环境变量：`BUZZ_ACP_RESPOND_TO_OWNER_MESSAGES=true|false`
- 默认值：`false`

开启后，该 Agent 的入站触发条件变为：

```text
消息明确 @ 当前 Agent
OR
消息作者是当前 Agent 的 owner
```

该开关只取消 owner 消息的 mention 要求，不取消 channel membership、event kind、subscription rule、表达式过滤和 `respond_to` 作者策略。

### 2.2 “主动回复”的含义

本期“主动回复”定义为：owner 的新消息可以主动唤醒 Agent，Agent 获得一次正常 turn，并根据消息内容决定和发送回复。

它不表示 Agent 定时扫描历史消息。按照当前 harness 的 delivery confirmation 机制，一旦消息成功触发 turn，Agent 最终必须向原 Channel/thread 发布回复；如果 Agent 没有主动调用 `buzz messages send`，harness 会追问一次并在必要时兜底发布最终文本。

因此第一版采用清晰语义：**开启后，owner 的每条符合过滤条件的新消息都会触发一次回复。** 如果产品希望 Agent 对闲聊“看见但不回复”，需要另行定义显式 no-op 结果及其可观测性，不能仅依赖模型自行沉默，否则会被现有兜底发送机制改写。

### 2.3 身份边界

- 只匹配 Agent 注册并验证得到的精确 owner pubkey。
- sibling Agent 虽然可能通过现有 `owner-only` author gate，但其未 @ 消息不能使用本机制触发。
- allowlist 用户和 `respond-to=anyone` 用户的未 @ 消息不能使用本机制触发。
- owner 身份缺失或无法解析时 fail closed：不扩大订阅，只保留原有 @Agent 行为，并输出结构化 warning。
- `respond-to=nobody` 的优先级更高；即使本开关开启，也不处理 owner 的普通消息。

### 2.4 多 Agent 行为

该开关按 Agent 单独配置。如果同一 Channel 中多个 Agent 都开启，owner 的一条普通消息会唤醒所有这些 Agent。

建设性建议：第一版不要默认给所有 Agent 开启，也不要随机选择 Agent。由 owner 明确指定哪些 Agent 开启，行为可预测且方便审计。后续如需要“团队中仅一个 Agent 自动接话”，应另行设计 team coordinator/primary responder，而不是在本功能中引入隐式抢占。

## 三、代码规范检查

已优先阅读：

- `docs/index.md`：项目文档导航入口；
- `wiki/code-spec.md`：身份、channel scope、Nostr event、Rust 安全、测试和交付规则；
- `CONTRIBUTING.md`：Hermit、格式化、测试、DCO 与 PR 规范；
- `AGENTS.md`：改代码前先形成方案并获得确认、每个 Todo 对应一个文件、完成后提交 signed-off commit。

本功能复用现有 kind:9/Nostr 消息，不新增 HTTP endpoint 或 event kind。Channel 仍使用 `h` tag，owner 使用 event author pubkey 判断。

## 四、技术方案

### 4.1 Relay 精确订阅

不能通过移除 `#p` 条件来监听 Channel 全部消息。那会扩大流量，也会把过滤正确性完全推到本地。

开启本功能时，同一个 Channel 的 NIP-01 `REQ` 使用两个过滤器：

1. 原有 mention filter：`#h=<channel>`、`#p=<agent>`、明确 `kinds`；
2. owner filter：`#h=<channel>`、`authors=[owner_pubkey]`、`kinds=[9]`。

owner 分支严格限定 kind:9 stream message；workflow approval、reminder 和其他 event 仍必须沿用原有 @Agent/规则触发方式，不能因为作者是 owner 就扩大为“owner 的所有事件”。

关闭时只发送原有 mention filter。owner 同时 @Agent 时两个 filter 会重叠，事件仍必须通过现有 event-id 去重，保证只产生一个 turn。

重连和动态加入 Channel 时继续复用现有 `since` 与 skew 逻辑，两个 filter 使用同一个时间窗口，不能回放本功能启用前的历史消息。

### 4.2 本地规则匹配

Relay subscription 只负责缩小事件集，本地仍需 fail closed 校验。

现有规则的 `require_mention=true` 调整为：

```text
has_agent_mention
OR (respond_to_owner_messages AND author == verified_owner)
```

其余规则继续按原顺序执行：channel、kinds、mention/owner 例外、可选表达式。这样 owner 消息不能绕过 kind 或自定义条件。

现有 author gate 保持不变，仍在 subscription rule 之前执行。`ignore_self` 和 event-id 去重也保持不变，防止 Agent 回复再次触发自己。

### 4.3 Prompt 与 thread 回复

不新增回复路由。现有 prompt 构建已把人类发送的顶层触发消息锚定为新 thread root；已有 thread 则锚定到原 thread root。因此 owner 未 @ 的消息进入队列后，继续走现有 `resolve_reply_anchor` 和 `buzz messages send --reply-to ...` 逻辑即可。

为便于 Agent 理解触发原因，建议为这类 turn 使用明确的 prompt tag，例如 `owner-message`，但不修改 owner 原始消息内容。

### 4.4 配置与兼容性

- 现有安装默认值为 `false`，无行为变化。
- 配置为 `true` 但没有有效 owner 时，启动成功但降级为 mention-only。
- `subscribe=all` 下已经能收到 owner 消息；新开关仍控制 owner 未 @ 消息能否绕过规则中的 mention 要求，不能制造重复 turn。
- `subscribe=config` 下只对已经匹配该 Channel 的规则生效，不让未配置的 Channel 自动进入订阅范围。
- Desktop 托管 Agent 本期应能把该值写入 harness 环境；如果暂不增加 UI，可先作为高级 env 配置使用，但产品入口最终应提供明确开关和风险提示。

## 五、验收标准

1. 开关关闭时，owner 未 @ 的 Channel 消息不触发 Agent。
2. 开关开启时，owner 未 @ 的 Channel 顶层消息触发 Agent，回复位于该消息 thread。
3. 开关开启时，owner 在已有 thread 中的未 @ 消息触发 Agent，回复仍位于原 thread。
4. 非 owner、sibling Agent 和 allowlist 用户的未 @ 消息不触发。
5. owner 明确 @Agent 时只产生一次 turn，不因双 filter 重复处理；该断言必须覆盖同一 WebSocket subscription 下两个 filter 都命中的真实收包路径。
6. `respond-to=nobody` 时 owner 消息不触发。
7. owner 未解析时保持 mention-only，不扩大到监听所有作者。
8. 重连只补回断线窗口内符合条件的消息，不回放旧历史。
9. Agent 自己发出的回复不会再次触发该 Agent。
10. Channel 中两个 Agent 只有开启该开关的 Agent 被 owner 普通消息唤醒；两者都开启时行为明确为两者都回复。
11. 关闭后再重启 Agent，owner 未 @ 消息恢复为不触发；开关状态不存在仅在当前进程有效的漂移。
12. owner 消息一旦触发，delivery confirmation 仍保证最终有一条 thread 回复，不出现“turn 成功但用户看不到回复”。

## 六、测试策略

### 6.1 配置解析与兼容性

- 默认值测试：未传 CLI/env 时为 `false`，现有 mention-only 行为不变。
- CLI 测试：`--respond-to-owner-messages` 正确开启。
- env 测试：`true`/`false` 正确解析，非法布尔值启动失败并给出明确错误。
- precedence 测试：CLI 与 env 同时存在时遵循 Clap 的既有优先级。
- owner 缺失/非法测试：fail closed 为 mention-only，不产生无 authors 条件的宽泛 filter。
- `subscribe=mentions|all|config` 三种模式分别覆盖开关开/关。
- `kinds` 默认值、显式 kinds override、config rule kinds 为空三种情况分别验证，保证 owner filter 不扩大 event kinds。
- `channels_override` 与 config channel scope 分别验证，保证 owner filter 不订阅未授权或未配置 Channel。
- 旧配置文件、旧 Desktop record 和未包含新字段的 persona/team snapshot 仍能按默认关闭状态加载。

### 6.2 Relay 订阅协议

- 开关关闭：REQ 只有原 mention filter。
- 开关开启且 owner 有效：同一 REQ 包含 mention filter 与 owner author filter。
- 两个 filter 都包含相同的 `#h` 和 `since`；owner filter 固定 `kinds=[9]` 且不包含 `#p`，mention filter 保留原有 kinds 且不被意外改成 authors-only。
- `subscribe=all`：避免生成语义重复的宽泛 filter；owner 消息仍只被处理一次。
- owner 同时 @Agent：模拟同一 event 经重叠 filters 到达，验证 event-id dedup 后只向上游发送一次。
- 首次订阅使用 `since=now`，不得回放开关启用前的 owner 历史消息。
- WebSocket 重连使用现有 skew window，补回断线期间 owner 消息且重复回放只处理一次。
- 动态 membership：Agent 新加入 Channel 后，从 membership timestamp 建立 owner filter，覆盖“加群后立即发送普通消息”的竞态。
- unsubscribe/access denied：移除 Channel 时 mention 与 owner 订阅意图一起清理，重连不能复活无权限 Channel。
- rate-limit/deferred subscribe：两个 filters 作为同一 Channel 的订阅意图恢复，不因 parking/drain 丢失 owner 分支。

### 6.3 本地规则与身份安全矩阵

按 `author × mention × switch × respond_to` 建表覆盖：

| 作者/消息 | 开关关闭 | 开关开启 |
|---|---:|---:|
| owner，无 mention | 拒绝 | 接受 |
| owner，有 mention | 接受 | 接受且仅一次 |
| sibling，无 mention | 拒绝 | 拒绝 |
| sibling，有 mention | 按既有 author gate | 按既有 author gate |
| allowlist 用户，无 mention | 拒绝 | 拒绝 |
| allowlist 用户，有 mention | 按既有 author gate | 按既有 author gate |
| 普通用户，无 mention | 拒绝 | 拒绝 |
| 普通用户，有 mention | 取决于 `respond-to` | 取决于 `respond-to` |
| Agent 自己 | `ignore_self` 拒绝 | `ignore_self` 拒绝 |

另外覆盖：

- `respond-to=owner-only|allowlist|anyone|nobody` 全矩阵，特别验证 `nobody` 始终优先。
- owner pubkey 比较经过规范化且必须是精确 64-char hex；相似前缀、大小写异常和非法值不能匹配。
- event 的 author 是判断依据，正文中的 `@owner` 字符串或伪造 `p` tag 不能冒充 owner。
- owner 例外只替代 `require_mention`，仍必须通过 channel、kinds 和 evalexpr filter。
- evalexpr error/timeout 继续 fail closed，不能因 owner 身份绕过。
- 非消息 kind、workflow approval、reminder 等现有默认 kinds 分别确认是否应触发；测试固定方案选择，避免无意把“owner 消息”扩展为“owner 的所有事件”。
- DM 保持既有线性对话规则，不因为本开关增加第二次触发或 thread 回复。

### 6.4 Queue、并发与回复交付

- 顶层 owner 消息生成 `--reply-to <trigger_event_id>` 指令。
- owner 在 thread root、第一层 reply、嵌套 reply 三种位置发言时，回复都锚定原 thread root。
- batched events：最后一个事件为顶层/线程消息时，继续使用现有“最后事件决定 scope”的规则并断言锚点。
- owner 新消息在 turn 进行中到达时，分别覆盖 `steer`、`queue`、`interrupt`、`owner-interrupt`，不得丢失或错误换 thread。
- 同一 owner event 由重叠 filters、重连 replay 或重复 EVENT frame 投递时，队列中只保留一份。
- 两条不同 owner 消息即使 content 与 timestamp 相同，也必须按不同 event ID 分别处理。
- `ignore_self=true` 防止 Agent 的回复自触发；`ignore_self=false` 时也不能把“自己”误判成 owner。
- delivery confirmation：Agent 主动 send、首次未 send 后补发、最终 harness fallback 三条路径都回复原 thread。
- send 被 relay 拒绝、超时或 Agent crash 时沿用现有重试/失败语义，不把未送达标记为成功。
- 多 Agent 同 Channel：单开关与双开关两种场景验证唤醒数量，避免测试环境误把所有 Agent 共享为一个订阅者。

### 6.5 Desktop 配置与 UI

- 新建 Agent 默认关闭；编辑已存在 Agent 时正确回显。
- 切换开关并保存后，managed-agent record、effective config 和启动环境变量一致。
- Agent 停止/重启、Desktop 重启、community 切换后开关仍保持，不串到其他 Agent/community。
- persona 默认值、Agent instance override 和 team snapshot import/export 的继承/覆盖语义明确并测试；若第一版明确不支持传播，也要验证导入后安全降级为关闭。
- 开关打开且 owner 身份不可用时，UI 给出可理解提示，不显示为已生效。
- `respond-to=nobody` 与开关同时选择时阻止无效组合，或明确显示“不会触发”的提示。
- 多 Agent 风险提示可见，键盘操作、disabled 状态和保存失败回滚可测试。
- UI 单测覆盖表单 dirty state、请求 payload 和失败恢复；如交互有用户可见变化，增加 Desktop E2E。

### 6.6 端到端验收

至少用一个真实 relay 测试 client 或现有 E2E harness 覆盖：

1. owner 顶层不 @ → Agent 在对应 thread 回复；
2. owner thread 内不 @ → Agent 在原 thread 回复；
3. 非 owner 不 @ → 无 turn、无 typing、无回复；
4. owner @Agent → 只有一个 turn 和一个回复；
5. 断开 Agent relay、发送 owner 消息、恢复连接 → 消息被补回且只回复一次；
6. 动态把 Agent 加入 Channel 后立即发送 owner 普通消息 → 不丢消息；
7. 开关关闭后重复场景 1 → 不触发。

同时检查 observer/Agent Activity 中的触发 event、turn 数量、delivery 状态和 thread event tags，不能只凭 UI 中“看起来有回复”判定成功。

### 6.7 质量门

- 实现过程中先运行目标模块单测，确保新增 regression test 在旧实现下能够失败、在新实现下通过。
- 激活 Hermit 后运行 `cargo fmt --all -- --check`、相关 `cargo test -p buzz-acp`、`just clippy` 和 `just test-unit`。
- 若修改 Desktop，运行对应 JS tests、`just desktop-tauri-test`、Desktop check/build；涉及可见 UI 时运行 E2E。
- 提交前运行 `just ci`；如因环境限制未运行，必须在交付说明中逐项列出。

## 七、Todo List

每个 Todo 只对应一个文件。方案确认后已完成以下实现：

- [x] `crates/buzz-acp/src/config.rs`：新增 CLI/env 开关、Channel filter owner 意图和配置回归测试。
- [x] `crates/buzz-acp/src/relay.rs`：构建 mention OR owner 的精确 NIP-01 filters，并测试 wire shape、去重前提与宽泛订阅兼容。
- [x] `crates/buzz-acp/src/filter.rs`：允许 verified owner 满足 mention 条件，同时保留 kinds 等规则边界。
- [x] `crates/buzz-acp/src/lib.rs`：接入 verified owner、`respond-to=nobody` 优先级、动态 Channel 订阅和 fail-closed 降级。
- [x] `crates/buzz-acp/README.md`：记录配置、默认值、多 Agent 风险和使用示例。
- [x] `desktop/src-tauri/src/managed_agents/types.rs`：持久化 instance-local 开关并投影到 summary，旧记录默认关闭。
- [x] `desktop/src-tauri/src/managed_agents/types/requests.rs`：支持 create 默认值与 update true/false patch，并补 serde 测试。
- [x] `desktop/src-tauri/src/commands/agents.rs`：创建 Agent 时写入开关。
- [x] `desktop/src-tauri/src/commands/agent_models.rs`：编辑 Agent 时应用可逆 bool patch。
- [x] `desktop/src-tauri/src/managed_agents/runtime.rs`：向 harness 明确注入 true/false 环境变量。
- [x] `desktop/src-tauri/src/managed_agents/runtime/tests.rs`：覆盖环境变量默认关闭与开启。
- [x] `desktop/src-tauri/src/managed_agents/env_vars.rs`：将新环境变量加入 reserved keys，禁止用户 env 覆盖。
- [x] `desktop/src-tauri/src/managed_agents/spawn_hash.rs`：将开关纳入 spawn config hash。
- [x] `desktop/src-tauri/src/managed_agents/spawn_hash/tests.rs`：验证开关变化触发 restart drift。
- [x] `desktop/src/shared/api/types.ts`：增加 ManagedAgent/create/update 的 camelCase 类型。
- [x] `desktop/src/shared/api/tauri.ts`：增加 raw mapper 旧数据 fallback 与 create payload 映射。
- [x] `desktop/src/features/agents/ui/AgentInstanceEditDialog.tsx`：接入编辑开关的回显/reset 与 dirty patch。
- [x] `desktop/src/features/agents/ui/OwnerMessageReplyField.tsx`：承载 owner 消息回复开关和多 Agent 风险提示。
- [x] `desktop/src/features/agents/ui/AgentNameField.tsx`：拆出既有名称字段，满足 Desktop 文件尺寸门禁且不改变行为。
- [x] `desktop/src/features/agents/ui/agentDialogRouting.test.mjs`：覆盖开关未变化、开启和显式关闭的 patch 语义。
- [x] `desktop/src-tauri/src/commands/agent_config.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/commands/agents_tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/commands/personas/delete_cascade_tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/commands/personas/inbound/inbound_tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/commands/personas/snapshot/fidelity_tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/commands/personas/snapshot/import.rs`：persona snapshot 创建本机实例时显式默认关闭。
- [x] `desktop/src-tauri/src/commands/personas/snapshot/tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/commands/personas/update/name_propagation_tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/commands/team_snapshot.rs`：team snapshot 创建本机实例时显式默认关闭。
- [x] `desktop/src-tauri/src/commands/team_snapshot/tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/managed_agents/agent_events.rs`：补齐本机 record fixture，不改变 relay event wire schema。
- [x] `desktop/src-tauri/src/managed_agents/agent_snapshot.rs`：补齐本机 record fixture，不传播 instance-local 开关。
- [x] `desktop/src-tauri/src/managed_agents/config_bridge/reader_tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/managed_agents/discovery/tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/managed_agents/effective_config/tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/managed_agents/global_config/tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/managed_agents/nest/tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/managed_agents/persona_events/tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/managed_agents/readiness.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。
- [x] `desktop/src-tauri/src/managed_agents/team_snapshot.rs`：补齐本机 record fixture，不改变 team snapshot schema。
- [x] `desktop/src-tauri/src/managed_agents/teams_tests.rs`：补齐 ManagedAgentRecord fixture 的新字段默认值。

## 八、实施验证

- `cargo test -p buzz-acp --lib`：656 passed。
- Desktop JavaScript/TypeScript tests：3795 passed。
- Desktop Tauri targeted tests：runtime 8 passed、spawn hash 1 passed、request patch 1 passed。
- Desktop Tauri full suite：1866 passed、14 ignored、15 failed；失败均来自本机 relay/HTTP mock 请求返回 502，涉及 join policy、media、pairing、persona sharing、relay admission 等既有外部网络测试，与本变更路径无关。
- Buzz ACP 与 Desktop Tauri Clippy：通过。
- Rust fmt、TypeScript typecheck、Biome、`git diff --check`：通过。

## 九、已确认决策

建议采用以下默认方案：

1. 功能默认关闭，由每个 Agent 单独开启；
2. 只响应精确 owner，不包含 sibling Agent；
3. owner 消息触发一次正常 turn，并沿用现有 delivery confirmation 保证最终回复；如需“可静默观察”，另开 no-op 方案；
4. Desktop Agent 编辑页提供显式开关，不隐藏在环境变量中。

本次按以上四点实现。开关作为本机 Agent instance 配置，不进入 persona/team snapshot 或跨设备 Agent event；导入得到的新实例安全默认为关闭。
