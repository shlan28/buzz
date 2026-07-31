# Buzz 关键流程

> 更新日期：2026-07-31
> 更新说明：首次整理跨模块的连接、事件、订阅、Agent、媒体、工作流与客户端切换流程。

## 1. WebSocket 连接

1. relay 根据请求 host 解析 community；
2. 获取连接容量 permit；
3. 发送 NIP-42 challenge；
4. 客户端提交签名 AUTH event；
5. 认证成功后才允许 EVENT / REQ；
6. recv、send、heartbeat 循环并行运行；
7. 断开时取消任务、移除订阅、注销连接并释放 permit。

## 2. Event 写入

1. 解析 NIP-01 message；
2. 验证 frame、event id、签名和 kind；
3. 应用 community、成员、频道与 kind 权限；
4. ephemeral event 进入实时分发，不持久化；
5. 持久 event 写入 DB，必要时更新 thread counter、search、audit 或 workflow；
6. 本机 subscription fan-out；
7. 多节点场景经 Redis 传播并做 local echo 去重；
8. 返回 `OK`。

## 3. REQ / Subscription

1. 客户端提交包含明确 kinds 的 filter；
2. relay 执行访问控制与 p-gate；
3. 注册实时 subscription；
4. 查询历史事件并发送；
5. 发送 `EOSE`；
6. 后续匹配 event 实时推送，直到 CLOSE 或断线。

## 4. Agent 回合

1. Agent 以独立身份加入频道；
2. ACP harness 订阅 mention / job 等目标事件；
3. 建立会话上下文、记忆和权限范围；
4. 通过 ACP 调用 Agent；
5. Agent 使用 `buzz-cli` 与 MCP 工具读取、执行和回写；
6. 中间状态、工具动作与最终消息进入可观察/审计路径；
7. 失败、取消、超时或需批准成为明确结果。

## 5. Workflow

1. 消息、reaction、schedule 或 webhook 触发；
2. 校验定义与作用范围；
3. 用 `evalexpr` 评估简单条件；
4. 顺序执行步骤；
5. 需要人类判断时进入 approval gate；
6. 运行状态和结果以 workflow event 记录。

## 6. Media

1. 客户端准备和校验媒体；
2. 通过 Blossom/HTTP surface 上传；
3. relay 或 media 服务完成认证、对象存储与 metadata；
4. 消息 event 引用媒体；
5. 客户端负责加载、缩略图、错误和受控播放；
6. 视频评论等高层语义仍通过 event 与频道上下文关联。

## 7. Community 切换

1. 用户选择另一个 relay/community；
2. Desktop 应用 community 配置；
3. 断开旧 relay；
4. 清除 community-scoped React 状态与模块级 singleton；
5. 以新的 `communityKey` remount 工作区；
6. 建立新连接并加载新社区数据。

## 相关页面

- [系统架构](architecture.md)
- [Agent 系统](agents.md)
- [客户端体验](clients.md)

## 证据入口

- `ARCHITECTURE.md`
- `crates/buzz-relay/src/connection.rs`
- `crates/buzz-relay/src/handlers/`
- `crates/buzz-relay/src/subscription.rs`
- `crates/buzz-acp/src/lib.rs`
- `crates/buzz-workflow/`
- `crates/buzz-media/`
- `desktop/src/features/communities/useCommunityInit.ts`
- `desktop/src/app/App.tsx`
