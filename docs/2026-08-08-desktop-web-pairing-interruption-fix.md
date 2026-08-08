> 更新日期：2026-08-08
> 更新说明：新增 Desktop 与 Web 在 SAS 匹配后被意外中断的修复方案，聚焦事件监听器异步注册/卸载竞态、配对生命周期所有权和回归测试；真实配对成功后进一步确认主 Relay 的 NIP-42 五秒 AUTH 窗口不足以容纳公网 Remote Signer 往返，只读加载改用同身份 NIP-98 `/query`；补充 Mac signer 长连接中断后的自动重连和运行期授权保持。

> 线上联调补充：NIP-98 `/query` 首次返回 Safari `Load failed`，根因是 Relay CORS 白名单仅包含 `https://achoverse.xyz`，未包含 Pages 域名 `https://app.achoverse.xyz`；运行配置需同时允许两者。

# Desktop Web Pairing 匹配后中断修复方案

## 一、产品问题

用户在 Desktop 与 Web 看到相同六位安全码并确认后，配对没有进入完成状态，而是在凭据传输或 Remote Signer 激活期间中断。

安全码一致说明双方已经确认同一个加密会话，因此不能通过跳过 SAS、延长有效期或降低校验强度解决。修复目标是保证：

- Settings 页面在配对完成前保持对后台会话的正确监听；
- React 组件重渲染、退出 Settings 或监听器异步注册完成，不会重复卸载同一个 Tauri listener；
- 已进入 `transferring` 的会话只由明确失败、超时或用户主动取消结束；
- Desktop 收到 Web 的 `complete` 后稳定显示成功；
- 真正离开未完成配对页面时仍会安全取消，避免后台遗留秘密和连接。

## 二、当前证据与根因

本次运行日志在中断时间点连续出现：

```text
Unhandled rejection TypeError: undefined is not an object
(evaluating 'listeners[eventId].handlerId')
MobilePairingCard.tsx:236, 246, 257, 276
```

`MobilePairingCard` 当前并行调用四个异步 `listen()`。如果组件先进入 cleanup，稍后 resolve 的 listener 会立即执行返回的 unlisten；cleanup 中保存的 listener 也可能再次执行。Tauri WebView 对重复或失效 listener id 的清理会抛出异常。

同一个 cleanup 还会在 `step !== idle/done` 时调用 `cancelPairing()`。因此，当组件在 `sas` 或 `transferring` 阶段因生命周期变化被清理时，后台 NIP-AB 会话可能收到取消，Web 端表现为 SAS 一致后突然中断。

配对成功后的第二个现场错误是 `Desktop did not answer get_public_key`。Desktop Remote Signer 当前只连接 signer Relay 一次；公网隧道、休眠或 Relay 短暂断开后任务直接结束，但 UI 仍保留“已配对”状态。Web 随后可以发出请求，却没有在线的 Mac signer 订阅者应答。

## 三、修复设计

### 3.1 单一 listener 生命周期

- 用一个异步安装函数顺序注册四个 listener；
- 每个 unlisten 只登记一次；
- cleanup 只触发一个幂等释放函数；
- 所有 unlisten Promise rejection 都被显式处理，不能形成未处理异常；
- 安装期间若组件已取消，后返回的 unlisten 立即且仅执行一次。

### 3.2 配对会话所有权

- 区分“组件生命周期结束”和“用户明确取消”；
- `transferring` 阶段不因普通 React cleanup 自动调用 `cancelPairing()`；
- `qr`、`sas` 阶段真正离开页面时仍取消会话；
- `done`、`error`、`expired` 不再发送多余取消；
- 后端现有 generation/cancellation token 继续作为并发会话的最终边界。

### 3.3 测试范围

自动化至少覆盖：

1. listener 注册完成后组件卸载，每个 unlisten 只调用一次；
2. listener 尚未注册完成时组件卸载，延迟返回的 unlisten 只调用一次；
3. `qr`/`sas` 阶段离开会调用 cancel；
4. `transferring` 阶段 React cleanup 不会取消后台完成流程；
5. `done` 阶段不取消；
6. unlisten 抛错不会产生未处理 Promise rejection；
7. Desktop Rust 的 signer ready、Pair complete 和取消 generation 测试继续通过。

### 3.4 Remote Signer 断线恢复

- Remote Signer 的网络连接改为可取消的重连循环；
- Relay 关闭、读写失败或订阅失败后按有上限的退避时间重新连接；
- 一次性 `connect` secret 仍只能使用一次，但已经建立的运行期授权在网络重连后继续有效；
- 首次订阅仍受十秒 ready 超时约束，避免 Desktop 把未真正上线的 signer 显示为配对成功；
- 用户撤销、重新配对或 Desktop 退出时立即停止重连。

## 四、建设性建议

本次先修复可复现的前端生命周期竞态，不把配对授权持久化混入同一个补丁。Desktop 重启后是否保留 Web signer 授权属于独立的设备管理设计，应单独实现持久化授权、撤销和过期策略，否则会扩大私钥签名安全边界。

## 五、验收标准

- 两端 SAS 相同并确认后，Desktop 显示完成，Web 进入 Channels；
- Desktop 控制台不再出现 `listeners[eventId].handlerId` 未处理异常；
- Web 能调用 `connect`、`get_public_key`；
- 退出尚未确认的 Pair 页面仍能中止会话；
- Desktop 前端测试、Tauri pairing/remote signer 测试、格式和类型检查通过。

## 六、Todo List

- [x] `desktop/src/features/settings/lib/pairingListenerLifecycle.ts`：实现幂等 listener 安装、释放和配对阶段取消判定。
- [x] `desktop/src/features/settings/lib/pairingListenerLifecycle.test.mjs`：覆盖延迟注册、重复 cleanup、异常 unlisten 和各阶段取消规则。
- [x] `desktop/src/features/settings/ui/MobilePairingCard.tsx`：接入统一 listener 生命周期，移除四组竞态式注册/卸载代码。
- [x] `desktop/src-tauri/src/commands/remote_signer.rs`：实现保持运行期授权的可取消重连循环，并覆盖退避与授权保持测试。
- [ ] `docs/2026-08-08-desktop-web-pairing-interruption-fix.md`：记录验证结果、提交号与真实配对结果。

## 八、自动化验证结果

- Remote Signer Rust 定向测试：6 项通过；
- Pairing listener 生命周期测试：4 项通过；
- Web TypeScript 类型检查、Biome、文件大小与 pubkey 展示检查通过；
- `git diff --check` 通过；
- 真实公网重新配对和数据加载仍待最终人工操作验收。

## 七、确认门

鹿鹿子大王确认本文后才修改代码。确认后按 Todo 顺序实施，运行相关 Desktop/Tauri 测试，完成一次真实 Web Pair 验证并提交 signed-off commit。
