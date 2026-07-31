# Buzz 模块地图

> 更新日期：2026-07-31
> 更新说明：首次建立 Rust、客户端、数据与部署模块的职责索引。

## Relay 与核心

| 模块 | 职责 |
|---|---|
| `buzz-core` | 零 I/O 类型、event、filter、kind、验证、tenant |
| `buzz-relay` | WebSocket/HTTP 入口与所有服务编排 |
| `buzz-db` | Postgres 数据访问 |
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
| `buzz-cli` | Agent-first CLI |
| `buzz-dev-mcp` | 开发工具 MCP |
| `buzz-persona` | persona packs |
| `buzz-sdk` | typed event builders |
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

主要 vertical slices：channels、messages、sidebar、search、agents、projects、workflows、forum、huddle、pulse、communities、profile、settings、moderation、notifications、onboarding、presence。

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
