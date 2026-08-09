# 多电脑 Agent 身份与上下文同步方案

> 更新日期：2026-08-07
> 更新说明：首次形成方案，明确同一 User Key 下 Agent 配置、Agent 私钥与可移植上下文的多端同步边界，并补充单机运行权、冲突处理、安全模型、迁移路径和分阶段 Todo。

## 一、需求与成功标准

### 1.1 用户需求

同一个用户使用同一份 User Key 登录多台 Mac 时：

1. Agent 配置自动同步；
2. 同一个 Agent 在所有电脑上拥有同一个 Agent Pubkey；
3. Agent 日志、大模型 API Key、Codex/Hermes 等 runtime 可以分别保存在每台电脑；
4. Agent 的会话上下文保存在可多端同步的位置；
5. 用户从电脑 A 切换到电脑 B 后，Agent 能理解之前的对话、目标、决策和未完成事项；
6. 两台电脑不会因为同时启动同一个 Agent 而重复回复或重复执行 Task。

### 1.2 验收标准

- 新电脑输入或配对得到同一个 User Key 后，能够看到该用户拥有的 Agent 列表；
- 选择启用某个 Agent 后，新电脑从加密身份包恢复 Agent 私钥，计算出的 Pubkey 必须与 Relay 上登记的 Agent Pubkey 完全一致；
- Agent 名称、Persona、模型选择、回复范围、并发等非敏感配置能够跨电脑保持一致；
- 新电脑没有模型 Key 或 runtime 时，Agent 显示为“身份已同步，运行环境未就绪”，而不是生成另一个 Agent；
- 新电脑配置好本地 runtime 后，可以接管同一个 Agent；
- 接管后新 runtime 创建新的原生 session，但会注入最新的 Buzz 标准化上下文检查点；
- 正常情况下，同一 Agent 同一时刻只有一台设备拥有执行权；
- Relay、数据库日志和普通客户端事件中不得出现明文 User 私钥、Agent 私钥或模型 API Key。

## 二、产品方案

### 2.1 用户看到的 Agent 分为四层

| 层级 | 示例 | 保存位置 | 是否多端同步 |
|---|---|---|---|
| Agent 身份 | Agent Pubkey、加密后的 Agent 私钥包 | Relay | 是 |
| Agent 配置 | 名称、Persona、System Prompt、模型偏好、回复范围 | Relay | 是 |
| Agent 上下文 | 摘要、目标、决策、Todo、对话游标、长期记忆 | Relay | 是 |
| 本机运行环境 | API Key、Codex/Hermes 安装、工作目录、日志、原生 session | Mac 本地 | 否 |

产品上必须把“Agent 存在”和“Agent 可以在本机运行”分开：

- **已同步**：身份和配置已经存在；
- **待配置**：本机缺少模型 Key、runtime 或工作目录；
- **待接管**：Agent 正在另一台设备运行；
- **运行中**：本机持有有效运行租约；
- **只读恢复**：可以查看同步数据，但因密钥包损坏或无权解密而不能运行。

### 2.2 新电脑首次登录流程

1. 用户使用相同 User Key 登录，或通过旧设备扫码配对；
2. Desktop 从 Relay 拉取 User 自己签名的 Persona、Team、Managed Agent 和加密 Agent 身份包；
3. Desktop 使用 User Key 在本机解密 Agent 身份包；
4. 对每个 Agent 执行 `由私钥计算 Pubkey == Relay 记录 Pubkey` 校验；
5. 校验成功后，把 Agent 私钥写入本机系统 Keychain；
6. 拉取 Agent 配置与最新上下文检查点；
7. 检查本机 runtime、API Key、工作目录是否就绪；
8. 未就绪则保留 Agent 身份并展示配置引导，不创建新的 Agent Pubkey；
9. 就绪后，用户点击“在这台电脑运行”，申请运行租约并启动 Agent。

### 2.3 Agent 配置同步

继续以现有 `kind:30175` Persona、`kind:30176` Team、`kind:30177` Managed Agent 为基础，但调整新设备恢复语义：

- `kind:30177` 仍然只携带经过白名单允许的非敏感配置；
- 新电脑收到一个本地不存在的 Managed Agent 时，先创建“不可运行的同步占位记录”；
- 只有成功解密身份包并通过 Pubkey 校验后，占位记录才能转为可运行 Agent；
- API Key、环境变量、provider 私密配置、进程 PID、本地命令和日志不进入 `kind:30177`；
- 配置采用参数化可替换事件的最新版本，编辑后由 User Key 签名；
- 同时编辑时使用 `previous`/版本号做乐观冲突检测，不静默覆盖另一台电脑的新配置。

### 2.4 保证 Agent Pubkey 一致

新增“Agent 身份包”。身份包由 User 签名，按 Agent Pubkey 定位，内容只保存端到端加密密文。

身份包解密后至少包含：

```json
{
  "version": 1,
  "agentPubkey": "<hex>",
  "agentNsec": "<nsec>",
  "createdAt": "<UTC>",
  "rotatedAt": null
}
```

加密约束：

- 优先复用项目已经使用和审计过的 NIP-44 能力，不自创密码算法；
- 密文只允许同一 User Key 解密，Relay 不能获得 Agent 私钥；
- 事件作者必须是 Agent 所属 User，Relay 对该类事件实行 author-only 读取；
- Desktop 解密后必须重新计算 Agent Pubkey并进行恒等校验；
- 校验失败立即拒绝写入 Keychain，并显示可恢复错误；
- 内存中的私钥字符串使用可清零容器，落地只进入 Keychain；
- 支持 Agent 密钥轮换，旧身份包被新版本替换，不允许旧设备用过期密钥重新发布。

这里的安全含义是：任何持有完整 User Key 的设备，本来就能代表该 User；本方案进一步允许它恢复该 User 托管的 Agent 身份。Relay 只承担密文保存和同步，不成为私钥托管方。

### 2.5 本地保留的数据

以下内容默认不跨电脑同步：

- OpenAI、Anthropic 等大模型 API Key；
- Codex、Hermes、Goose 的登录状态和 token；
- runtime 二进制和安装路径；
- Agent 工作目录、Git checkout 和未提交文件；
- 进程 PID、启动参数探测结果和机器性能信息；
- 原始运行日志、stdout、stderr、tool trace；
- Codex/Hermes/Goose 返回的原生 sessionId。

同一个 Agent 可以在不同电脑使用不同 Provider 或不同本地 runtime，但产品要明确展示“身份相同，执行环境不同”。如果本机配置覆盖了同步的模型偏好，应显示本地覆盖标识。

## 三、上下文同步方案

### 3.1 为什么不能只同步 runtime sessionId

当前 ACP 的 sessionId 是 runtime 进程生成的本地句柄，并由 `buzz-acp` 在内存中按频道维护。它可能指向某台电脑上的 Codex/Hermes 进程、本地文件系统和工具状态：

- 新电脑上的 runtime 不一定认识旧 sessionId；
- 不同 runtime 的 session 格式不兼容；
- session 可能引用旧电脑上的工作目录和临时文件；
- 进程重启后 session 也可能已经失效。

所以“上下文同步”不能定义为复制 sessionId，而应定义为：**Buzz 保存一份与 runtime 无关、可验证、可恢复的 Agent 上下文；每个 runtime 用它创建或恢复自己的本地 session。**

### 3.2 两类上下文来源

#### A. Relay 已有的事实历史

- 频道消息、Thread、DM；
- Task、Track 和执行状态；
- Agent 发出的回复；
- Agent Engram、Canvas 等已有持久事件。

这些是可追溯的原始事实。新设备仍可按需从 Relay 拉取，不能仅依赖摘要替代。

#### B. 新增的 Agent 上下文检查点

每个 Agent 按“会话作用域”保存紧凑检查点：

```json
{
  "schemaVersion": 1,
  "agentPubkey": "<hex>",
  "scope": { "type": "channel", "id": "<uuid>" },
  "revision": 18,
  "previousEventId": "<event-id>",
  "sourceCursor": {
    "lastMessageEventId": "<event-id>",
    "lastMessageCreatedAt": 1786000000
  },
  "summary": "当前对话的压缩摘要",
  "goals": ["当前目标"],
  "decisions": ["已确认的决定"],
  "openItems": ["未完成事项"],
  "constraints": ["用户要求和边界"],
  "artifactRefs": ["可从 Relay 或仓库重新读取的引用"],
  "workingState": {
    "taskIds": [],
    "trackIds": [],
    "lastKnownWorkspace": null
  },
  "updatedAt": "<UTC>",
  "writerDeviceId": "<device-id>"
}
```

检查点不保存完整推理过程，不默认保存全部工具输出，也不保存 API Key。它保存的是下一次继续工作真正需要的可移植状态。

### 3.3 上下文作用域

第一阶段支持：

- `channel:<uuid>`：普通频道的 Agent 工作上下文；
- `thread:<root-event-id>`：独立 Thread 的任务上下文；
- `dm:<conversation-id>`：User 与 Agent 的线性私信上下文；
- `agent:core`：Agent 的稳定身份、长期目标和经用户确认的长期记忆。

不要把所有频道压成一个无限增长的“大脑”。不同作用域分别读取、分别压缩、分别替换，避免隐私串线和上下文污染。

### 3.4 上下文写入时机

- 每轮成功回复后异步生成增量检查点；
- Task 状态改变、用户确认关键决策或产生重要 artifact 后立即更新；
- runtime 正常停止、设备交接或上下文压缩前强制刷新；
- 每次更新带 `revision + previousEventId`，Relay 拒绝基于旧版本的覆盖；
- 写入失败不把主回复伪装成“上下文已同步”，Desktop 显示待同步状态并重试；
- 相同输入重复写入必须幂等，避免断线重试产生多个逻辑版本。

### 3.5 新电脑恢复一轮会话

新 runtime 启动时按以下顺序构造首轮上下文：

1. Buzz Base Prompt 与 Persona；
2. `agent:core` 长期检查点；
3. 当前 channel/thread/DM 的最新检查点；
4. 从检查点游标之后拉取的 Relay 新消息；
5. 与当前请求关联的 Task、Track 和 artifact；
6. 当前电脑的本地 runtime、工作目录和权限说明；
7. 本轮用户消息。

旧电脑原生 session 不可用时，新电脑创建新 session。对用户而言语义连续，但技术上是“从标准化检查点恢复的新 runtime session”。

### 3.6 大小与保留策略

- Relay 当前事件 content 上限为 256 KB，但上下文检查点目标应控制在 64 KB 内；
- 超过阈值时先压缩摘要，较大的 artifact 只保存引用，不塞进检查点；
- 参数化可替换事件保存每个作用域的当前头，历史版本可按审计需求保留有限窗口；
- `agent:core` 与 DM 检查点必须加密；其他作用域第一版也建议统一加密，避免内部目标、摘要和文件引用被社区成员读取；
- 日志继续本地保存，不把日志当上下文数据库使用。

## 四、运行权与多设备冲突

### 4.1 为什么必须有运行租约

同一 Agent 私钥同时存在于两台电脑后，两台电脑都能以相同 Pubkey 签名。如果都订阅并执行：

- 一条消息可能回复两次；
- 一个 Task 可能执行两遍；
- 两台电脑会写出相互竞争的上下文检查点；
- 两个 runtime 的本地文件和原生 session 会分叉。

因此身份同步和上下文同步必须与运行租约一起上线。

### 4.2 租约模型

- 每台安装生成独立 `deviceId` 和设备密钥；
- Agent 启动前向 Relay 发布短期租约，包含 Agent Pubkey、deviceId、过期时间和启动 nonce；
- Relay 对每个 Agent 只接受一个有效租约头；
- 当前设备定期续租，退出时主动释放；
- 设备失联后租约自动过期，其他设备可以接管；
- “在这台电脑运行”默认是温和接管：通知旧设备停止、刷新上下文、释放租约；
- 强制接管必须二次确认，并明确可能丢失旧设备尚未同步的最后一轮本地状态；
- Task 执行请求处理前再次校验租约，不能只在进程启动时校验一次。

### 4.3 多端编辑冲突

- Agent 配置：LWW 之外增加 `previous` 冲突校验，冲突时让用户选择保留哪一版；
- Agent 身份包：只允许单调递增版本，密钥轮换优先级高于普通配置；
- 上下文检查点：只有持有有效运行租约的设备可以写当前作用域；
- 非运行设备可以读取上下文，但不能用旧检查点覆盖新检查点；
- User 主动编辑 `agent:core` 时作为显式人工变更，优先于 Agent 自动摘要，并进入下一轮恢复上下文。

## 五、安全与权限模型

### 5.1 Relay 必须强制的边界

- Agent 身份包、上下文检查点和设备记录只允许事件作者本人读取；
- 写入者必须是 User Key，或持有经过 User 授权且未撤销的设备能力；
- 每个事件必须绑定 community，不能跨 Relay host 读取；
- Relay 验证 Agent Pubkey、owner、事件 d-tag 和签名的一致性；
- 身份密文、上下文密文不进入搜索索引；
- 结构化日志只能记录 event ID、kind、owner、大小、版本和结果，不能记录解密内容；
- 删除 User 或删除 Agent 时，需要同时删除/吊销身份包、上下文头和租约。

### 5.2 设备撤销

- “设备管理”显示设备名称、最后在线时间、是否正在运行 Agent；
- 撤销设备后，该设备不能再续租或写上下文；
- 由于同一 User Key 已复制到该设备，单纯撤销设备不能消除 User Key 泄露风险；
- 如果设备丢失且 User Key 可能泄露，必须轮换 User 身份或执行更高级的密钥恢复流程；
- 产品文案不能把“撤销设备”错误描述为“让已泄露的 nsec 失效”。

## 六、事件与数据模型建议

遵循 Buzz “优先使用 Nostr Event”的规范。具体 kind 数值在实施前统一检查 `crates/buzz-core/src/kind.rs` 的占用情况，不在方案阶段提前锁死编号。

建议新增三类参数化可替换事件：

| 事件 | 作者 | d-tag | 内容 | 读取权限 |
|---|---|---|---|---|
| Agent Identity Envelope | User | Agent Pubkey | NIP-44 加密身份包 | 仅作者 |
| Agent Context Checkpoint | User/受权设备 | `Agent Pubkey + scope` | 加密标准化检查点 | 仅作者 |
| Agent Runtime Lease | Agent 或受权设备 | Agent Pubkey | deviceId、nonce、expiresAt | owner 与该 Agent；短期 |

还需要设备记录，用于展示和撤销。如果复用 NIP-AB 配对，则配对只负责安全引入设备；长期设备授权仍应使用独立、可撤销的设备记录，不能把一次性配对 session 当长期凭证。

## 七、与现有实现的差距

### 7.1 已有能力

- Desktop 已能通过 NIP-AB 把 User 的 relay URL、pubkey 和 nsec 配对给 Mobile；
- Persona、Team 和 Managed Agent 的公开投影已有 Relay 同步事件；
- Agent 私钥已优先保存在系统 Keychain；
- Relay 已保存频道、Thread、DM、Task 和 Track 等事实历史；
- `buzz-acp` 已能在每轮前抓取有限的 Thread/DM 历史并注入 prompt；
- 项目已有参数化可替换事件、author-only 读取和 LWW/冲突处理模式可复用。

### 7.2 当前缺口

- `kind:30177` 在新电脑找不到同 Pubkey 本地记录时会直接忽略，不能形成待恢复 Agent；
- Agent 私钥没有 Relay 端到端加密身份包；
- ACP session 映射只在进程内存中，没有可移植检查点；
- 没有 Agent 单写者运行租约；
- 没有设备管理、身份恢复状态和上下文同步状态 UI；
- 没有 Agent 密钥轮换、身份包版本回退防护和跨设备冲突测试。

## 八、实施阶段

### Phase 1：身份一致与配置可见

- 定义 Agent 身份包事件和 author-only 安全规则；
- 旧设备为现有 Agent 生成加密身份包；
- 新设备创建不可运行占位记录，解密校验后写入 Keychain；
- UI 展示“身份已同步/本机待配置”；
- 暂不自动启动，降低同 Agent 双运行风险。

### Phase 2：运行租约与安全接管

- 引入 deviceId、运行租约、续租、释放和过期接管；
- Agent 启动、消息消费和 Task 执行都校验租约；
- 增加设备管理和“在这台电脑运行”流程。

### Phase 3：标准化上下文检查点

- 定义检查点 schema、加密事件和版本冲突；
- 每轮成功后异步更新；
- 新 session 恢复时合并 core、scope checkpoint、Relay 增量消息和 Task/Track；
- UI 展示最后同步时间、待同步和冲突状态。

### Phase 4：质量与高级恢复

- 增加 Agent 密钥轮换、设备撤销、强制接管和恢复工具；
- 评估支持 runtime-specific session export/import 的适配器扩展；
- 增加容量监控、检查点压缩质量评估和故障演练。

## 九、测试与验收矩阵

| 场景 | 预期结果 |
|---|---|
| 同一 User Key 登录新 Mac | 看见相同 Agent，不生成新 Pubkey |
| 身份包解密成功 | 写入 Keychain，计算 Pubkey 与记录一致 |
| 身份包被篡改 | 解密或 Pubkey 校验失败，不创建可运行 Agent |
| 新 Mac 缺少 Codex/Hermes | Agent 保持待配置，不改变身份 |
| 两台 Mac 同时点击运行 | 只有租约获得者启动，另一台显示运行位置 |
| 运行设备正常交接 | 先刷新检查点，再由新设备接管 |
| 运行设备突然离线 | 租约过期后允许接管，并提示最后检查点时间 |
| 新设备继续 Thread | 新 session 获得检查点与游标后的新消息 |
| 两端同时编辑配置 | 检测冲突，不静默覆盖 |
| Relay 数据库泄露 | 攻击者只能得到 Agent 私钥和上下文的密文 |
| community 切换 | 清空旧 community 的身份/上下文缓存和订阅 |
| 删除 Agent | 身份包、上下文、租约均被删除或吊销 |

## 十、关键取舍与建议

1. **目标是语义连续，不承诺原生 session 原样漫游。** 标准化上下文可跨 Codex、Hermes 和未来 runtime；原生 session 迁移只能作为适配器增强。
2. **Agent 私钥可以经 Relay 同步，但 Relay 只能保存密文。** 直接把 nsec 放进 `kind:30177` 会破坏当前安全边界。
3. **运行租约不是后续优化，而是身份同步的上线前置条件。** 没有租约，同 Pubkey 多端运行会造成真实的重复执行风险。
4. **上下文检查点不等于日志。** 日志适合排障，检查点适合恢复；把全部日志同步会带来隐私、成本和上下文噪音。
5. **先完成身份与接管，再做上下文。** 否则上下文虽然同步了，执行主体仍可能不是同一个 Agent，或者出现双写分叉。

## 十一、代码规范检查

已优先检查：

- `wiki/index.md`；
- `wiki/code-spec.md`；
- `/Users/lu/achoverse-backend/docs/backend-code-reference.md`；
- `/Users/lu/achoverse-3d-web/docs/frontend-code-spec.md`。

方案遵循以下规则：Relay 是事实来源；新增能力优先建模为 Nostr Event；身份与 community 边界必须 fail closed；敏感字段使用显式白名单与端到端加密；Desktop 业务逻辑不堆入页面组件；新增 community-scoped 缓存必须接入 reset；用户可见错误提供恢复路径；实现后分别执行 Rust、Desktop、Tauri 与相关集成测试。

## 十二、实施 Todo List

> 以下是方案级文件清单，每个 Todo 只对应一个文件。具体路径会在进入实施前结合现有模块规模再次确认；未经确认不修改代码。

### Phase 1：Agent 身份包

- [ ] `crates/buzz-core/src/kind.rs`：登记 Agent 身份包、上下文检查点和运行租约事件 kind，并加入范围断言。
- [ ] `crates/buzz-core/src/agent_identity.rs`：定义身份包明文、密文信封、版本和校验类型。
- [ ] `crates/buzz-relay/src/handlers/ingest.rs`：增加新事件的作者、d-tag、大小、版本与密文结构校验。
- [ ] `crates/buzz-relay/src/subscription.rs`：为身份包与上下文事件增加 author-only 读取和 fan-out 限制。
- [ ] `desktop/src-tauri/src/managed_agents/identity_envelope.rs`：生成、加密、解密、清零并校验 Agent 身份包。
- [ ] `desktop/src-tauri/src/managed_agents/storage.rs`：把恢复后的 Agent 私钥写入 Keychain，并支持同步占位记录转为可运行记录。
- [ ] `desktop/src-tauri/src/commands/personas/inbound.rs`：新电脑收到未知 Managed Agent 时创建不可运行占位记录，不再静默忽略。
- [ ] `desktop/src/features/agents/types.ts`：定义身份同步、本机就绪和恢复错误状态类型。
- [ ] `desktop/src/features/agents/AgentDetail.tsx`：展示相同 Pubkey、身份同步状态和本机 runtime 配置引导。

### Phase 2：设备与运行租约

- [ ] `crates/buzz-core/src/agent_lease.rs`：定义设备标识、运行租约、nonce 和过期语义。
- [ ] `crates/buzz-relay/src/handlers/agent_lease.rs`：实现单 Agent 单有效租约、续租、释放和过期接管。
- [ ] `crates/buzz-relay/src/handlers/mod.rs`：注册 Agent 租约处理器。
- [ ] `desktop/src-tauri/src/managed_agents/lease.rs`：在启动、续租、停止和接管时管理租约。
- [ ] `desktop/src-tauri/src/managed_agents/process.rs`：把有效租约作为 Agent 进程启动前置条件。
- [ ] `crates/buzz-acp/src/lib.rs`：在消息消费和 Task 执行前校验运行权，失去租约时停止接收新工作。
- [ ] `desktop/src/features/agents/AgentRuntimeLocation.tsx`：展示当前运行设备、待接管和强制接管状态。
- [ ] `desktop/src/features/settings/DeviceManagement.tsx`：展示设备列表、最后在线时间和撤销入口。

### Phase 3：上下文检查点

- [ ] `crates/buzz-core/src/agent_context.rs`：定义版本化的标准化 Agent 上下文检查点 schema。
- [ ] `crates/buzz-acp/src/context_checkpoint.rs`：构建、压缩、加密和提交检查点。
- [ ] `crates/buzz-acp/src/pool.rs`：新 session 创建时读取检查点并与本地 SessionState 生命周期衔接。
- [ ] `crates/buzz-acp/src/queue.rs`：按 core、scope、Relay 增量和当前请求的顺序格式化恢复上下文。
- [ ] `crates/buzz-acp/src/relay.rs`：查询和发布指定 Agent、作用域与版本的检查点事件。
- [ ] `desktop/src-tauri/src/managed_agents/context_sync.rs`：暴露同步状态、最后成功时间、重试和冲突信息。
- [ ] `desktop/src/features/agents/AgentContextSyncStatus.tsx`：展示上下文同步、待上传、冲突和恢复状态。

### Phase 4：测试与文档

- [ ] `crates/buzz-core/src/kind_tests.rs`：覆盖新 kind 的分类、替换语义和范围断言。
- [ ] `crates/buzz-test-client/tests/e2e_agent_identity_sync.rs`：覆盖身份包权限、篡改、跨用户和 community 隔离。
- [ ] `crates/buzz-test-client/tests/e2e_agent_lease.rs`：覆盖竞争租约、续租、断线过期和强制接管。
- [ ] `crates/buzz-test-client/tests/e2e_agent_context_sync.rs`：覆盖检查点版本、冲突、恢复和密文不可读。
- [ ] `desktop/tests/e2e/agent-multi-device-sync.spec.ts`：覆盖待配置、运行位置、接管和同步错误 UI。
- [ ] `wiki/agents.md`：补充多设备 Agent 身份、运行权和上下文模型。
- [ ] `wiki/flows.md`：补充新设备恢复、接管和会话续接流程。
- [ ] `wiki/architecture.md`：补充加密身份包与上下文检查点的数据边界。

