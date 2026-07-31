# Buzz 边界、风险与研究问题

> 更新日期：2026-07-31
> 更新说明：首次集中记录当前实现边界、知识漂移风险和后续研究问题。

## 当前边界

- Mobile 功能面仍小于 Desktop；
- workflow approval gate 等能力仍在整合；
- huddle lifecycle 仍有待完整贯通；
- 愿景中的 reputation、culture 等不应写成已交付；
- Web 客户端不是完整 Desktop replacement；
- 具体 kinds、限制数值和 feature 状态可能快速变化，应从代码验证。

## 高风险一致性点

- Desktop、Mobile 和 relay 对 kind/tag 的理解必须同步；
- 标准 Nostr kind 41 与 Buzz 产品频道使用的 NIP-29 group metadata kind 39000 用途不同；产品频道不得误用 41；
- community-scoped cache/singleton 漏 reset 会造成跨社区数据泄漏；
- reply 新入口漏更新 counters 会破坏 thread UI；
- open-ended query 或缺 kinds 会触发 relay gate；
- Agent 没有频道成员关系时可能“正常运行但不响应”；
- Desktop E2E 使用普通 build 会呈现伪产品故障；
- Wiki 若只更新单页不更新交叉引用，会逐渐失真。

## Wiki 健康问题

后续 lint 应重点发现：

- `ARCHITECTURE.md` 与新增 crates/服务是否漂移；
- README 的“works today”与实际 feature 是否一致；
- Mobile/Desktop feature parity 变化；
- 新 kind 是否进入核心概念或关键流程；
- 新 module-level cache 是否加入 community reset；
- 旧路径和重命名模块造成的 dead link；
- 愿景陈述被误当成当前能力。

## 建议研究问题

1. 哪些能力真正达到 Desktop/Mobile/CLI 一致，而不仅是数据模型一致？
2. Agent 行为的用户可见状态是否形成统一状态机？
3. workflow、project 与 channel 的边界在产品上是否足够清晰？
4. 多社区部署下，哪些非数据库状态仍可能跨租户泄漏？
5. 是否需要把 wiki lint 变成 CI 的只读报告？
6. 是否需要 frontmatter `refs` 来建立代码/文档依赖图并检测陈旧页面？

## Constructive suggestion

不要立刻给 wiki 上复杂向量检索。当前规模下，稳定索引、明确证据路径、交叉链接与定期 lint 比 RAG 基础设施更重要。等页面达到数百且 `rg + index` 明显不足，再引入本地搜索。

## 相关页面

- [项目总览](overview.md)
- [系统架构](architecture.md)
- [客户端体验](clients.md)
- [维护协议](AGENTS.md)

## 证据入口

- `README.md`
- `ARCHITECTURE.md`
- `AGENTS.md`
- `VISION*.md`
- `desktop/src/features/`
- `mobile/lib/features/`
- `crates/buzz-core/src/kind.rs`
