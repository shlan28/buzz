# Buzz 模块地图

> 更新日期：2026-08-06
> 更新说明：登记 Tracks vertical slice，并补充 Tasks 的 Track 与多 Tag 扩展入口。

## Relay 与核心

| 模块 | 职责 |
|---|---|
| `buzz-core` | 零 I/O 类型、event、filter、kind、验证、tenant；包含 Task 与 Track 的 kind、状态和字段验证 |
| `buzz-relay` | WebSocket/HTTP 入口与所有服务编排；校验 Task / Track 权限、引用和并发版本，并生成当前 State |
| `buzz-db` | Postgres 数据访问；原子保存 Task / Track Command 历史并替换当前 State |
| `buzz-auth` | NIP-42/NIP-98、token、scope、rate limit |
| `buzz-pubsub` | Redis fan-out、presence、typing |
| `buzz-search` | community-scoped Postgres FTS |
| `buzz-audit` | hash-chain 审计 |
| `buzz-workflow` | YAML workflow 与条件 |
| `buzz-media` | Blossom/S3、校验、缩略图 |
| `buzz-relay-mesh` | relay 间 QUIC mesh 与 fencing |
| `buzz-push-gateway` | Mobile push gateway |
| `buzz-conformance` | multi-tenant runtime trace / replay 检查 |

## Agent 表面

| 模块 | 职责 |
|---|---|
| `buzz-acp` | Buzz ↔ ACP harness |
| `buzz-agent` | 最小 ACP Agent |
| `buzz-cli` | Agent-first CLI；`buzz tasks` 管理工作项，`buzz tracks` 管理跨任务工作轨道 |
| `buzz-dev-mcp` | 开发工具 MCP |
| `buzz-persona` | persona packs |
| `buzz-sdk` | typed event builders；包含 Task 与 Track Create/Mutate builders |
| `sprig` | 一体化 Agent harness |

## 客户端与互操作

| 模块 | 职责 |
|---|---|
| `desktop/` | Tauri + React 主客户端 |
| `mobile/` | Flutter iOS/Android |
| `web/` | relay 托管的浏览器客户端 |
| `buzz-ws-client` | 共享 NIP-42 WebSocket client |
| `buzz-pair-relay` | 临时设备配对 relay |
| `buzz-pairing-cli` | NIP-AB 配对测试 CLI |
| `git-sign-nostr` | Nostr Git 签名 |
| `git-credential-nostr` | NIP-98 Git credential |

## 工具与验证

| 模块 | 职责 |
|---|---|
| `buzz-admin` | relay 运维 CLI |
| `buzz-test-client` | integration / E2E client |
| `migrations/` | 启动时应用的 SQL schema |
| `scripts/` | 开发、发布、截图和运维脚本 |
| `deploy/` | Compose、Helm 等部署资产 |
| `docs/spec/` | TLA+/形式化模型 |
| `docs/formal/` | conformance 与模型辅助验证 |

## Desktop feature 地图

主要 vertical slices：channels、messages、sidebar、search、agents、tasks、tracks、projects、workflows、forum、huddle、pulse、communities、profile、settings、moderation、notifications、onboarding、presence。

Tasks 的主要入口：

| 文件/目录 | 职责 |
|---|---|
| `crates/buzz-core/src/task.rs` | Task 枚举与协议字段验证 |
| `crates/buzz-sdk/src/builders.rs` | 构造由人或 Agent 签名的 Task Command |
| `crates/buzz-relay/src/handlers/command_executor.rs` | 写前权限、负责人策略、`previous` 冲突校验与 Relay-signed State 生成 |
| `crates/buzz-db/src/tasks.rs` | Command 与 State 的原子事务 |
| `crates/buzz-cli/src/commands/tasks.rs` | Agent 和命令行操作面 |
| `desktop/src/features/tasks/` | Tasks 看板、列表、详情与编辑体验 |
| `desktop/src/features/agents/` | 每个 Agent 的独立任务指派权限设置 |

Tasks 是 community 通用协作模块，不属于 NIP-34 Projects。它可以关联 NIP-34 repository，但不会复用 Issue 作为底层记录。

Tracks 的主要入口：

| 文件/目录 | 职责 |
|---|---|
| `crates/buzz-core/src/track.rs` | Track 状态、日期、owner、归档与字段验证 |
| `crates/buzz-db/src/tracks.rs` | Track Command 与 State 的原子 CAS 事务 |
| `crates/buzz-cli/src/commands/tracks.rs` | Agent 和命令行的 Track create/list/get/update/archive/restore 操作面 |
| `desktop/src/features/tracks/` | Current / Completed / Archived、详情、编辑、进度、Undo 与 Restore |
| `desktop/src/features/tasks/` | Task 单一 Track 归属、多 Tag 编辑、Track 分组和 Tag OR 筛选 |

Tracks 是独立的 community 工作管理模块，不依赖或复用 feature-gated NIP-34 Projects。

## Mobile feature 地图

主要 slices：home、channels、activity、search、forum、pulse、invites、pairing、profile、settings。

## 相关页面

- [系统架构](architecture.md)
- [客户端体验](clients.md)
- [Agent 系统](agents.md)

## 证据入口

- `Cargo.toml`
- `crates/*/Cargo.toml`
- `crates/*/src/lib.rs`
- `desktop/src/features/`
- `mobile/lib/features/`
- `AGENTS.md`
