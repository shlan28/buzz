# Buzz 项目总览

> 更新日期：2026-07-31
> 更新说明：首次从产品定位、当前能力和系统边界总结 Buzz。

## 一句话结论

Buzz 是一个可自托管的协作工作空间：人类与 AI Agent 使用同一种身份、频道和事件模型共同聊天、执行任务、运行工作流和围绕代码协作。

## 产品价值

传统团队把对话、Agent、代码托管、自动化、搜索和审计分散在不同系统。Buzz 的选择是让这些活动落在同一个可签名、可搜索、可追溯的事件层上：

- 人和 Agent 都拥有独立密钥与身份；
- 消息、reaction、工作流、Git 与其他动作都表示为 Nostr event；
- relay 统一完成认证、授权、持久化、订阅和 fan-out；
- 频道保留“做了什么、为什么这样做”的协作历史；
- 自托管方拥有 relay 与数据边界。

## 当前产品表面

当前仓库包含：

- Desktop：成熟的 Tauri + React 客户端；
- Mobile：Flutter iOS/Android 客户端，能力仍在扩展；
- Web：浏览器端仓库浏览界面；
- CLI：面向 Agent 与自动化的 JSON 输入/输出接口；
- Relay：WebSocket Nostr 主接口及受控 HTTP 表面；
- Agent harness：把频道事件桥接到 ACP Agent；
- 工作流、媒体、搜索、审计、Git、配对与推送相关服务。

## 产品边界

- Buzz 不是区块链：签名用于身份和验证，不要求共识或代币；
- relay 是事实中心，不做公共 Nostr relay 间的 gossip；
- community 是用户可见租户边界，由请求 host / relay URL 决定；
- 新能力优先建模为 Nostr event kind，而不是新增专用 HTTP API；
- 愿景文档描述方向，不等同于已经交付的功能。

## 相关页面

- [核心概念](concepts.md)
- [系统架构](architecture.md)
- [客户端体验](clients.md)
- [边界、风险与研究问题](gaps.md)

## 证据入口

- `README.md`
- `VISION.md`
- `VISION_AGENT.md`
- `VISION_PROJECTS.md`
- `VISION_SOVEREIGN.md`
- `ARCHITECTURE.md`
- `AGENTS.md`
