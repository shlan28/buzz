> 更新日期：2026-08-01
> 更新说明：记录当前 Buzz 本地 Relay、Desktop 和托管 Agent 的统一启动方法及 Relay 地址。

# Buzz 本地启动与 Relay 地址

## 一、当前运行配置

| 对象 | 地址 | 说明 |
| --- | --- | --- |
| Relay 对外 WebSocket | `wss://achoverse.xyz` | Desktop、Agent 和 CLI 使用的统一 Relay 地址 |
| Relay 对外 HTTP | `https://achoverse.xyz` | `/health`、`/query`、`/events` 等 HTTP 接口的基础地址 |
| Relay 本机监听 | `0.0.0.0:3200` | `.env` 中的 `BUZZ_BIND_ADDR`；由反向代理映射到对外域名 |
| Desktop Relay | `wss://achoverse.xyz` | 当前 workspace/community 连接地址 |
| Agent Relay | `wss://achoverse.xyz` | 托管 Agent 自动继承当前 Desktop workspace Relay |

关键规则：Desktop 和 Agent 使用同一个 Relay。Agent 不再使用独立、固定的旧 Relay 地址；Desktop 启动 Agent 时会把当前 workspace Relay 作为 `BUZZ_RELAY_URL` 注入 Agent 进程。

## 二、首次准备

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

## 三、推荐启动方法

使用两个终端分别启动 Relay 和 Desktop，便于单独观察日志和重启。

### 3.1 终端一：启动 Relay

```bash
cd /Users/lu/buzz
. ./bin/activate-hermit
just relay-release
```

该命令使用根目录 `.env`，本机监听端口为 `3200`。Relay 启动后，对外仍通过以下地址访问：

```text
wss://achoverse.xyz
```

### 3.2 终端二：启动 Desktop

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

### 3.3 Agent 启动方式

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

## 四、启动后的检查

### 4.1 检查对外 Relay

```bash
curl --fail --silent --show-error https://achoverse.xyz/health
```

请求成功并返回健康状态，说明 HTTPS 入口和 Relay 服务可达。

### 4.2 检查本机 Relay 端口

```bash
lsof -nP -iTCP:3200 -sTCP:LISTEN
```

应看到 `buzz-relay` 正在监听 `3200`。

### 4.3 检查 Desktop 与 Agent

```bash
ps aux | rg 'buzz-desktop|buzz-acp' | rg -v 'rg '
```

应看到：

- `buzz-desktop`：Desktop 主进程；
- `buzz-acp`：Desktop 启动的托管 Agent harness。

Agent 日志中应出现连接 `wss://achoverse.xyz`、解析 owner、订阅频道和 presence online 等信息。若 Agent 全部报错，优先核对 Desktop 当前 community 地址，而不是单独修改 Agent 的 Relay。

## 五、停止与重启

- Relay 终端按 `Ctrl+C` 停止 Relay。
- Desktop 终端按 `Ctrl+C` 或正常退出应用，Desktop 会清理该实例启动的 Agent 进程。
- 重启时按“Relay → Desktop”的顺序操作，避免 Desktop 和 Agent 在 Relay 尚未就绪时产生连接错误。

## 六、Todolist

- [x] 新增 `docs/2026-08-01-local-startup-and-relay-guide.md`：统一记录 Relay、Desktop 和 Agent 的启动命令、地址与检查方式。
