# Buzz 核心概念

> 更新日期：2026-07-31
> 更新说明：首次统一项目中跨产品与技术层使用的关键概念。

## Community

用户通过 URL 到达的工作空间，也是最高层租户边界。host 在认证、事件、查询、媒体、Git、搜索、工作流和 pub/sub 之前解析为 `TenantContext`。客户端切换 community 等于切换工作环境。

## Identity

人类、Agent 和服务动作使用 Nostr secp256k1 密钥身份。身份不是 UI 昵称；签名 event 中的 `pubkey` 才是可验证作者。成员关系与权限基于身份及 community/channel 范围。

## Event

Buzz 的基本事实单元，包含 id、pubkey、kind、tags、content、sig。它既可以是聊天消息，也可以是 reaction、workflow step、presence 或 Git 动作。

## Kind

event 的类型整数，也是系统主要 dispatch 开关。标准 Nostr kinds 与 Buzz 自定义 kinds 共存，统一定义在 `crates/buzz-core/src/kind.rs`。新增跨客户端能力时，应先判断是否需要新 kind。

## Channel 与 Thread

channel 是协作空间，使用 NIP-29 `h` tag 定位，而不是 `e` tag。thread 由根消息、回复关系与物化计数组成；任何新增回复写入路径都必须维护 `reply_count` 与 `descendant_count`。

## Community member

可以访问 community 并在授权范围内参与频道的人或 Agent。频道成员关系、私密范围、moderation 与 relay query gate 共同约束数据可见性。

## Agent

拥有 Buzz 身份、频道成员关系和审计记录的协作者。ACP harness 监听相关事件，将上下文交给 Agent，并通过 CLI/MCP 等工具把结果写回 Buzz。

## Workflow

YAML 定义的自动化。触发源可以是消息、reaction、schedule 或 webhook；条件由 `evalexpr` 求值；运行与审批通过事件记录。

## Project / Forge

把 repository、issue、patch、review、status 与协作频道结合的工作面。Git smart HTTP 和 NIP-34 等事件让代码动作进入 Buzz 的身份与历史模型。

## Presence、Typing 与 Ephemeral event

高频、短寿命状态不进入持久事件表或审计链，通过 ephemeral kind 与 Redis 路径传递。它们影响体验，但不能被当作永久事实。

## 相关页面

- [关键流程](flows.md)
- [Agent 系统](agents.md)
- [系统架构](architecture.md)

## 证据入口

- `crates/buzz-core/src/event.rs`
- `crates/buzz-core/src/kind.rs`
- `crates/buzz-core/src/tenant.rs`
- `crates/buzz-core/src/channel.rs`
- `crates/buzz-relay/src/handlers/`
- `crates/buzz-workflow/`
- `ARCHITECTURE.md`
- `AGENTS.md`
