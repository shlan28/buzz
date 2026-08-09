# Agent 公开工作区与隐藏运行目录分离方案

> 更新日期：2026-08-08  
> 更新说明：首次提出将 Agent 用户成果迁移到无点号的公开目录，同时保留 Buzz 与各 Agent runtime 的隐藏状态目录；覆盖目录边界、开发/正式版隔离、迁移、回滚、产品入口和逐文件 Todo List。

## 一、问题与目标

Buzz Desktop 当前把 Agent 的公开成果和系统内部状态放在同一个 Nest：

```text
开发版：~/.buzz-dev/
正式版：~/.buzz/
```

其中同时包含：

```text
# 用户需要阅读、管理或备份的内容
RESEARCH/
PLANS/
GUIDES/
WORK_LOGS/
OUTBOX/
REPOS/

# Buzz 或 Agent runtime 的内部内容
.agents/
.claude/
.codex/
.goose/
.scratch/
.nest-agents-version
.dev-nest-migrated
archive/
AGENTS.md
```

这会造成两个产品问题：

1. 用户成果位于点号开头的隐藏目录，不容易通过 Finder 发现；
2. 如果简单地把整个 `.buzz` 政名为 `Buzz`，runtime 配置、迁移标记和临时文件也会暴露给用户，公开目录仍然杂乱且容易误操作。

本方案的目标不是“去掉 `.buzz` 前面的点”，而是拆分两个职责：

- **公开工作区**：存放用户可理解、可打开、可备份、可迁移的 Agent 工作成果；
- **隐藏运行目录**：存放 Buzz、Agent harness、provider、迁移和缓存状态。

## 二、产品结论

采用“双根目录”模型。

### 2.1 正式版

```text
~/Buzz/
├── RESEARCH/
├── PLANS/
├── GUIDES/
├── WORK_LOGS/
├── OUTBOX/
└── REPOS/

~/.buzz/
├── .agents/
├── .claude/
├── .codex/
├── .goose/
├── .scratch/
├── archive/
├── AGENTS.md
├── .nest-agents-version
└── 其他内部状态
```

### 2.2 开发版

```text
~/Buzz Dev/
├── RESEARCH/
├── PLANS/
├── GUIDES/
├── WORK_LOGS/
├── OUTBOX/
└── REPOS/

~/.buzz-dev/
├── .agents/
├── .claude/
├── .codex/
├── .goose/
├── .scratch/
├── archive/
├── AGENTS.md
└── 其他内部状态
```

开发版与正式版默认继续隔离，避免开发 Agent 修改正式版工作成果。后续可以允许用户主动把两者配置到同一个工作区，但不作为默认行为。

## 三、目录归属

| 目录或文件 | 新位置 | 原因 |
|---|---|---|
| `RESEARCH/` | 公开工作区 | 用户可阅读的调研成果 |
| `PLANS/` | 公开工作区 | 用户可阅读和编辑的计划 |
| `GUIDES/` | 公开工作区 | 用户可长期使用的操作文档 |
| `WORK_LOGS/` | 公开工作区 | 用户可审计的工作记录 |
| `OUTBOX/` | 公开工作区 | 用户需要审核的草稿 |
| `REPOS/` | 公开工作区或用户自定义目录 | 用户代码资产，不应隐藏 |
| `.scratch/` | 隐藏运行目录 | 临时文件，不属于交付成果 |
| `.agents/` | 隐藏运行目录 | Buzz CLI skill 等 Agent 内部配置 |
| `.claude/`、`.codex/`、`.goose/` | 隐藏运行目录 | provider/runtime 私有配置 |
| `archive/` | 隐藏运行目录 | Agent 内部归档；未来如有用户归档产品再单独设计 |
| `AGENTS.md` | 隐藏运行目录 | Buzz 管理的 Agent 行为和工作区说明，不作为普通用户文档 |
| 版本与迁移标记 | 隐藏运行目录 | 系统状态，不应暴露或由用户编辑 |

### 3.1 不移动 `.scratch`

`.scratch` 的语义是可丢弃的临时空间。即使名称仍以点号开头，把它放进 `~/Buzz` 也会让公开工作区继续混入内部状态。因此它保留在隐藏运行目录。

### 3.2 `AGENTS.md` 的处理

当前 Agent 会从工作目录读取 `AGENTS.md`。拆分后不能依赖 Agent 在公开工作区自动发现隐藏目录中的文件。

推荐由 Desktop/ACP 在启动 session 时显式加载隐藏运行目录里的 `AGENTS.md`，并作为系统上下文注入。这样：

- 用户工作成果根目录可以是 Agent 的真实 `cwd`；
- Buzz 管理的行为规则仍然保存在内部目录；
- 不需要在公开工作区放置容易被误改的系统模板；
- 项目仓库自身的 `AGENTS.md` 仍按 Agent runtime 的现有规则加载。

## 四、工作目录与路径模型

现有实现把 `nest_dir()` 同时当成内部状态根目录、用户成果根目录和 Agent `cwd`。实施时应拆成三个明确概念：

```text
runtime_dir       隐藏运行目录：~/.buzz 或 ~/.buzz-dev
workspace_dir     公开工作区：~/Buzz 或 ~/Buzz Dev
repos_dir         仓库目录：默认 <workspace_dir>/REPOS，也可由用户自定义
```

Agent 启动时：

```text
current_dir = workspace_dir
```

Agent 提示词中的相对路径保持不变：

```text
RESEARCH/REPORT.md
PLANS/FEATURE_PLAN.md
GUIDES/SETUP.md
```

因此对 Agent 来说仍然是一个统一工作区，但实际生成文件会落在 Finder 可见的目录中。

内部配置不能再通过相对于 `cwd` 的 `.agents/`、`.codex/` 等路径隐式发现；Buzz 管理的内部路径必须使用 `runtime_dir` 显式解析。第三方 runtime 自己基于工作目录生成的私有状态，需要逐一验证并通过环境变量、启动参数或显式配置定向到 `runtime_dir`，避免重新污染公开工作区。

## 五、用户设置与交互

Desktop 设置中增加“Agent 工作区”区域：

- 显示当前公开工作区的绝对路径；
- “在 Finder 中打开”；
- “更改位置”；
- “恢复默认位置”；
- 更改前说明已有文件如何处理；
- 路径不可用时显示可恢复错误，不静默退回其他目录。

建议区分两个操作：

1. **更改工作区位置并移动现有文件**：由 Buzz 执行安全迁移；
2. **使用已有文件夹**：不自动覆盖同名非空目录，先检测冲突并让用户确认。

第一版可以只支持默认路径和“在 Finder 中打开”，将自定义工作区作为第二阶段，以降低首轮迁移复杂度。但后端路径模型应从第一版起支持可配置，避免再次重构。

## 六、首次升级迁移

### 6.1 迁移范围

正式版从 `~/.buzz` 迁移到 `~/Buzz`；开发版从 `~/.buzz-dev` 迁移到 `~/Buzz Dev`。

仅迁移：

```text
RESEARCH/
PLANS/
GUIDES/
WORK_LOGS/
OUTBOX/
REPOS/
```

`.scratch`、runtime 配置、内部归档和迁移标记不移动。

### 6.2 安全顺序

1. 在隐藏运行目录记录迁移状态为 `pending`；
2. 创建公开工作区及权限；
3. 逐目录复制到临时目标；
4. 校验文件数量、相对路径、文件大小和必要的内容校验和；
5. 将临时目标原子切换为正式公开目录；
6. 更新工作区路径配置；
7. 将迁移状态标记为 `completed`；
8. 原目录先保留为只读备份，不在同一次升级中立即删除。

不能先删除旧目录再移动，也不能在校验失败时启动 Agent。迁移中断后，下次启动应根据状态继续或回滚，而不是产生两个都可写的工作区。

### 6.3 同名目标冲突

如果 `~/Buzz` 或 `~/Buzz Dev` 已存在：

- 为空：可以迁入；
- 包含完全相同文件：跳过相同项；
- 存在不同内容的同名文件：停止自动迁移，展示冲突，不覆盖；
- 不可写、是文件或危险 symlink：拒绝使用并保留旧工作区。

### 6.4 `REPOS` 特殊处理

- 如果旧 `REPOS` 是真实目录，按普通目录迁移；
- 如果旧 `REPOS` 是指向用户自定义仓库目录的 symlink，不移动目标仓库，只在新公开工作区重建链接；
- `.repos-dir` 继续作为内部配置保存在隐藏运行目录；
- 任何失败都应 fail closed，禁止 Agent 临时写入错误的空 `REPOS`。

### 6.5 回滚与旧版本兼容

迁移完成后立即启动旧版 Desktop，会继续寻找 `~/.buzz[-dev]/PLANS` 等旧路径。为避免双向写入，不建议在旧路径建立可写 symlink 作为长期兼容方案。

推荐策略：

- 迁移前保留旧目录备份；
- 新版写入工作区 schema/version；
- 用户回退旧版时，由明确的“恢复旧版工作区”流程把公开成果复制回旧路径；
- 自动更新说明中提示该版本改变 Agent 工作区位置；
- 一个稳定版本周期后，再提示用户清理旧备份。

## 七、安全与隐私边界

- 公开工作区是“Finder 可见”，不等于“网络公开”；文件仍然只在用户本机，除非用户主动同步或提交；
- 不在公开工作区保存 private key、API key、access token、Keychain 导出或完整敏感日志；
- 自定义工作区位于 iCloud Drive、Dropbox 等同步目录时，需要明确提示成果可能被第三方云同步；
- 工作区根目录拒绝指向 `/`、用户 Home 根、隐藏运行目录及其祖先/子目录；
- 不跟随未经验证的根目录 symlink；
- 运行目录和工作区权限分别管理，不能因为公开可见就放宽内部状态权限；
- Reset 应明确区分“重置 Buzz 内部状态”和“删除 Agent 工作成果”，默认不得删除公开工作区。

## 八、失败与恢复模型

| 场景 | 行为 |
|---|---|
| 公开工作区不存在 | 首次启动创建；创建失败则阻止 Agent 启动并提示修复 |
| 公开工作区暂时不可访问 | 不退回 `$HOME` 或隐藏目录写入，保持失败关闭 |
| 迁移中断 | 根据 migration journal 继续或回滚 |
| 文件名冲突 | 停止自动迁移，不覆盖用户文件 |
| 自定义 `REPOS` 不可访问 | 不恢复 Agent，避免写入错误仓库目录 |
| runtime 试图在公开根写隐藏配置 | 记录 provider 和路径，修正启动配置；不能静默接受长期污染 |
| 用户执行 Reset | 默认只重置内部状态；删除公开成果必须二次确认并独立选择 |

## 九、分阶段实施

### 阶段 A：路径模型和迁移能力

- 引入 `runtime_dir`、`workspace_dir`、`repos_dir`；
- 创建公开工作区；
- 完成旧目录的一次性安全迁移；
- Agent `cwd` 切换到公开工作区；
- 内部状态继续使用隐藏运行目录；
- 更新提示词、Markdown 预览和 Reset 边界。

### 阶段 B：Desktop 产品入口

- 在设置中显示路径；
- 支持 Finder 打开；
- 提供迁移失败和冲突恢复界面；
- 完成 E2E 覆盖。

### 阶段 C：可配置工作区

- 支持选择已有目录；
- 支持移动工作区；
- 增加云同步目录提示；
- 支持恢复默认路径。

分阶段发布的前提是阶段 A 已经包含稳定、可扩展的路径配置格式，不能先把 `~/Buzz` 再次硬编码到所有调用点。

## 十、验收标准

1. 新安装正式版生成的 Agent 成果位于 `~/Buzz`；
2. 新安装开发版生成的 Agent 成果位于 `~/Buzz Dev`；
3. `.agents`、`.claude`、`.codex`、`.goose`、`.scratch` 和迁移标记不出现在公开工作区；
4. Agent 使用 `RESEARCH/...` 等相对路径时无需感知底层拆分；
5. 已有用户升级后文件无丢失、无覆盖、无重复写入；
6. `REPOS` 真实目录和自定义 symlink 两种情况都保持原有语义；
7. 公开工作区不可用时 Agent 不会回退到 `$HOME` 或错误目录；
8. Reset 默认不删除用户公开成果；
9. Markdown 预览只能从当前公开工作区解析允许的文件，不能扩大到整个 Home；
10. 正式版与开发版默认互不覆盖；
11. macOS 路径包含空格时，Agent、MCP、CLI 和预览功能仍正常；
12. 升级、崩溃恢复、冲突和回滚路径均有自动化测试。

## 十一、代码规范检查

已优先阅读：

- `wiki/index.md`；
- `wiki/code-spec.md`；
- 根目录 `AGENTS.md` 中的 Desktop、迁移、测试和交付规则。

本方案遵循以下现有约束：

- 保持用户数据与内部状态的明确边界；
- 破坏性路径变更必须有迁移、版本和回滚策略；
- 用户可见错误必须提供恢复路径；
- 不引入新的 community-scoped module singleton；如实现中不可避免，必须接入 reset；
- production Rust 路径不新增 `unwrap()`、`expect()` 或 `unsafe`；
- 新行为必须有回归测试和 Desktop E2E 验证；
- Reset 不得把用户成果和可重建内部状态混为一类。

## 十二、实施 Todo List

每个 Todo 只对应一个文件。以下为建议实施清单，开始改代码前需再次核对最新调用关系；鹿鹿子大王确认本文档后才能执行。

- [ ] `desktop/src-tauri/src/managed_agents/nest.rs`：拆分隐藏 `runtime_dir` 与公开 `workspace_dir`，分别创建内部目录和用户成果目录。
- [ ] `desktop/src-tauri/src/managed_agents/mod.rs`：将 Agent 默认工作目录切换为公开工作区，并在路径不可用时 fail closed。
- [ ] `desktop/src-tauri/src/managed_agents/runtime.rs`：启动 Agent 时显式使用公开工作区作为 `current_dir`，传递必要的内部运行目录配置。
- [ ] `desktop/src-tauri/src/managed_agents/repos.rs`：让默认 `REPOS` 位于公开工作区，同时将 `.repos-dir` 配置保留在隐藏运行目录。
- [ ] `desktop/src-tauri/src/migration.rs`：实现旧 Nest 用户成果到公开工作区的一次性、可恢复迁移。
- [ ] `desktop/src-tauri/src/reset.rs`：拆分内部状态重置与公开成果删除，默认保留公开工作区。
- [ ] `desktop/src-tauri/src/lib.rs`：调整启动顺序，完成目录初始化和迁移后再恢复 Agent。
- [ ] `desktop/src-tauri/src/commands/local_markdown.rs`：将 Markdown 解析根切换到公开工作区并保持路径越界防护。
- [ ] `desktop/src-tauri/src/managed_agents/nest_agents.md`：更新工作区说明，移除内部目录与用户成果同根的假设。
- [ ] `crates/buzz-acp/src/base_prompt.md`：明确公开工作区相对路径和内部状态不可写边界。
- [ ] `crates/buzz-acp/src/pool.rs`：将绝对 Workspace 提示锚定到公开工作区，并显式注入隐藏目录中的 Buzz 管理规则。
- [ ] `crates/buzz-acp/src/lib.rs`：补充公开工作区提示词、路径和 session 初始化回归测试。
- [ ] `desktop/src/features/settings/ui/SettingsPanels.tsx`：在设置面板中接入 Agent 工作区路径、Finder 打开和后续路径选择入口。
- [ ] `desktop/src/testing/e2eBridge.ts`：为工作区查询、打开、迁移状态和错误场景增加 mock command。
- [ ] `desktop/tests/e2e/agent-workspace.spec.ts`：新增公开工作区设置、迁移成功、冲突和不可用状态的 E2E 测试。
- [ ] `CONTRIBUTING.md`：更新开发版与正式版 Agent 工作区、Reset 和本地调试说明。
- [ ] `AGENTS.md`：更新 Agent workspace 的开发/正式路径和操作约束。

## 十三、需要确认的产品决策

实施前需要鹿鹿子大王确认：

1. 正式版默认公开目录是否使用 `~/Buzz`；
2. 开发版是否使用独立的 `~/Buzz Dev`，本方案建议独立；
3. 第一版是否立即支持用户自定义整个工作区，还是先只提供默认路径与 Finder 入口；
4. `WORK_LOGS` 是否属于用户成果，本方案暂定属于；
5. `OUTBOX` 是否需要长期对用户可见，本方案暂定可见；
6. 旧工作区备份保留多久，以及由用户手动清理还是后续版本提示清理；
7. Reset 页面是否增加独立的“删除 Agent 工作成果”危险操作，本方案建议增加但默认不选。

## 十四、建议决策

建议第一版采用：

```text
正式版公开工作区：~/Buzz
开发版公开工作区：~/Buzz Dev
内部运行目录：继续使用 ~/.buzz 与 ~/.buzz-dev
第一版设置能力：显示路径 + Finder 打开
第二版设置能力：选择、移动和恢复默认工作区
Reset：默认只清内部状态，不删除公开成果
```

这是产品可发现性、开发隔离、迁移风险和实现复杂度之间较稳妥的平衡。最重要的架构决定是先建立 `runtime_dir` 与 `workspace_dir` 两个概念，而不是继续让一个目录同时承担所有职责。
