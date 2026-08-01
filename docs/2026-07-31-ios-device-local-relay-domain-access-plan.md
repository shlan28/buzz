# 更新日期：2026-08-01

## 更新说明

将本机 Buzz Relay 的目标监听端口从 `3000` 调整为 `3200`。公网继续使用标准
HTTPS/WSS 地址，不在 `achoverse.xyz` 后暴露 `:3200`。Relay 与 Desktop
保持双终端独立启动，Relay 使用 `just relay-release`，Desktop 使用显式稳定
实例 `BUZZ_DEV_INSTANCE_SLUG=dev` 并连接 `wss://achoverse.xyz`。保留原有
Cloudflare Tunnel、社区 Host 原地迁移、Mobile 配对和安全设计。

本方案不把 Buzz 数据迁移到云服务器，而是使用 Cloudflare Tunnel 将公网
HTTPS/WSS 流量安全地转发到本机 `http://127.0.0.1:3200`，并将现有 Buzz
社区的 Host 从 `localhost:3000` 原地迁移为 `achoverse.xyz`。

本文最初是部署方案；2026-08-01 已按方案完成 DNS、Tunnel、数据库 Host 与
Relay 配置，实际执行结果见文末。未修改 Buzz 产品代码。

## 目标

用户在 iPhone 真机上的 Buzz Mobile 中加入并使用当前 Mac 上已经存在的
Buzz 社区、频道和消息：

```text
Buzz Mobile（iPhone 真机）
  -> HTTPS / WSS
achoverse.xyz（Cloudflare 边缘 TLS）
  -> Cloudflare Tunnel
cloudflared（当前 Mac）
  -> HTTP / WS
127.0.0.1:3200（当前 Mac 上的 Buzz Relay 目标端口）
  -> PostgreSQL / Redis / MinIO（当前本地数据）
```

最终统一使用以下公开地址：

| 用途 | 地址 |
| --- | --- |
| 用户看到的 Relay 地址 | `https://achoverse.xyz` |
| Nostr WebSocket 地址 | `wss://achoverse.xyz` |
| 媒体基础地址 | `https://achoverse.xyz/media` |
| Tunnel 本地源站 | `http://127.0.0.1:3200` |

Mobile 内部会把保存的 `https://achoverse.xyz` 转换为
`wss://achoverse.xyz` 建立 WebSocket。

## 产品行为

完成后，Desktop 和 Mobile 访问的是同一个社区，而不是两个数据相互隔离的
新社区：

- Desktop 中现有频道、成员、消息和 Git 仓库继续保留。
- iPhone 通过邀请或设备配对获得该社区的身份密钥。
- Mobile 使用 NIP-42 对 Relay challenge 签名。
- Relay 根据请求 Host `achoverse.xyz` 解析当前社区。
- 消息通过 WebSocket 实时同步，历史消息通过同一 Relay 查询。
- 媒体上传和读取通过 `https://achoverse.xyz/media` 完成。

该方案的可用性依赖当前 Mac：

- Mac 必须开机且能访问互联网。
- Buzz Relay、PostgreSQL、Redis、MinIO 和 `cloudflared` 必须运行。
- Relay 与 Desktop 使用两个独立终端启动；关闭 Desktop 不应连带停止 Relay。
- Mac 休眠、断网或 Tunnel 停止时，iPhone 将暂时无法连接。

因此它适合个人使用、演示和阶段性远程访问；如果需要 7×24 小时稳定服务，
后续应把整套 Buzz 服务迁移到 VPS 或其他持续在线的主机。

## 已确认的当前状态

2026-07-31 本机检查结果：

- 上一次检查时 Buzz Relay 仍监听 `0.0.0.0:3000`；本方案实施后改为
  `0.0.0.0:3200`。
- 切换后应由 `http://127.0.0.1:3200/` 返回 NIP-11 `200 OK`。
- 当前 Relay 对外身份仍是本地开发地址。
- 当前推荐启动方式是 `just relay-release` 与
  `BUZZ_DEV_INSTANCE_SLUG=dev just desktop-standalone` 分开运行。
- `desktop-standalone` 不启动 Relay、数据库、Docker 或 migrations，也不依赖
  Relay 的 `.env` 来决定 Desktop 默认连接地址。
- Mobile 只有在安全存储中存在合法社区和 `nsec` 后才会建立 WebSocket；
  `BUZZ_RELAY_URL` 的默认值不会自动创建登录身份。

## 关键约束

### 1. 域名是社区边界

Buzz 使用请求 Host 选择社区：

```text
resolve_host(connection.host) -> community_id
```

数据库中的 `communities.host` 有唯一约束，一个社区目前只有一个 Host，不能让
同一个社区同时拥有下面两个入口：

```text
localhost:3000
achoverse.xyz
```

因此必须把当前已有数据的社区原地改为 `achoverse.xyz`。不能简单插入一条新的
`achoverse.xyz` 社区记录；那会创建一个没有现有频道和消息的新社区。

迁移完成后，Desktop 也应改用 `wss://achoverse.xyz`。继续用
`ws://localhost:3000` 将无法解析到原社区。

### 2. NIP-42 地址必须一致

以下三者必须一致：

```text
Mobile / Desktop: wss://achoverse.xyz
Relay RELAY_URL:  wss://achoverse.xyz
社区 Host:        achoverse.xyz
```

若 Host、scheme 或端口不一致，Mobile 虽然可能建立 TCP/WebSocket 连接，
但 NIP-42 AUTH 事件中的 `relay` 标签会被 Relay 拒绝。

### 3. DNS 不等于转发

DNS 只能把名称解析到目标，不能单独把公网请求转发到处于 NAT 后面的 Mac。
本方案使用 Cloudflare Tunnel，由 Mac 主动建立出站隧道，因此不需要：

- 公网固定 IP；
- 路由器端口映射；
- 把本机 `3200` 端口直接暴露到公网；
- 在 Mac 上自行维护公网 TLS 证书。

Cloudflare Tunnel 支持 WebSocket，适合 Buzz 的 Nostr 连接。

### 4. Relay 与 Desktop 生命周期分离

公网 Mobile 连接不能依赖 `just dev` 托管 Relay。`just dev` 会自行启动 Relay，
并在 Desktop 退出时清理它；如果 `3200` 端口已经存在 Relay，它还会拒绝启动，
以避免连接陈旧实例。

本方案固定使用：

```text
终端 1：just relay-release
终端 2：BUZZ_DEV_INSTANCE_SLUG=dev \
        BUZZ_RELAY_URL=wss://achoverse.xyz \
        just desktop-standalone
终端 3：cloudflared tunnel run buzz-local
```

这使 Relay、Desktop 和 Tunnel 的生命周期相互独立。即使 Desktop 关闭，只要
Relay、基础服务和 Tunnel 仍运行，iPhone 仍可连接。

### 5. Desktop 必须复用稳定实例

`BUZZ_DEV_INSTANCE_SLUG=dev` 会稳定复用：

```text
Tauri identifier: xyz.block.buzz.app.dev.dev
Keychain service: buzz-desktop-dev.dev
```

该参数不能在迁移期间忽略。若使用 canonical 实例、worktree 自动实例或另一个
slug，Desktop 可能打开不同的数据目录和 Keychain，表现为身份、社区或本地状态
“丢失”，但实际上只是进入了另一个 Desktop 实例。

`desktop-standalone` 默认仍会把 `BUZZ_RELAY_URL` 设为
`ws://localhost:3000`，除非启动命令显式提供其他值。活跃社区虽然可以在运行时
覆盖默认 Relay，但本方案仍要求显式传入 `wss://achoverse.xyz`，确保首次初始化、
社区恢复和 Agent sidecar 使用一致地址。

## 域名选择

本方案按用户指定使用根域名：

```text
achoverse.xyz
```

但从长期维护看，更推荐：

```text
buzz.achoverse.xyz
```

根域名只能承载一套路由。如果 `achoverse.xyz` 已有官网、邮件跳转或其他服务，
把它指向 Buzz Tunnel 会产生冲突。子域名可让官网与 Buzz 独立部署，也能降低
以后迁移的影响。

在正式实施前必须确认：

1. `achoverse.xyz` 的权威 DNS 是否由 Cloudflare 管理。
2. 根域名当前是否已有 A、AAAA、CNAME 或 Web 服务。
3. 是否接受根域名以后直接打开时由 Buzz Relay 响应。

如果任一项存在冲突，应把本文所有 `achoverse.xyz` 替换为
`buzz.achoverse.xyz`。

## 实施方案

### 阶段一：备份与迁移前检查

激活项目工具环境并确认当前服务：

```bash
cd /Users/lu/buzz
. ./bin/activate-hermit
curl -fsS -H 'Accept: application/nostr+json' \
  http://127.0.0.1:3200/
lsof -nP -iTCP:3200 -sTCP:LISTEN
```

检查当前社区，记录社区 ID 和 Host：

```bash
docker exec -i -e PGPASSWORD=buzz_dev buzz-postgres \
  psql -U buzz -d buzz -v ON_ERROR_STOP=1 \
  -c "SELECT id, host, archived_at FROM communities ORDER BY created_at;"
```

检查现有数据属于哪个社区：

```bash
docker exec -i -e PGPASSWORD=buzz_dev buzz-postgres \
  psql -U buzz -d buzz -v ON_ERROR_STOP=1 \
  -c "SELECT c.id, c.host, count(ch.id) AS channel_count
      FROM communities c
      LEFT JOIN channels ch ON ch.community_id = c.id
      GROUP BY c.id, c.host
      ORDER BY channel_count DESC;"
```

在任何数据库变更前创建备份：

```bash
mkdir -p /Users/lu/buzz/backups
docker exec -i -e PGPASSWORD=buzz_dev buzz-postgres \
  pg_dump -U buzz -d buzz -Fc \
  > /Users/lu/buzz/backups/buzz-before-achoverse-domain.dump
```

验收标准：

- 明确且只选中一个“当前正在使用”的社区 ID。
- 备份文件非空。
- 记录原 Host；尚未迁移时可能是 `localhost:3000`，已先切换本地端口时可能是
  `localhost:3200`。
- 确认现有 Desktop 数据位于 `xyz.block.buzz.app.dev.dev`，Keychain service
  为 `buzz-desktop-dev.dev`。
- 停止现有 `just dev` 或其他占用 `3200` 的旧 Relay，避免切换时连接错误实例。

### 阶段二：建立 Cloudflare Tunnel

前提：`achoverse.xyz` 已加入 Cloudflare，Mac 已安装 `cloudflared`。

登录并创建命名 Tunnel：

```bash
cloudflared tunnel login
cloudflared tunnel create buzz-local
cloudflared tunnel list
```

创建 Mac 本地的 Cloudflare 配置文件。该文件不进入 Buzz 仓库，凭据 JSON
也不能提交到 Git：

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/lu/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: achoverse.xyz
    service: http://127.0.0.1:3200
  - service: http_status:404
```

建议路径：

```text
/Users/lu/.cloudflared/config.yml
```

验证规则并创建 DNS route：

```bash
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://achoverse.xyz
cloudflared tunnel route dns buzz-local achoverse.xyz
```

如果根域名已有冲突记录，停止实施，不要覆盖；改用
`buzz.achoverse.xyz` 后重新生成方案中的配置。

此时可以先运行 Tunnel：

```bash
cloudflared tunnel run buzz-local
```

在社区 Host 尚未迁移前，公网 WebSocket 返回未映射或认证失败是预期现象。

### 阶段三：迁移现有社区 Host

这是整个方案中影响最大的一步。执行前先停止 Desktop 和 Relay 的写入，避免
切换窗口内继续产生本地 Host 流量。

先检查目标 Host 没有被其他社区占用：

```sql
SELECT id, host
FROM communities
WHERE lower(host) IN ('localhost:3000', 'localhost:3200', 'achoverse.xyz');
```

使用阶段一确认的社区 ID，在事务中原地更新：

```sql
BEGIN;

UPDATE communities
SET host = 'achoverse.xyz'
WHERE id = '<CURRENT_COMMUNITY_UUID>'
  AND lower(host) IN ('localhost:3000', 'localhost:3200');

SELECT id, host
FROM communities
WHERE id = '<CURRENT_COMMUNITY_UUID>';

COMMIT;
```

执行时必须检查 `UPDATE 1`。若返回 `UPDATE 0` 或多于一行，立即
`ROLLBACK` 并重新确认社区，不能改为无条件更新。

不应执行：

```sql
INSERT INTO communities (host) VALUES ('achoverse.xyz');
```

因为这会产生新的空社区，而不是让手机进入当前社区。

### 阶段四：切换 Relay 公网身份

在本地 `.env` 中将 Relay 的公开身份改为：

```env
BUZZ_BIND_ADDR=0.0.0.0:3200
RELAY_URL=wss://achoverse.xyz
BUZZ_MEDIA_BASE_URL=https://achoverse.xyz/media
BUZZ_MEDIA_SERVER_DOMAIN=achoverse.xyz
BUZZ_CORS_ORIGINS=https://achoverse.xyz
```

`BUZZ_BIND_ADDR` 使用本机 `3200` 端口，`RELAY_URL` 表示客户端和 NIP-42
使用的公开身份，两者不是同一个概念。公网 URL 不应写成
`wss://achoverse.xyz:3200`；TLS 由 Cloudflare 在标准 `443` 端口提供。

必须重启 Relay 才能加载新环境变量。Relay 终端统一使用：

```bash
cd /Users/lu/buzz
. ./bin/activate-hermit
just relay-release
```

不要在此方案中使用 `just dev` 启动 Relay 和 Desktop。重启后确认：

```bash
curl -fsS -H 'Accept: application/nostr+json' \
  https://achoverse.xyz/
```

响应应为 Buzz NIP-11 JSON，且外部访问不需要显式端口。

再验证 WebSocket 握手路径，而不是只验证普通 HTTPS：

```bash
. ./bin/activate-hermit
cargo run -p buzz-cli -- \
  --format compact channels list
```

运行前让 CLI 使用有效身份，并设置：

```bash
export BUZZ_RELAY_URL=wss://achoverse.xyz
```

不要把私钥写入本文、shell history 或仓库文件。

### 阶段五：使用稳定实例切换 Desktop

先使用独立终端启动固定的 Desktop 实例：

```bash
cd /Users/lu/buzz
. ./bin/activate-hermit
BUZZ_DEV_INSTANCE_SLUG=dev \
BUZZ_RELAY_URL=wss://achoverse.xyz \
just desktop-standalone
```

`desktop-standalone` 不会启动 Relay、Docker 或数据库，因此执行该命令前必须确认
阶段四的 Relay 和本地基础服务正在运行。

然后在 Buzz Desktop 的社区设置中，把当前社区地址从：

```text
ws://localhost:3000
```

改为：

```text
wss://achoverse.xyz
```

Desktop 应能看到迁移前完全相同的频道和历史消息。若界面显示空社区，应立即
停止后续 Mobile 配对，检查：

- Desktop 启动命令是否包含 `BUZZ_DEV_INSTANCE_SLUG=dev`；
- Desktop 是否读取 `buzz-desktop-dev.dev` Keychain service；
- Desktop 启动命令是否显式传入
  `BUZZ_RELAY_URL=wss://achoverse.xyz`；
- `communities.host` 是否原地更新了正确社区；
- Tunnel 是否保留公网请求 Host；
- Relay 是否已用新的 `RELAY_URL` 重启；
- Desktop 是否仍缓存旧的本地社区配置。

#### Desktop 系统代理诊断

新的 Desktop 启动流程会自动将 `localhost`、`127.0.0.1` 和 `::1` 合并到
`NO_PROXY`/`no_proxy`，避免本地请求被系统代理截获。`achoverse.xyz` 是公网
地址，默认仍可经过系统代理，这通常是正确行为。

如果 iPhone 可以连接，但 Desktop 访问 `achoverse.xyz` 出现 Relay 日志中完全
不可见的空响应或 `502`，临时绕过系统代理进行对照验证：

```bash
NO_PROXY="${NO_PROXY:+$NO_PROXY,}achoverse.xyz" \
no_proxy="${no_proxy:+$no_proxy,}achoverse.xyz" \
BUZZ_DEV_INSTANCE_SLUG=dev \
BUZZ_RELAY_URL=wss://achoverse.xyz \
just desktop-standalone
```

只有实际证明系统代理破坏 HTTPS/WSS 时，才把 `achoverse.xyz` 固化进个人
`NO_PROXY`；本方案不默认绕过公网代理。

### 阶段六：iPhone 真机加入

不能只给 Mobile 传入 `BUZZ_RELAY_URL`，因为 Mobile 还需要合法的 `nsec`
身份。推荐从已经确认正常的 Desktop 发起：

1. 在 Desktop 中为当前 `achoverse.xyz` 社区生成邀请或设备配对。
2. 在 iPhone 上打开邀请链接或扫描配对二维码。
3. 确认 Mobile 保存的社区地址是 `https://achoverse.xyz` 或
   `wss://achoverse.xyz`，不是 `localhost:3000`。
4. 若 Mobile 之前保存过本地社区，先在 Mobile 中删除旧社区再重新加入。
5. 完成 NIP-42 后检查频道、历史消息、实时消息和媒体。

不建议把已有 Desktop 私钥手工复制到聊天工具或备忘录再传给手机。

### 阶段七：让 Tunnel 随 Mac 启动

手工运行验证通过后，再把 `cloudflared` 安装为 macOS LaunchAgent。具体命令
应以当前安装版本的官方文档为准，执行前确认它读取的是：

```text
/Users/lu/.cloudflared/config.yml
```

安装后执行一次重启验收：

1. 重启 Mac。
2. 确认 PostgreSQL、Redis 和 MinIO 已启动。
3. 在独立终端执行 `just relay-release`。
4. 确认 `cloudflared tunnel info buzz-local` 有健康 connector。
5. 需要 Desktop 时，使用稳定实例的 `desktop-standalone` 命令启动。
6. 关闭 iPhone Wi-Fi，仅使用蜂窝网络发送和接收消息。

## 安全方案

### 必须满足

- 公网只暴露 `https://achoverse.xyz` / `wss://achoverse.xyz`。
- 不暴露 PostgreSQL `5432`、Redis `6379`、MinIO `9000/9001`、metrics 或
  health-only 端口。
- Cloudflare Tunnel 凭据 JSON 和 Relay 私钥不进入 Git。
- 保留 Buzz 自身的 NIP-42 和社区成员权限检查。
- 对公网部署启用 Relay membership 或等效 allowlist。
- Mac 开启磁盘加密和登录保护。

### 不建议启用 Cloudflare Access 登录页

普通 Cloudflare Access 浏览器登录会在 WebSocket 前增加 Cookie/Token
认证，而 Buzz Mobile 不会完成这套浏览器跳转。直接在该 hostname 上启用
Access 可能导致 Mobile 永远无法握手。

本方案让公网流量到达 Buzz Relay，再由 Buzz 的 NIP-42、成员和权限模型完成
认证。如果后续要叠加 Cloudflare Access，需要先验证原生 Mobile 的
service-token 支持，不能直接套用浏览器策略。

## 验收清单

### 网络

- [ ] iPhone 使用蜂窝网络时可以访问 `https://achoverse.xyz/`。
- [ ] 公网证书有效，不出现自签名或明文网络错误。
- [ ] WebSocket 能保持连接，不是只返回 NIP-11 HTTP JSON。
- [ ] Mac 的公网 IP 变化后连接仍然有效。

### 身份与社区

- [ ] `communities.host` 中当前社区为 `achoverse.xyz`。
- [ ] 没有误创建第二个空的 `achoverse.xyz` 社区。
- [ ] Relay 的 `RELAY_URL` 为 `wss://achoverse.xyz`。
- [ ] Desktop 与 Mobile 使用同一公开 Relay URL。
- [ ] Mobile NIP-42 认证成功且进入正确社区。

### 功能

- [ ] Mobile 能看到原有频道和历史消息。
- [ ] Desktop 发消息后 Mobile 实时收到。
- [ ] Mobile 发消息后 Desktop 实时收到。
- [ ] Mobile 可上传并查看图片或文件。
- [ ] App 进入后台再恢复后可以自动重连。
- [ ] Mac 重启后 Relay 与 Tunnel 能恢复。
- [ ] 关闭 Desktop 后，Mobile 仍能通过独立运行的 Relay 与 Tunnel 连接。
- [ ] Desktop 重启后仍使用 `xyz.block.buzz.app.dev.dev` 与
  `buzz-desktop-dev.dev`。

### 安全

- [ ] 路由器没有对公网开放本地 `3200`、`5432`、`6379` 或 `9000`。
- [ ] Tunnel 凭据、Nostr 私钥和数据库密码未提交 Git。
- [ ] 未给 Buzz hostname 配置会阻断原生 WebSocket 的 Access 登录页。
- [ ] 未授权 Nostr 身份不能加入受限社区。

## 故障定位

| 现象 | 优先检查 |
| --- | --- |
| `502 Bad Gateway` | Mac 上 Relay 是否监听 `127.0.0.1:3200`；`cloudflared` 是否能访问源站 |
| HTTPS 正常但 Mobile 一直重连 | Tunnel WebSocket、Mobile 保存的 URL、App 前后台状态 |
| `unknown/unmapped host` | `communities.host` 是否为 `achoverse.xyz` |
| NIP-42 超时 | Relay 是否下发 challenge；Tunnel 是否保持 WebSocket |
| `Auth rejected` | `RELAY_URL`、请求 Host、Mobile AUTH 的 relay tag 是否一致 |
| 登录后频道为空 | 是否误插入新社区，而不是更新原社区 Host |
| 图片仍指向 localhost | `BUZZ_MEDIA_BASE_URL` 是否切换并重启 Relay |
| Desktop 可用、Mobile 不可用 | Mobile 是否仍保存旧社区；是否真正完成邀请/配对并持有 nsec |
| Mobile 可用、Desktop 显示未登录 | 是否遗漏 `BUZZ_DEV_INSTANCE_SLUG=dev`，导致进入其他 Desktop 数据目录或 Keychain |
| Mobile 可用、Desktop 返回空 body 502 | 系统代理是否截获 `achoverse.xyz`；临时加入 `NO_PROXY` 做对照 |
| `just dev` 提示端口已占用 | 这是防止陈旧 Relay 的预期保护；本方案应使用 `desktop-standalone` |
| Mac 休眠后断线 | 关闭自动睡眠或迁移到持续在线主机 |

## 回滚方案

如果公网切换失败：

1. 停止 Mobile 和 Desktop 写入。
2. 停止 `cloudflared` Tunnel。
3. 将 Relay `.env` 恢复为：

   ```env
   BUZZ_BIND_ADDR=0.0.0.0:3200
   RELAY_URL=ws://localhost:3200
   BUZZ_MEDIA_BASE_URL=http://localhost:3200/media
   ```

4. 在事务中把同一社区 Host 改回原值：

   ```sql
   BEGIN;
   UPDATE communities
   SET host = 'localhost:3200'
   WHERE id = '<CURRENT_COMMUNITY_UUID>'
     AND lower(host) = 'achoverse.xyz';
   COMMIT;
   ```

5. 使用 `just relay-release` 重启 Relay。
6. 使用下列稳定实例命令启动 Desktop：

   ```bash
   BUZZ_DEV_INSTANCE_SLUG=dev \
   BUZZ_RELAY_URL=ws://localhost:3200 \
   just desktop-standalone
   ```

7. 把 Desktop 社区切回 `ws://localhost:3200`。
8. 验证原频道和历史消息后再恢复使用。

正常的 Host 原地迁移不会移动或删除频道与消息；数据库备份用于防止操作时选错
社区或发生意外变更。

## 实施顺序

```text
确认根域名没有冲突
  -> 备份数据库并锁定当前 community_id
  -> 创建 Tunnel 和 DNS route
  -> 暂停客户端写入
  -> 原地迁移 communities.host
  -> 修改 Relay 公开 URL
  -> 独立终端执行 just relay-release
  -> 验证 HTTPS + WSS
  -> 稳定 dev 实例执行 desktop-standalone
  -> Desktop 切换到公网域名
  -> iPhone 重新邀请/配对
  -> 蜂窝网络端到端验收
  -> 配置 Tunnel 开机启动
```

## Todolist

- [x] `/Users/lu/.cloudflared/config.yml`：配置 `achoverse.xyz` 到本机 Relay 的 Tunnel ingress。
- [ ] `/Users/lu/.codex/achoverse-dns-change-record.md`：记录根域名原 DNS、Tunnel UUID 和回滚目标，不包含凭据。
- [x] `/Users/lu/buzz/backups/buzz-before-achoverse-domain.dump`：保存社区 Host 迁移前的数据库备份。
- [x] `/Users/lu/buzz/.env`：将 Relay、媒体和 CORS 的公开地址切换到 `achoverse.xyz`。
- [x] `/Users/lu/buzz/docs/2026-07-31-desktop-local-instance-startup-fix.md`：复用已完成的稳定 `dev` 实例与双终端启动流程，不再手写 Tauri JSON。
- [ ] `/Users/lu/.codex/achoverse-community-migration-record.md`：记录迁移前后 Host、community ID 和 SQL 行数，不包含私钥。
- [ ] `/Users/lu/.codex/achoverse-desktop-validation.md`：记录 Desktop 公网连接及历史数据验收结果。
- [ ] `/Users/lu/.codex/achoverse-mobile-validation.md`：记录 iPhone 蜂窝网络、NIP-42、消息和媒体验收结果。

## 2026-08-01 实际执行结果

- Cloudflare Tunnel `buzz-local` 已创建并通过 macOS LaunchAgent 常驻，公网
  `https://achoverse.xyz` 返回 Buzz Relay 的 NIP-11 信息。
- Tunnel 将 `wss://achoverse.xyz/pair` 单独转发到本机配对 Relay 的
  `127.0.0.1:5000`；配对 Relay 通过 macOS LaunchAgent 常驻。
- Relay 监听 `0.0.0.0:3200`；公网仍使用标准 `443`，域名后不需要添加端口。
- 社区 ID `4eb435f3-8ed1-4266-a4bf-fdc4d8e83cc0` 的 Host 已从
  `localhost:3000` 原地更新为 `achoverse.xyz`，没有创建新社区。
- 迁移前数据库备份已保存；迁移后数据库仍有 7 个频道，历史事件保留。
- Relay 成员表包含 1 个 owner 和 7 个 Agent member。原 Desktop 身份通过公网
  能读取原频道，随机非成员身份被 `403 relay_membership_required` 拒绝。
- 现有 Agent 的 Relay 地址已迁移到 `wss://achoverse.xyz`，daily-assistant 已连接
  公网 Relay、订阅频道并上线。
- iPhone 真机已通过 `wss://achoverse.xyz/pair` 完成 Mobile Pairing。消息收发与
  媒体上传仍可继续做完整验收，因此单独的 Mobile 验收记录保留为未完成项。

## 参考

- Buzz 本地环境示例：`.env.example`
- Buzz 多社区 Host 模型：`ARCHITECTURE.md`
- Buzz 生产 Compose 示例：`deploy/compose/.env.example`
- Buzz Mobile Relay 配置：`mobile/lib/shared/relay/relay_provider.dart`
- Buzz Mobile NIP-42 连接：`mobile/lib/shared/relay/relay_socket.dart`
- Desktop 本地实例启动修复：
  `docs/2026-07-31-desktop-local-instance-startup-fix.md`
- Desktop 启动命令：`justfile`
- Desktop 实例与代理环境：`scripts/instance-env.sh`
- Cloudflare Tunnel 本地管理文档：
  `https://developers.cloudflare.com/tunnel/advanced/local-management/create-local-tunnel/`
- Cloudflare Tunnel 路由文档：
  `https://developers.cloudflare.com/tunnel/routing/`
