> 更新日期：2026-08-08
> 更新说明：定位 Web 报错 `Desktop did not answer get_public_key` 的确定性原因，并提出 Desktop 重启后自动恢复 Remote Signer、断线自愈和状态可观测的修复方案。

# Web Remote Signer 持久连接修复方案

## 一、问题结论

当前 Pair 只建立了一次“内存授权”。Web 会把 client key、Desktop signer pubkey、Relay 和一次性 secret 保存在浏览器 IndexedDB，但 Desktop 的 `RemoteSignerHandle` 只把授权保存在当前进程内存中。

因此 Desktop 重启后会出现不对称状态：

- Web 仍显示已配对，并继续向 signer pubkey 发送 `connect` / `get_public_key`；
- Desktop 已忘记 client pubkey、Relay 和 secret，也没有启动 kind `24133` 订阅；
- Relay/Tunnel 正常转发请求，但没有 Desktop 消费者；
- Web 等待超时后显示 `Desktop did not answer get_public_key`。

这不是单纯的跨网络延迟，也不是本次请求超过 Cloudflare timeout。重新 Pair 可以临时恢复，但下一次 Desktop 重启仍会复现。

## 二、产品目标

一次 Pair 后，只要用户没有主动撤销：

1. Desktop 重启后自动恢复同一个 Web client 的 signer 订阅；
2. Cloudflare、网络切换、Mac 睡眠导致 WebSocket 断开时自动重连；
3. Web 能区分“Desktop 离线”“授权不存在”“Relay 断开”和“请求超时”；
4. 用户主动清除配对后，Desktop 与 Web 两侧都不再继续使用旧授权；
5. 用户私钥仍只保存在 Desktop Keychain，不进入 Web 或 Relay。

## 三、持久化设计

Desktop 持久化一条 Web signer 授权记录：

- `client_pubkey`：允许请求的 Web 设备公钥；
- `relay_url`：Remote Signer 使用的公网 Relay；
- `signer_secret`：NIP-46 connect secret；
- `created_at`、`last_seen_at`：设备管理与排障信息；
- `revoked`：撤销状态。

安全边界：

- secret 进入 macOS Keychain，不写普通 JSON；
- 普通 app data 只保存 client pubkey、relay URL 和非敏感元数据；
- 启动时必须同时成功读取元数据和 Keychain secret 才恢复授权；
- Keychain 不可用时 fail closed，不生成替代授权，也不静默清除记录；
- `revoke_web_signer` 同时停止任务、删除元数据和 Keychain secret；
- 继续保留当前 kind 白名单及 `h`/`p` tag 校验。

## 四、生命周期

```text
首次 Pair 成功
  -> Keychain 保存 signer secret
  -> app data 保存 client pubkey + relay
  -> 启动 Remote Signer 订阅

Desktop 再次启动
  -> 加载持久授权
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
  -> 删除 Keychain secret 和授权元数据
  -> Web 清除 IndexedDB 后进入 Pair 页
```

## 五、状态与错误提示

Desktop 应记录结构化状态：`disabled`、`connecting`、`connected`、`retrying`、`keychain_locked`、`revoked`，并记录最近一次连接/请求时间。

Web 的错误提示按事实区分：

- 收不到任何 signer 响应：`Mac signer is offline or no longer authorized`；
- Relay WebSocket 关闭：`Relay connection closed; reconnecting`；
- connect 被拒绝：`Pairing authorization was revoked; pair again`；
- `get_public_key` 超时：显示 Retry，不把普通网络慢误报成 Pair 成功。

## 六、测试要求

- Pair 后重启 `buzz-desktop`，不重新 Pair 即可完成 `get_public_key`；
- Desktop signer WebSocket 被强制关闭后自动重连并继续响应；
- Mac 睡眠/网络切换模拟后恢复；
- Keychain secret 缺失、损坏或锁定时 fail closed；
- 撤销后重启 Desktop 不恢复 signer；
- client pubkey 不匹配、secret 错误、重复 request id、非法 kind/tag 均拒绝；
- Web 在断线后重试读取，但发送消息不盲目重复发布；
- 公网跨网络连续运行至少 10 分钟，周期性执行 `get_public_key` 和一次只读查询。

## 七、Todo List

- [ ] `desktop/src-tauri/src/commands/remote_signer_store.rs`：实现非敏感授权元数据和 Keychain secret 的保存、加载、删除与损坏状态处理。
- [ ] `desktop/src-tauri/src/commands/remote_signer.rs`：让 signer 授权可恢复，补充连接状态、last seen、断线重连和撤销清理。
- [ ] `desktop/src-tauri/src/commands/pairing.rs`：Pair 确认成功后先持久化授权，再启动 signer；失败时不宣称 Pair 完成。
- [ ] `desktop/src-tauri/src/lib.rs`：Desktop 启动时自动加载授权并恢复 signer task。
- [ ] `desktop/src-tauri/src/commands/mod.rs`：注册 signer store 模块和必要命令。
- [ ] `web/src/shared/api/nip46Client.ts`：区分未授权、Desktop 离线、Relay 关闭和请求超时，并保持读取请求的有界重试。
- [ ] `web/src/features/settings/SettingsPage.tsx`：显示 signer 状态、最近响应时间和明确的重新 Pair/Retry 操作。
- [ ] `desktop/src-tauri/src/commands/remote_signer_tests.rs`：覆盖重启恢复、Keychain 故障、撤销、重连和安全拒绝。
- [ ] `web/tests/e2e/relay-session.spec.ts`：覆盖错误分类、恢复读取和消息不重复发送。
- [ ] `docs/2026-08-01-local-startup-and-relay-guide.md`：补充一次 Pair 后的重启恢复、撤销和排障说明。
- [ ] `docs/2026-08-08-web-signer-durable-connection-fix.md`：记录测试、commit、部署和公网稳定性结果。

## 八、验收标准

- Desktop 重启不再要求重新 Pair；
- 同一个浏览器 Web client key 与同一个 Desktop signer pubkey 保持不变；
- Relay/Tunnel 短暂断线后 5 秒级开始重连并最终恢复；
- Desktop 没有活动 signer 时，Web 不再只显示模糊的 `did not answer`；
- 只有用户主动撤销或 Keychain 授权确实丢失时才要求重新 Pair。

## 九、确认门

当前可以通过重新 Pair 立即临时恢复，但不能消除 Desktop 重启必现的问题。鹿鹿子大王确认本方案后，再修改代码并完成重启恢复与公网稳定性测试。
