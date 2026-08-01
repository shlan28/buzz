# Buzz Code Spec

> 更新日期：2026-08-01
> 更新说明：首次汇总 Buzz 当前代码规范，统一产品不变量、架构边界、分端实现规则、测试与交付门禁。

## 1. 文档定位

本规范回答“怎样为 Buzz 增加一项可长期维护、不会破坏协议与社区边界的能力”。它适用于 relay、Rust crates、Desktop、Web、Mobile、CLI、Agent 与数据库变更。

规则优先级如下：

1. 安全、身份、community 隔离和协议兼容性；
2. 产品与领域不变量；
3. 模块边界和数据流；
4. 测试、可观测性和交付门禁；
5. 语言格式与局部代码风格。

格式问题尽量由 `rustfmt`、Clippy、Biome、Dart formatter 和现有检查脚本自动裁决；架构不变量必须在设计与评审中显式验证。

## 2. 产品与架构不变量

### 2.1 Relay 是事实来源

- 客户端、Agent 和自动化都通过 relay 读取或提交状态；不得建立绕过 relay 授权与事件验证的旁路写入。
- Postgres 保存持久事件与派生数据，Redis 用于跨节点 fan-out、presence、typing 等短生命周期状态。
- community 由请求 host/relay 上下文确定。客户端提供的 tag、token 或 payload 不能覆盖这个边界；未知 host 必须 fail closed。

### 2.2 功能优先建模为 Nostr Event

- 新业务动作优先定义为 event，而不是新增专用 JSON HTTP API。
- 所有 kind 整数统一定义在 `crates/buzz-core/src/kind.rs`，先检查编号范围和冲突，再实现处理逻辑。
- HTTP 仅用于确实需要 HTTP 的能力：NIP-11/NIP-05、通用 `/events`、`/query`、`/count`、webhook、Blossom media、git smart HTTP、policy hook 和 health probe。
- 新 event 应明确：作者、kind、content schema、必需 tags、community/channel scope、存储语义、替换语义、权限、订阅 fan-out、搜索与审计行为。

### 2.3 身份、频道与线程

- 每个用户和 Agent 以自己的密钥与 pubkey 行动，不能共享匿名系统身份掩盖操作主体。
- channel 使用 NIP-29 `h` tag 作用域，不使用 `e` tag 代替频道标识。
- relay query 必须给出明确 `kinds`；Agent CLI 的 `messages search` 同样必须使用 `--kinds`。
- 插入 reply 时必须同步维护 thread root 的 `reply_count` 与 `descendant_count`。
- 签名验证、pubkey 匹配、membership、scope 和 community 检查属于写入路径的安全边界，不能为了客户端便利而跳过。

### 2.4 兼容性与失败模型

- 未识别 kind 应保持向前兼容，不让旧客户端因新能力崩溃。
- API、event content 和 tag 演进优先 additive change；破坏性变更必须有迁移和版本策略。
- 不把所有失败折叠为“无响应”。至少区分认证、授权、校验、冲突、依赖不可用、超时、取消、限流与内部错误。
- 先持久化成功再触发的异步副作用，应允许重试且尽量幂等；副作用失败不能伪装成主写入成功后的完整业务成功。

## 3. 模块与依赖边界

### 3.1 Rust workspace

- `buzz-core`：共享领域类型、event 验证、filter、kind registry；不承载具体服务编排。
- `buzz-relay`：连接、认证后的协议处理、事件管线、HTTP surface 与 side effects。
- `buzz-db`：Postgres 查询和持久化；SQL 与数据映射留在数据层。
- `buzz-auth`：认证和授权规则；业务 handler 不复制一套权限判断。
- `buzz-pubsub`：Redis fan-out 与临时协作状态。
- `buzz-search`、`buzz-audit`、`buzz-media`、`buzz-workflow`：保持各自领域边界，不把功能回填进 relay 的通用 handler。
- Agent 面向 Buzz 的操作先加入 `buzz-cli`；`buzz-dev-mcp` 只负责 shell 和文件工具，不作为业务 API 替代品。
- Desktop 的 Tauri crate 不在根 Rust workspace 内，检查和测试必须显式使用它自己的 manifest 或 `just desktop-tauri-*`。

### 3.2 Client 分层

- Desktop 与 Web 按 feature 组织；跨 feature 的稳定能力下沉 shared，避免从一个 feature 深层导入另一个 feature 的内部实现。
- Mobile feature module 只能依赖自身与 `shared/`，不得跨 feature import。
- UI 组件保持单一职责，数据访问、业务状态和呈现逻辑不要堆在同一个超大文件。
- 新增 module-level cache、`Map`、class singleton 等 community-scoped 状态时，必须提供 reset，并接入 Desktop `resetCommunityState()`。

## 4. Rust 代码规范

### 4.1 安全与错误

- 禁止 `unsafe`；crate 应保持 `#![deny(unsafe_code)]` 约束。
- production path 不新增 `unwrap()` 或 `expect()`；使用 `?`、显式分支和有上下文的错误转换。测试中可在失败即代表 fixture/断言错误时使用。
- library error 使用 `thiserror` 表达可匹配的错误类型；binary/application 层使用 `anyhow` 传播上下文。
- 不吞掉错误。可降级的异步任务要记录结构化上下文，并说明其是否影响主流程结果。

### 4.2 API、并发与可观测性

- 新 public API 必须有 doc comment，说明语义、错误和关键约束。
- 异步路径避免阻塞 Tokio executor；CPU 密集或阻塞工作使用合适的隔离机制。
- 有界 channel、队列和连接池要定义满载行为；不得默认无限增长。
- 使用 `tracing`，字段结构化记录，例如 channel、community、kind、event ID；不要把所有上下文拼进消息字符串。
- 日志不得泄露 private key、token、完整认证材料或不必要的敏感内容。

### 4.3 数据库与迁移

- schema 变更通过 `migrations/` 管理，并考虑现有数据、回滚/前滚、索引成本和并发部署。
- 查询必须显式带入 community 边界；仅凭 channel/event ID 不能假定租户安全。
- 写入和重试路径应设计幂等性；NIP-33/LWW 冲突使用已有冲突语义，不静默覆盖。
- 派生计数、搜索索引和缓存需说明与主记录的一致性策略，并为修复或重建保留路径。

## 5. Desktop 与 Web 规范

### 5.1 TypeScript / React

- 使用 TypeScript 类型表达组件边界；避免用 `any` 绕开不清晰的数据契约。
- 遵循现有 hooks 与 feature slice；副作用放在明确的 effect/service 边界，render 保持纯净。
- `React.memo` 只有在全部 props 引用稳定时才有收益。React Query result object 等不稳定对象不得直接作为 memo 依赖；优先依赖稳定方法或使用项目已有的稳定引用工具。
- 用户可见错误需要可恢复路径；不要只写 console 日志。
- Biome 是格式与 lint 的裁决器，JavaScript/TypeScript 使用双引号，不手工制造与 formatter 对抗的风格。

### 5.2 Desktop UI

- 可读文本只使用 rem-based 命名 token，如 `text-base`、`text-sm`、`text-xs`、`text-2xs`、`text-3xs`；禁止任意 `text-[15px]` 或 `text-[0.9rem]`。
- 新字号确有需要时，在 Tailwind config 中增加命名 token，不在组件里散落 literal。
- community 切换依赖 React remount 与显式 singleton reset；所有旧 relay 数据必须在边界切换时清理。
- UI 改动应覆盖 loading、empty、error、disabled、permission denied 和窄窗口/长内容状态，而不只验证 happy path。
- 交互截图要等待 Radix/CSS animation 完成；多个状态截图在发布前检查 hash，避免重复画面。

### 5.3 文件规模与性能

- 遵守 Desktop/Web 的 file-size guard；触发限制时拆分职责，不提高阈值或加入逃逸规则。
- 列表、消息时间线等高频路径减少无意义 re-render，性能判断在关闭 DevTools 和临时探针后复测。
- 不为“可能更快”提前引入缓存；缓存必须说明 key、生命周期、失效和 community reset。

## 6. Mobile 规范

- 使用 Riverpod 与 `flutter_hooks`；页面和组件优先 `HookConsumerWidget` 或 `ConsumerWidget`，不新增传统 `StatefulWidget`。
- 一个 public widget 一个文件；私有子组件拆入同级 page folder 的 `part` 文件。单文件硬上限 1000 行，触发检查时拆分文件。
- 使用 `context.colors`、`context.textTheme`、`Grid` 和 `Radii`，不散落原始 theme lookup、间距和圆角常量。
- 禁止 `print()`，使用 `debugPrint()` 或结构化日志。
- UI 优先 widget test，通过 `ProviderScope(overrides: ...)` 注入 fake notifier；fake notifier 继承真实 notifier 并覆写 `build()`。
- Agent 只运行 `dart format`、`flutter analyze`、`flutter test`；不运行 `flutter run/build/clean/upgrade`。

## 7. 测试规范

### 7.1 测试与变更对应

- 新行为必须有测试；bug fix 必须有能先复现失败的 regression test。
- 纯逻辑优先 unit test；跨 crate、数据库、Redis、认证或 relay 协议行为使用 integration test；关键用户旅程使用 E2E。
- 修改 `buzz-relay`、`buzz-db` 或 `buzz-auth` 时运行 `just test`。
- 协议能力至少覆盖签名/认证、权限、community 隔离、非法输入、重复写入或冲突。
- 测试固定行为而非内部实现细节；fixture 应确定、可读，并避免依赖外部时间或网络。

### 7.2 客户端测试

- Desktop helper/unit test 使用 `pnpm test`；类型与构建分别由 typecheck/build 覆盖。
- Desktop E2E 必须用 `pnpm build:e2e` 或仓库封装命令，保证 mock Tauri bridge 被编译进去。
- 注入 live message 前等待 mock subscription；localStorage 的 `addInitScript` 必须早于 mock bridge 安装。
- Mobile UI 使用 widget test，Provider 用 override 注入；不要为了易测而破坏 production state 边界。
- UI PR 提供有意义的 before/after 截图或交互录屏；PR 图片通过仓库截图脚本发布，不使用 relay media 或第三方图床。

## 8. 格式化、检查与交付

### 8.1 常用门禁

```bash
. ./bin/activate-hermit
just fix-all       # 自动修复格式
just test-unit     # 无基础设施单测
just test          # relay/db/auth 等集成变更
just ci            # PR 前完整本地门禁
```

分端检查可使用：

- Rust：`cargo fmt --all -- --check`、`cargo clippy --workspace --all-targets -- -D warnings`；
- Desktop：`pnpm check`、`pnpm test`、`pnpm build`；
- Desktop Tauri：`just desktop-tauri-fmt-check`、`just desktop-tauri-clippy`、`just desktop-tauri-test`；
- Web：`pnpm check`、`pnpm build`；
- Mobile：`dart format --output=none --set-exit-if-changed .`、`flutter analyze`、`flutter test`。

### 8.2 Git 与 PR

- 修复分支从最新本地 `dev` 创建，使用 `codex/` 前缀；完成后合并回 `dev`，不直接从或合入 `main`。
- 保留用户未提交的无关变更；一个 PR 聚焦一个逻辑目标，不夹带顺手重构。
- commit 使用 `git commit -s` 满足 DCO。
- commit/PR 标题遵循 Conventional Commits：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`，scope 可选但建议填写。
- PR 描述必须包含问题/目标、方案与关键取舍、验证方法、延后事项；新 public API、event kind、MCP tool 或配置同步更新文档。

## 9. 变更设计检查表

开始实现前：

- [ ] 用户问题与成功标准清晰，且已检查重复 issue/PR。
- [ ] 已判断能否使用现有或新增 Nostr event，而不是专用 HTTP endpoint。
- [ ] 已定义 identity、community、channel、permission 和数据保留边界。
- [ ] 已确认模块归属、依赖方向、兼容性和迁移策略。
- [ ] 已列出失败状态、可观测字段、测试层次和手工验收方式。

提交前：

- [ ] 没有无关改动、敏感日志、新增 production `unwrap/expect` 或 `unsafe`。
- [ ] public API 与用户可见行为已有文档。
- [ ] formatter、lint、相关单测/集成测试通过。
- [ ] UI 状态、缩放、community 切换和截图要求已按影响范围验证。
- [ ] `just ci` 通过，或 PR 明确记录环境限制与未运行项。

## 10. 文档维护 Todo List

每项只对应一个文件；完成后更新勾选状态与本页更新说明。

- [x] `wiki/code-spec.md`：建立统一 Code Spec。
- [x] `wiki/index.md`：加入 Code Spec 导航入口。
- [ ] `CONTRIBUTING.md`：后续评估是否将本规范设为贡献者必读入口。
- [ ] `AGENTS.md`：后续在规则变化时同步机器执行约束，避免两处口径漂移。
- [ ] `wiki/development.md`：后续精简重复规则并改为链接本规范。

## 11. 证据与权威来源

本页是当前规则的统一阅读入口，不替代下列更具体的权威来源：

- `AGENTS.md`：Agent 执行规则、项目 gotchas 与分端硬约束；
- `CONTRIBUTING.md`：贡献流程、Rust 风格、测试和 PR 要求；
- `ARCHITECTURE.md`：协议、数据流与系统不变量；
- `TESTING.md`、`crates/buzz-cli/TESTING.md`：测试运行手册；
- `Justfile`：当前可执行质量门；
- `biome.json`、`desktop/biome.json`、`mobile/analysis_options.yaml`：格式与 lint 配置；
- 各目录内更近的 `AGENTS.md`：局部规则，优先于本页通用描述。

规则发生冲突时，以更接近目标文件的 `AGENTS.md`、实际 CI 配置和安全边界为准，并同步修订本页。
