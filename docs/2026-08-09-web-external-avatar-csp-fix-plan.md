# Buzz Web 外部 Agent 头像加载修复方案

> 更新日期：2026-08-09
>
> 更新说明：定位并规划修复 Buzz Web 无法展示阿里云 OSS Agent 头像的问题；采用精确域名白名单，不扩大 Web 的通用外部图片权限。

## 一、用户体验目标

Agent 在 Desktop 中把头像设置为公网 URL 后，Web 的 DM、Channel、Inbox、成员列表和个人资料区域应显示同一张头像；如果图片确实不可用，则继续显示 Agent 专属颜色和名称首字母，不能出现破图或空白头像。

当前示例头像为：

`https://xianghuzuoyongli.oss-cn-beijing.aliyuncs.com/buzz-avatar/HR.png`

同一批头像预计都来自以下固定源：

`https://xianghuzuoyongli.oss-cn-beijing.aliyuncs.com`

## 二、问题结论

Web 已正确读取 Nostr kind `0` profile 的 `picture` 字段，头像组件也会把该值交给浏览器加载。失败发生在浏览器安全层：Cloudflare Pages 当前返回的 Content Security Policy 仅允许本站、`data:` 和 `blob:` 图片：

```text
img-src 'self' data: blob:
```

因此，阿里云 OSS 图片会在进入头像组件之前被浏览器 CSP 拦截。组件收到加载失败后回退到首字母头像，所以界面看起来像没有读取 URL。

示例图片当前响应为 `200 OK` 和 `Content-Type: image/png`，公网可访问；同时带有 `Content-Disposition: attachment` 与 `x-oss-force-download: true`。CSP 是确定的首要阻塞项，OSS 的强制下载元数据也应取消，以避免浏览器和缓存链路出现兼容性差异。

## 三、修复设计

### 3.1 精确放行头像源

把 Web 图片策略调整为：

```text
img-src 'self' data: blob: https://xianghuzuoyongli.oss-cn-beijing.aliyuncs.com;
```

不使用宽泛的 `https:` 或 `*`，避免任意第三方图片源扩大隐私泄露、追踪和内容注入面。后续新增正式头像存储域名时，应通过评审加入明确白名单。

### 3.2 保持统一回退行为

现有 `ProfileAvatar` 的真实图片优先、加载失败后显示 initials 的逻辑保持不变。此次不针对不同页面分别处理 URL，避免 DM、Channel、Inbox 等页面行为漂移。

### 3.3 OSS 对象元数据建议

在阿里云 OSS 管理端删除对象的强制下载配置，或把 `Content-Disposition` 改为 `inline`。这属于存储侧配置，不在 Buzz 仓库代码提交范围内。

头像原图当前约 3.1 MB。建议生成 256×256 或 512×512 的 Web 版本并压缩到约 100–300 KB，减少侧边栏和消息时间线并发加载时的等待与流量。

## 四、验收标准

- 线上 `https://app.achoverse.xyz` 返回的 CSP 精确包含阿里云 OSS 头像源。
- 示例 OSS 头像能在 Web 的统一头像组件中加载，不触发 initials fallback。
- 不在白名单中的外部图片源仍被 CSP 拒绝。
- 图片 404、网络失败或格式错误时，Agent 仍显示 primary 色首字母头像。
- DM、Channel、Inbox、成员列表和当前用户卡片继续消费同一个头像组件，无页面级例外。
- Web 构建、单元/E2E smoke 测试通过，部署后再次检查真实响应头。

## 五、Todo

- [ ] `web/public/_headers`：在 `img-src` 中精确加入 `https://xianghuzuoyongli.oss-cn-beijing.aliyuncs.com`，保持其余 CSP 不变。
- [ ] `web/tests/e2e/pwa-shell.spec.ts`：增加生产安全头契约测试，断言 OSS 头像源被允许且没有放开通配外部图片。
- [ ] `docs/2026-08-09-web-external-avatar-csp-fix-plan.md`：实现后记录测试结果、提交号、Cloudflare 部署号和线上响应头验收结果。

## 六、非代码操作

- 在阿里云 OSS 中取消 `buzz-avatar/` 对象的强制下载元数据。
- 将头像源文件生成适合 Web 列表展示的压缩版本。
- 部署 Cloudflare Pages 后清理或等待边缘缓存更新，并用线上地址做真实账号验收。

