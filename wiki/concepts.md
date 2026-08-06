# Buzz 核心概念

> 更新日期：2026-08-06
> 更新说明：补充 Track 成员、私有可见性、owner Agent 管理权与关联 Task 的权限继承规则。

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

## Track、Task 与 Tag

Track 是 community 内用于协调一组相关工作的上层容器。每个 Track 有稳定 UUID、名称、负责人、只读成员、开始日期、结束日期和 `planned / active / completed / canceled` 状态；归档是独立属性，只有 completed 或 canceled Track 可以归档。归档后不会从系统删除，仍可从 Archived 范围、详情深链或 Restore 操作找回。

Track 不是 community 全员可见。只有 creator、当前 owner、显式 Track members，以及 Buzz 身份关系中归属于当前 owner 的托管 Agent 可以读取。只有当前 owner 与这些 owner Agents 可以编辑、转派、管理成员、归档或恢复；creator、members 和 community owner/admin 不因其身份自动获得管理权。

Task 是 community 内由人和 Agent 共用的通用工作项。Task 有稳定 UUID、单一负责人、状态、优先级、截止时间，以及可选的单一 Track、Project、Channel、来源消息关联；按负责人展示时，拖到另一列表示转派，而不是改变状态。把 Task 指派给 Agent 只表示责任归属，不会自动启动 Agent。

一个 Task 最多归属一个 Track，但可以拥有多个 Tag。Track 用于表达有负责人和时间边界的工作归属，Tag 用于轻量、多维标记；Tasks 支持按 Track 分组或筛选，Tag 只提供 OR 筛选，不提供 Tag 分组。

Task 的创建和修改保留实际操作者，当前状态由 Relay 签名并供 Desktop 与 CLI 查询。关联 Track 的 Task 继承 Track 可见性，其有效读取权限是原有 Task/Channel 权限与 Track ACL 的交集：看不到 Track 就看不到 Task，能看到 Track 也不会绕过私密 Channel 权限。未关联 Track 或清除 Track 归属的 Task 继续沿用原有可见范围。Agent 的对话权限与“谁可以给它指派 Task”是两项独立设置。

## Project / Forge

把 repository、issue、patch、review、status 与协作频道结合的工作面。Git smart HTTP 和 NIP-34 等事件让代码动作进入 Buzz 的身份与历史模型。

NIP-34 Issue 是代码仓库中的问题，必须依附 repository；Task 是可独立存在的通用协作事项。Task 可以通过 Project 关联指向 NIP-34 repository，但不会因此变成 Issue，Issue 也不会自动成为 Task。

Track 不复用 Project：Track 与代码仓库无关，Projects 仍是可关闭的 repository / issue / patch / review 工作面。关闭 Projects 不影响 Tracks，也不会隐藏 Task 的 Track 归属。

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
- `crates/buzz-core/src/task.rs`
- `crates/buzz-core/src/track.rs`
- `crates/buzz-core/src/channel.rs`
- `crates/buzz-relay/src/handlers/`
- `crates/buzz-workflow/`
- `crates/buzz-relay/src/handlers/command_executor.rs`
- `crates/buzz-cli/src/commands/tasks.rs`
- `crates/buzz-cli/src/commands/tracks.rs`
- `desktop/src/features/tasks/`
- `desktop/src/features/tracks/`
- `ARCHITECTURE.md`
- `AGENTS.md`
