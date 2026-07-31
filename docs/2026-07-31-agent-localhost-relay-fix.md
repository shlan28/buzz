# 更新日期：2026-07-31

## 更新说明

修复 Desktop 管理的 Agent 在本地社区中无法接收消息的问题。当前 Agent
runtime 会把 `ws://localhost:3000` 规范化为
`ws://127.0.0.1:3000`，随后使用规范化结果建立真实连接。Buzz Relay
按请求 Host 隔离社区，因此 Desktop 与 Agent 实际进入不同社区，Agent
无法发现频道，也不会触发模型请求。

## 用户影响

用户在 Desktop 中配置 `ws://localhost:3000` 后，界面、频道和消息均属于
`localhost:3000` 社区，但本地 Agent 会连接 `127.0.0.1:3000` 社区。
Agent 日志表现为：

```text
buzz-acp starting: relay=ws://127.0.0.1:3000
discovered 0 channel(s)
no channel subscriptions resolved — agent will sit idle
```

这不是模型提供商故障。消息没有进入 Agent 的频道订阅，所以不会产生模型
请求。

## 根因

Agent runtime 使用规范化 Relay URL 作为 `(agent, community)` 进程标识。
现有规范化规则把 `localhost`、`127.0.0.1` 和 `::1` 视为同一地址。

这种等价关系适用于普通网络寻址，但不适用于 Buzz 的产品语义。Buzz Relay
使用 Host 作为社区边界：

```text
localhost:3000  -> 社区 A
127.0.0.1:3000 -> 社区 B
```

因此，Agent runtime 的社区身份也必须保留 Host。仅大小写、默认端口和根路径
斜杠等不会改变 Host 语义的差异可以继续规范化。

## 修复方案

调整共享 Relay URL 规范化规则，不再把不同的 loopback Host 合并：

- `ws://localhost:3000` 保持为 `ws://localhost:3000`。
- `ws://127.0.0.1:3000` 保持为 `ws://127.0.0.1:3000`。
- `ws://[::1]:3000` 保持为 `ws://[::1]:3000`。
- DNS Host 仍转为小写。
- WebSocket 默认端口和根路径末尾斜杠仍会移除。
- 凭据、fragment 和非 WebSocket scheme 仍被拒绝。

Desktop 前端用于匹配 runtime 状态的规范化逻辑必须同步采用相同规则，避免
前后端对同一社区得出不同的 runtime key。

## 影响代码文件范围

本次修复限定在 Relay URL 的 runtime 身份规范化及其回归测试，共涉及以下
五个代码文件：

| 文件 | 现有职责 | 本次影响 |
| --- | --- | --- |
| `crates/buzz-core/src/relay.rs` | 定义共享的 Relay URL runtime 身份规范化规则 | 移除 loopback Host 合并，保留 `localhost`、`127.0.0.1` 和 `::1` 的社区身份差异；同步更新 Rust 单元测试 |
| `desktop/src-tauri/src/managed_agents/runtime_commands.rs` | 创建、探测和管理 `(agent, community)` runtime | 增加 runtime key 回归测试，证明启动及 HTTP probe 使用的 key 保留原社区 Host |
| `desktop/src/features/agents/managedAgentRuntimeStatus.ts` | 在 Desktop 前端规范化 Relay URL，并将社区与 Agent runtime 状态匹配 | 与 Rust 规则保持一致，不再把不同 loopback Host 归并为 `127.0.0.1` |
| `desktop/src/features/agents/managedAgentRuntimeStatus.test.mjs` | 验证前端 runtime URL 规范化和状态匹配 | 增加不同 loopback Host 必须保持独立的回归测试 |
| `desktop/src/features/agents/managedAgentReconciliationPlan.test.mjs` | 验证多社区 Agent runtime reconciliation 的去重和重试计划 | 确认指向同一 socket、但 Host 不同的本地社区会分别 reconciliation |

本次不修改以下范围：

- Relay 的 Host 派生社区模型及数据库结构。
- 社区、频道、消息和成员数据。
- ACP 的频道发现、订阅与模型调用逻辑。
- Desktop Community Settings 的保存逻辑。
- Agent 模型、提供商、API Key 和代理配置。
- 现有 runtime receipt 或本地社区数据迁移。

## 兼容性

已有 `127.0.0.1` runtime receipt 仍代表 `127.0.0.1` 社区，不应自动改写成
`localhost`，否则可能把两个真实社区错误合并。修复后的 Desktop 会为
`localhost` 创建独立 runtime；正常停止或应用退出流程会清理旧进程。

该变化主要影响本地开发地址。生产 DNS Relay 的规范化行为保持不变。

## 验证标准

### 自动化测试

1. 共享 Rust URL 规范化：
   - `localhost`、`127.0.0.1`、`::1` 生成不同的 Relay 身份。
   - DNS Host 大小写、默认端口和根路径斜杠仍正确规范化。
   - 非 WebSocket scheme、凭据和 fragment 仍被拒绝。
2. Desktop Rust runtime：
   - `ManagedAgentRuntimeKey::new()` 为三种 loopback Host 生成不同 key。
   - Agent 启动路径使用的 runtime key 保留 `localhost`。
   - HTTP `/query` 探测从保留 Host 的 key 构造 API 地址。
3. Runtime receipt 兼容性：
   - 旧 `127.0.0.1` receipt 仍只匹配 `127.0.0.1` runtime。
   - `localhost` runtime 不会接管、覆盖或删除该 receipt。
4. Desktop TypeScript：
   - 前端规范化结果与 Rust 一致。
   - `localhost` 社区不会匹配 `127.0.0.1` runtime 状态。
   - 同 Host 的大小写、默认端口和根路径差异仍能正确匹配。

计划执行以下命令：

```bash
. ./bin/activate-hermit
cargo test -p buzz-core relay::
cargo test --manifest-path desktop/src-tauri/Cargo.toml managed_agents
cd desktop && pnpm test -- managedAgentRuntimeStatus
cd ..
cargo fmt --all -- --check
cargo clippy -p buzz-core --all-targets -- -D warnings
cargo clippy --manifest-path desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```

### 本地链路验收

1. 使用 `ws://localhost:3000` 启动 Desktop 和 Agent。
2. ACP 启动日志必须保留原 Host：

   ```text
   buzz-acp starting: relay=ws://localhost:3000
   ```

3. ACP 必须发现并订阅当前社区频道：

   ```text
   discovered 1 channel(s)
   subscribed to channel ...
   ```

4. 在 Desktop 中发送带 Agent mention 的消息，确认产生 prompt、模型请求和
   Agent 回复。
5. 查询本地数据库，确认客户端消息、Agent presence 和 Agent 回复使用相同的
   `community_id`，且对应 `communities.host = 'localhost:3000'`。
6. 确认 `127.0.0.1:3000` 社区没有收到本次验收产生的新事件。

## Todolist

- [x] `crates/buzz-core/src/relay.rs`：保留 loopback Host，并更新 Rust 回归测试与文档注释。
- [x] `desktop/src-tauri/src/managed_agents/runtime_commands.rs`：增加 runtime key、启动地址和 HTTP probe 地址回归测试。
- [x] `desktop/src/features/agents/managedAgentRuntimeStatus.ts`：同步前端 runtime URL 规范化规则。
- [x] `desktop/src/features/agents/managedAgentRuntimeStatus.test.mjs`：更新并补充 loopback Host 回归测试。
- [x] `desktop/src/features/agents/managedAgentReconciliationPlan.test.mjs`：更新多社区 reconciliation 的 loopback Host 隔离测试。
