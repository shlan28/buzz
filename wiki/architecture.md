# Buzz 系统架构

> 更新日期：2026-07-31
> 更新说明：首次形成跨客户端、relay、数据服务和 Agent 的架构综合页。

## 一句话结论

Buzz 是 relay 中心的事件系统：客户端只信任当前 community 的 relay，relay 统一协调认证、事件存储、查询、实时分发和附属服务。

## 逻辑结构

```text
Desktop / Mobile / Web / CLI / ACP
                  |
        WebSocket + narrow HTTP
                  |
              buzz-relay
        /         |         \
  Postgres      Redis      S3/MinIO
 events/FTS   fan-out/      media
 audit/etc.   presence
```

## Relay 的职责

`buzz-relay` 是编排层：

- 先按 host 建立 community 上下文；
- 通过 NIP-42、NIP-98 或受控 token 认证；
- 验证 event id、签名、大小、kind 与权限；
- 把持久 event 写入 Postgres；
- 把 ephemeral / presence / typing 走实时路径；
- 维护 subscription registry 并向连接 fan-out；
- 协调 search、audit、workflow、media、Git、push 与 mesh。

服务 crate 不应相互任意调用。跨子系统协调集中在 relay，降低隐藏耦合。

## 数据职责

- Postgres：event、channel、token、workflow、audit、search document 等持久状态；
- Redis：多节点 pub/sub、presence、typing 与短寿命协调状态；
- S3/MinIO：Blossom 媒体对象；
- 本地客户端存储：主题、草稿、选择与部分缓存，但不能越过 community 边界；
- Nostr event：跨客户端和服务共享的事实协议。

## HTTP 边界

优先使用 WebSocket Nostr event。HTTP 保留给：

- NIP-11 / NIP-05；
- `POST /events`、`POST /query`、`POST /count` 通用桥；
- webhook；
- Blossom 媒体；
- Git smart HTTP；
- policy hook 与健康检查。

新增业务专用 HTTP endpoint 前，先验证能否用 event kind 获得实时 fan-out、NIP-29 scoping 与既有 auth pipeline。

## 多社区原则

共享 Postgres、Redis 或对象存储只是实现细节。所有用户可观察状态必须以 host-derived community 隔离；客户端提供的 `h` tag 不能改变租户。

## 相关页面

- [核心概念](concepts.md)
- [关键流程](flows.md)
- [模块地图](modules.md)
- [部署、运维与发布](operations.md)

## 证据入口

- `ARCHITECTURE.md`
- `crates/buzz-relay/src/lib.rs`
- `crates/buzz-relay/src/router.rs`
- `crates/buzz-relay/src/state.rs`
- `crates/buzz-relay/src/tenant/`
- `crates/buzz-db/`
- `crates/buzz-pubsub/`
- `crates/buzz-media/`
- `migrations/`
