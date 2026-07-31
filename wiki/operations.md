# Buzz 部署、运维与发布

> 更新日期：2026-07-31
> 更新说明：首次总结运行依赖、部署形态、健康与发布路径。

## 运行依赖

核心 relay 通常依赖：

- Postgres：持久状态与 FTS；
- Redis：pub/sub、presence 与 typing；
- S3/MinIO：媒体对象；
- 可选 TLS / reverse proxy；
- 按能力启用 push、mesh、Agent provider 等组件。

## 部署形态

- 本地开发：根目录 Docker Compose + `just dev`；
- 单机/VPS：`deploy/compose/` production bundle；
- Kubernetes：Helm / ArgoCD 相关部署仓库；
- 内部构建与部署由 ecosystem 中其他仓库承担。

部署时必须保证 host 到 community 的映射先于所有数据访问，未知 host fail closed。

## 运维关注点

- WebSocket 连接数、认证失败、slow client 与 heartbeat；
- Postgres migration、event 写入与 query latency；
- Redis fan-out、presence TTL 与多节点 local echo；
- media 容量、校验与对象可用性；
- workflow webhook secret 与运行失败；
- audit chain 完整性；
- community 级隔离与跨租户 trace；
- relay、Desktop、Mobile 与协议 kind 的版本兼容。

## 发布

- Desktop：`release-desktop` 流程，发布打包产物与 updater metadata；
- Relay：`release-relay` 与容器流程；
- Mobile：candidate tag 与平台签名流程；
- 内部 Block 构建使用独立仓库和 `-block` 版本体系。

发布前应以 `RELEASING.md` 的当前命令为准，wiki 只解释路径，不复制全部易漂移参数。

## 故障定位顺序

1. 确认当前 community/host；
2. 确认客户端连接与 NIP-42 auth；
3. 区分 EVENT 被拒绝、REQ 被 gate、历史为空和实时订阅失效；
4. 检查 Postgres / Redis / object store；
5. 验证 kind、`h` tag、成员权限；
6. 对 Agent 再检查频道成员关系、harness 与工具写回。

## 相关页面

- [系统架构](architecture.md)
- [关键流程](flows.md)
- [开发与测试](development.md)

## 证据入口

- `RELEASING.md`
- `deploy/compose/README.md`
- `deploy/charts/buzz/README.md`
- `.env.example`
- `docker-compose.yml`
- `crates/buzz-relay/src/config.rs`
- `crates/buzz-relay/src/metrics.rs`
- `AGENTS.md`
