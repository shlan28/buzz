# Agent 执行身份识别修复方案

> 更新日期：2026-08-04
> 更新说明：已完成 Agent Owner 关系自动补齐、Execute 连接中断提示和回归测试；补充实际验证结果。

## 1. 用户遇到的问题

在负责人为 `Strategic Advisor` 的 Task 上点击 `Execute` 时：

1. 第一次提示 `timeout`；
2. 再次点击后提示 `task assignee is not an Agent`。

从用户视角看，这两个提示互相矛盾：Task 页面能够显示 Agent，Agent 也已经启动，但 Relay 又说负责人不是 Agent。

## 2. 已确认的实际原因

### 2.1 第一次超时

第一次操作附近，Relay 记录了 `3 missed pongs — closing connection`。Desktop 与 Relay 的 WebSocket 当时断开，执行请求没有成功写入数据库，也没有生成 Task Execution Request。

这属于连接层故障，不代表 Agent 拒绝执行。页面应该明确告诉用户连接已中断，可以在恢复连接后重试，而不是只显示缺少上下文的 `timeout`。

### 2.2 第二次无法识别 Agent

当前 Task 的负责人是：

```text
Strategic Advisor
ddf19229…ceeca
```

Desktop 本地托管 Agent 清单和运行进程都能识别它；Agent 启动日志也能通过签名授权识别 Owner 为当前用户。

但 Relay 数据库中的该身份虽然已有用户记录，`agent_owner_pubkey` 仍为空。因此 Relay 按现有持久身份规则把它当作普通人，严格的 Execute 权限检查随即拒绝请求。

### 2.3 为什么 Owner 没有保存

当前 Relay 在 Agent 不是直接成员、需要借助 Owner 权限加入时，会保存 Agent 与 Owner 的关系；但如果 Agent 本身已经是 Relay 直接成员，成员检查会提前成功，后续没有保存已经验证通过的 Owner 关系。

因此出现了两个事实来源不一致：

- Desktop 知道这是本地托管 Agent；
- Relay 只看到一个没有 Owner 的普通成员。

Task Execute 以 Relay 为最终权限来源，这个原则是正确的；需要修复的是 Relay 身份登记缺口，而不是让 Desktop 绕过 Relay。

## 3. 产品修复方案

### 3.1 Agent 每次认证都校准身份

只要 Agent 连接时携带有效、签名可验证的 Owner 授权，Relay 就自动确认并保存 Agent → Owner 关系，无论这个 Agent 是否已经是 Relay 直接成员。

修复后的用户体验：

```text
Agent 启动并连接 Relay
        │
        ▼
Relay 验证 Agent 自己的签名和 Owner 授权
        │
        ▼
自动补齐 Agent → Owner 身份关系
        │
        ▼
Task Execute 能稳定识别负责人是 Agent
```

这个修复不会根据 Agent 名称、在线状态或 Desktop 本地配置猜测身份。只有密码学验证通过的 Owner 授权可以建立关系。

### 3.2 保留首次登记结果

Agent Owner 关系继续遵守现有“首次有效登记后不可被另一位 Owner 覆盖”的规则：

- 数据库没有 Owner：补齐当前已验证 Owner；
- 已经是同一 Owner：视为成功，无需重复写入；
- 已经属于另一位 Owner：拒绝覆盖并记录安全日志。

这避免恶意连接或配置错误抢走 Agent 所属关系。

### 3.3 超时提示

Desktop 遇到执行请求超时或连接断开时，应提示：

```text
Relay connection was interrupted. Reconnect and try Execute again.
```

不自动重复提交 Execute。因为客户端在超时时未必能确定 Relay 是否已经接受请求，自动重试可能产生第二轮执行。用户重新点击时仍由 Relay 的唯一执行约束防止重复工作。

## 4. 技术方案

### 4.1 认证与成员资格分开处理

Relay 的 NIP-42 认证流程分别处理两个结论：

1. 该身份是否有权连接当前 community；
2. 有效 Owner 授权是否证明该身份是 Agent。

成员资格检查继续决定“能不能连接”，但不再决定“是否保存 Agent Owner 关系”。认证事件中只要存在有效 Owner 授权，就进入现有的 `materialize_nip_oa_owner` 安全写入流程。

### 4.2 数据不迁移、不手工修改

不新增表和 migration，也不直接执行一次性 SQL 修改现有用户。

现有 Agent 在下次认证时自动修复。这条路径可重复执行，并受现有首次登记规则保护。对于当前正在运行的 Agent，重启 Agent 或重新连接后即可触发补齐。

### 4.3 可观测性

日志需要区分：

- Owner 授权验证失败；
- Agent → Owner 关系首次补齐成功；
- 关系已存在且一致；
- 已存在另一位 Owner，拒绝覆盖；
- 数据库写入失败。

日志只记录 community、Agent pubkey 和 Owner pubkey，不记录完整授权材料或私钥。

## 5. 测试范围

至少覆盖以下场景：

1. Agent 不是直接成员，通过 Owner 获得连接权限，关系正常保存；
2. Agent 已经是直接成员，但携带有效 Owner 授权，关系仍然保存；
3. 开放 Relay 上携带有效 Owner 授权，关系正常保存；
4. 无效或缺失 Owner 授权不能把普通用户标记为 Agent；
5. 已属于 Owner A 的 Agent 不能被 Owner B 覆盖；
6. 自动补齐后，Task Execute 使用同一个持久化 Owner 关系识别该 Agent；
7. Desktop 把连接超时与“负责人不是 Agent”显示为不同错误。

## 6. Todo List

- [x] `crates/buzz-relay/src/handlers/auth.rs`：在 NIP-42 认证中把成员资格和 Agent Owner 证明分开处理，并在直接成员路径补齐已验证关系。
- [x] `crates/buzz-relay/src/api/mod.rs`：补充 Owner 关系首次写入、已存在、冲突与数据库失败的结构化日志。
- [x] `crates/buzz-test-client/tests/e2e_relay.rs`：增加直接成员携带有效 Owner 授权后自动补齐关系的回归测试。
- [x] `desktop/src/features/tasks/hooks.ts`：把 Relay 连接中断或请求超时转换为可恢复的 Execute 提示，不自动重复提交。
- [x] `desktop/src/testing/e2eBridge.ts`：让 Task execution mock 支持注入 Relay 拒绝或超时错误。
- [x] `desktop/tests/e2e/tasks.spec.ts`：覆盖连接超时提示与 Execute 按钮恢复可用。
- [x] `docs/2026-08-04-agent-owner-materialization-fix-plan.md`：更新 Todo 状态和验证结果。

## 7. 验收标准

1. `Strategic Advisor` 重新认证后，Relay 持久身份能够正确识别其 Owner。
2. 负责人是该 Agent 的 Task 可以通过严格 Execute 权限检查。
3. Agent 已是 Relay 直接成员时，也不会跳过 Owner 关系补齐。
4. 普通用户不会因为在线、名称或 Desktop 本地记录而被误判为 Agent。
5. Agent Owner 不能被另一身份覆盖。
6. 连接中断显示明确的可恢复提示，且不会自动创建重复执行。
7. 不新增数据库表，不手工篡改现有身份数据。

## 8. 实际验证结果

- Relay 认证单元测试：3 项通过。
- Relay 成员资格单元测试：3 项通过。
- 真实 Relay 回归：同一个“Agent 已是直接成员”用例在旧 Relay 上失败，在修复后通过，数据库成功保存 Agent Owner。
- Desktop Task E2E：Agent 在线执行、Agent 离线拦截、Relay 超时提示共 3 项通过。
- `cargo check -p buzz-relay -p buzz-test-client` 通过。
- Desktop E2E build 和相关 Biome 检查通过。
- 当前 Relay 和 Desktop 已使用修复后代码重启。Agent 需要启动或重新连接后，才会触发现有身份的自动补齐。
