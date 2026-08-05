# Agent 本地 Markdown 文件预览方案

> 更新日期：2026-08-05
> 更新说明：修正共享 workspace 相对路径回归；优先按消息原文相对 workspace 根目录解析，再搜索五类文档目录，最后回退 `REPOS`。

## 1. 结论摘要

Buzz Desktop 可以把 Agent 回复中的本地 `.md` 文件路径显示为可点击路径。用户点击后，Buzz 在应用内打开只读预览弹窗，展示文件名、完整路径和渲染后的 Markdown 内容；无需离开 Buzz，也不修改原文件。

该能力覆盖 Agent 消息出现的两个 Desktop 消费入口：频道/DM 消息时间线与 Home Inbox 详情。两处使用相同的 Agent 身份判定和本地文件读取边界，避免用户从 Inbox 进入同一条消息时失去预览能力。

该能力只对**已识别为 Agent 作者的消息**启用，只支持本机存在的普通 `.md` 文件。消息中的路径只是候选文本，真正读取必须在用户点击后由 Tauri 后端完成，并经过文件类型、大小和普通文件校验。

本功能属于 Desktop 本地展示能力，不新增 Nostr event、relay API 或数据库字段，也不把本地文件内容上传到 relay。

## 2. 用户体验

### 2.1 基本流程

1. Agent 在回复中给出本地 Markdown 路径，例如 `/Users/lu/buzz/docs/plan.md`。
2. Buzz 将符合规则的路径渲染为可点击文本，保留路径原文，不自动读取文件。
3. 用户点击路径后，按钮进入加载状态。
4. 读取成功时，在当前窗口上方打开只读 Markdown 预览弹窗。
5. 用户可滚动阅读，并通过关闭按钮或 `Esc` 返回消息。

### 2.2 支持范围

- 支持扩展名为 `.md` 的绝对路径、`~` 路径和可在 Agent workspace 内解析的相对路径，扩展名大小写不敏感。
- 支持 macOS/Linux 绝对路径，例如 `/Users/lu/buzz/README.md`。
- 支持 Windows 盘符绝对路径，例如 `C:\\work\\buzz\\README.md`。
- 支持 Agent 把路径写成普通文本或行内代码。
- 普通文本路径以空白字符作为边界；路径包含空格时，Agent 必须使用行内代码包裹，以避免错误识别。

### 2.3 不支持范围

- 不支持 `.markdown`、`.mdx`、`.txt` 或其他格式。
- 不支持包含 `..` 的路径、`~other-user` 或 workspace/repo 有界搜索之外的相对路径。
- 不支持目录、设备文件、socket 等非普通文件。
- 不提供编辑、保存、在外部编辑器打开或文件树浏览。
- 不在 Mobile 或 Web 客户端启用；这些客户端通常无法访问 Agent 所在机器的文件系统。
- 不在用户消息、普通成员消息或其他通用 Markdown 页面中自动激活本地路径。

### 2.4 相对路径查找

Agent 回复 `README.md`、`docs/plan.md`、`./docs/plan.md` 或 `~/notes.md` 时，Buzz 也将其渲染为可点击路径，但仍然只在已知 Agent 作者的消息中启用。

点击后按以下顺序解析：

1. 绝对路径继续直接校验和读取，不执行搜索。
2. `~/...` 仅将开头的 `~` 展开为当前用户目录，不支持 `~other-user`。
3. 相对路径先按消息原文相对共享 workspace 根目录直接解析，例如 `PLANS/foo.md` 对应 `~/.buzz-dev/PLANS/foo.md`。
4. 直接解析没有命中时，依次相对 `GUIDES`、`OUTBOX`、`PLANS`、`RESEARCH`、`WORK_LOGS` 查找。
5. 上述文档目录没有匹配时，再到 `REPOS` 下的各个仓库根目录查找。
6. 只有文件名时，在 workspace 根目录尝试直接命中，再在五类文档目录与 repos 范围内执行有界的文件名搜索。
7. 只有一个合法匹配时直接预览；有多个匹配时弹出完整路径列表，由用户选择；无匹配时给出可恢复提示。

不默认扫描整个用户目录或整块磁盘。Buzz managed Agent 的共享 workspace 在开发环境为 `~/.buzz-dev`，生产环境为 `~/.buzz`。预览器从当前运行环境动态取得这个根目录，不能把 `~/.buzz-dev` 硬编码到产品构建中。

开发环境的检索入口为：

```text
~/.buzz-dev/
├── GUIDES/
├── OUTBOX/
├── PLANS/
├── RESEARCH/
├── WORK_LOGS/
└── REPOS/
```

本次只扩大预览器的已知搜索入口。某个目录不存在时直接跳过，不创建目录，也不修改 Agent 的启动参数、默认工作目录或写文件方式。

## 3. 状态与反馈

| 状态 | 产品表现 |
|---|---|
| 默认 | 路径使用链接式样并支持键盘聚焦，悬停提示“Preview Markdown file” |
| 加载 | 保持当前消息位置，路径按钮显示忙碌状态，避免重复请求 |
| 成功 | 弹窗标题显示文件名，副标题显示完整路径，正文渲染 Markdown |
| 文件不存在 | Toast 提示文件不存在或已移动，消息原文不变 |
| 非 `.md` 或非普通文件 | Toast 提示该文件不支持预览 |
| 文件过大 | Toast 提示文件超出预览大小限制 |
| 无权限或读取失败 | Toast 给出可理解的失败信息，不暴露底层堆栈 |
| 空文件 | 弹窗显示“此 Markdown 文件为空” |

预览弹窗使用现有 Dialog 与 Markdown 组件，最大化利用已有标题层级、代码块、表格、列表和主题样式。预览内的交互链接按只读模式展示，避免从本地文件内容继续触发本地读取或外部跳转。

## 4. 路径识别规则

### 4.1 为什么只在 Agent 消息中识别

本地路径在聊天中也可能只是示例、报错或他人机器上的路径。把所有消息里的路径都变成文件入口，会扩大误触和本地信息读取风险。因此，`MessageRow` 只在消息作者属于当前已知 Agent 集合时，向 Markdown 渲染层开启本地 Markdown 路径能力。

### 4.2 解析优先级

1. 已有图片、附件、Buzz message link、频道链接和标准 HTTP 链接保持现有行为。
2. fenced code block 中的路径保持代码文本，不变成链接，避免日志或大段代码产生大量误识别。
3. 行内代码如果整体内容是绝对 `.md` 路径，则渲染为路径按钮并保留等宽视觉语义。
4. 普通文本中的绝对 `.md` 路径转换为专用 `local-markdown-path` 节点。
5. 末尾的句号、逗号、括号等句子标点不计入路径。

识别只负责判断“看起来像路径”，不在渲染阶段查询文件是否存在。这样不会因消息列表渲染而批量探测本地文件系统，也不会拖慢时间线。

相对路径同样必须以 `.md` 结尾，并在用户点击后才搜索。拒绝包含 `..` 的路径、空路径、非 `.md` 文件和带空格但未用行内代码包裹的候选，避免路径逃逸和误分词。

## 5. 安全与隐私边界

本功能允许用户主动读取本机 Markdown 文件，因此必须把读取边界放在 Rust/Tauri 命令中，而不是让 WebView 直接访问 `file://`。

后端命令接收单个路径，并执行以下检查：

1. 路径必须是平台支持的绝对路径；
2. 文件扩展名必须严格为 `.md`，大小写不敏感；
3. metadata 必须表明目标是普通文件；
4. 文件大小不得超过 2 MiB，避免超大文件冻结 UI 或占用过多内存；
5. 使用 UTF-8 读取，非法编码返回可理解错误；
6. 返回规范化后的实际路径、文件名与内容，前端不自行猜测标题；
7. 不记录文件内容，错误日志也不包含内容。

符号链接可以跟随到最终目标，但最终目标仍必须满足普通文件、`.md` 与大小限制。由于路径来自 Agent 消息，读取动作必须由用户显式点击触发，不能在 hover、预渲染、列表挂载或 link preview 阶段自动发生。

建设性建议：首版不限制在当前仓库目录。Agent 可能在 worktree、临时目录或其他用户授权目录产出文档，仓库白名单会让核心场景失效；“仅 Agent 消息 + 用户显式点击 + 仅 `.md` + 2 MiB 上限”是更合适的首版边界。若后续发现误触或信任问题，再增加“首次读取某目录时确认”的权限层。

## 6. 技术方案

### 6.1 Markdown 解析层

新增一个 remark 插件，仅在 `Markdown` 收到 `enableLocalMarkdownPaths` 时启用。插件遍历普通文本节点，将绝对 `.md` 路径转换成 `local-markdown-path` 自定义节点；行内代码由 Markdown `code` renderer 在确认内容完全匹配路径时转换。

该开关必须进入 Markdown component variant / parse cache key。否则同一段内容先在普通消息中缓存、再在 Agent 消息中渲染时，可能错误复用不带路径按钮的节点树，反向复用也会把普通消息变成可点击路径。

### 6.2 预览触发与弹窗

新增 `LocalMarkdownPath` 组件负责：

- 呈现可聚焦的路径按钮；
- 点击后调用 Tauri `read_local_markdown_preview`；
- 管理 loading、success、error 状态；
- 打开 `LocalMarkdownPreviewDialog`；
- 将错误转换为统一 Toast。

弹窗复用共享 `Dialog` 和 `Markdown`。正文使用 `interactive={false}`，避免预览文件中的 URL、本地路径、附件语法继续触发操作。弹窗内容区设置合理最大高度与滚动，不改变消息时间线高度。

### 6.3 Tauri 读取边界

新增独立命令模块 `local_markdown.rs`，返回结构化结果：

```text
LocalMarkdownPreview {
  path: string,
  filename: string,
  content: string
}
```

命令注册到现有 `commands/mod.rs` 导出列表和 `lib.rs` invoke handler。实现使用异步文件 API，先 metadata 与大小检查，再读取文本；不新增第三方依赖。

### 6.4 相对路径解析边界

扩展现有 `read_local_markdown_preview` 命令，让它先把候选路径解析为零个、一个或多个规范化的 `.md` 文件，再返回预览或候选列表。搜索必须在 blocking task 中执行，不阻塞 Tokio executor，并使用固定上限：

- 最多访问 10,000 个目录项；
- 最多返回 20 个匹配；
- 最大搜索深度为 8；
- 跳过 `.git`、`node_modules`、`target`、`dist`、`build` 等大型生成目录；
- 不跟随搜索过程中的目录符号链接，但 `REPOS` 作为 Buzz 已验证的入口可解析到配置的仓库根目录。

每个最终候选在返回前仍必须通过现有的 canonical path、普通文件、`.md`、2 MiB 上限和 UTF-8 检查。多匹配时先只返回路径，用户选择后才读取文件内容。

### 6.5 共享 workspace 搜索边界

Tauri 后端从现有 managed Agent nest 配置取得当前 workspace 根目录。先把候选路径原样拼到 workspace 根目录并校验；这样 Agent 返回 `PLANS/foo.md` 时不会被重复拼成 `PLANS/PLANS/foo.md`。直接解析失败后，才进入 `GUIDES`、`OUTBOX`、`PLANS`、`RESEARCH`、`WORK_LOGS` 与 `REPOS` 的有界搜索。前端仍然只传消息里的候选路径，不能指定或扩大搜索根目录。

文档产物目录优先于 `REPOS`。如果在前五个目录中已经找到合法匹配，就不再混入仓库中的同名文件；前五个目录内有多个匹配时仍由用户查看完整路径后选择。只有文档产物目录完全无匹配时，才回退到 `REPOS`。

### 6.6 Inbox 与 Tasks 的数据边界

Inbox 不是独立的本地文件目录或单独的权威数据表。它是 Desktop 从 Relay 查询消息、提醒、活动和 Task execution 等 Nostr events 后组合出的产品视图。Desktop 的 `localStorage` / `sessionStorage` 仅保存有限的已见条目、选择状态和面板宽度等界面状态，不是 Inbox 内容的权威存储。

Tasks 同样由 Relay 上的 Nostr events 表达，并持久化在 Relay 的 PostgreSQL `events` 表中。当前任务状态使用 kind `30500`，任务执行状态使用 kind `30501`；创建、修改、删除与执行命令/更新使用 kind `42500` 至 `42504`。Agent 的 `OUTBOX`、`PLANS`、`RESEARCH`、`WORK_LOGS` 是本地文档产物，与 Inbox / Tasks 的 Relay 数据相互独立。

## 7. 测试与验收

### 7.1 自动化测试

- 路径解析单测覆盖 macOS/Linux 路径、Windows 路径、大小写扩展名、空格行内代码、尾随标点、相对路径、非 `.md`、fenced code block 和普通 HTTP 链接。
- Markdown cache 单测覆盖相同 content 在开关开启/关闭时不会串用缓存。
- Rust 单测使用临时目录覆盖成功读取、空文件、文件不存在、相对路径、错误扩展名、目录、超限文件和非法 UTF-8。
- Desktop E2E 使用 mock Tauri bridge 注入 Agent 消息，验证点击路径、加载、成功弹窗、空文件和错误 Toast；截图前使用共享 animation wait helper。
- 相对路径单测覆盖 workspace 直接命中、repo 中命中、文件名搜索、`~` 展开、零匹配、多匹配、`..` 拒绝、目录与匹配数上限。
- Desktop E2E 额外验证相对路径唯一匹配直接预览、多匹配选择完整路径、无匹配 Toast，以及普通成员相对路径不可点击。

### 7.2 手工验收

1. Agent 回复一个真实、无空格的绝对 `.md` 路径，点击后正确预览。
2. Agent 以行内代码回复一个包含空格的绝对 `.md` 路径，点击后正确预览。
3. 相同路径出现在普通用户消息中时保持普通文本。
4. `.txt`、包含 `..` 的路径和 fenced code block 中的 `.md` 路径不变成按钮。
5. 删除文件后点击，出现错误 Toast，Buzz 不崩溃。
6. 超过 2 MiB 的 `.md` 文件被拒绝，时间线保持流畅。
7. 预览中的标题、列表、表格、代码块、亮色/暗色主题和 Cmd +/- 缩放表现正常。
8. 同一条 Agent 消息从 Home Inbox 详情打开时，`.md` 路径也可点击并打开相同的只读预览。
9. Home Inbox 中的普通用户消息仍保持纯文本，不会获得本地文件读取入口。
10. Agent 回复 `docs/plan.md` 且只有一个合法文件时，点击后直接打开完整路径对应的预览。
11. Agent 回复 `README.md` 且有多个同名文件时，先显示完整路径选择列表，不自动猜测。
12. 搜索超过边界或无匹配时，提示用户要求 Agent 返回完整绝对路径，时间线不卡顿。

实施后应运行：

```bash
. ./bin/activate-hermit
cd desktop && pnpm test
cargo test --manifest-path desktop/src-tauri/Cargo.toml local_markdown
cd desktop && pnpm test:e2e:smoke
just ci
```

## 8. Todo List

每个 Todo 只对应一个文件。

- [x] `desktop/src/features/messages/ui/MessageRow.tsx`：仅为已知 Agent 作者的消息开启本地 Markdown 路径识别。
- [x] `desktop/src/features/messages/lib/remarkLocalMarkdownPaths.ts`：识别普通文本中的绝对 `.md` 路径并生成专用 Markdown 节点。
- [x] `desktop/src/features/messages/lib/remarkLocalMarkdownPaths.test.mjs`：覆盖路径边界、尾随标点、跨平台格式与负例。
- [x] `desktop/src/shared/ui/markdown/LocalMarkdownPath.tsx`：实现路径按钮、读取状态、错误反馈与预览弹窗。
- [x] `desktop/src/shared/ui/markdown/ExternalLinkAnchor.tsx`：从超大 Markdown 主文件中等价拆出既有外链渲染，满足文件大小门禁。
- [x] `desktop/src/shared/ui/markdown.tsx`：接入专用节点、行内代码路径和 Agent 专属开关。
- [x] `desktop/src/shared/ui/markdown/types.ts`：补充本地 Markdown 路径开关与运行时类型。
- [x] `desktop/src/shared/ui/markdown/nodeCache.ts`：按开关启用解析插件并隔离缓存键。
- [x] `desktop/src/shared/ui/markdown/nodeCache.test.mjs`：验证开关维度不会发生缓存串用。
- [x] `desktop/src-tauri/src/commands/local_markdown.rs`：实现安全、限量、只读的本地 `.md` 文件读取命令及 Rust 单测。
- [x] `desktop/src-tauri/src/commands/mod.rs`：注册并导出本地 Markdown 预览命令模块。
- [x] `desktop/src-tauri/src/lib.rs`：将读取命令加入 Tauri invoke handler。
- [x] `desktop/src/testing/e2eBridge.ts`：为 E2E mock bridge 增加本地 Markdown 读取响应。
- [x] `desktop/tests/helpers/bridge.ts`：补充本地 Markdown 预览的 E2E 配置类型。
- [x] `desktop/tests/e2e/local-markdown-preview.spec.ts`：验证 Agent 消息点击预览和普通用户消息隔离。
- [x] `desktop/playwright.config.ts`：将新预览 spec 纳入 smoke 项目。
- [x] `desktop/src/features/home/ui/InboxMessageRow.tsx`：为 Inbox 中已知 Agent 作者的消息开启本地 Markdown 路径预览。
- [x] `desktop/tests/e2e/local-markdown-preview.spec.ts`：增加 Inbox Agent 路径可预览与普通用户路径隔离的回归测试。
- [x] `desktop/src/features/messages/lib/remarkLocalMarkdownPaths.ts`：识别 Agent 消息中的相对 `.md`、`./...` 和 `~/...` 候选路径。
- [x] `desktop/src/features/messages/lib/remarkLocalMarkdownPaths.test.mjs`：增加相对路径、`~`、空格、`..` 与普通文本边界测试。
- [x] `desktop/src/shared/ui/markdown/LocalMarkdownPath.tsx`：处理零/一/多匹配，并提供完整路径选择弹窗。
- [x] `desktop/src-tauri/src/commands/local_markdown.rs`：实现 `~` 展开、workspace/repo 相对解析、有界文件名搜索与 Rust 单测。
- [x] `desktop/src/testing/e2eBridge.ts`：为预览 mock 增加唯一匹配、多匹配和无匹配响应。
- [x] `desktop/tests/helpers/bridge.ts`：补充相对路径解析的 E2E mock 类型。
- [x] `desktop/tests/e2e/local-markdown-preview.spec.ts`：验证相对路径直接预览、多匹配选择、无匹配和普通成员隔离。
- [x] `desktop/src-tauri/src/commands/local_markdown.rs`：将有界搜索入口明确扩展为共享 workspace 的五类文档目录与 `REPOS`，实现文档目录优先、仓库回退，并补充 Rust 单测。
- [x] `desktop/src/testing/e2eBridge.ts`：确认现有相对路径唯一命中、多匹配和错误 mock 协议可直接覆盖新后端搜索顺序，无需修改 IPC 结构。
- [x] `desktop/tests/e2e/local-markdown-preview.spec.ts`：确认现有频道/DM 与 Inbox 相对路径交互测试继续覆盖搜索结果的预览和多匹配选择；目录优先级由 Rust 单测验证。
- [x] `desktop/src-tauri/src/commands/local_markdown.rs`：恢复 workspace 原样相对路径优先解析，并增加 `PLANS/foo.md`、workspace 根文件和分阶段回退的回归测试。

## 9. 实施约束

- 实施前由鹿鹿子大王确认本方案与产品边界。
- 改代码时从最新本地 `dev` 创建 `codex/` 修复分支，并保留工作区中无关改动。
- 不引入 arbitrary px/rem 文本字号；使用现有 rem-based Tailwind token。
- 不新增 module-level community-scoped cache；如实现中确有新增，必须提供 reset 并接入 `resetCommunityState()`。
- 完成后运行相关测试与 `just ci`，制作有作用域的 Desktop 截图，并使用 signed-off commit 提交；在鹿鹿子大王完成测试并明确要求前，不合并回 `dev`。
