# Managed Agent 创建后无法连接 Relay 修复方案

> 更新日期：2026-08-01  
> 更新说明：补充实现进展，并将无法稳定观察调用顺序的 E2E 方案调整为依赖注入单元回归测试。

## 1. 问题与用户影响

在启用了 Relay 成员准入的社区中，用户从频道或 Team 流程创建 Managed Agent 后，界面可以完成 Agent 创建和频道成员添加，但 Agent 随后无法上线，并显示或记录：

```text
Auth failed: restricted: not a relay member
```

本次现场中受影响的两个 Agent 是：

- `Strategic Advisor`（pubkey 前缀 `ddf192`）
- `Creative Product Manager`（pubkey 前缀 `96824d`）

两者拥有 Managed Agent 本地记录和 owner 签发的 NIP-OA auth tag，也已尝试连接 `wss://achoverse.xyz`，但当前社区的 `relay_members` 中没有对应 pubkey。Relay 开启了 `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true`，同时未开启 `BUZZ_ALLOW_NIP_OA_AUTH`，因此登录阶段按预期拒绝了它们。

## 2. 期望的产品行为

当有权限的社区 owner/admin 把 Managed Agent 添加到频道时，Desktop 应保证以下顺序：

1. 创建或复用 Agent 身份；
2. 在需要 Relay membership 的社区中，确保 Agent 是 Relay member；
3. 把 Agent 加入目标频道并赋予 `bot` 或用户选择的频道角色；
4. 在以上准入写入成功后启动 Agent；
5. 任一步骤失败时返回准确错误，不把 Agent 展示成已经成功上线。

开放 Relay 不需要额外创建 Relay member，也不应发送 NIP-43 管理事件。重复添加已有 Relay member 必须保持幂等，不改变其现有角色。

## 3. 根因

`desktop/src/features/agents/channelAgents.ts` 的 `attachManagedAgentToChannel()` 当前只调用 `addChannelMembers()`，随后直接启动 Agent，没有确保该 Agent 已存在于 Relay 的 NIP-43 成员名单。

这与同文件批量创建逻辑中的注释不一致：注释说明每个 Agent 的 Relay membership 会在处理下一个 Agent 前完成，但实际代码只完成了频道 membership。

Relay 端的行为本身正确：关闭 Relay membership fallback 时，未出现在当前 community `relay_members` 表中的 pubkey 必须在 NIP-42 认证阶段被拒绝。因此不应放宽 Relay 的默认安全策略来掩盖客户端漏写。

## 4. 技术方案

### 4.1 Relay membership helper

在 `desktop/src/shared/api/relayMembers.ts` 增加面向 Managed Agent 挂载流程的 helper：

- 首先通过现有 `relay_requires_membership` IPC 判断当前 Relay 是否启用 membership；
- 开放 Relay 直接返回，不发送管理事件；
- 受限 Relay 查询现有 NIP-43 snapshot；
- 目标 pubkey 已存在时直接返回，保持原角色不变；
- 目标 pubkey 不存在时发布 kind `9030`，角色固定为 `member`；
- 保留 Relay 返回的未授权、连接失败和拒绝原因，让调用方展示真实错误。

这里复用已有的 Nostr event 写入路径，不新增 HTTP API，也不直接写数据库，符合 Relay 作为事实来源的项目规范。

### 4.2 Agent 挂载顺序

在 `attachManagedAgentToChannel()` 中，把 Relay membership ensure 放在 `addChannelMembers()` 和 `startManagedAgent()` 之前。

这样可以保证：

- 新 Agent 第一次连接时已经具备 Relay 访问权；
- 批量 Team 创建仍保持串行，避免 membership snapshot 的 replaceable-event/LWW 更新互相覆盖；
- 复用已有 Agent 时同样可以修复缺失的 Relay membership；
- Relay membership 写入失败时不会继续制造“频道里可见但永远无法登录”的半成功状态。

### 4.3 失败与一致性

Relay membership 和频道 membership 是两个独立的 Nostr 管理动作，当前没有跨事件事务。如果 Relay member 添加成功、频道添加失败，Agent 会暂时保留普通 Relay member 身份。此次修复不自动回滚，原因是：

- 删除 Relay member 是高风险权限操作；
- 该 pubkey 可能已被其他频道或并发流程使用；
- 自动补偿可能误删合法成员。

调用方应返回频道添加失败的真实原因，用户可以重试；重复 Relay member ensure 是幂等的。

## 5. 测试与验收

自动化测试至少覆盖：

- membership-required Relay：目标不是 Relay member 时，先发布 kind `9030`，再添加频道成员，最后启动 Agent；
- membership-required Relay：目标已是 Relay member 时不重复改变角色；
- open Relay：不发布 kind `9030`，维持原有频道挂载与启动流程；
- Relay membership 写入失败：不继续添加频道或启动 Agent，并向上返回错误；
- 批量创建两个 Agent：第二个 Agent 只在第一个 Agent 的 Relay membership 和频道 membership 完成后开始处理。

手工验收：

1. 使用 `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true`、`BUZZ_ALLOW_NIP_OA_AUTH=false` 启动本地 Relay；
2. 从 Team/频道流程连续创建两个新 Agent；
3. 确认两个 pubkey 都出现在 Community Members；
4. 确认两个 Agent 都能完成 NIP-42 登录并进入 running 状态；
5. 确认日志中不再出现 `restricted: not a relay member`；
6. 在开放 Relay 下重复创建，确认没有发送无效的 NIP-43 管理事件。

相关门禁：

```bash
. ./bin/activate-hermit
cd desktop && pnpm test
cd desktop && pnpm check
```

实现完成后再根据影响范围运行 `just ci`。

## 6. Todo List

每个 todo 只对应一个文件；代码实现必须在本方案获得确认后开始。

- [x] `desktop/src/shared/api/relayMembers.ts`：增加按 Relay 能力检查、查询并幂等确保 Managed Agent Relay membership 的 helper。
- [x] `desktop/src/features/agents/channelAgents.ts`：在频道 membership 和 Agent 启动前调用 Relay membership ensure，并修正批量串行流程注释。
- [x] `desktop/src/shared/api/relayMembers.test.mjs`：补充 restricted/open Relay、已有成员、写入失败等 helper 单元测试。
- [x] `desktop/src/features/agents/channelAgents.test.mjs`：通过依赖注入直接验证 Relay membership、频道 membership、启动顺序及失败短路。

## 7. 非目标

- 不修改 Relay 的 membership 默认值或降低认证门槛；
- 不默认启用 `BUZZ_ALLOW_NIP_OA_AUTH`；
- 不新增数据库迁移或 HTTP endpoint；
- 不自动清理历史 Agent、频道成员或 Relay member；
- 不在本次修复中处理本机已有的其他 Managed Agent 进程与历史记录。
