> 更新日期：2026-08-08
> 更新说明：记录 Web/PWA 真实工作数据版本的自动化、生产构建、Cloudflare Pages 发布结果与尚需真机确认的边界。

# Buzz Web/PWA iPad 控制台验证记录

## 产品结果

配对后的 Web 会恢复本设备 NIP-46 凭据，通过在线 Desktop signer 使用同一 User Pubkey 完成 Relay NIP-42 AUTH，并读取 Channels、消息、Calendar、Tasks、Tracks。工作数据页面保持只读；Agent Activity 当前以 Relay 可见的非 User 消息时间线表达。

线上入口：`https://app.achoverse.xyz/app/channels`

本次 Cloudflare Pages 部署：`https://84845f47.achoverse-app.pages.dev`

## 自动化结果

- `pnpm typecheck`：通过。
- `pnpm check`：通过，包含 Biome、文件大小和 pubkey 显示门禁。
- `pnpm test:e2e`：42 项通过，覆盖 Chromium smoke、iPad 横屏和 iPad 竖屏。
- 追加 Relay/signer 防篡改用例后 `pnpm test:e2e:smoke`：24 项通过。
- `pnpm build`：生产构建通过，产物 `index-CIO-Wm1g.js`。
- Pages 单次地址与 `app.achoverse.xyz`：均返回 `index-CIO-Wm1g.js`。
- `https://achoverse.xyz/health`：返回 `ok`。
- 线上 CSP、nosniff、no-referrer 和 service worker no-store header：已验证。

## 已覆盖测试边界

- NIP-AB 固定 ECDH/SAS 向量；
- NIP-46 签名事件 pubkey、kind、时间、tags、content 和签名完整性；
- Relay 查询必须显式指定 kinds；
- Channel scope、Calendar date/time、Task、Track codec 和最新状态归并；
- 配对缺失、signer/Relay 错误和重试状态；
- 五个工作台入口和只读约束；
- 1180x820、820x1180、600x900 布局无页面级横向溢出；
- manifest、standalone、service worker 不缓存凭据或 nsec。

## 仍需人工确认

- 在已配对的真实浏览器刷新后，确认当前 Relay 内每类业务数据与 Desktop 数量一致；
- iPad Safari 真机“添加到主屏幕”、软键盘和 Split View 手势；
- Desktop 睡眠、重启和授权失效后的重新配对体验；
- Desktop/Web 像素级截图差异门禁尚未完成，本次只完成结构、token 和几何断言。

这些人工项不会改变“配对后读取真实 Relay 数据”的实现，但在宣布 iPad 视觉和恢复体验完全验收前必须补齐。
