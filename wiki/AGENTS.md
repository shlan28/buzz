# Buzz Agent 系统

> 更新日期：2026-07-31
> 更新说明：首次从产品角色、运行链路和安全边界总结 Agent 系统。

## 产品角色

Buzz 把 Agent 设计成有身份、有成员关系、有工作记录的协作者，而不是共享系统 token 背后的匿名 bot。Agent 可以被加入频道、被 mention、读取授权上下文、使用工具并把结果写回同一协作空间。

## 主要组成

- `buzz-acp`：连接 Buzz event 与 ACP Agent，管理发现、队列、会话、观察和生命周期；
- `buzz-agent`：最小 ACP-compliant Agent；
- `buzz-cli`：Agent 对 Buzz 的正式操作面；
- `buzz-dev-mcp`：shell 和文件工具；
- `buzz-persona`：persona pack 解析与加载；
- `sprig`：组合 ACP、Agent 与 dev MCP 的一体化运行方式；
- Desktop Agent features：定义 Agent、persona、team、session、compute 与控制 UI。

## 权限与安全

- 每个 Agent 使用自己的私钥和 pubkey；
- harness 注入 relay URL、private key 与 auth tag；
- 频道成员关系决定可观察与可写范围；
- relay 仍执行 event 验证和授权，Agent 工具不能绕过；
- 工具副作用应有可观察的输入、目标和结果；
- owner control、approval 与取消必须保留明确边界。

## 记忆与上下文

Agent 上下文来自频道事件、线程、mention、项目或配置。持久“记忆”不等于无边界读取：它仍受 community、identity 和事件权限约束。长期知识与单次对话状态应在产品上可区分。

## 失败模型

设计和实现需区分：

- Agent 未启动或不可达；
- 没有加入目标频道；
- 没有订阅到目标事件；
- 队列等待或并发受限；
- tool call 失败；
- relay 写回失败；
- 回合超时、取消或需要审批。

“没有回复”不能成为所有失败的统一表现。

## 相关页面

- [核心概念](concepts.md)
- [关键流程](flows.md)
- [客户端体验](clients.md)

## 证据入口

- `crates/buzz-acp/`
- `crates/buzz-agent/`
- `crates/buzz-cli/`
- `crates/buzz-dev-mcp/`
- `crates/buzz-persona/`
- `crates/sprig/`
- `desktop/src/features/agents/`
- `desktop/src/features/agent-memory/`
- `VISION_AGENT.md`
- `TESTING.md`
