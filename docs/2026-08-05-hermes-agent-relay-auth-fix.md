# Hermes Agent Relay 认证修复方案

> 更新日期：2026-08-05
> 更新说明：完成 Managed Agent 创建与启动前的显式 Relay membership 修复，并记录定向测试结果。

## 1. 问题与产品行为

新建的 `hermes girl` 已成功启动 Hermes 并完成 ACP 初始化，但连接 `wss://achoverse.xyz` 时被 Relay 拒绝：

```text
Auth failed: restricted: not a relay member
```

Agent 创建与 Relay 成员准入是两个独立动作。Buzz 不应因为本地生成了一个 Agent 就无条件放宽 Relay 的认证策略；但当有权限的用户明确创建并启动 Managed Agent 时，Desktop 必须先确保该 Agent 是当前社区的普通 Relay member，再启动运行时。

## 2. 根因

频道与 Team 挂载流程已经调用 `ensureManagedAgentRelayMembership()`，顺序是“Relay membership → Channel membership → Agent start”。

独立 Create Agent 流程默认把 `spawnAfterCreate=true` 直接交给 Tauri。Tauri 在创建命令内部启动 Agent，没有经过前端的 membership helper。因此新 Agent 被保存后立即以非 Relay member 身份连接，认证失败。

手动启动命令也没有统一执行这项前置检查。只修某个 React 按钮会继续遗漏创建时自动启动和其他调用方。

## 3. 为什么不启用 `BUZZ_ALLOW_NIP_OA_AUTH`

该开关允许任何 Relay member 为 Agent 签发 NIP-OA 委托，使 Agent 不进入直接成员名单也能获得 Relay 会话访问。这会改变社区治理边界：原本只有 owner/admin 能添加 Relay member，开启后普通 member 也可委托新的 Agent 身份进入。

因此保留默认关闭，不修改 Relay 部署配置。Agent 继续作为显式普通成员出现，便于审计、撤销和管理。

## 4. 技术方案

在 Tauri 端增加可复用的 Managed Agent membership ensure：

1. 查询当前 Relay 的 NIP-11 信息；未启用 NIP-43 时直接返回；
2. 查询 kind `13534` membership snapshot；
3. Agent 已存在时直接返回，不改变原角色；
4. Agent 不存在时，由当前身份发布 kind `9030`，角色固定为 `member`；
5. Relay 拒绝或网络失败时返回真实错误，不继续启动 Agent。

在以下两条当前社区启动路径调用它：

- `create_managed_agent` 的 `spawn_after_create` 分支，在 local spawn 或 provider deploy 之前；
- `start_managed_agent`，在 local spawn 或 provider deploy 之前。

频道挂载现有前端 ensure 暂时保留。重复检查是幂等的，并能保证频道 membership 写入前 Relay membership 已存在。

本次不让多社区后台 reconcile 自动修改非当前社区成员名单。那属于跨社区权限副作用，需要独立设计。

## 5. 失败与回滚

- 当前用户不是 owner/admin：kind `9030` 会被 Relay 拒绝，Agent 不启动，并展示真实权限错误。
- snapshot 已有 Agent：不重复添加，也不覆盖 owner/admin 等已有角色。
- 开放 Relay：不发送无意义的管理事件。
- 添加成员成功但后续启动失败：保留普通 Relay member，用户可修复运行时配置后重试；不自动执行高风险成员删除。
- 回滚仅需撤回 Desktop 代码；不涉及 Relay 配置和数据库迁移。

## 6. 验证标准

1. membership-required Relay 上，创建并自动启动 Agent 时先发布 kind `9030`，再启动运行时。
2. 手动启动缺少 Relay membership 的 Agent 时先补齐普通成员身份。
3. membership 写入失败时不启动或部署 Agent。
4. 已有成员不重复写入、不改变角色。
5. open Relay 不发布 kind `9030`。
6. `hermes girl` 重试后出现 `connected to relay at wss://achoverse.xyz` 和 `presence set to online`。

## 7. Todo List

- [x] `desktop/src-tauri/src/commands/relay_members.rs`：增加后端可复用、幂等的 Managed Agent Relay membership ensure。
- [x] `desktop/src-tauri/src/commands/agents.rs`：在创建后自动启动和手动启动前调用 membership ensure。
- [x] `desktop/src-tauri/src/commands/mod.rs`：注册 Relay membership 回归测试模块。
- [x] `desktop/src-tauri/src/commands/relay_members_tests.rs`：覆盖 open/restricted、已有成员、缺失成员及 malformed snapshot 判断。
- [x] `docs/2026-08-05-hermes-agent-relay-auth-fix.md`：补充实施方案与定向验证结果。

## 8. 实施验证

已通过：

```text
cargo fmt --manifest-path desktop/src-tauri/Cargo.toml -- --check
cargo test --manifest-path desktop/src-tauri/Cargo.toml commands::relay_members_tests --lib
cargo clippy --manifest-path desktop/src-tauri/Cargo.toml --lib -- -D warnings
```

定向单测结果：4 passed，0 failed。

完整 `cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib` 结果为
1871 passed、16 failed、14 ignored。失败项均为本机 HTTP mock 请求被环境代理返回
`502 Bad Gateway`，涉及 join policy、media download、pairing、persona sharing 与
relay admission 等既有网络测试；本次新增的 membership 测试全部通过。
