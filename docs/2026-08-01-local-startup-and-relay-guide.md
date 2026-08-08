> 更新日期：2026-08-08
> 更新说明：在 Desktop dev 启动说明基础上，增加 Web/PWA 本地开发、Pair/Remote Signer、Cloudflare Tunnel 公网入口、Cloudflare Pages 线上部署、版本验证和排障流程；补充配对后真实工作数据加载、完整 E2E 矩阵和 signer 离线恢复说明。

# Buzz 本地启动与 Web 部署指南

## 一、用户入口与系统边界

Buzz Web 是部署在 Cloudflare Pages 的静态 PWA，任意网络下通过以下地址访问：

```text
https://app.achoverse.xyz/app/channels
```

Web 界面不直接获取用户私钥。首次使用时，用户在 Desktop 生成 Web Pair Link，然后在 Web 的 Pair 页面完成 SAS 校验。配对完成后：

- Web 保存本设备可撤销的 device key 和 Remote Signer 连接信息；
- Desktop 保留 user key，并只为已授权的 Web 设备执行白名单签名；
- Relay 负责数据与实时事件；
- Web 使用同一 User Pubkey 完成 Relay NIP-42 AUTH，读取 Channels、消息、Calendar、Tasks、Tracks 和 Agent Activity；
- Pair 和 Remote Signer 使用独立的短时/单播通道，不把私钥发到 Pages 或 Relay 数据库。

## 二、当前运行配置

| 对象 | 地址 | 说明 |
| --- | --- | --- |
| Relay 对外 WebSocket | `wss://achoverse.xyz` | Desktop、Agent 和 CLI 使用的统一 Relay 地址 |
| Relay 对外 HTTP | `https://achoverse.xyz` | `/health`、`/query`、`/events` 等 HTTP 接口的基础地址 |
| Relay 本机监听 | `0.0.0.0:3200` | `.env` 中的 `BUZZ_BIND_ADDR`；由反向代理映射到对外域名 |
| Desktop Relay | `wss://achoverse.xyz` | 当前 workspace/community 连接地址 |
| Agent Relay | `wss://achoverse.xyz` | 托管 Agent 自动继承当前 Desktop workspace Relay |
| Web/PWA 公网入口 | `https://app.achoverse.xyz` | Cloudflare Pages 自定义域名 |
| Web 工作台 | `https://app.achoverse.xyz/app/channels` | iPad/Mac 浏览器和主屏幕 PWA 入口 |
| Web Pair 页 | `https://app.achoverse.xyz/app/pair` | 输入 Desktop Pair Link 并校验 SAS |
| Pair WebSocket | `wss://achoverse.xyz/pair` | 对应本机 `127.0.0.1:5000`，仅承载 kind 24134 |
| Remote Signer WebSocket | `wss://achoverse.xyz/signer` | 对应本机 `127.0.0.1:5001`，仅承载 kind 24133 |
| Cloudflare Pages 项目 | `achoverse-app` | 当前使用 `dev` 作为生产部署分支 |

关键规则：Desktop 和 Agent 使用同一个 Relay。Agent 不再使用独立、固定的旧 Relay 地址；Desktop 启动 Agent 时会把当前 workspace Relay 作为 `BUZZ_RELAY_URL` 注入 Agent 进程。

## 三、首次准备

在仓库根目录执行：

```bash
cd /Users/lu/buzz
. ./bin/activate-hermit
just setup
```

`just setup` 用于安装依赖、启动 Postgres/Redis 等本地服务并执行数据库迁移。日常重启不需要重复执行，除非依赖、容器或数据库环境发生变化。

当前根目录 `.env` 应包含以下非密钥配置：

```dotenv
BUZZ_BIND_ADDR=0.0.0.0:3200
RELAY_URL=wss://achoverse.xyz
BUZZ_MEDIA_BASE_URL=https://achoverse.xyz/media
```

不要把 `.env` 中的私钥、数据库密码或对象存储密钥复制进文档或提交到 Git。

Web 依赖从 workspace 根目录统一安装：

```bash
cd /Users/lu/buzz
. ./bin/activate-hermit
pnpm install
```

Cloudflare 首次部署需要完成账号授权：

```bash
npx --yes wrangler login
```

## 四、推荐本地启动方法

使用两个终端分别启动 Relay 和 Desktop，便于单独观察日志和重启。

### 4.1 终端一：启动 Relay

```bash
cd /Users/lu/buzz
. ./bin/activate-hermit
just relay-release
```

该命令使用根目录 `.env`，本机监听端口为 `3200`。Relay 启动后，对外仍通过以下地址访问：

```text
wss://achoverse.xyz
```

### 4.2 终端二：启动 Desktop

```bash
cd /Users/lu/buzz
. ./bin/activate-hermit
BUZZ_RELAY_URL=wss://achoverse.xyz \
BUZZ_DEV_INSTANCE_SLUG=dev \
just desktop-standalone
```

其中：

- `BUZZ_RELAY_URL=wss://achoverse.xyz` 明确指定 Desktop 默认 Relay。
- `BUZZ_DEV_INSTANCE_SLUG=dev` 复用 `xyz.block.buzz.app.dev.dev` 的本地数据和 Keychain 身份，避免误开到另一个开发实例。
- `desktop-standalone` 只启动 Desktop，不会再启动一个本地 Relay。

Desktop 内已经保存的 community 地址具有 workspace override 优先级。如果界面仍连接旧地址，应在 community 设置中切换到 `wss://achoverse.xyz`；当前 workspace 地址也会成为 Agent 的实际 Relay 地址。

### 4.3 Agent 启动方式

托管 Agent 由 Desktop 自动启动，不需要再开第三个终端，也不需要单独执行 Agent 命令。

Agent 的有效地址解析规则是：

```text
当前 Desktop workspace Relay → Agent BUZZ_RELAY_URL
```

因此当前正确结果为：

```text
Desktop Relay: wss://achoverse.xyz
Agent Relay:   wss://achoverse.xyz
```

如果切换 community，Agent 也应随当前 workspace 使用新 Relay。Agent 记录中历史遗留的单独 Relay 值不会覆盖当前 workspace Relay。

### 4.4 Pair 与 Remote Signer 服务

`buzz-pair-relay` 同一进程使用隔离的端口提供两种通道：

```bash
cd /Users/lu/buzz
. ./bin/activate-hermit
cargo run -p buzz-pair-relay
```

默认监听：

```text
127.0.0.1:5000  Pair（kind 24134）
127.0.0.1:5001  Remote Signer（kind 24133）
```

当前 Mac 已配置 LaunchAgent，日常可用以下命令检查或重启：

```bash
launchctl list | rg 'xyz.achoverse.buzz-pair-relay'
launchctl kickstart -k "gui/$(id -u)/xyz.achoverse.buzz-pair-relay"
```

### 4.5 Cloudflare Tunnel

`achoverse.xyz` 的 Relay、Pair 和 Signer 通过本机 Cloudflare Tunnel 进入公网。`/Users/lu/.cloudflared/config.yml` 应保持以下 ingress 顺序：

```yaml
ingress:
  - hostname: achoverse.xyz
    path: ^/pair(?:/.*)?$
    service: http://127.0.0.1:5000
  - hostname: achoverse.xyz
    path: ^/signer(?:/.*)?$
    service: http://127.0.0.1:5001
  - hostname: achoverse.xyz
    service: http://127.0.0.1:3200
  - service: http_status:404
```

路由顺序不能颠倒：`/pair` 和 `/signer` 必须在主 Relay 的通配规则之前。验证和重启：

```bash
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://achoverse.xyz/pair
cloudflared tunnel ingress rule https://achoverse.xyz/signer
launchctl kickstart -k "gui/$(id -u)/com.cloudflare.cloudflared"
```

### 4.6 终端三：启动 Web 本地开发

```bash
cd /Users/lu/buzz
. ./bin/activate-hermit
cd web
pnpm dev --host 0.0.0.0
```

Vite 默认本地入口为：

```text
http://localhost:5173/app/channels
http://localhost:5173/app/pair
```

`localhost` 可作为安全上下文调试 Service Worker。若从同一局域网的 iPad 直接访问 Mac IP，普通 HTTP 不等同于生产 HTTPS，PWA 安装和某些 Web Crypto 能力可能受限。iPad 端完整验收应优先使用 `https://app.achoverse.xyz`。

## 五、启动后的检查

### 5.1 检查对外 Relay

```bash
curl --fail --silent --show-error https://achoverse.xyz/health
```

请求成功并返回健康状态，说明 HTTPS 入口和 Relay 服务可达。

### 5.2 检查本机 Relay 端口

```bash
lsof -nP -iTCP:3200 -sTCP:LISTEN
```

应看到 `buzz-relay` 正在监听 `3200`。

### 5.3 检查 Desktop 与 Agent

```bash
ps aux | rg 'buzz-desktop|buzz-acp' | rg -v 'rg '
```

应看到：

- `buzz-desktop`：Desktop 主进程；
- `buzz-acp`：Desktop 启动的托管 Agent harness。

Agent 日志中应出现连接 `wss://achoverse.xyz`、解析 owner、订阅频道和 presence online 等信息。若 Agent 全部报错，优先核对 Desktop 当前 community 地址，而不是单独修改 Agent 的 Relay。

### 5.4 检查 Pair、Signer 和 Tunnel

```bash
lsof -nP -iTCP:5000 -sTCP:LISTEN
lsof -nP -iTCP:5001 -sTCP:LISTEN
launchctl list | rg 'xyz.achoverse.buzz-pair-relay|com.cloudflare.cloudflared'
```

对 `/pair` 或 `/signer` 执行普通 HTTP `curl` 时返回 `400` 是预期行为，因为这两个入口只接受 WebSocket 升级；`502` 或超时才表示 Tunnel 或本机端口异常。

### 5.5 检查 Web 本地版

```bash
curl --fail --silent --show-error http://localhost:5173/app/channels
```

浏览器内还应检查：

- `/app/channels` 能进入 Desktop 风格的 Web shell；
- `/app/pair` 能输入新生成的 `nostrpair://` 链接；
- Desktop 和 Web 显示的 SAS 六位码必须一致；
- 每次重试都必须在 Desktop 生成新 Pair Link，不复用旧的一次性 secret。

## 六、部署 Web/PWA 到 Cloudflare Pages

### 6.1 部署前质量门禁

```bash
cd /Users/lu/buzz/web
. ../bin/activate-hermit
pnpm typecheck
pnpm check
pnpm test:e2e:smoke
```

`test:e2e:smoke` 会先生成 E2E 专用 `web/dist`，并验证 PWA shell、iPad 布局、Pair 入口、NIP-AB SAS 互操向量、NIP-46 返回值防篡改、Relay 查询约束、领域事件解析和五个工作台入口。正式部署前再执行一次 `pnpm build`，确保测试 fixture 不进入生产产物。任一命令失败都不应继续部署。

完整 iPad 横屏、竖屏矩阵使用：

```bash
pnpm test:e2e
pnpm build
```

### 6.2 发布生产版

```bash
cd /Users/lu/buzz/web
npx --yes wrangler pages deploy dist \
  --project-name achoverse-app \
  --branch dev \
  --commit-dirty=true
```

成功后 Wrangler 会返回一个不变的单次部署地址，例如：

```text
https://<deployment-id>.achoverse-app.pages.dev
```

该地址用于确认本次产物；用户长期入口仍是：

```text
https://app.achoverse.xyz
```

`app.achoverse.xyz` 是 Pages 项目的自定义域名，与指向本机 Tunnel 的 `achoverse.xyz` 分属两条路由，不要把两者配成同一个 DNS 目标。

### 6.3 验证线上版本

```bash
curl --fail --silent --show-error \
  https://app.achoverse.xyz/app/channels

curl --fail --silent --show-error \
  https://app.achoverse.xyz/app/pair
```

若需要确认自定义域名已切换到新产物，可对比 HTML 中的 hashed JS 文件名：

```bash
curl --fail --silent --show-error \
  https://<deployment-id>.achoverse-app.pages.dev/app/pair \
  | rg -o 'index-[A-Za-z0-9_-]+\.js'

curl --fail --silent --show-error \
  'https://app.achoverse.xyz/app/pair?deploy=<deployment-id>' \
  | rg -o 'index-[A-Za-z0-9_-]+\.js'
```

两者文件名一致，说明自定义域名已获取新版本。查询参数只用于绕过边缘 HTML 缓存，不参与业务逻辑。

### 6.4 PWA 更新注意事项

如果 iPad 主屏幕上仍显示旧页面：

1. 先在 Safari 直接打开 `https://app.achoverse.xyz/app/pair` 确认线上版本；
2. 完全退出主屏幕 PWA 后重新打开；
3. 仍未更新时，删除主屏幕图标，在 Safari 刷新后重新“添加到主屏幕”；
4. 重新配对时使用 Desktop 新生成的 Pair Link。

## 七、停止与重启

- Relay 终端按 `Ctrl+C` 停止 Relay。
- Desktop 终端按 `Ctrl+C` 或正常退出应用，Desktop 会清理该实例启动的 Agent 进程。
- Web Vite 终端按 `Ctrl+C` 只停止本地开发页，不影响 Cloudflare Pages 线上版。
- Pair/Signer 和 Tunnel 由 LaunchAgent 管理时，不要同时再手工启动第二个相同端口进程。
- 重启时按“Relay → Desktop”的顺序操作，避免 Desktop 和 Agent 在 Relay 尚未就绪时产生连接错误。

## 八、常见问题

| 现象 | 优先检查 |
| --- | --- |
| `app.achoverse.xyz` 打不开 | Cloudflare Pages 自定义域名状态和 DNS，不是本机 3200 端口 |
| Web 能打开但 Relay 数据失败 | `https://achoverse.xyz/health`、3200 端口和 cloudflared |
| Web `/query` 显示 `Load failed` | `.env` 的 `BUZZ_CORS_ORIGINS` 必须同时包含 `https://app.achoverse.xyz`；OPTIONS 响应必须返回对应 `Access-Control-Allow-Origin` |
| Pair Link 连接失败 | 5000 端口、`/pair` ingress、Pair Link 是否过期 |
| SAS 两边不一致 | 立即拒绝，确认 Web 是最新版，重新生成 Pair Link；不得绕过 SAS |
| SAS 一致但 signer 超时 | 5001 端口、`/signer` ingress、Desktop 是否仍在运行 |
| Pair 成功但页面没有数据 | 先刷新 `/app/channels`；确认 Desktop signer 在线、`VITE_RELAY_URL=wss://achoverse.xyz`，再检查 Relay AUTH 和浏览器控制台；不要重新导入 user nsec |
| 重启 Desktop 后 Web 提示 signer 离线 | 当前授权由 Desktop 进程持有；重新打开 Desktop，若授权记录已失效则生成新的 Web Pair Link 重新配对 |
| Pages 单次地址是新版，自定义域名是旧版 | 对比 hashed asset，等待边缘更新或使用查询参数再验证 |
| Wrangler 提示未登录 | 执行 `npx --yes wrangler login` 重新授权 |

## 九、Todolist

- [x] `docs/2026-08-01-local-startup-and-relay-guide.md`：统一记录 Relay、Desktop、Agent、Web/PWA、Pair/Signer、Tunnel 和 Cloudflare Pages 的本地/线上运行方式。
