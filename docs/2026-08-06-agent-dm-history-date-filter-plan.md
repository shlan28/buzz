# Agent DM 历史查看与搜索弹窗方案

> 更新日期：2026-08-06
> 更新说明：完成独立的大尺寸只读历史弹窗实现；保留现有 DM 实时消息、缓存、滚动与分页逻辑，支持日期范围浏览和范围内简单全文搜索，并明确首版结果数量上限。

## 1. 背景

当前进入 Agent DM 后，Desktop 与普通 DM 一样加载最新 50 条顶层消息；用户向上滚动时，每次继续加载更早 50 条，直到到达 DM 起点。页面还会持续接收实时消息，并维护当前滚动位置、输入草稿、未读状态和 Thread 状态。

直接在 DM 页面切换日期范围会改变当前消息窗口，容易造成以下问题：

- 历史结果覆盖当前实时消息；
- 切换范围后丢失滚动位置；
- 新消息混入旧时间范围；
- 不同日期范围共用 channel-only 缓存而互相污染；
- 用户发送消息后，因为消息不在筛选范围内而看不见。

因此本次保留 DM 主页面的全部现有行为，只增加一个与主时间线隔离的历史查看入口。

本次不调整 Agent Session、模型上下文、上下文压缩或长期记忆。

## 2. 产品目标

1. 在 Agent 一对一 DM 标题栏增加“查看历史”按钮。
2. 点击后打开独立的大尺寸弹窗，不替换或重置当前 DM 时间线。
3. 用户可选择开始时间与截止时间，精确到年月日时分。
4. 弹窗以只读方式加载指定范围内的历史消息。
5. 用户可输入简单关键词，搜索指定日期范围内的完整历史消息内容。
6. 关闭弹窗后，原 DM 的消息、滚动位置、草稿、未读状态和实时订阅保持不变。
7. 普通频道、人与人的 DM、群聊和 Thread 主流程保持不变。

## 3. 产品范围

### 3.1 什么是 Agent DM

本期仅作用于同时满足以下条件的会话：

- `channelType === "dm"`；
- DM 中除当前用户外只有一名参与者；
- 该参与者的 pubkey 能被当前 community 的已知 Agent 集合确认。

群聊中即使包含 Agent，也不应用本功能。无法确认对方是否为 Agent 时，按普通 DM 处理。

### 3.2 不改变现有 DM 加载逻辑

进入 Agent DM 后仍然：

- 首次加载最新 50 条顶层消息；
- 向上滚动时每次加载更早 50 条；
- 接收并合并实时消息；
- 使用现有 channel window 缓存与复合游标；
- 继续维护 Thread summary、reaction、edit、delete 等辅助状态。

取消旧方案中的“进入 Agent DM 默认只加载最近 3 天”。日期范围仅作用于独立历史弹窗。

## 4. 用户体验

### 4.1 入口

在 Agent DM 标题栏右侧增加带时钟/历史图标的“查看历史”按钮，与现有标题栏操作保持一致。

按钮只在 Agent 一对一 DM 中出现。

### 4.2 弹窗尺寸与布局

历史弹窗采用接近全屏的大尺寸阅读布局：

- 宽度约为主内容区域的 86%；
- 高度约为主内容区域的 84%；
- 不覆盖左侧导航；
- 背景 DM 保持可见但降低亮度，明确用户仍处于当前会话；
- 弹窗内部结果区域独立滚动。

弹窗顶部包含：

- 标题“查看历史消息”；
- 说明“按时间范围查看与 {Agent Name} 的历史对话，不会影响当前会话。”；
- “只读历史”标识；
- 关闭按钮。

### 4.3 日期范围

顶部工具栏包含：

- 开始时间：本地 `YYYY-MM-DD HH:mm`；
- 截止时间：本地 `YYYY-MM-DD HH:mm`；
- 关键词输入框；
- 主操作按钮；
- “重置”操作。

日期规则：

- 开始和截止时间均必填，精确到分钟；
- 输入按用户本地时区展示，查询前转换为 Unix 秒；
- 开始时间不得晚于截止时间；
- 截止时间不得晚于当前时间；
- 开始分钟包含整分钟；
- 截止输入转换为该分钟的最后一秒，避免漏掉截止分钟内的消息；
- 本期不预设最大时间跨度；日期浏览单次最多返回 500 条，达到上限时明确提示缩小时间范围。

### 4.4 简单搜索

关键词输入框 placeholder 为“搜索历史消息内容”。

搜索规则：

- 关键词为空：按日期范围浏览全部历史消息；
- 关键词非空：搜索整个指定日期范围内的历史，而不是只过滤当前已经加载的 50 条；
- 关键词、开始时间、截止时间一起提交；
- 复用现有 Relay/Postgres FTS 搜索能力；
- 结果显示命中总数；
- 消息正文中对命中词做轻量高亮；
- 清空关键词并重新提交后恢复日期范围浏览；
- 本期不增加作者、消息类型、排序、布尔表达式等高级筛选。

这里的“简单搜索”是全文关键词搜索，不承诺严格的逐字符子串匹配。分词、大小写和标点行为遵循现有 Buzz 全文搜索规则。

### 4.5 历史结果

弹窗中的消息沿用 Buzz 当前时间线样式：

- 不使用聊天气泡或卡片式消息；
- 展示头像、作者、时间和正文；
- 日期范围浏览时按时间顺序展示；
- 搜索结果显示命中数量和关键词高亮；
- 日期浏览最多展示 500 条，搜索最多展示 100 条；达到上限时提示缩小日期范围或关键词；
- 空结果显示“该时间范围内没有消息”或“没有找到相关消息”；
- 查询失败时保留条件并提供重试。

### 4.6 只读边界

首版弹窗不提供：

- 发送消息；
- 编辑或删除；
- 添加或撤销 reaction；
- 自动混入实时新消息；
- 修改当前 DM 的已读位置；
- 修改主时间线缓存或滚动位置。

首版允许查看文本、附件、作者和时间，也可以复制消息内容。

“定位到当前 DM”和在弹窗中展开完整 Thread 可作为后续能力，因为目标消息可能不在主 DM 当前已加载窗口内。

## 5. 状态与异常

- 初始状态：展示日期和关键词控件，尚未查询时不显示伪造结果。
- 查询中：结果区域显示加载状态，按钮禁止重复提交。
- 日期非法：在对应输入项附近说明原因，不发请求。
- 空结果：保留查询条件，提供修改条件和重置操作。
- Relay 失败：保留上一份可用结果与用户输入，提供重试。
- 搜索关键词只有空白：按无关键词处理。
- 关闭再打开：首版重置未提交条件；不跨 Channel 复用弹窗状态。
- 切换 Channel/Community：自动关闭弹窗并清除弹窗查询状态。
- DM 收到实时消息：主页面正常更新，弹窗结果不变。

## 6. 技术现状

### 6.1 DM 历史窗口

`useChannelMessagesQuery()` 调用 `get_channel_window` 获取最新窗口，默认包含 50 条顶层消息及相关 summary/auxiliary events。`useFetchOlderMessages()` 使用窗口尾部的 `(createdAt, eventId)` 复合游标继续分页。

当前窗口查询支持：

- `#h` channel 范围；
- 明确的消息 kinds；
- `until + before_id` 复合游标；
- `limit`、`top_level`；
- Thread summaries 与 auxiliary events。

### 6.2 全文搜索

现有 `searchMessages()` 已支持：

```ts
type SearchMessagesInput = {
  q: string;
  limit?: number;
  channelId?: string;
  authors?: string[];
  since?: number;
  until?: number;
};
```

因此弹窗搜索可以直接传入 `q + channelId + since + until`，不需要新增搜索协议或数据库能力。

## 7. 技术方案

### 7.1 独立弹窗状态

新增 Agent DM 历史弹窗状态：

```ts
type AgentDmHistoryQuery = {
  channelId: string;
  since: number;
  until: number;
  keyword: string;
};
```

弹窗的打开、关闭、表单草稿、已提交条件、加载状态和结果状态均独立于 `ChannelScreen` 当前消息窗口。

### 7.2 独立缓存

日期范围浏览使用范围化 key：

```ts
["agent-dm-history", channelId, since, until]
```

搜索使用现有搜索能力的独立 key：

```ts
["agent-dm-history-search", channelId, since, until, normalizedKeyword]
```

不能复用当前：

```ts
["channel-window", channelId]
```

这样可保证：

- 弹窗不会覆盖主 DM 消息；
- 不同日期范围不会互相污染；
- 不同关键词结果不会互相覆盖；
- live subscription 不会把新消息塞入历史结果；
- 关闭弹窗不需要重建主 DM。

### 7.3 日期范围浏览查询

新增独立的 `get_channel_history_range` 命令：

```ts
type ChannelHistoryRange = {
  since: number;
  until: number;
};
```

日期浏览 filter：

```json
{
  "#h": ["<channel-id>"],
  "kinds": ["<existing timeline kinds>"],
  "since": 1782838800,
  "until": 1783055400,
  "limit": 500
}
```

首版采用有界只读结果，不接入主时间线的复合游标、summary 或 auxiliary store。查询结果仅保存在独立 React Query key 中，不写入主 `channelWindowKey`。如命中 500 条上限，界面提示用户缩小时间范围；完整分页作为后续增强。

### 7.4 搜索查询

关键词非空时不走客户端过滤，而调用现有 `searchMessages()`：

```ts
searchMessages({
  q: normalizedKeyword,
  channelId,
  since,
  until,
  limit: 100,
});
```

这样搜索覆盖该日期范围内的完整历史，即使相关消息尚未通过日期浏览分页加载，也能被搜索到。

搜索结果使用现有 `SearchHit`，按 event ID 获取或映射展示所需信息。首版只展示命中消息本身，不承诺重建完整上下文段落。

### 7.5 关联事件完整性

日期范围应限制“哪些主消息进入结果”，而不是简单限制所有参与渲染的事件。

例如主消息发生在 7 月 1 日，但其 edit、delete 或 reaction 发生在 7 月 4 日。如果对所有事件统一应用截止时间，用户可能看到编辑前内容、错误 reaction 数或已删除消息。

首版弹窗只展示命中消息的作者、时间和正文，不展示 reaction、编辑状态、删除状态或 Thread summary，因此不会把不完整的辅助事件呈现给用户，也不会把结果写入主时间线 store。

后续若要在历史弹窗中展示这些状态，必须改为按范围内主消息由服务端组装辅助事件，或按命中 event ID 补取详情；不能简单地对全部事件统一应用时间边界。

### 7.6 Agent DM 识别

复用 `ChannelScreen` 已有 current identity、DM participants 和 known Agent pubkeys，抽出纯函数判断是否为 Agent 一对一 DM。

识别结果只决定是否显示“查看历史”入口，不改变权限、消息格式或主 DM 查询行为。

### 7.7 UI 组件边界

建议新增专用组件承载大弹窗，不把表单、搜索、分页和结果展示继续堆入 `ChannelScreen.tsx`：

- Header 只负责显示入口；
- `ChannelScreen` 只负责编排当前 Agent DM 和弹窗开关；
- 历史弹窗负责日期、关键词、查询状态和只读结果；
- 数据 hook 负责日期浏览与搜索请求。

UI 遵循 Buzz 当前浅色 Desktop 风格、无气泡消息流和命名 rem 字号 token。

## 8. 数据与协议影响

- 不新增 Nostr event kind。
- 不新增数据库表或迁移。
- 不新增专用 HTTP endpoint。
- 日期浏览继续使用通用 `/query` bridge。
- 搜索复用现有 NIP-50/Postgres FTS 能力。
- 不改变消息存储、保留和权限策略。
- Tauri 新增独立历史范围命令，现有 channel window 命令与调用保持不变。
- Relay 继续执行 community、membership、channel 和消息可见性检查。

## 9. 验收标准

1. 只有 Agent 一对一 DM 显示“查看历史”按钮。
2. 点击后打开大尺寸弹窗，左侧导航和背景 DM 仍可辨认。
3. 打开、查询、关闭弹窗不改变主 DM 消息、滚动位置、草稿和未读状态。
4. 用户可选择精确到分钟的开始与截止时间。
5. 无关键词时，弹窗按日期范围浏览最多 500 条历史，并在达到上限时提示缩小范围。
6. 有关键词时，搜索整个日期范围，不局限于已加载页面。
7. 搜索结果显示命中数并高亮关键词。
8. 清空关键词后可恢复日期范围浏览。
9. 不同日期、关键词结果使用独立缓存，不与主 DM 或彼此混合。
10. 弹窗打开期间的新消息只更新主 DM，不进入历史结果。
11. 弹窗中不出现发送、编辑、删除或 reaction 操作。
12. 日期边界、非法范围、空结果、Relay 失败和重试均有明确状态。
13. 切换 Channel/Community 后不残留上一会话的弹窗或结果。

## 10. 测试策略

### 10.1 纯逻辑测试

- Agent 一对一 DM、人与人 DM、群 DM、未知 participant 的识别。
- 本地日期时间到 Unix 秒转换。
- 截止分钟包含规则。
- 开始晚于截止、未来截止和 DST 非法时间。
- 关键词 trim 与空白关键词归一化。
- 日期浏览和搜索 query key 隔离。

### 10.2 Desktop 数据层测试

- 日期浏览正确传递 `channelId + since + until + limit`。
- 搜索正确传递 `q + channelId + since + until`。
- 主 DM、日期范围、搜索结果不互相覆盖。
- live message 只进入主 DM。
- 关闭弹窗不 invalidate 或替换主 channel window。

### 10.3 Rust/Tauri 测试

- 历史范围 filter 生成正确的 channel、kinds、`since/until` 和 limit。
- 非法范围与超限参数被拒绝。
- 现有 channel window filter 保持不变。

### 10.4 Desktop E2E

- Agent DM 展示入口，普通 DM 和群 DM 不展示。
- 大弹窗尺寸和 Buzz 视觉风格。
- 日期浏览、空状态和错误重试。
- 日期范围内搜索、命中数、关键词高亮和清空恢复。
- 弹窗打开时注入 live message，主 DM 更新而弹窗结果不变。
- 关闭后主 DM 滚动位置、草稿和消息保持不变。

E2E 使用 `pnpm build:e2e` 和 mock Tauri bridge；截图前调用共享 animation wait helper。

## 11. 风险与建议

### 风险 1：在客户端过滤已加载消息

如果先加载 50 条，再用 `filter()` 处理日期或关键词，只能查询当前缓存，无法找到未分页加载的历史，也不会减少 Relay 和网络负担。

正确方式：日期范围进入 Relay filter；关键词使用现有全文搜索，并同时传入 channel 和时间边界。

### 风险 2：复用 channel-only 缓存

主 DM、不同日期范围和不同关键词若都写入 `channelWindowKey(channelId)`，会发生覆盖、混合、错误分页和 live message 污染。

正确方式：主 DM 保持原 key，历史浏览与搜索使用包含范围和关键词的独立 key。

### 风险 3：关联事件不完整

范围内主消息的 reaction、edit、delete 或 Thread summary 可能发生在范围外。简单按所有事件的 `created_at` 截取，会让历史消息显示为错误状态。

正确方式：首版不展示这些辅助状态；后续如需展示，日期浏览应使用 server-assembled window，搜索结果则按命中 event ID 补取详情。

### 风险 4：把搜索做得过重

作者、类型、排序、正则表达式和高级语法会扩大交互与测试范围。

建议首版只支持单个关键词输入框，并复用现有 FTS 语义。先验证用户是否频繁使用，再决定是否增加高级筛选。

### 建议：保持只读

首版在弹窗中发送、编辑或 reaction，会引入主时间线同步、权限、乐观更新和滚动定位问题。保持只读可以让历史查询与实时会话真正隔离。

## 12. Todo List

每个 Todo 只对应一个文件；业务代码必须在本方案确认后再修改。

- [x] `desktop/src/features/channels/lib/agentDmHistory.ts`：定义 Agent DM 识别、日期范围、关键词归一化和校验纯函数。
- [x] `desktop/src/features/channels/lib/agentDmHistory.test.mjs`：覆盖 Agent DM 识别、日期边界、非法范围和关键词归一化。
- [x] `desktop/src/features/channels/useAgentDmHistoryDialog.tsx`：管理弹窗开关、表单草稿、已提交条件和 Channel 切换清理。
- [x] `desktop/src/features/channels/ui/AgentDmHistoryDialog.tsx`：实现大尺寸只读弹窗、日期控件、搜索框、状态和结果布局。
- [x] `desktop/src/features/channels/ui/ChannelScreenHeader.tsx`：仅在 Agent 一对一 DM 中挂载“查看历史”入口。
- [x] `desktop/src/features/channels/ui/ChannelScreen.tsx`：编排 Agent DM 识别和弹窗，不改主时间线查询。
- [x] `desktop/src/shared/api/channelWindow.ts`：增加独立的历史范围请求。
- [x] `desktop/src/features/messages/useAgentDmHistoryQuery.ts`：实现隔离的日期范围浏览与全文搜索查询 key。
- [x] `desktop/src-tauri/src/commands/channel_window.rs`：新增历史范围命令并将 `since/until` 写入 Nostr filter。
- [x] `desktop/src-tauri/src/lib.rs`：注册历史范围 Tauri 命令。
- [x] `desktop/src/testing/e2eBridge.ts`：支持日期历史窗口的 mock 数据。
- [x] `desktop/tests/e2e/agent-dm-history-dialog.spec.ts`：覆盖入口、日期浏览、搜索、主时间线隔离、关闭恢复和非 Agent DM 回归。
- [x] `desktop/playwright.config.ts`：将 Agent DM 历史弹窗用例注册到 smoke 项目。

## 13. 实施顺序

1. 完成 Agent DM 识别、范围/关键词模型和测试。
2. 增加独立历史范围命令，验证 Relay filter 与结果上限。
3. 复用现有 `searchMessages()` 接入日期范围内全文搜索。
4. 实现大尺寸只读弹窗和 Buzz 风格结果列表。
5. 接入 Header 入口，验证主 DM 状态完全不受影响。
6. 补齐错误、空状态、结果上限、搜索高亮和 E2E。
7. 运行 Desktop 单测、类型检查、E2E smoke、Tauri Rust 测试与相关格式检查。

本方案确认前不修改业务代码。
