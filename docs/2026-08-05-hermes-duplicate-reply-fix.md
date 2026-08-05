# Hermes 重复回复修复方案

> 更新日期：2026-08-05
> 更新说明：完成 Hermes 终端发送识别修复，并记录格式化、回归测试和静态检查结果。

## 1. 问题与用户影响

Hermes 已经通过 `buzz messages send` 把回答送到频道后，Buzz 仍判断“没有成功发送”，再次注入 `[Delivery Required]`。Hermes 因此重发同一答案，用户会看到两条内容相同或近似的回复。

日志证据：

```text
agent ended turn without a successful buzz messages send; requesting delivery
published ACP fallback because the agent did not send its answer
```

## 2. 根因

`buzz-acp` 的 delivery tracker 目前只从 ACP `tool_call.rawInput` 中识别 `buzz messages send`。

Hermes 0.20.0 把 `terminal` 归类为 polished tool：终端命令写入 `tool_call.content` 的 text block，而 `rawInput` 被明确设为 `null`。完成事件仍携带同一个 `toolCallId` 和可靠的 `completed` / `failed` 状态。

因此实际发送成功，但 tracker 没有登记该 tool call，后续 completion 无法与消息发送关联，最终错误触发补发。

## 3. 修复目标

- 识别 Hermes polished terminal tool 中的 `buzz messages send`；
- 成功完成后将当前 turn 标记为已送达，不触发 `[Delivery Required]`；
- failed terminal command 仍不得标记为成功；
- 不把普通终端命令或仅提及相关文字的输出误判为发送；
- 本次只处理重复发送，不修改 fallback 文案和凭证注入策略。

## 4. 技术方案

扩展 `PromptDeliveryTracker::observe_tool_call()`：

1. 优先检查现有 `rawInput`；
2. `rawInput` 缺失或不匹配时，检查 ACP `content` 中的 text block；
3. 继续复用现有严格命令解析，只接受真正执行 `buzz messages send` 的命令片段；
4. 仍使用 `toolCallId` 与 `tool_call_update.status=completed` 关联，失败状态不算送达。

该改动兼容 Hermes 的 ACP wire shape，同时保持 Codex、Claude、Goose 等现有 runtime 的判断不变。

## 5. 测试与验收

- Hermes shape：`rawInput=null`、命令位于 content text block、completion 为 `completed`，应标记已发送；
- Hermes failed shape：相同命令但 completion 为 `failed`，不得标记已发送；
- 非发送命令：terminal content 中是其他 `buzz` 命令，不得标记；
- 现有 rawInput 路径继续通过；
- 现场发送“你是什么模型”时只出现一条回答，日志不再出现该 turn 的 delivery correction。

## 6. Todo List

- [x] `crates/buzz-acp/src/acp.rs`：识别 Hermes polished terminal content，并补充成功、失败和非发送命令回归测试。
- [x] `docs/2026-08-05-hermes-duplicate-reply-fix.md`：实施后记录测试结果并更新完成状态。

## 7. 实施结果

- `cargo fmt --all`：通过；
- `cargo test -p buzz-acp delivery_tracker --lib`：7 项通过；
- `cargo test -p buzz-acp --lib`：661 项通过；
- `cargo clippy -p buzz-acp --lib -- -D warnings`：通过。

代码层面的验收已完成。部署后还需在真实 Hermes DM 中发送一条测试问题，确认只落地一条回答，且该 turn 不再出现 delivery correction 日志。
