# 更新日期：2026-07-31

## 更新说明

根据本地运行证据修正方案：问题不是时间接近的消息被聚合，而是 Agent 产生
ACP 文本后，没有执行 `buzz messages send`，运行时仍把该 turn 视为成功结束。

本方案保留现有 batch、queue 和 steer 行为，新增消息交付确认、纠正重试和 ACP
兜底发布，确保人类触发的消息不会只在 Agent Activity 中留下回答。

## 用户影响

用户在 DM 或频道中向 Agent 发送消息后：

- Agent 能收到消息并调用模型。
- 模型回答会作为 `agent_message_chunk` 出现在 Agent Info → Activity。
- 如果模型没有选择工具调用，消息不会提交给 Relay。
- 消息页面没有 Agent 回复，但 turn 已被标记为完成，不会自动补偿。

Activity 是执行观察面，不是消息交付面。Activity 中出现回答不能作为用户已经
收到回复的证据。

## 本地证据

本次问题对应的实际数据：

```text
2026-07-31 11:24:22  用户 DM：中午好
2026-07-31 11:24:36  用户 DM：你吃了吗
2026-07-31 11:24:39–40  Agent observer 产生 Activity frame
```

Relay 数据库中没有这次 turn 对应的 Agent kind-9 消息，Agent 日志中也没有
`tool_call` 或 `buzz messages send`。同一个 Agent 之前成功发送的消息能够正常
写入 Relay，说明 Relay、DM 页面和 Agent 身份本身可以工作。

## 根因

`buzz-agent` 使用自动工具选择。模型可以返回普通文本并以 `end_turn` 结束，也可以
选择调用 shell 工具。

当前 ACP 行为：

1. `agent_message_chunk` 被发送到 observer，因此 Activity 能显示回答。
2. `tool_calls` 为空时，Agent 接受 provider 的 `end_turn`。
3. ACP 只检查 turn 是否结束，不检查该 turn 是否向 Buzz 发布过消息。
4. 因此“模型回答完成”被错误地等同于“用户已经收到回复”。

基础提示虽然要求使用 `buzz messages send`，但提示词不是交付保证。不同模型或同一
模型的不同采样结果都可能直接返回文本。

## 非根因

消息聚合不是本次缺少回复的根因：

- batch 只决定多条等待消息是否在同一个 prompt 中处理。
- steer 只决定进行中的 turn 如何接收后续消息。
- 两条路径都没有禁止 `buzz messages send`。
- 即使只有一条消息，只要模型返回普通文本且不调用工具，当前代码仍会静默结束。

因此本次不修改队列 flush 粒度，也不把默认 `steer` 改成 `queue`。

## 目标行为

对每个由 Buzz 消息触发的 Agent turn：

```text
收到消息
  -> Agent 处理
  -> 验证是否成功执行 buzz messages send
     -> 已发送：turn 正常完成
     -> 未发送：追加交付纠正提示
        -> 纠正发送成功：turn 完成
        -> 仍未发送：ACP 使用 Agent 身份兜底发布最终文本
```

- Activity 文本不能单独满足交付条件。
- 成功发送的消息不得再次兜底发布。
- batch 中的消息可以继续由一条综合回复覆盖；本次不改变聚合产品语义。
- steer 注入的消息继续由当前 turn 的最终回复覆盖。
- DM、普通频道和 thread 使用同一交付保障。
- 兜底消息必须发布到触发 turn 的原频道。
- thread 回复继续保留原有 thread root/parent 结构。
- Relay 明确拒绝发送时不能伪装成功，必须记录错误并进入失败处理。

## 技术方案

### 1. 在 ACP client 中追踪消息交付

每次 `session/prompt` 开始时创建独立的 delivery tracker：

- 收集该 prompt 的 `agent_message_chunk`，用于构造最终可见文本。
- 记录 `tool_call.rawInput` 中调用 `buzz messages send` 的候选 tool call ID。
- 在对应 `tool_call_update` 为 `completed` 且结果不是 error 时，标记发送成功。
- prompt 结束时返回本轮的发送状态和可用最终文本。
- prompt 取消、超时或进程退出时清理 tracker，不能把上一个 turn 的发送状态泄漏到
  下一个 turn。

只看到 shell tool 开始不能算成功；必须看到该 tool 的成功完成结果。

### 2. 正常结束前执行有限纠正

消息触发的 turn 收到 `end_turn` 后：

- 已存在成功发送证明：正常完成。
- 没有发送证明但存在 Activity 文本：向同一 session 追加一次明确的交付纠正 prompt，
  要求立即通过 `buzz messages send` 发布到指定频道，禁止只返回普通文本。
- 纠正次数必须有固定上限，避免不遵循工具调用的模型无限循环。

心跳 turn、纯控制命令和没有频道来源的内部 turn 不应用消息交付纠正。

### 3. ACP 兜底发布

纠正后仍没有成功发送证明时，ACP 使用现有 `RestClient` 中的 Agent keys：

- 使用 `buzz_sdk::build_message` 构建 kind-9 消息。
- 使用 Agent 身份签名。
- 通过 `POST /events` 提交到 Relay。
- 内容采用本轮最后一段非空的 Agent 可见文本。
- thread turn 根据现有 `ThreadTags` 恢复 root 和 parent。
- 如果没有任何可见文本，则发布明确的失败通知，而不是伪造模型答案。

兜底提交必须检查 Relay 响应。只有 Relay 接受后才记录为 delivered。

### 4. 保留现有聚合和高级消息处理

以下行为保持不变：

- 同频道等待事件的 batch 合并。
- 默认 `multiple_event_handling=steer`。
- 不同频道并行处理。
- queue、interrupt 和 owner-interrupt 的显式配置。

## 重复消息防护

兜底发布前必须确认本轮没有成功的 `buzz messages send` tool result。以下情况不能
触发兜底：

- tool 已成功完成，但模型随后又输出总结文本。
- observer frame 到达顺序与 tool result 接近。
- 同一 tool update 被重复接收。

delivery tracker 以 prompt 和 tool call ID 为边界，状态只允许从未交付变为已交付，
不能回退。

## 影响代码文件范围

| 文件 | 现有职责 | 本次影响 |
| --- | --- | --- |
| `crates/buzz-acp/src/acp.rs` | ACP JSON-RPC、session update 和 prompt 生命周期 | 收集 Agent 可见文本；识别并确认成功的 `buzz messages send` tool call；向调用方暴露每轮 delivery outcome |
| `crates/buzz-acp/src/pool.rs` | 执行 Agent turn、维护 batch/thread 上下文和 Relay REST client | 在消息 turn 正常结束前检查 delivery outcome；执行一次纠正 prompt；必要时用 Agent 身份兜底发布 |
| `crates/buzz-acp/src/base_prompt.md` | Agent 的 Buzz 操作契约 | 明确 Activity 文本不等于已回复，发送必须以成功的 Relay 写入结果为准 |
| `crates/buzz-acp/README.md` | ACP 配置和运行行为文档 | 说明消息交付确认、有限纠正及兜底发布行为 |

本次不修改：

- `crates/buzz-acp/src/queue.rs` 的 batch 规则。
- `multiple_event_handling` 默认值。
- Relay 数据模型和 DM 存储。
- Desktop 消息页面与 Activity 页面。
- 模型 provider 和模型参数。

## 测试计划

### ACP delivery tracker

1. 普通 `agent_message_chunk` 会被收集，但不会标记 delivered。
2. 普通 shell 命令完成不会标记 delivered。
3. `buzz messages send` tool 开始但失败，不会标记 delivered。
4. `buzz messages send` tool 成功完成后标记 delivered。
5. 重复或乱序的 tool update 不会造成错误交付状态。
6. 新 prompt 会清除上一轮的文本和 delivery 状态。

### 消息 turn

1. 首轮成功调用 `buzz messages send` 时不追加纠正、不兜底。
2. 首轮只有模型文本时追加一次纠正 prompt。
3. 纠正 prompt 成功发送时不兜底。
4. 纠正后仍只有文本时，ACP 向原频道兜底发布。
5. DM 兜底消息出现在原 DM 频道。
6. thread 兜底消息保留 root 和 parent。
7. 心跳和无频道 turn 不触发交付纠正。
8. Relay 拒绝兜底消息时记录失败，不能标记 delivered。
9. batch/steer 原有测试继续通过，证明聚合行为未改变。

计划执行：

```bash
. ./bin/activate-hermit
cargo test -p buzz-acp acp::
cargo test -p buzz-acp pool::
cargo test -p buzz-acp queue::
cargo fmt --all -- --check
cargo clippy -p buzz-acp --all-targets -- -D warnings
```

## Todolist

- [x] `crates/buzz-acp/src/acp.rs`：实现 prompt 级 delivery tracker，并补充 session update 状态测试。
- [x] `crates/buzz-acp/src/pool.rs`：实现发送确认、一次纠正和 ACP 兜底发布，并补充 DM/thread/失败测试。
- [x] `crates/buzz-acp/src/base_prompt.md`：明确 Activity 与消息交付的边界。
- [x] `crates/buzz-acp/README.md`：记录交付保障与聚合行为不变。
