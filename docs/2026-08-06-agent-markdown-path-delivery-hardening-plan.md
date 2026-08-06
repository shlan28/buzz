# Agent Markdown 路径交付加固方案

> 更新日期：2026-08-06
> 更新说明：完成 Desktop 中文标点路径兼容、Agent 行内代码交付规范及两侧回归测试。

## 1. 结论摘要

Buzz 应同时修复展示容错与 Agent 交付格式：

1. Desktop 把 `.md` 路径后的常见中文尾随标点视为句子标点，不把它们并入路径，也不因此放弃识别。
2. Buzz ACP 的共享 Agent 输出规范要求：交付本地 Markdown 文件时，始终把完整路径放在行内代码中，例如 `RESEARCH/REPORT.md`。

两层职责不同。Desktop 兼容中文自然语言，保证旧消息和不完全遵守规范的 Agent 回复仍可预览；Agent 规范提供稳定、无歧义的交付格式，尤其保护含空格路径和多语言句子中的路径边界。

本次不改变本地文件读取权限、安全校验、搜索目录或预览 UI，只修正路径文本的识别边界与 Agent 的消息生成约束。

## 2. 问题与根因

Business Researcher 已生成真实文件 `RESEARCH/GOOGLE_ADS_INTEGRATION_GUIDE.md`，并作为已知 managed Agent 正常发送消息。但消息写成：

```text
文档已保存到 RESEARCH/GOOGLE_ADS_INTEGRATION_GUIDE.md。
```

当前普通文本路径正则只接受英文尾随标点和空白作为 `.md` 后边界。中文句号 `。` 不在允许集合中，因此整条路径不会转换为 `local-markdown-path` 节点，Desktop 无法显示预览入口。

这不是文件不存在、Agent 身份未识别或 Tauri 读取失败；失败发生在用户点击之前的 Markdown 文本解析阶段。

## 3. 产品行为

### 3.1 Desktop 容错

下列消息中的路径都应识别为 `RESEARCH/REPORT.md`，尾随标点继续作为普通文本展示：

```text
报告：RESEARCH/REPORT.md。
请看“RESEARCH/REPORT.md”
请看《RESEARCH/REPORT.md》
请看（RESEARCH/REPORT.md）
请看【RESEARCH/REPORT.md】
```

首版明确支持用户提出的常见中文尾随标点：

- `。`
- `、`
- 中文引号：`“`、`”`、`‘`、`’`
- 中文书名号：`《`、`》`
- 中文圆括号：`（`、`）`
- 中文方头括号：`【`、`】`

其中开标点主要用于保证路径前边界清晰，闭标点用于 `.md` 后的匹配边界。现有英文标点、空白、绝对路径、相对路径、`~/` 路径和 Windows 路径行为保持不变。

### 3.2 Agent 交付规范

当 Agent 新建、更新或交付一个本地 Markdown 文件时，发给用户的消息必须包含一个行内代码路径：

```markdown
调研完成，完整报告：`RESEARCH/GOOGLE_ADS_INTEGRATION_GUIDE.md`
```

规范要求：

- 路径必须精确指向实际写入的 `.md` 文件。
- 完整路径整体放进一对反引号，标点放在反引号之外。
- 可以使用 workspace 相对路径或绝对路径；优先使用简短、可读的 workspace 相对路径。
- 不能只说“文档已保存”而省略路径。
- 多个交付文件分别提供各自的行内代码路径。

该规则写入 `buzz-acp` 共享 base prompt，因此对 Business Researcher 及其他经 ACP 运行的 Agent 一致生效，不在单个 persona 的 system prompt 中重复维护。

## 4. 技术方案

### 4.1 路径解析

扩展 `LOCAL_MARKDOWN_PATH_PATTERN` 的前后边界字符集合，使中文开闭标点能够围绕路径出现。匹配结果仍只包含以 `.md` 结尾的路径本身，不吞掉标点。

保留现有安全约束：

- 不识别 URL。
- 不识别包含 `..` 的路径。
- 不识别 `.mdx`、`.markdown` 或其他扩展名。
- fenced code block 不启用路径按钮。
- 带空格路径仍要求通过行内代码表达。

### 4.2 解析回归测试

在现有纯逻辑测试中增加表驱动用例，覆盖中文句号、顿号、引号、书名号、圆括号和方头括号，并断言：

- 提取出的路径不包含标点；
- 一句话中多个不同包裹形式都能识别；
- 中文标点本身不会被误识别为路径内容；
- 原有英文和负例继续通过。

### 4.3 共享 Agent Prompt

在 `base_prompt.md` 的 Communication Patterns / General 规则中增加本地 Markdown 文件交付要求。规则使用正反例说明行内代码路径、标点位置和不得省略路径，避免模型只理解为视觉格式偏好。

### 4.4 Prompt 契约测试

在现有 `include_str!("base_prompt.md")` 契约测试模块中增加断言，确保共享 prompt 持续包含以下语义：

- 本地 `.md` 交付路径必须使用 inline code；
- 标点位于反引号之外；
- 交付消息不能省略实际路径。

这样未来精简 prompt 时不会无意移除预览所依赖的输出协议。

## 5. 验收标准

1. Agent 普通文本回复 `RESEARCH/REPORT.md。` 时，路径可点击，中文句号保持可见且不进入读取参数。
2. 路径被 `“”`、`《》`、`（）`、`【】` 包裹时均可点击。
3. 英文标点、Windows 路径、相对路径及现有负例没有回归。
4. Buzz ACP 共享 prompt 明确要求交付 `.md` 时使用行内代码路径。
5. Business Researcher 按新规范回复 ``完整报告：`RESEARCH/REPORT.md`。`` 时可正常预览。
6. 不扩大 Desktop 本地文件读取权限，不自动读取文件，不改变 2 MiB、UTF-8、普通文件和 workspace 有界搜索约束。

## 6. 验证计划

实施后运行：

```bash
. ./bin/activate-hermit
cd desktop && pnpm test
cargo test -p buzz-acp shared_base_prompt
just ci
```

手工验证时使用真实 managed Agent 返回带行内代码的相对 `.md` 路径，并确认消息时间线中出现可点击预览入口。

## 7. Todo List

每个 Todo 只对应一个文件。

- [x] `desktop/src/features/messages/lib/remarkLocalMarkdownPaths.ts`：扩展本地 Markdown 路径的中文开闭标点边界，不把标点并入路径。
- [x] `desktop/src/features/messages/lib/remarkLocalMarkdownPaths.test.mjs`：增加中文句号、顿号、引号、书名号、圆括号和方头括号的解析回归测试。
- [x] `crates/buzz-acp/src/base_prompt.md`：要求 Agent 交付本地 `.md` 文件时始终用行内代码包裹完整路径，并把句子标点放在反引号外。
- [x] `crates/buzz-acp/src/lib.rs`：增加共享 base prompt 的 Markdown 路径交付规范契约测试。

## 8. 实施约束

- 获得鹿鹿子大王确认后才修改代码。
- 从最新本地 `dev` 创建 `codex/` 修复分支，保留当前未跟踪文档等无关用户改动。
- 不顺带修改本地 Markdown 读取、搜索或身份识别逻辑。
- 完成测试后使用 signed-off commit 提交；按项目分支流程合并回 `dev`。
