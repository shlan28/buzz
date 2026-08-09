> 更新日期：2026-08-08
> 更新说明：新增 Web 配对后内容可短暂打开、随后 Mac Remote Signer 断开的修复方案；依据现场日志将根因限定为独立 `/signer` 通道缺少保活和请求级恢复，不放宽主 Relay 成员权限。

# Web Remote Signer 长连接稳定性修复方案

## 一、产品问题

Web 与 Desktop 配对成功后，用户能打开 Channels、Calendar、Tasks 和 Tracks，但连接运行一段时间后会显示 Mac signer 不可用。此时用户身份和已加载数据没有丢失，但新的刷新和签名请求无法稳定完成。

修复后应达到：

- Desktop 开着时，Web 在局域网或跨网络下都能长时间维持 signer 可用；
- Cloudflare Tunnel 或网络发生一次短暂断流时，用户不需要重新 Pair；
- 正在执行的安全读操作在可控边界内恢复，不会重复不可幂等写操作；
- Desktop 真正退出、设备被撤销或凭据不匹配时仍 fail closed。

## 二、现场证据与根因

### 2.1 真实传输路径

Remote Signer 不经过主业务 Relay，而是：

```text
Web -> wss://achoverse.xyz/signer -> Cloudflare Tunnel
    -> 127.0.0.1:5001 -> buzz-pair-relay signer policy -> Desktop
```

`/signer` 只允许 NIP-46 `kind:24133`，严格按 `p` tag 单播，不持久化。NIP-44 密文、事件签名、配对 secret 和请求 id 共同保护 RPC。

因此，主 Relay 日志里的 `relay_membership_required` 不是这次 Remote Signer 断线的直接根因，也不应通过把 Web device key 添加为普通成员解决。

### 2.2 断线规律

Signer Relay 现场日志连续记录连接在约 125–133 秒后关闭，例如：

```text
duration_ms=125560 category=connection_ended
duration_ms=132715 category=connection_ended
duration_ms=125607 category=connection_ended
```

Signer policy 自身的硬时限是 24 小时，所以两分钟左右的规律关闭不是业务 TTL，而是公网链路对空闲 WebSocket 的回收。

### 2.3 代码缺口

- Desktop signer 有指数退避重连，但长连接空闲时不主动发送 Ping；
- Signer Relay 已支持 WebSocket Ping/Pong 和应用层 `PING/PONG`，但客户端没有使用；
- Web `Nip46Client` 一旦 socket close 会立即拒绝所有在途请求，没有连接代际和请求重试边界；
- 页面只显示统一的“Mac signer or Relay unavailable”，无法区分恢复中、Desktop 离线、凭据失效和业务 Relay 错误。

## 三、修复设计

### 3.1 Desktop signer 保活

- signer 连接建立后每 25 秒发送一次 WebSocket Ping；
- 正常收到数据不替代周期 Ping，确保反向无流量时 Tunnel 仍能观测活性；
- Ping 写入失败进入现有可取消重连循环；
- 重连保持已授权 client pubkey 和运行期 secret，不自动扩大签名 kind 白名单。

### 3.2 Web NIP-46 恢复

- `Nip46Client` 为建连和重建连接使用同一个去重 Promise，避免并发刷新打开多个 socket；
- Web 每 25 秒发送应用层 `PING`，并接受 `PONG`；
- socket 非正常关闭后使用有上限退避重连，显式 `close()` 不触发重连；
- 仅对 `get_public_key` 和等价的只读请求自动重发一次；
- `sign_event` 如果已发送后断线，不盲目重发，避免未来接入非幂等写操作时重复执行；
- 使用 request id 匹配延迟响应，连接代际切换后旧 socket 不能清空新 socket 的 pending 请求。

### 3.3 错误和 UI 语义

- 恢复窗口内显示“正在重连 Mac signer”，不立即把已配对凭据判定为失效；
- 重连超过时间边界后显示“Desktop 已离线”并保留手动 Retry；
- 只有身份不匹配或用户撤销才清除 IndexedDB 凭据；
- 已成功加载的只读数据在短暂断线时保留，刷新按钮显示恢复状态。

### 3.4 安全边界

- 不关闭主 Relay NIP-42/NIP-43 成员校验；
- 不把 Web device key 添加为普通成员或 Agent；
- `/signer` 仍只允许 `kind:24133`、有效签名和单一 `p` 目标，不持久化；
- Desktop 仍只允许 `get_public_key`、`connect` 和已列入白名单的 `sign_event` kind；
- 心跳不携带 pubkey、secret、RPC 内容或用户数据。

## 四、测试与验收

自动化必须覆盖：

1. Desktop 空闲时持续 Ping，收到 NIP-46 事件时仍正常处理；
2. Desktop Ping 失败后进入有界重连，撤销后立即停止；
3. Web 心跳不被当成 NIP-46 响应；
4. Web 异常 close 后重连，显式 close 不重连；
5. 并发 `open()` 只建立一条 WebSocket；
6. `get_public_key` 在断线代际最多自动重试一次；
7. 已发送的 `sign_event` 不自动重发；
8. signer 通道仍拒绝错误 kind、错误 `p` tag、无效签名和超限流量；
9. 本地用缩短的空闲代理时限运行端到端测试，连接跨过回收边界仍可完成 `get_public_key`；
10. 公网验收持续至少五分钟，期间两次刷新数据，无需重新 Pair。

## 五、Todo List

- [x] `desktop/src-tauri/src/commands/remote_signer.rs`：实现 signer WebSocket 心跳，心跳失败接入现有可取消重连循环。
- [x] `web/src/shared/api/nip46Client.ts`：实现去重建连、心跳、旧 socket 隔离和只读请求单次安全重试。
- [x] `web/src/shared/api/signer.ts`：复核凭据清除边界；现有逻辑只在 user pubkey 不匹配时清除，无需修改。
- [x] `web/src/shared/hooks/useWorkConsoleData.ts`：保留已加载数据并表达刷新中和刷新错误。
- [x] `web/src/shared/ui/AsyncStateView.tsx`：区分 Mac signer 离线和 Relay 数据不可用。
- [x] `crates/buzz-pair-relay/tests/integration.rs`：增加 signer 心跳后订阅仍可用的集成测试，完整 55 项通过。
- [x] `web/tests/e2e/relay-session.spec.ts`：增加 signer 心跳周期和仅传输错误可重试的边界测试。
- [x] `docs/2026-08-01-local-startup-and-relay-guide.md`：补充 signer 心跳、公网五分钟验收和断线排查步骤。
- [ ] `docs/2026-08-08-web-remote-signer-stability-fix.md`：记录自动化、真实公网验收、部署号和 commit。

## 六、确认门

鹿鹿子大王确认本方案后才修改代码。实施完成后运行 Desktop Rust、Pair Relay、Web 类型/规范/E2E 测试，重启 signer sidecar 与 Desktop，部署 Web，完成 signed-off commit。

## 七、实施与验证结果

- Desktop Remote Signer 定向测试 7 项通过；
- Pair/Signer Relay 完整集成测试 55 项通过；
- Web TypeScript、Biome、文件大小与 pubkey 检查通过；
- Web smoke E2E 29 项通过；
- Desktop Clippy 被已存在的 `pairing_ws_task_inner` 八参数警告阻断，本次修改的 Remote Signer 定向编译和测试通过；
- Signer sidecar 已重建并由 LaunchAgent 重启，5000/5001 正常监听；
- Desktop dev 已热重启；运行期 Web 授权随进程重启清除，需要用户重新 Pair 一次；
- Web 生产部署 `1067e1eb` 已发布，`app.achoverse.xyz` 返回 `index-DmdqhIdD.js`；
- 公网 `/signer` 心跳测试持续 176 秒，收到 8 次 `PONG`，稳定跨过原约 125 秒断点；
- 重新 Pair 后的真实账号五分钟验收待用户操作。
