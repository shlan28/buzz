> 更新日期：2026-08-15
> 更新说明：已完成 Web Remote Signer 授权持久化、Desktop 启动恢复和 Web 离线提示；自动化检查通过，待真实 Pair 后执行一次完整重启验收。

# Web Remote Signer 持久连接修复方案

> **状态：已实施，待真实 Pair 重启验收。** 本轮只解决“Web 不要每次打开都重新 Pair”。更完整的可撤销 Web device principal 保留为长期路线，见 [`2026-08-12-web-device-identity-delegation-plan.md`](2026-08-12-web-device-identity-delegation-plan.md)。

## 一、问题结论

当前 Pair 只在 Desktop 建立一次“内存授权”。Web 会把 client key、Desktop signer pubkey、Relay 和 user pubkey 保存在浏览器 IndexedDB；一次性 connect secret 只在首次 Pair 建连时存在，不会写入 Web 的长期凭证。Desktop 的 `RemoteSignerHandle` 则只把已验证的 Web client pubkey、Relay、secret 和 signer task 保存在当前进程内存中。

因此 Desktop 重启后会出现不对称状态：

- Web 仍显示已配对，并继续向 signer pubkey 发送 `connect` / `get_public_key`；
- Desktop 已忘记 client pubkey、Relay 和 secret，也没有启动 kind `24133` 订阅；
- Relay/Tunnel 正常转发请求，但没有 Desktop 消费者；
- Web 等待超时后显示 `Desktop did not answer get_public_key`。

这不是单纯的跨网络延迟，也不是本次请求超过 Cloudflare timeout。重新 Pair 可以临时恢复，但下一次 Desktop 重启仍会复现。

### 1.1 2026-08-11 现场复查

本次现场已经排除以下方向：

- 持久化 Relay LaunchAgent 正在运行，本机 `3200` 与公网 `/health` 均返回成功；
- `wss://achoverse.xyz` 可以完成 WebSocket 升级，`https://app.achoverse.xyz` 与 `/query` CORS 正常；
- `/pair` 与 `/signer` sidecar 均在监听，Cloudflare Tunnel 当前可达；
- 启动 Desktop 后 Remote Signer 恢复响应，Web 可以重新访问；
- `RemoteSignerHandle::new()` 每次 Desktop 启动都会创建空授权，代码中不存在从 Keychain 或 app data 恢复 Web signer 的路径。

因此，本轮不修改主 Relay membership、不把 Web device key 加入 `relay_members`，也不继续扩大网络重连范围。当前缺口是 Desktop 授权生命周期短于 Web 凭证生命周期。

### 1.2 已修复的在线竞态

重新 Pair 后未重启仍断开，曾经是另一条已复现故障：

1. `loadWorkConsoleData()` 每次加载都调用 `openPairedSigner()` 新建 WebSocket，查询结束后立即 `close()`；
2. Cloudflare 关闭握手与 signer relay 清理订阅不是同步完成；
3. signer relay 为避免同一 `#p` 的响应被窃取，只允许一个实时订阅；
4. 新 WebSocket 在旧订阅尚未清理时收到 `CLOSED ... #p already has a live subscriber`；
5. Web 当前在 socket `open` 时就认为订阅完成，不等待 `EOSE`，也不处理 `CLOSED`；
6. Web 仍发送 `get_public_key`，Desktop 正常回答，但 Relay 把响应发给旧订阅，新连接最终超时。

该问题已经由共享 signer session、等待 `EOSE`、处理 `CLOSED` 和心跳修复。本轮必须保留这些行为并做回归验证，不重复设计或重写在线连接层。

## 二、产品目标

本方案严格区分两种状态：

```text
Pairing authorization
  -> 决定这个浏览器是否已被 Desktop 授权
  -> 应跨 Web 刷新、标签页关闭和 Desktop 重启持久恢复

Runtime availability
  -> Desktop 和托管 Agent 是否当前在线
  -> Desktop 离线时 Web 保留授权，但显示 Desktop/Agent 离线
  -> Desktop 重新启动后自动恢复，不要求重新 Pair
```

Relay 不会运行 Agent。Mobile/Web 发出的消息在 Desktop/Agent 离线时仍可被 Relay 入库，但不会产生 Agent 回复。这是运行时能力边界，不是 Pair 失效。

一次 Pair 后，只要用户没有主动撤销：

1. Desktop 重启后自动恢复同一个 Web client 的 signer 订阅；
2. Cloudflare、网络切换、Mac 睡眠导致 WebSocket 断开时自动重连；
3. Web 在应用生命周期内复用一个 signer session，不为每次查询反复开关 WebSocket；
4. Web 必须等待 `EOSE` 才发送 RPC，并把 `CLOSED` 当作握手失败处理；
5. Web 能区分“Desktop 离线”“授权不存在”“Relay 断开”和“请求超时”；
6. 用户从 Desktop 主动撤销配对后，Desktop 不再恢复旧授权；Web 本地清除只清除当前浏览器凭证，不伪装成已远程撤销；
7. 用户私钥仍只保存在 Desktop Keychain，不进入 Web 或 Relay。
8. Desktop/Agent 离线时 Web 保留 IndexedDB 凭据，只显示离线与 Retry，不跳转 Pair。

### 2.1 本轮成功标准

- 同一 Desktop 身份、同一浏览器和同一 community 完成一次 Pair 后，Desktop 重启无需重新 Pair；
- Web 刷新、关闭标签页后重新打开、Mac 睡眠和短时断网均优先自动恢复；
- Desktop 身份变化、用户主动撤销、Keychain 记录缺失或损坏时 fail closed；
- Web 明确区分“未 Pair”“Desktop 暂时离线”“授权已撤销或身份变化”，不把所有错误都引导到 Pair；
- Desktop/Agent 离线时不显示“Agent 处理中”，不暗示 Relay 会自主生成回复；
- 本轮先保持“一个 Desktop 同时授权一个 Web 设备”的现有能力边界，不在修复中顺带扩展多设备管理。后续若需要多个浏览器并存，应单独设计设备列表、逐设备撤销和多 signer task 生命周期。

## 三、持久化设计

Desktop 在现有 `SecretStore` 中以独立 key 持久化一条版本化 Web signer 授权记录：

- `version`：授权记录 schema 版本；
- `owner_pubkey`：授权绑定的 Desktop 用户身份；
- `client_pubkey`：允许请求的 Web 设备公钥；
- `relay_url`：Remote Signer 使用的公网 Relay；
- `signer_secret`：NIP-46 connect secret；
- `created_at`：配对建立时间，用于排障与未来设备管理。

安全边界：

- 整条授权记录进入系统 Keychain 的 `SecretStore`，不再拆分普通 app data 元数据与 Keychain secret，避免两份状态部分写入或版本漂移；
- 保存成功后必须读回、解析并校验 owner/client pubkey、Relay scheme 和 secret 格式，随后才向 Web 宣称 Pair 完成；
- 启动时必须同时满足 Desktop 当前身份与 `owner_pubkey` 一致、记录完整且 Keychain 可用，才恢复授权；
- Keychain 不可用时 fail closed，不生成替代授权，也不静默清除记录；
- 记录损坏时不启动 signer，不在日志中输出 secret 或完整授权 JSON，并向 Desktop 暴露可恢复错误；
- `revoke_web_signer` 先停止 task，再删除 Keychain 记录；删除失败必须显示失败，不能让用户误以为已经撤销；
- 新 Pair 覆盖旧设备时，先持久化新记录，再切换运行中的 task；任一步失败都保留上一条可用授权；
- 继续保留当前 kind 白名单及 `h`/`p` tag 校验。

不新增 Postgres 表或 Relay event：这是单台 Desktop 对本机私钥签名代理的设备授权，不属于 community 共享事实，也不应把 connect secret 发送给 Relay。

## 四、生命周期

```text
首次 Pair 成功
  -> Keychain 原子保存完整授权记录
  -> 读回并校验 owner/client/relay/secret
  -> 启动 Remote Signer 订阅

Desktop 再次启动
  -> 加载持久授权
  -> 校验 owner_pubkey 等于当前 Desktop 身份
  -> 读取当前 user signing key
  -> 自动启动同一个 client pubkey 的 signer 订阅
  -> Web 下一次请求自动 connect 并恢复

网络断开 / Mac 睡眠
  -> signer task 发现 read/write/heartbeat 失败
  -> 250ms 到 5s 有界退避重连
  -> 重连后重新 REQ 并等待 EOSE
  -> 不要求用户重新 Pair

主动撤销
  -> cancel signer task
  -> 删除 Keychain 授权记录
  -> Web 旧请求不再获得响应并显示授权不可用
  -> 用户在 Web 清除本地凭证后进入 Pair 页
```

Web 侧 signer session 生命周期：

```text
首次数据请求
  -> 创建进程内共享 Nip46Client
  -> WebSocket open
  -> 发送 REQ
  -> 等待匹配 subscription id 的 EOSE
  -> 才允许 get_public_key / sign_event

后续页面查询和消息发送
  -> 复用同一个 client 和 WebSocket
  -> 引用计数/空闲计时，不在每次 HTTP 查询后立即 close

收到 CLOSED / socket close
  -> 拒绝当前 pending request
  -> 清除旧 socket 引用
  -> 有界退避后重新连接、重新订阅并等待 EOSE
  -> 只读请求可重试；写入请求不自动重复
```

## 五、状态与错误提示

Desktop 应至少记录结构化状态：`disabled`、`restoring`、`connected`、`retrying`、`keychain_unavailable`、`identity_mismatch`、`revoked`。日志可以包含 client pubkey 的短指纹、Relay host 和错误分类，不记录 secret、完整 RPC 或用户私钥。

Web 的错误提示按事实区分：

- Desktop 进程不在或 signer 暂时无响应：`Desktop is offline; pairing is still saved`；
- Desktop 在线但托管 Agent 不在线：`Agent is offline; start it from Desktop`；
- Relay WebSocket 关闭：`Relay connection closed; reconnecting`；
- connect 被拒绝：`Pairing authorization was revoked; pair again`；
- `get_public_key` 超时：显示 Retry，不把普通网络慢误报成需要重新 Pair。

Web 不应因为普通 transport error 清除 IndexedDB。只有 `PAIR_REQUIRED`、Desktop 明确返回授权撤销，或 signer 返回的 user pubkey 与已保存身份不一致时，才进入重新 Pair 路径。

## 六、测试要求

- Pair 后重启 `buzz-desktop`，不重新 Pair 即可完成 `get_public_key`；
- 连续刷新/切换 Inbox、Calendar、Tasks、Tracks 不产生重叠 signer 订阅；
- 第二条同 `#p` 订阅收到 `CLOSED` 时必须立即报握手冲突，不能等待 10 秒伪装成 Desktop 无响应；
- `open()` 只有收到匹配 subscription id 的 `EOSE` 才成功；
- Desktop signer WebSocket 被强制关闭后自动重连并继续响应；
- Mac 睡眠/网络切换模拟后恢复；
- Keychain secret 缺失、损坏或锁定时 fail closed；
- 撤销后重启 Desktop 不恢复 signer；
- client pubkey 不匹配、secret 错误、重复 request id、非法 kind/tag 均拒绝；
- Web 在断线后重试读取，但发送消息不盲目重复发布；
- Desktop 退出后 Web 保留 IndexedDB 凭据并显示离线，不进入 Pair 页；
- Desktop 重新启动后 signer 自动恢复，Web 无需新 Pair Link 即可继续读写；
- Agent 离线状态不会被误判为授权撤销，也不会清除 Web 凭据；
- 公网跨网络连续运行至少 10 分钟，周期性执行 `get_public_key` 和一次只读查询。

测试分层：

- Rust 单元测试用 fake secret store 覆盖保存、读回、损坏、Keychain 不可用、身份不匹配、覆盖与撤销；
- Desktop 启动测试覆盖 identity resolve 之后恢复 signer、recovery mode 不恢复 signer；
- Web 单元/E2E 回归覆盖 IndexedDB 凭证保留、Desktop 离线只显示 Retry、身份不匹配才清凭证；
- 人工验收使用真实 `wss://achoverse.xyz/signer`，执行 Pair → Web 成功 → 完全退出 Desktop → 重启 Desktop → Web 刷新成功，全程不得生成新 Pair Link。

## 七、Todo List

- [x] `desktop/src-tauri/src/commands/remote_signer_store.rs`：定义版本化授权记录、SecretStore 适配层，以及保存、读回验证、加载、覆盖回滚、删除和 fake store 测试。
- [x] `desktop/src-tauri/src/commands/remote_signer.rs`：让 signer task 接受恢复后的授权；撤销时停止任务并删除持久记录；保留现有心跳、EOSE 与有界退避逻辑。
- [x] `desktop/src-tauri/src/commands/pairing.rs`：Web Pair 确认后先持久化并读回验证授权，再启动 signer 并发送成功 payload；失败时不宣称 Pair 完成。
- [x] `desktop/src-tauri/src/lib.rs`：在身份解析成功且不处于 recovery mode 时加载授权，并异步恢复 Remote Signer；启动恢复失败不阻止 Desktop UI 打开。
- [x] `desktop/src-tauri/src/commands/mod.rs`：注册 `remote_signer_store` 模块，保持命令层依赖方向清晰。
- [x] `web/src/shared/api/nip46Client.ts`：等待匹配 `EOSE`、处理 `CLOSED`、重连后重新订阅，并区分订阅拒绝、Relay 关闭和请求超时。
- [x] `web/src/shared/api/signer.ts`：复核现有凭证生命周期；普通 transport error 不清除 IndexedDB，只有 signer 身份不匹配才清除，无需修改。
- [x] `web/src/shared/api/communitySession.ts`：通过共享 signer 的无操作 release 保持连接，不在每次读取后关闭底层 WebSocket。
- [x] `web/src/shared/api/messagePublish.ts`：复用共享 signer，写请求失败不自动重复发布。
- [x] `web/src/shared/ui/AsyncStateView.tsx`：将 Desktop signer 离线提示为“Pairing 仍保留，启动或重开 Desktop 后重试”，与首次 Pair 引导分离。
- [ ] `web/src/shared/api/agentAvailability.ts`：另行实现 Agent presence；它属于运行时可用性，不阻塞本次 Pairing authorization 持久化。
- [x] `web/src/features/settings/SettingsPage.tsx`：显示 Pairing saved，并明确 Desktop 仍需运行以签名和托管 Agent。
- [x] `web/tests/e2e/relay-session.spec.ts`：覆盖等待匹配 EOSE、忽略错误订阅和 CLOSED 单订阅冲突分类。
- [x] `docs/2026-08-01-local-startup-and-relay-guide.md`：补充一次 Pair 后的重启恢复、撤销和排障说明。
- [x] `docs/2026-08-08-web-signer-durable-connection-fix.md`：记录实施范围与自动化验证结果；commit 与真实公网重启结果在交付时补充。

## 八、验收标准

- Desktop 重启不再要求重新 Pair；
- 页面切换、刷新和并发读取不再制造相同 `#p` 的重叠订阅；
- Web 不会在收到 `EOSE` 前发送任何 signer RPC；
- 同一个浏览器 Web client key 与同一个 Desktop signer pubkey 保持不变；
- Relay/Tunnel 短暂断线后 5 秒级开始重连并最终恢复；
- Desktop 没有活动 signer 时，Web 不再只显示模糊的 `did not answer`；
- 只有用户主动撤销或 Keychain 授权确实丢失时才要求重新 Pair。
- Desktop 或 Agent 暂时离线只改变运行时可用性，不改变 Pairing authorization。

## 八点一、在线连接修复验证

- 公网双连接复现确认 signer relay 对第二条相同 `#p` 订阅返回 `CLOSED: #p already has a live subscriber`；
- Web typecheck、Biome、文件大小和 pubkey 展示检查通过；
- Chrome smoke 共 35 项通过，包含 EOSE/CLOSED 协议测试、消息安全测试、工作台与 Settings 回归；
- 完整 Chrome、iPad 横屏、iPad 竖屏矩阵共 57 项通过；
- 在线连接修复 commit：`97e94d3b3 fix(web): reuse the remote signer session`；
- Cloudflare Pages 部署：`5e7d5086`，生产域名确认加载 `index-CXvXKbz3.js`；
- Pair/Signer sidecar 已重启清理旧订阅，Desktop signer 自动恢复后仅保留一条长连接。

## 八点二、本次持久化实现验证

- `cargo test --manifest-path desktop/src-tauri/Cargo.toml remote_signer --lib`：12 项通过；
- Desktop 全量 `--lib`：本次相关测试通过，总计 1894 项通过、15 项失败、14 项忽略；失败项均依赖本机 HTTP/WebSocket 测试服务，当前环境统一收到 HTTP 502 或无法发现本地 `5000` 端口，不属于本次改动路径；
- `pnpm check` 与 `pnpm typecheck`：通过；
- Web smoke：91 项通过，包含 signer 离线时保留 Pairing 的新增回归；
- Desktop Clippy：被 `pairing_ws_task_inner` 既有 `too_many_arguments` 告警阻断，本次没有扩大或绕过该告警；
- 真实 Pair → Desktop 完全退出 → 重启 → Web Retry：待人工验收。

## 九、确认门

鹿鹿子大王已确认实施。代码已在 `codex/web-signer-persistent-pairing` 分支完成：Desktop 将已验证的 Web signer 授权写入系统 Keychain，并在同一 Desktop 身份启动时自动恢复；Web 保留浏览器凭证并把 signer 离线与首次 Pair 区分显示。

自动化验证包括 Desktop Remote Signer 单元测试、Web typecheck/check 和 Relay Session smoke E2E。真实公网验收仍需在新版本 Desktop 中执行一次 Pair → 完全退出 → 重启 → Web Retry；该验收会写入真实 Keychain，因此保留为明确的人工步骤，不在自动化测试中伪造通过。

## 十、Task Progress

- [x] 1. 对齐需求与影响范围：Desktop Tauri + Web，不修改 Relay membership、Mobile 或数据库。
- [x] 2. 定义授权记录类型、安全存储和失败语义。
- [x] 3. 按分层落位：store 负责持久化，remote signer 负责任务生命周期，pairing 负责编排，Web 负责错误呈现。
- [x] 4. 对齐交互状态：未 Pair、离线、恢复中、已撤销、身份变化。
- [x] 5. 更新本方案文档和逐文件 Todo List。
- [x] 6. 根据已确认的 Agent 运行边界，将本方案恢复为当前待实施方案。
- [x] 7. 获得鹿鹿子大王对代码实施的单独确认并完成实现。
- [x] 8. 完成 Desktop 定向单元测试以及 Web check、typecheck 和 Relay Session smoke E2E。
- [ ] 9. 使用真实 Pair 执行 Desktop 完全退出与重启验收，并记录公网结果。
