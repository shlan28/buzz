> 更新日期：2026-08-15
> 更新说明：根据“托管 Agent 必须由 Desktop 启动”的已确认产品边界，将本方案降级为长期设备身份路线；当前交付改为 Desktop Keychain 持久化 Remote Signer 授权，聚焦 Web 免重复 Pair。

# Web 可撤销设备身份长期方案

> **状态：长期路线，当前不实施。** 当前实施方案见 [`2026-08-08-web-signer-durable-connection-fix.md`](2026-08-08-web-signer-durable-connection-fix.md)。本文保留设备 principal、最小权限、撤销和审计设计，供未来 Web 真正脱离 Desktop 或扩展多设备安全模型时使用。

## 一、产品结论

Web 的当前产品目标是“一次 Pair，后续打开自动恢复”，而不是“脱离 Desktop 后仍能完整使用 Agent”。

已确认的边界：

- Relay 只负责验证、存储与转发事件，不运行 Agent；
- 托管 Agent 由 Desktop 启动和管理，Desktop 退出后 Agent 也会离线；
- Mobile 和 Web 可在 Agent 离线时向 Relay 发送消息，但不会有 Agent 回复；
- Web 不应把“Desktop/Agent 离线”误报为“需要重新 Pair”。

因此，本文描述的可撤销 Web 设备身份仍是合理的长期安全架构，但它不再是解决“每次打开 Web 都要重新 Pair”的最小方案。当前先持久化 Desktop Remote Signer 授权，避免在 Agent 仍依赖 Desktop 时过早扩大 Relay/Auth/DB 的身份改造面。

本长期路线的目标体验仍为：

目标体验：

```text
首次 Pair
  -> Desktop 必须在线，用户核对 SAS
  -> Web 生成自己的设备密钥
  -> Desktop 用用户主身份授权该设备
  -> Relay 记录可撤销、可过期、带权限范围的设备授权

后续使用（长期路线能力）
  -> Web 使用设备私钥直接连接 Relay
  -> Desktop 可以退出，Web 仍可读写 Relay
  -> 但托管 Agent 会离线，Agent 对话不会产生回复
  -> Web 刷新、关闭标签页、Mac 重启均不需要重新 Pair

撤销
  -> 用户从 Desktop 或未来的 Mobile 设备管理页撤销设备
  -> Relay 立即拒绝该设备的新请求并断开现有连接
  -> 用户主身份和其他设备不受影响
```

Web 只保存设备私钥，不保存用户主 `nsec`。设备泄露时，攻击者只能获得该设备被授予的权限；用户可以撤销设备，而不需要轮换主身份。

## 二、为什么不直接照搬 Mobile 的 `nsec`

原生 Mobile 当前在 Pair payload 中接收用户 `nsec`，并保存到 iOS Keychain / Android Keystore，因此可以独立签名。Web 的 IndexedDB 不等价于系统安全存储：同源脚本、XSS 或供应链代码一旦被攻破，就可能读取或调用其中的密钥。

直接把主 `nsec` 给 Web 会造成：

- 一个浏览器站点漏洞升级为整个 Nostr 主身份泄露；
- 无法只撤销一台浏览器，只能轮换用户主密钥；
- Web 获得超出产品需要的完整签名能力；
- 站点数据备份、浏览器同步和调试工具可能扩大密钥暴露面。

本方案接受“浏览器设备密钥可能被站点上下文调用”的现实，但通过独立密钥、最小权限、有效期和即时撤销限制损失半径。

## 三、协议选择与现有能力边界

### 3.1 不直接采用 NIP-26

标准 NIP-26 描述了 delegated event signing，但当前官方文档将其标记为 `draft`、`unrecommended`。它只原生表达 kind 与时间条件，不能满足 Buzz 的 community 隔离、设备列表、权限范围、即时撤销、强制断连和审计要求。

因此本方案不直接发送 NIP-26 `delegation` tag，也不要求通用 Nostr Relay 认可 Buzz 设备身份。

### 3.2 不复用 NIP-OA

Buzz 现有 NIP-OA 用于 Agent：Agent 以自己的 pubkey 行动，Owner attestation 证明 Agent 归属，并把 `users.agent_owner_pubkey` 物化为 Agent 分类。

Web 设备不是 Agent。直接复用 NIP-OA 会导致：

- Web 设备被计入 Agent 用户和用量；
- Agent owner 权限与人类设备权限混淆；
- Timeline、Calendar、Moderation 和任务授权出现错误分支；
- NIP-OA 的 kind/time conditions 无法表达 Web 产品权限。

本方案新增独立的 device principal，不写入 `agent_owner_pubkey`，也不改变 NIP-OA 语义。

### 3.3 继续使用现有 Nostr 通道

- 首次设备建立仍使用 NIP-AB `/pair` 与 SAS；
- WebSocket 登录仍使用 NIP-42 kind `22242`；
- HTTP `/query`、`/events`、`/count` 仍使用 NIP-98 kind `27235`；
- 业务写入仍是 Nostr event，不新增面向单项业务的 JSON API；
- Relay 仍由 host 确定 community，设备 payload 不能覆盖 community 边界。

## 四、身份模型

每次 Web Pair 产生三个不同概念：

| 概念 | 含义 | 是否拥有用户主权限 |
| --- | --- | --- |
| Owner pubkey | 用户在 Desktop/Mobile 中的主身份 | 是 |
| Device pubkey | 当前浏览器本地生成的设备身份 | 否 |
| Device authorization | Owner 对 device、community、scope、有效期的授权 | 仅授权范围内 |

Relay 的认证上下文新增两层主体：

```text
raw signer      = device pubkey
effective actor = owner pubkey
principal type  = web_device
```

规则：

- Schnorr 签名始终由 device pubkey 验证，不能把设备 event 伪装成由 owner 私钥签名；
- membership、频道权限和“自己的数据”按 effective actor 判断；
- 审计、封禁设备、速率限制和安全调查必须保留 raw signer；
- UI 可以把经过 Relay 验证的设备 event 展示为 owner，但 Moderation 必须能看到原始 signer；
- Agent 仍使用 `agent_owner_pubkey`，Web 设备使用独立映射，两个身份类别互斥。

## 五、设备授权事件

### 5.1 新 event kind

建议新增参数化可替换事件：

```text
KIND_WEB_DEVICE_AUTHORIZATION = 30079
```

实施前必须再次扫描 `buzz-core/src/kind.rs` 和协议文档确认编号无冲突。事件由 Owner 签名，按 `(owner_pubkey, kind, d=device_pubkey)` 保留最新版本。

建议 tags：

```json
[
  ["d", "<device-pubkey>"],
  ["p", "<device-pubkey>"],
  ["client", "buzz-web"],
  ["status", "active"],
  ["expires", "<unix-seconds>"]
]
```

建议 content：

```json
{
  "version": 1,
  "name": "Safari on iPad",
  "scopes": [
    "workspace:read",
    "messages:write",
    "tasks:write",
    "tracks:write",
    "calendar:write",
    "media:write"
  ]
}
```

撤销由 Owner 发布相同 `d` 的新版本：

```json
{
  "version": 1,
  "name": "Safari on iPad",
  "scopes": [],
  "reason": "user_revoked"
}
```

并使用 `status=revoked`。Relay 以最新版为准；旧 active event 不能在重放后重新激活设备。

### 5.2 Device proof tag

设备在 NIP-42 AUTH、NIP-98 HTTP auth 和设备签署的业务 event 中携带：

```json
["device-auth", "<owner-pubkey>", "<authorization-event-id>"]
```

Relay 必须验证：

1. 外层 event 的 Schnorr 签名属于 device pubkey；
2. 授权 event 存在、签名有效且作者是 owner；
3. 授权 event 的 `d` / `p` 精确匹配 device pubkey；
4. 授权属于当前 host-derived community；
5. 最新状态为 active，且没有过期；
6. 请求所需 scope 在授权范围内；
7. device 与 owner 均未被封禁；
8. device authorization 没有被更高版本替换或撤销。

普通客户端伪造 `device-auth` tag 不能改变显示作者或权限；只有 Relay 完成上述验证后才设置 effective actor。

## 六、Relay 持久化与授权

### 6.1 数据模型

新增 community-scoped `web_device_authorizations` 表：

```text
community_id
device_pubkey
owner_pubkey
authorization_event_id
authorization_created_at
name
scopes
expires_at
revoked_at
revoked_by
created_at
updated_at
```

约束：

- 主键为 `(community_id, device_pubkey)`；
- owner 必须是当前 community 的 relay member；
- 一个 device pubkey 只能绑定一个 owner，禁止换绑；需要换账号时生成新设备密钥；
- LWW 同时比较 Nostr `created_at` 和 event id，避免同秒冲突；
- 撤销记录保留，用于历史作者解析和审计，不做硬删除；
- scope 使用受控枚举，不接受任意字符串扩大权限。

### 6.2 membership 与认证

设备本身不加入 `relay_members`。NIP-42/NIP-98 验证成功后：

```text
device active authorization
  -> 查 owner relay membership
  -> 构造 AuthContext {
       pubkey: device,
       effective_pubkey: owner,
       principal_type: WebDevice,
       device_scopes: ...
     }
```

这样设备被撤销时不会留下独立 membership，也不会污染成员列表。

### 6.3 权限映射

所有 scope 到行为的映射必须集中在授权模块，不散落在 Web UI：

| Scope | 允许 | 明确不允许 |
| --- | --- | --- |
| `workspace:read` | Channels、消息、Inbox、Tasks、Tracks、Calendar、Search 的当前 owner 可见数据 | Relay 管理、成员管理、设备管理写入 |
| `messages:write` | 普通频道消息、reply、reaction、edit/delete 自己的内容 | Moderation、代表其他成员写入 |
| `tasks:write` | 当前用户在 Web 已开放的任务操作 | Relay operator 与成员角色变更 |
| `tracks:write` | 当前用户在 Web 已开放的 Track 操作 | 管理员专属操作 |
| `calendar:write` | 当前 owner 私有 Calendar 操作 | 读取其他用户私有 Calendar |
| `media:write` | 经过 Blossom auth 的上传 | 任意 owner 替换、跨 community 媒体权限 |

第一版禁止设备执行：

- 创建、撤销或扩大其他设备授权；
- Relay membership、owner/admin 转移；
- 封禁、踢人等 Moderation；
- Agent 创建、密钥导出、团队 snapshot；
- 用户主 profile/identity key 轮换；
- 未经单独设计的 Git credential 和高权限 API token 操作。

### 6.4 读路径

设备的 `workspace:read` 不是“能读整个 Relay”。REQ、COUNT、HTTP `/query`、Search、Calendar 私有数据、author-only kinds、DM 可见性仍按 owner 的现有权限计算，并继续受 channel/community 边界约束。

需要统一 effective principal helper，避免每个 handler 手写：

```text
request signer -> verified web device -> owner effective principal
```

缓存 key 必须包含 community、device pubkey、authorization event/version；撤销时主动失效。

### 6.5 写路径与作者显示

设备发布的 event 仍由 device pubkey 签名，并携带已验证的 `device-auth` tag。Relay：

- 用 owner effective actor 做业务权限、编辑/删除所有权和频道成员校验；
- 用 device raw signer 做签名验证、设备限流、封禁与审计；
- 保留 event 原始签名，不在 Relay 内重签或改写 event；
- 历史 event 的展示 owner 依据保留的 device→owner 绑定解析，即使设备后来被撤销也不改变历史作者；
- 客户端不得仅凭 tag 自行信任 owner，必须使用 Relay 已验证的设备映射或 Relay 返回的有效作者投影。

现有 `effective_message_author`、Timeline author resolution、Inbox、Search、通知、线程计数、reaction、edit/delete 和 Moderation raw signer 路径都必须审计，避免只修消息列表而遗漏副作用。

## 七、Pair 流程

### 7.1 Web 生成设备身份

Web 打开 Pair 页面时：

1. 在浏览器本地生成新的 secp256k1 device key；
2. 私钥只用于当前 pairing session 和后续设备签名；
3. SAS 仍绑定 Desktop source key、device pubkey、session secret 和 transcript；
4. Web 不接收 owner `nsec`，也不接收 NIP-46 connect secret。

### 7.2 Desktop 签发授权

用户确认 SAS 后，Desktop：

1. 读取当前 community Relay 和 owner keys；
2. 根据固定的 Web 默认权限模板构造 kind `30079`；
3. 用 owner key 签名并发布到主 Relay；
4. 等待 Relay 返回 accepted；
5. 只有 Relay 确认授权已物化后，才通过加密 `/pair` payload 返回授权证据；
6. Pair 任一步失败都发送 `complete=false`，不让 Web 保存半成品。

payload 建议为：

```json
{
  "version": 1,
  "relayUrl": "https://achoverse.xyz",
  "ownerPubkey": "<owner-pubkey>",
  "devicePubkey": "<device-pubkey>",
  "authorizationEvent": { "...": "完整 owner-signed event" }
}
```

### 7.3 Web 激活

Web 收到 payload 后：

1. 校验 owner-signed authorization event；
2. 校验 device pubkey 与本地 private key 匹配；
3. 使用 device key + `device-auth` 完成一次 NIP-42；
4. 再执行最小 `/query` 验证 owner 数据可见；
5. 全部成功后，把 device private key、owner、Relay 和 authorization evidence 保存到 IndexedDB；
6. 清理 pairing session 临时状态。

## 八、Web 本地安全

Web 设备私钥继续使用 IndexedDB 持久化，但必须：

- 使用专用、版本化 object store，不与 Remote Signer credential 混写；
- 默认不进入 localStorage、日志、错误上报、URL、clipboard 或 Service Worker cache；
- 私钥读取集中在 signer/storage 模块，React 组件不直接接触 key bytes；
- 配置严格 CSP，继续禁止第三方 script；
- 清除站点数据等同于丢失该设备，需要重新 Pair，但不会影响 owner 主身份；
- UI 展示设备名、授权时间、过期时间和当前 scope，不展示 secret；
- Web “Sign out”只清本地设备凭证；远程撤销必须由持有 owner key 的 Desktop/Mobile 发起。

可评估将 key 导入 WebCrypto non-extractable key，但 secp256k1 的跨浏览器支持与 Nostr 库兼容性必须先验证；不能为了形式上的 non-extractable 引入不可迁移或不可恢复的假安全。

## 九、撤销与设备管理

### 9.1 Desktop 设备管理

Desktop Settings 增加 Web Devices 列表：

- 设备名；
- device pubkey 短指纹；
- 创建时间、到期时间、最近使用时间；
- active / expired / revoked；
- scope 摘要；
- Revoke 操作。

撤销必须二次确认。Owner 发布 `status=revoked` 的 kind `30079` 后，Relay：

1. 原子更新授权状态；
2. 清除授权缓存；
3. 通过 connection manager 断开该 device pubkey 的现有 WebSocket；
4. 后续 NIP-42、NIP-98 和 event ingest 返回明确的 `device_authorization_revoked`；
5. 保留历史 event 与审计映射。

### 9.2 过期与续期

第一版默认授权有效期建议为 90 天，而不是永久授权。到期前 Web 提示用户在 Desktop/Mobile 上续期；续期发布同一 `d` 的新 owner-signed active event，可以调整 scopes 和 expires。

如果产品更重视家庭设备的低打扰体验，可在首次落地后根据实际风险将默认期调整为 180 天，但不建议第一版永久有效。

## 十、加密 DM 与私密数据边界

设备身份可以解决认证、授权和事件签名，但不能自动解密历史上只加密给 owner 主密钥的 NIP-17/NIP-44 数据。没有 owner `nsec` 时，这在密码学上不可绕过。

当前 Web 主要消费 Relay 已提供的 DM channel metadata，并没有完整的 NIP-17 私钥解密实现。因此本轮规则是：

- 不把 owner `nsec` 复制给 Web；
- 不让 Relay 解密用户内容；
- 不宣称本轮增加历史加密 DM 解密能力；
- 保持 Web 当前 DM 能力不回退；
- 未来若要完整多设备加密 DM，单独设计“每条消息同时封装给 owner key 和 active device keys”或用户控制的内容密钥同步；
- 已存在的历史密文需要由可信 owner 设备显式重封装，不能由 Relay 凭空恢复。

这个边界必须写进 UI 与发布说明，避免把“独立访问 Relay”误解为“设备自动获得所有历史端到端密文”。

## 十一、兼容与迁移

迁移分四阶段：

### 阶段 A：Relay 与协议先行

- 增加 kind、DB 表、授权验证、effective principal、scope gate、撤销断连和测试；
- 默认 feature flag 关闭，不影响现有 Desktop/Mobile/Web；
- NIP-OA 和 relay member 行为保持不变。

### 阶段 B：Desktop 签发与管理

- Desktop Web Pair 改为签发 device authorization；
- 增加设备列表和撤销；
- 保留旧 NIP-46 Remote Signer 命令，供旧 Web build 使用。

### 阶段 C：Web 双栈迁移

- 新 Pair 默认创建 device credential；
- 已有 Remote Signer credential 继续可读，不自动转换；
- 用户下一次主动 Pair 时迁移为 device credential；
- 生产观测确认后，Web 数据路径优先 device signer，旧 credential 仅回退。

### 阶段 D：收口

- 公网稳定运行并确认旧 Web build 已淘汰后，再移除 NIP-46 业务依赖；
- `/signer` sidecar 是否保留给其他 NIP-46 客户端另行决策；
- 不在同一个 commit 中删除旧路径和上线新授权路径，保留可回滚窗口。

## 十二、失败语义与可观测性

至少区分：

- `device_authorization_missing`；
- `device_authorization_invalid`；
- `device_authorization_expired`；
- `device_authorization_revoked`；
- `device_scope_denied`；
- `device_owner_not_member`；
- `device_owner_banned`；
- `device_banned`；
- `device_authorization_stale`；
- `device_auth_community_mismatch`。

Metrics 建议：

- active / expired / revoked device 数；
- device NIP-42/NIP-98 成功与失败原因；
- scope denied 计数；
- Pair 签发、激活、撤销、续期计数；
- raw device 与 effective owner 维度的速率限制命中。

日志不记录 private key、Pair secret、完整 authorization payload、NIP-44 明文或用户内容。

## 十三、测试与安全验收

### 13.1 协议与数据库

- 授权 event 签名、kind、`d/p`、scope、expires 和 LWW；
- community A 的授权不能用于 community B；
- device 不能换绑 owner；
- revoked/expired/stale event fail closed；
- DB/Redis 错误不降级为允许；
- 撤销后缓存失效且现有连接被关闭；
- NIP-OA Agent 不被识别为 Web device，Web device 不计为 Agent。

### 13.2 读写权限

- Web device 可以读取 owner 有权读取的数据，不能扩大到其他私有数据；
- 所有 relay query 仍要求明确 kinds；
- 频道写入、reply、reaction、edit/delete 使用 effective owner 校验；
- raw signer 保留在 Moderation、审计和封禁路径；
- scope 缺失时每类写入均返回 `device_scope_denied`；
- 禁止设备签发/撤销设备、转移 owner、管理成员或执行管理员操作。

### 13.3 Web 与 Desktop

- 首次 Pair 后 Desktop 完全退出，Web 刷新并正常读取/写入 Relay；
- Desktop 退出后 Web 明确显示 Agent 离线；用户发出的消息可入库，但不伪造“Agent 处理中”或回复；
- Desktop 重新启动 Agent 后，Web 恢复 Agent 在线状态，不需重新 Pair；
- Mac 重启、Web 标签页关闭、iPad PWA 重启均不要求重新 Pair；
- 清除 IndexedDB 后只丢失当前设备，不影响 owner；
- revoked/expired 时显示明确操作，不陷入无限 Retry；
- 旧 Remote Signer credential 在迁移窗口仍可使用；
- CSP、Service Worker 和错误上报不泄露 device key。

### 13.4 公网验收

1. 使用 `wss://achoverse.xyz` 和 `https://app.achoverse.xyz` 完成 Pair；
2. 退出 Desktop 并确认进程不存在；
3. Web 连续使用 Channels、Search、Tasks、Tracks、Calendar 至少 30 分钟；
4. 刷新页面、关闭再打开 PWA、切换网络；
5. 重新启动 Desktop，从设备列表撤销；
6. Web 现有连接立即关闭，刷新后仍不能访问；
7. 重新 Pair 生成不同 device pubkey，恢复访问；
8. 检查历史消息仍显示 owner，审计仍能定位旧 raw device signer。

## 十四、Todo List

每项只对应一个文件；实际实施前从最新 `dev` 创建修复分支，完成一项后更新勾选状态。

- [ ] `crates/buzz-core/src/kind.rs`：登记 `KIND_WEB_DEVICE_AUTHORIZATION`、kind 分类和约束测试。
- [ ] `crates/buzz-core/src/device_auth.rs`：定义授权 content、scope 枚举、proof tag、LWW 与验证类型。
- [ ] `crates/buzz-core/src/lib.rs`：导出 device auth 领域模块。
- [ ] `migrations/0030_web_device_authorizations.sql`：创建 community-scoped 授权表、约束与索引。
- [ ] `crates/buzz-db/src/web_device_authorizations.rs`：实现授权 upsert、active lookup、list、revoke、expiry 和 LWW。
- [ ] `crates/buzz-db/src/lib.rs`：暴露 Web device 授权数据层接口和记录类型。
- [ ] `crates/buzz-auth/src/lib.rs`：扩展 AuthContext，区分 raw signer、effective actor、principal type 和 device scopes。
- [ ] `crates/buzz-relay/src/api/mod.rs`：在现有 relay membership 单一入口中增加 device owner fallback，同时保持 NIP-OA 分支独立。
- [ ] `crates/buzz-relay/src/handlers/auth.rs`：验证 NIP-42 device proof，设置 WebDevice AuthContext，并应用 device/owner ban gate。
- [ ] `crates/buzz-relay/src/api/bridge.rs`：为 NIP-98 `/query`、`/count`、`/events` 增加 device proof、scope 和 effective principal。
- [ ] `crates/buzz-relay/src/handlers/ingest.rs`：验证设备业务 event、集中映射 required scope，并用 effective actor 执行业务权限。
- [ ] `crates/buzz-relay/src/handlers/req.rs`：让 Web device 读取路径继承 owner 可见性而不扩大 community/channel/private ACL。
- [ ] `crates/buzz-relay/src/handlers/side_effects.rs`：统一设备 event 的 effective author，用于通知、线程、reaction 和派生状态。
- [ ] `crates/buzz-relay/src/connection.rs`：记录 WebDevice principal，并支持按 raw device pubkey 强制断连。
- [ ] `crates/buzz-relay/src/state.rs`：增加 community-scoped device authorization 缓存及撤销失效。
- [ ] `crates/buzz-relay/src/handlers/event.rs`：处理 owner-signed 授权 event 的物化、续期和撤销副作用。
- [ ] `crates/buzz-relay/src/handlers/moderation_authz.rs`：保持 raw device signer 与 effective owner 的双主体封禁/审计语义。
- [ ] `crates/buzz-relay/src/main.rs`：注册 device metrics、启动期配置和 feature flag。
- [ ] `desktop/src-tauri/src/commands/pairing.rs`：Web Pair 改为 owner 签发授权 event，Relay accepted 后发送 device payload。
- [ ] `desktop/src-tauri/src/events.rs`：增加 Web device authorization event builder 与严格字段校验。
- [ ] `desktop/src-tauri/src/commands/web_devices.rs`：实现设备列表、撤销和续期 Tauri commands。
- [ ] `desktop/src-tauri/src/commands/mod.rs`：注册 Web device commands 模块。
- [ ] `desktop/src-tauri/src/lib.rs`：挂载 Web device commands，不再把新 Pair 绑定到 RemoteSignerHandle。
- [ ] `desktop/src/features/settings/ui/WebDevicesCard.tsx`：展示设备、状态、scope、到期时间和撤销确认。
- [ ] `desktop/src/features/settings/ui/SettingsPanels.tsx`：接入 Web Devices 设置卡片和刷新状态。
- [ ] `web/src/shared/storage/deviceCredentials.ts`：增加版本化 Web device credential store 和旧 Remote Signer credential 兼容读取。
- [ ] `web/src/shared/api/deviceSigner.ts`：集中管理 device key、proof tag、NIP-42、NIP-98 和业务 event 签名。
- [ ] `web/src/features/pairing/types.ts`：定义 device authorization pairing payload 类型。
- [ ] `web/src/features/pairing/pairingSession.ts`：接受并验证 device payload，拒绝 owner `nsec` 和不匹配授权。
- [ ] `web/src/features/pairing/PairPage.tsx`：激活 device credential，完成独立 Relay 验证后才显示成功。
- [ ] `web/src/shared/api/communitySession.ts`：从 Remote Signer 切换到 device signer，并保留迁移期回退。
- [ ] `web/src/shared/api/relayHttp.ts`：使用 device-signed NIP-98 和 proof tag。
- [ ] `web/src/shared/api/relaySession.ts`：使用 device-signed NIP-42 和 proof tag。
- [ ] `web/src/shared/api/publishSignedEvent.ts`：发布 device-signed 业务 event，不再请求 Desktop Remote Signer。
- [ ] `web/src/shared/ui/AsyncStateView.tsx`：展示 missing/expired/revoked/scope denied 等可恢复状态。
- [ ] `web/src/features/settings/SettingsPage.tsx`：展示当前设备信息、到期时间、本地 Sign out 和远程撤销说明。
- [ ] `crates/buzz-test-client/tests/e2e_web_device_auth.rs`：覆盖 Pair 后认证、读写、scope、撤销、过期、跨 community 和强制断连。
- [ ] `desktop/tests/e2e/web-device-pairing.spec.ts`：覆盖 Desktop 签发、设备列表、撤销和续期 UI。
- [ ] `web/tests/e2e/device-auth.spec.ts`：覆盖独立登录、刷新、旧 credential 迁移、撤销和错误状态。
- [ ] `docs/2026-08-01-local-startup-and-relay-guide.md`：更新 Web 一次 Pair 后独立运行、撤销、过期和排障方式。
- [ ] `docs/2026-08-12-web-device-identity-delegation-plan.md`：实施后记录测试、commit、部署、feature flag 和公网验收结果。

## 十五、交付门禁

实施完成前至少运行：

```bash
. ./bin/activate-hermit
just desktop-tauri-fmt-check
just desktop-tauri-clippy
just desktop-tauri-test
cd web && pnpm check && pnpm build && pnpm test:e2e:smoke
cd /Users/lu/buzz && just test
just ci
```

涉及 Relay、DB、Auth 和协议边界，必须运行集成测试，不能只以 Clippy 或 Web smoke 通过作为完成。

## 十六、风险与建设性建议

### 16.1 主要风险

- effective actor 改动横跨认证、读取、写入、Timeline、审计和 Moderation，局部修补容易产生越权；
- 设备撤销必须同时影响缓存和现有 WebSocket，否则“数据库已撤销但旧连接仍可写”；
- raw signer 与 display author 混淆会导致封错用户或隐藏真实攻击设备；
- scope 设计过宽会让设备密钥接近主密钥风险；过窄则造成 Web 功能碎片化；
- 多设备加密 DM 不能靠授权表解决，必须单独处理密钥封装。

### 16.2 实施建议

这是高风险、跨 Relay/Desktop/Web 的身份系统改动，不适合一次性大提交。建议按阶段 A/B/C 拆成独立、可回滚的 signed-off commits，并在 feature flag 下先完成 Relay 安全测试，再接入生产 Web。

不要为了赶进度先让 Relay“看到 device-auth tag 就信任 owner”；授权记录、签名、最新版本、scope、community 和撤销状态必须在同一验证入口 fail closed。

## 十七、确认门

鹿鹿子大王已确认当前产品目标为“Web 不再重复 Pair”，同时接受托管 Agent 在当前架构下仍依赖 Desktop。因此本设备身份方案降级为长期路线，不作为当前实施确认。

当前只更新方案文档，没有修改代码、数据库、Keychain、Relay、Desktop、Cloudflare 或生产 Web。未来如果要开始本长期路线，需要再次获得独立实施确认。

## 十八、Task Progress

- [x] 1. 重新对齐产品边界：Web 身份可独立不等于托管 Agent 可脱离 Desktop 运行。
- [x] 2. 明确安全边界：Web 不保存 owner `nsec`，设备权限可撤销、可过期、可审计。
- [x] 3. 明确协议边界：不直接采用 NIP-26，不复用 Agent NIP-OA。
- [x] 4. 定义 Relay、Desktop、Web、DB 和 Pair 数据流。
- [x] 5. 定义加密 DM 非目标、迁移阶段、失败语义和测试矩阵。
- [x] 6. 建立逐文件 Todo List。
- [x] 7. 将本方案降级为长期路线，当前不实施。
- [ ] 8. 未来在 Agent 运行形态或多设备需求发生变化时重新评估。
