> 更新日期：2026-08-01
> 更新说明：完成 ACP 与 Relay 双层修复及回归测试；记录质量门禁结果与仓库既有阻塞项。

# DM 线性回复修复方案

## 一、问题与用户影响

Buzz 的 DM 产品形态是连续对话。用户在 DM 中发出一条普通消息后，Agent 应直接在对话时间线中回复，而不是自动创建或进入 thread。

当前现场中：

- `daily-assistant` 的历史回复仅携带频道 `h` tag 和 Agent owner `auth` tag，因此直接显示在 DM 时间线；
- `Strategic Advisor` 与 `Creative Product Manager` 的新回复额外携带 NIP-10 `e/reply` tag，因此 Desktop 将回复展示为 thread；
- 三个会话对应的频道记录都是 `channel_type=dm`，不是频道创建类型错误。

这会把一对一连续交流拆成多个 thread，用户无法像普通聊天一样顺序阅读，也会让不同 Agent runtime 呈现不一致行为。

## 二、产品规则

本次修复建立以下不变量：

1. 所有 DM 消息都直接发布到 DM 时间线；
2. DM 消息不得携带 NIP-10 `root` 或 `reply` thread tag；
3. Agent 收到顶层 DM 或历史 threaded DM 时，后续回复都必须回到 DM 顶层；
4. stream、forum 等非 DM channel 保持现有 thread 行为；
5. 行为由系统边界保证，不能依赖不同模型自行理解提示词。

## 三、根因

### 3.1 Agent 指令存在歧义

`crates/buzz-acp/src/base_prompt.md` 的通用 threading 说明写道：human-facing 顶层消息可以把触发消息作为新 thread root。该说明没有明确排除 DM。

`crates/buzz-acp/src/queue.rs` 对顶层 DM 不主动提供 `--reply-to`，但也没有明确告诉 Agent “DM 必须不带 `--reply-to`”。不同 runtime 因此产生不同结果：`buzz-agent` 倾向于直接回复，`codex-acp` 会主动按通用 threading 规则添加 `--reply-to`。

### 3.2 Relay 未维护 DM 线性不变量

Relay 当前会为任何带 NIP-10 thread tag 的 channel-scoped event 解析并保存 thread metadata，没有在 `channel_type=dm` 时拒绝 thread message。于是客户端或 Agent 的错误选择会成为持久数据，并被 Desktop 正常渲染为 thread。

## 四、技术方案

### 4.1 ACP 明确 DM 发送规则

更新 Agent 基础说明与 turn context：

- 明确 DM 永远使用不带 `--reply-to` 的 `buzz messages send`；
- DM 即使收到历史 `e/root`、`e/reply` tag，也只把它们作为旧消息结构信息，不再延续 thread；
- `format_prompt()` 在 DM 分支永远不产生 reply anchor；
- DM `[Context]` 明确输出线性回复指令；
- 非 DM 的 human-facing thread anchor 行为保持不变。

这消除 runtime 间的解释差异，并让 Agent 第一遍发送就走正确路径。

### 4.2 Relay 强制拒绝新的 threaded DM

在 ingest 已经解析出 server-scoped `channel_row` 后增加验证：

- 仅以数据库中的 `channel_type=dm` 为准，不信任事件 tag 声明；
- 对会进入 thread metadata 的 DM message，如果携带 NIP-10 `root` 或 `reply` marker，返回明确的 `invalid: DM messages cannot be threaded`；
- 非 DM channel 不受影响；
- 不修改客户端签名事件，也不静默剥离 tag，避免“签名内容与实际持久内容不同”。

Relay guard 是最终一致性边界，可阻止旧客户端、自定义 Agent 或提示词偏离继续写入 threaded DM。

### 4.3 历史数据

已有 threaded DM event 是已签名、已持久化事件，本次不重写或删除。修复上线后：

- 历史 thread 仍可阅读；
- 针对历史 threaded DM 的新 Agent 回复回到 DM 顶层；
- 所有新 DM 消息不再创建 thread。

## 五、测试与验收

### 自动化测试

- 顶层 DM prompt 明确要求不使用 `--reply-to`；
- 历史 threaded DM prompt 同样要求顶层直回，且不生成 reply anchor；
- stream 顶层 human message 仍创建 thread anchor；
- stream 内 thread reply 仍锚定 thread root；
- Relay 接受不带 NIP-10 reply tag 的 DM kind:9；
- Relay 拒绝带 `reply` marker 的 DM kind:9；
- Relay 拒绝带 `root`/`reply` markers 的 DM kind:9；
- Relay 继续接受非 DM channel 的合法 thread reply。

### 手工验收

1. 分别打开 `Strategic Advisor`、`Creative Product Manager` 和 `daily-assistant` 的 DM；
2. 各发送两条普通消息；
3. 确认每条 Agent 回复都直接出现在 DM 时间线，不打开 thread panel；
4. 向一个历史 threaded DM 继续发消息，确认新回复回到顶层；
5. 在 stream 中 @Agent，确认原有 thread 回复行为不回归。

### 质量门禁

```bash
. ./bin/activate-hermit
cargo test -p buzz-acp
cargo test -p buzz-relay handlers::ingest
just fmt-check
just clippy
just test-unit
```

修复完成后运行 `just ci`，并记录任何环境限制。

## 六、Todolist

每项只对应一个文件；代码实现必须在本方案获得确认后开始。

- [x] `crates/buzz-acp/src/base_prompt.md`：声明 DM 永远线性直回，禁止 `--reply-to`。
- [x] `crates/buzz-acp/src/queue.rs`：移除 DM reply anchor、生成明确 DM 直回指令并补充回归测试。
- [x] `crates/buzz-relay/src/handlers/ingest.rs`：拒绝新的 threaded DM message，并补充 DM/stream ingest 测试。
- [x] `docs/2026-08-01-linear-dm-agent-replies.md`：更新实施状态、验证结果和最终取舍。

## 七、实施与验证结果

- `cargo test -p buzz-acp queue::tests --lib`：112 项通过；
- `cargo test -p buzz-relay handlers::ingest::tests --lib`：114 项通过；
- `just ci` 的格式检查、Rust Clippy、Desktop/Web 检查、Mobile analyze 均通过；
- 全仓单元测试在既有 `buzz-db` migration 数量断言处失败：仓库现有 migration 已到 `0027`，测试仍断言总数为 26。该文件不属于本次 DM 修复，未夹带修改；
- 历史 threaded DM 保持可读，新回复会回到顶层；新写入的 threaded DM message 由 Relay 明确拒绝。

## 八、非目标

- 不改变 stream、forum 或 Agent-to-Agent channel 的 thread 规则；
- 不迁移、重签、删除已有 DM event；
- 不为 DM 增加新的显示开关或 Agent 配置项；
- 不通过模型或 runtime 白名单做差异化处理。
