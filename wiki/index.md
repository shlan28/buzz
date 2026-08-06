# Buzz Wiki 索引

> 更新日期：2026-08-06
> 更新说明：在核心概念与模块地图中增加 Tracks 工作管理导航。

这是 Buzz 的 LLM 维护型知识层。先读 [项目总览](overview.md)，再按问题进入对应页面。

## 产品与概念

- [项目总览](overview.md) — Buzz 是什么、解决什么问题、当前能力边界。
- [核心概念](concepts.md) — community、identity、event、channel、agent、workflow、track、task、tag、project。
- [客户端体验](clients.md) — Desktop、Mobile、Web 与 CLI 的职责边界。
- [客户端 UI 设计规范](../docs/2026-07-31-buzz-client-ui-design-standard.md) — 新功能设计与验收依据。

## 系统与流程

- [系统架构](architecture.md) — relay 中心架构、数据与服务边界。
- [关键流程](flows.md) — 连接、事件、订阅、Agent、媒体、工作流、社区切换。
- [Agent 系统](agents.md) — Agent 如何获得身份、加入频道、接收任务并使用工具。
- [模块地图](modules.md) — Rust crates、Desktop features、Mobile features 和部署目录索引。

## 交付与维护

- [Code Spec](code-spec.md) — 产品不变量、架构边界、分端代码规范、测试与交付门禁。
- [开发与测试](development.md) — 本地环境、分支、质量门与测试策略。
- [部署、运维与发布](operations.md) — 服务依赖、部署形态、可观测性与发布路径。
- [边界、风险与研究问题](gaps.md) — 已知限制、愿景和需要持续验证的主题。
- [维护日志](log.md) — wiki ingest / query / lint 的追加记录。
- [维护协议](AGENTS.md) — LLM 维护规则与 schema。

## 推荐阅读路径

- 新成员：总览 → 核心概念 → 客户端体验 → 开发与测试；
- 产品/设计：总览 → 核心概念 → UI 设计规范 → 边界与风险；
- 后端开发：核心概念 → 系统架构 → 关键流程 → 模块地图；
- Agent 开发：核心概念 → Agent 系统 → 关键流程 → 开发与测试；
- 运维：系统架构 → 部署与发布 → 边界与风险。
