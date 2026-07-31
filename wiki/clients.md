# Buzz 客户端体验

> 更新日期：2026-07-31
> 更新说明：首次定义 Desktop、Mobile、Web 与 CLI 的用户和能力边界。

## Desktop

当前最完整的人类协作客户端。采用 Tauri 2 + React 19 + feature slice：

- 频道、DM、消息、线程、搜索、成员与 presence；
- Agent、persona、team、运行状态和本地 compute；
- project / forge、workflow、forum、canvas、media、huddle；
- community、identity、通知、moderation 与 settings；
- 多栏工作区、sidebar 与辅助面板。

Desktop 的 shared 层包含 UI primitive、layout、theme、API 和通用 hook。业务能力应进入 `features/<feature>`，跨功能复用进入 `shared/`。

## Mobile

Flutter + Riverpod + Hooks 客户端，以平台原生导航和触控为先。目前 feature 包括：

- home、channels、activity、search、forum、pulse；
- invite、pairing、profile、settings。

状态和主题由 `shared/` 提供。Mobile 与 Desktop 对齐身份、颜色、排版和业务语义，但不复制多栏交互。

## Web

由 relay 服务的浏览器界面，主要面向 repository browser 等 Web 合适场景。它不是 Desktop 的完整替代品，能力边界应以 `web/` 当前路由与实现验证。

## CLI

`buzz` 是 Agent-first 客户端：

- JSON 输入/输出稳定；
- 读操作返回去签名 JSON；
- 写操作返回 event 接收结果；
- 全局 `--format compact` 放在 subcommand 之前；
- agent-facing 新操作优先加入 `buzz-cli`。

CLI 不是后台调试杂物箱，它是 Agent 可组合、可审计地操作 Buzz 的正式产品面。

## 跨客户端一致性

必须一致：

- community、identity、channel、thread、event、permission 的语义；
- kind 与 tag 约定；
- 成功/失败、离线、权限不足等结果含义；
- 人与 Agent 的身份和审计模型。

允许平台化：

- 导航层级；
- panel 与 page/sheet 的映射；
- hover、keyboard 与 touch 手势；
- 信息密度；
- 本地通知与系统集成。

## 相关页面

- [客户端 UI 设计规范](../docs/2026-07-31-buzz-client-ui-design-standard.md)
- [核心概念](concepts.md)
- [关键流程](flows.md)

## 证据入口

- `desktop/README.md`
- `desktop/src/app/`
- `desktop/src/shared/`
- `desktop/src/features/`
- `mobile/README.md`
- `mobile/lib/app.dart`
- `mobile/lib/shared/`
- `mobile/lib/features/`
- `web/`
- `crates/buzz-cli/README.md`
- `crates/buzz-cli/TESTING.md`
