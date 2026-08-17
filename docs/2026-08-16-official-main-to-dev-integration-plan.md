# 官方 `main` 合并至 `dev` 实施计划

> 更新日期：2026-08-17
> 更新说明：隔离集成分支已完成 53 个冲突的解决、迁移重编号和分层验证；记录最终取舍与尚受环境影响的测试结果，等待合回 `dev` 前确认。

## 1. 目标

在不直接扰动当前 `dev` 的前提下，将 `block/buzz` 官方最新 `main` 集成到 Achoverse 的本地开发主线，同时保留以下本地产品能力：

- Tasks、Tracks 与 Agent Task Execution；
- Agent Calendar 与私有数据访问边界；
- Agent Owner DM、消息投递保证与 DM 历史；
- Web PWA 控制台、Web Signer Pairing 与本地 Relay 配置；
- 本地 Wiki、UI 规范和部署流程。

合并完成后，官方的 Projects v3、Buzz Term、Agent usage、ACP context delta、Desktop 性能优化、Mobile 安全更新等能力应正常工作，且本地能力不得发生权限泄漏、状态丢失或入口消失。

## 2. 当前事实与风险

- 当前分支：`dev`，工作区干净。
- 当前 `dev` 相对共同基点 `63496cc1` 有 162 个本地提交、约 429 个变更文件。
- 本次集成目标：官方 `main@f956e6fe0`（2026-08-16）。
- 正式 `git merge --no-commit --no-ff origin/main` 产生 53 个真实冲突文件。
- 只使用本地缓存到 2026-08-01 的官方提交进行三方预演，已出现 17 个内容冲突。
- GitHub 最新 Compare 的文件列表达到 300 个上限，其中至少 35 个文件与本地 `dev` 重叠。
- 最高风险不是文本冲突，而是自动合并后的语义冲突：event kind、权限矩阵、ACP session、Agent 运行状态、Desktop 路由、community reset 和 E2E mock 注册。

## 3. 分支与提交策略

正式执行时采用以下分支拓扑：

```text
dev
 └── codex/sync-official-main-2026-08-17
       ├── merge origin/main（暂不自动提交）
       ├── 分模块解决冲突
       ├── 完成测试和真实流程验收
       └── 生成 signed-off merge commit
             └── 合并回 dev
```

执行原则：

1. 从执行当时最新的本地 `dev` 创建集成分支。
2. 仅在集成分支执行 `git fetch origin main` 和 `git merge --no-commit --no-ff origin/main`。
3. 不使用 `git pull`、rebase、`-X ours` 或 `-X theirs`。
4. 每次提交前激活 Hermit，并使用 `git commit -s`。
5. 冲突解决、测试与真实流程验收全部通过后，才将集成分支合回 `dev`。
6. 任意阶段需要放弃时使用 `git merge --abort`；原 `dev` 保持不变。

## 4. 产品合并原则

### 4.1 Relay 与事件协议

以官方最新 handler 和权限管线为结构基础，逐项重新接入本地 Tasks、Tracks、Calendar 与 Web Pairing 规则。不得整文件选择 ours 或 theirs。

必须验证：

- event kind 不冲突；
- 所有查询明确限制 kinds 与 community；
- channel 继续使用 `h` tag；
- 私有 Track、Task 与 Calendar 不会通过通用 REQ、COUNT 或 HTTP bridge 泄漏；
- 官方 Projects 和本地 Tracks/Tasks 的权限与实体边界明确；
- reply counters、搜索、审计与 fan-out 保持一致。

### 4.2 ACP 与 Agent

以官方最新 session、queue、pool、usage 和 context-delta 模型为基础，重新接入本地任务执行、Owner DM、Hermes 投递和 Agent membership 能力。

必须验证：

- Task execution 的取消只作用于目标任务或会话；
- context delta 不遗漏 Task/DM 所需历史；
- 官方 acknowledgement 与本地投递保证不会重复发布；
- Session replacement、steer、timeout 和恢复不会污染其他频道或任务；
- Agent usage 能覆盖本地任务执行路径。

### 4.3 Desktop、Web 与导航

保留官方 AppShell、Projects v3、Buzz Term、Search、Glass appearance 和性能优化，再重新挂载本地 Tasks、Tracks、Calendar、Inbox result 与 Web PWA 入口。

所有 community-scoped singleton 必须具有 reset，并接入 `resetCommunityState()`。路由、快捷键、侧边栏入口和 Inbox 聚合不得互相覆盖。

### 4.4 测试基础设施

E2E bridge、Playwright 配置与 fixtures 采用注册表式合并：保留双方 handler、route、identity、channel 和 testMatch，消除重复 command、UUID 和 project 注册。

## 5. 解决顺序

1. 文档、构建配置与依赖声明。
2. kind、schema 与 migrations。
3. `buzz-core`、`buzz-db`、`buzz-relay`。
4. `buzz-sdk`、`buzz-cli`。
5. `buzz-acp` 与 Desktop Tauri managed agents。
6. Desktop AppShell、导航与业务 UI。
7. Web 与 Mobile。
8. E2E bridge、Playwright 和 fixtures。
9. 重新生成 lockfile。
10. 分层测试、`just test`、`just ci` 和真实流程验收。

## 6. 冲突解决 Todo List

以下清单已根据官方 `main@f956e6fe0` 的真实 merge 结果更新。每项只对应一个文件。

- [x] `crates/buzz-core/src/kind.rs`：保留官方 Team Catalog、Private Managed Agent、Project 与本地 Calendar、Task、Track kinds，确认无编号碰撞。
- [x] `crates/buzz-db/src/event.rs`：合并官方共享访问门与本地 Calendar、Task、Track 可见性。
- [x] `crates/buzz-relay/src/api/bridge.rs`：让 HTTP query/count 与 WebSocket 权限同样 fail closed。
- [x] `crates/buzz-relay/src/handlers/ingest.rs`：统一 Projects、私有 Agent、Tasks、Tracks、Calendar 和 linear DM 的 ingest 规则。
- [x] `crates/buzz-relay/src/handlers/req.rs`：保留官方共享访问门、本地 Calendar owner 规则与 Track/Task ACL。
- [x] `crates/buzz-acp/src/acp.rs`：合并官方 context delta/usage 与本地消息投递修正和 Task execution。
- [x] `crates/buzz-acp/src/queue.rs`：保留 linear DM、逐 Task 身份和混合消息批次语义。
- [x] `desktop/src/app/AppShell.tsx`：采用官方 Buzz Term/AppShell surface，并重新挂载本地业务入口。
- [x] `desktop/src/features/agents/ui/AgentInstanceEditDialog.tsx`：保留官方 access/run-location 与本地 Owner reply/Task assignment 设置，并完成职责拆分。
- [x] `desktop/src/testing/e2eBridge.ts`：合并官方 Huddle/Projects/Term mocks 与本地 Calendar/Tasks/Tracks/Web Pairing mocks。
- [x] `desktop/playwright.config.ts`：保留双方关键 E2E project 与 testMatch。

## 7. 迁移与构建收尾 Todo List

- [x] `migrations/0030_channels_id_lookup_index.sql`：将官方原 0027 后移，避免覆盖已部署的本地 Calendar 迁移。
- [x] `migrations/0031_long_reaction_payloads.sql`：将官方原 0028 后移，避免覆盖本地 Task assignment policy 迁移。
- [x] `migrations/0032_community_deletion.sql`：将官方原 0029 后移，避免覆盖本地 Task search 迁移。
- [x] `migrations/0033_community_deletion_recovery.sql`：保持官方删除恢复迁移顺序。
- [x] `migrations/0034_workflow_run_error_codes.sql`：保持官方 workflow error code 迁移顺序。
- [x] `crates/buzz-db/src/migration.rs`：更新版本断言，并在独立临时数据库验证 0001 至 0034 全链成功。
- [x] `crates/buzz-db/src/tasks.rs`：使用参数对象衔接 Task execution 数据库写入，满足 Clippy 并保持事务语义。
- [x] `desktop/src-tauri/src/commands/agents.rs`：拆分模块装配职责，通过 Tauri 文件大小门禁。
- [x] `desktop/src-tauri/src/lib.rs`：提取顶层依赖，通过 Tauri 文件大小门禁。
- [x] `desktop/src/features/home/ui/HomeView.tsx`：提取共享类型，通过 Desktop 文件大小门禁。
- [x] `desktop/src/features/sidebar/ui/AppSidebar.tsx`：提取 Props 类型，通过 Desktop 文件大小门禁。
- [x] `pnpm-lock.yaml`：完成官方依赖图与本地 workspace 的 lockfile 合并。

## 8. 验证与验收

代码层验证：

- Rust format、Clippy、unit tests；
- `buzz-relay`、`buzz-db`、`buzz-auth` 相关集成测试；
- Desktop Tauri checks/tests；
- Desktop check、typecheck、unit、E2E build 和关键 Playwright；
- Web check/build/E2E；
- Mobile format check、analyze 和 tests；
- 最终 `just ci`。

截至 2026-08-17 的执行结果：

- `just check`：通过；
- `just test-unit`：通过；
- `just test`：10 组通过，workspace integration 中 Databricks mock HTTP 测试并发运行时 13 项失败；同一测试文件以单线程重跑 18/18 通过，判定为本机并发 mock/代理环境干扰；
- Fresh database migration：独立临时数据库中 0001 至 0034 全部成功应用；
- Desktop unit：5053 项通过；并修正一个仍断言旧默认 accent 行为的自动合并测试。
- Desktop Tauri：编译、格式、Clippy 与聚焦测试通过；全套 2487 项中 2453 通过、15 忽略、19 项因本机 HTTP 请求统一收到 502 失败。
- `just ci`：执行至 Desktop Tauri 全套测试时，被上述 19 项本机 HTTP 502 阻断；此前所有静态检查、Desktop unit/build 与 Rust unit 均通过。

真实流程验收：

- 本地 Relay 与 Desktop 启动、重连和社区切换；
- Web Signer Pairing 与 PWA 控制台；
- Agent 创建、启动、停止、恢复、Owner DM 与普通 DM；
- Task 创建、分配、执行、取消、结果投递和 Inbox 历史；
- Tracks 权限与查询；
- Calendar 私有事件；
- 官方 Projects v3、Buzz Term、Search、Link Preview 和 Huddle；
- Mobile pairing 与身份导出设备认证。

## 9. 完成条件

- 集成分支无未解决冲突或未提交变更；
- 本地产品能力与官方新增能力均通过对应测试和真实流程验收；
- 没有 event kind、migration、route、command、fixture 或 singleton reset 冲突；
- `just ci` 通过，或所有环境限制都有明确记录；
- 使用 signed-off commit 完成集成分支提交；
- 经确认后将集成分支以 signed-off merge commit 合回 `dev`。
