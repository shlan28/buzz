> 更新日期：2026-08-08
> 更新说明：新增 Web Inbox 点击详情、真实用户/Agent 身份和 Markdown 正文补齐方案；与 Track 详情修复同批实施，文件预览不在范围内。

# Web Inbox 详情、身份与 Markdown 补齐方案

## 一、问题结论

鹿鹿子大王指出的三个问题均存在：

1. Web Inbox 行使用静态 `<article>`，没有选择状态、详情面板或跳转行为；
2. 作者名称直接显示 `pubkey` 前 10 位，没有消费已经取得的 profile，因此 Agent 名称丢失；
3. 正文使用普通 `<p>` 输出原始字符串，没有经过 Web 已有的安全 Markdown 组件。

这不是 Relay 数据不足，而是 Web Inbox 被实现成了简化的“最近消息列表”，没有复刻 Desktop 的 Inbox list/detail 产品结构。

## 二、产品目标

本次将 Web Inbox 补齐为只读的 Desktop-style 双栏 Inbox：

- 左侧为可点击的 Inbox 条目列表；
- 右侧显示所选条目的会话详情和上下文；
- Agent/User 显示真实 profile 名称、头像和身份回退色；
- 列表预览保持紧凑纯文本，详情正文使用安全 Markdown；
- 提供“Open conversation”进入对应 DM/Channel；
- iPad 窄屏采用列表与详情单面板切换；
- URL 保存所选 item，刷新和前进后退可以恢复。

本轮保持只读，不在 Inbox 内发送回复、删除、reaction 或改变已读状态。文件预览、附件下载和本机文件访问不在范围内。

## 三、Desktop 事实源与 Web 边界

Desktop Inbox 使用 `InboxListPane` 和 `InboxDetailPane`：列表选择一组会话活动，详情呈现上下文时间线，并统一使用 profile、Avatar 和 Markdown。

Web 当前数据层只取得 Channel/DM 消息，没有 Desktop 完整的 mentions、needs-action、agent-activity、project、reminder 和 task-execution Inbox feed。因此本次不会把“所有消息”伪装成完整 Desktop Inbox 语义；先准确补齐当前 Recent activity 数据集的详情、身份和正文展示。

后续若要求 Inbox 条目集合也与 Desktop 完全一致，需要另行同步 Desktop feed 投影、已读游标和专项 Inbox kinds。该部分不应与本次三个明确 UI 缺口混在一起。

## 四、交互设计

### 4.1 Inbox 列表

- 每一行改为可键盘和触控点击的 `<button>`；
- 显示作者真实名称、头像、Agent/User 正确回退色、Channel/DM 名称、时间和两行纯文本预览；
- 当前选中行使用 Desktop 的 muted selected 状态；
- 同一消息不得因为 profile 刷新而改变 item identity。

### 4.2 Inbox 详情

- Desktop 宽度下使用左列表、右详情双栏；
- 详情头部显示作者、会话位置、时间和 `Open conversation`；
- 正文及同一会话上下文按稳定时间顺序展示；
- 使用 `MessageMarkdown` 渲染标题、强调、列表、引用、链接、行内代码、代码块、表格和换行；
- 危险协议与原始 HTML 继续由现有安全规则阻断；
- 使用 `ProfileAvatar` 和 `profileLabel`，与 DM/Channel 同一 pubkey 的名称、头像和身份色一致。

### 4.3 路由与恢复

- 使用 `/app/inbox?item={eventId}` 保存选择，不新增不必要的详情路径；
- 首次进入宽屏时可自动选择最新条目；
- 窄屏首次进入只显示列表，点击后显示详情并提供 Back；
- 刷新、前进和后退恢复 URL 对应条目；
- URL 中 item 不存在时安全回退，不显示旧社区数据。

### 4.4 打开原会话

- `Open conversation` 导航到 `/app/channels/{channelId}`；
- 详情中不伪造回复能力；
- 进入原会话后使用现有 DM/Channel 消息发送、实时回复和底部定位逻辑。

## 五、数据投影

- 作者名称：当前用户显示现有 profile 名称而不是统一写死 `You`；其他作者使用 `displayName -> name -> pubkey fallback`。
- 会话名称：使用 `channel.displayName`，DM 显示 Agent/参与者名称，不使用内部 channel name。
- 上下文：从现有消息集中选取相同 `channelId` 的消息，按 `createdAt + id` 稳定排序，并定位选中 event。
- Agent 身份：只使用已验证 profile 的 `isAgent`，不通过名称猜测。
- 列表预览：从 Markdown 内容提取可读纯文本并限制两行，避免直接显示 `##`、反引号等语法符号。
- 详情正文：保留原 content 交给 `MessageMarkdown`。

## 六、响应式与视觉

- Desktop/iPad 横屏：列表宽度遵循 Desktop Inbox 栏比例，详情使用白色/暖黑 content surface。
- iPad 竖屏和紧凑宽度：列表与详情单面板切换，详情 Back 可返回列表。
- 列表内部滚动与详情时间线独立，不产生页面级横向溢出。
- Markdown 代码和表格只在正文容器内滚动。
- 选中态、分隔线、作者字号、时间字号、头像尺寸与 Desktop Inbox 对齐。

## 七、异常与安全

- Profile 缺失时使用稳定 pubkey fallback 和普通 User 色，不能误标 Agent。
- Channel 被过滤或不存在时仍可查看消息，但 `Open conversation` 禁用并说明原因。
- URL 指向不存在的 event 时回退到最新条目；空 Inbox 显示 `You’re all caught up.`。
- Markdown 链接使用 `noopener noreferrer`，危险 URL 不生成可执行链接。
- 本次不读取本机路径、不加载文件附件预览，也不改变 Relay media 权限。

## 八、验收标准

- Inbox 每条记录可点击，宽屏打开右侧详情，窄屏进入单独详情面板。
- Agent 作者显示真实 Agent 名称和头像；无头像时使用 Agent primary 回退色。
- 普通用户使用真实 profile 名称和 User secondary 回退色。
- DM 位置显示 DM 对象名称，而不是内部名称或 pubkey。
- 详情支持 Markdown 标题、列表、强调、代码和安全链接。
- `Open conversation` 到达正确 Channel/DM。
- `?item=` 在刷新、前进和后退后正确恢复。
- Chrome、iPad 横屏、iPad 竖屏 E2E 和 Light/Dark 视觉回归通过。
- 不实现文件预览，不改变 Track 详情方案范围。

## 九、Todo List

- [ ] `web/src/features/inbox/inboxProjection.ts`：生成稳定 Inbox 条目、profile/channel label、纯文本预览和会话上下文。
- [ ] `web/src/features/inbox/InboxListPane.tsx`：实现可选择列表、真实头像/名称、位置、时间和 selected 状态。
- [ ] `web/src/features/inbox/InboxDetailPane.tsx`：实现只读上下文、Markdown 正文、Back 和 Open conversation。
- [ ] `web/src/features/inbox/InboxPage.tsx`：组合响应式双栏/单栏布局，并同步 `?item=`、刷新和浏览器历史。
- [ ] `web/src/features/messages/MessageMarkdown.tsx`：仅在 Inbox 验收发现共享样式缺口时补齐通用正文约束，不增加附件预览。
- [ ] `web/tests/e2e/inbox-projection.spec.ts`：覆盖 profile label、Agent 身份、DM label、纯文本预览和稳定排序。
- [ ] `web/tests/e2e/work-console.spec.ts`：覆盖 Inbox 点击详情、Markdown、Open conversation 和 URL 恢复。
- [ ] `web/tests/e2e/ipad-layout.spec.ts`：覆盖 Inbox 双栏/单栏切换及局部滚动边界。
- [ ] `web/tests/e2e/desktop-parity.visual.spec.ts`：增加 Inbox 列表/详情 Light/Dark 视觉基线。
- [ ] `web/tests/helpers/desktopParityFixtures.ts`：增加多作者、Agent Markdown、缺失 Channel 和跨会话 Inbox fixture。
- [ ] `docs/2026-08-08-web-inbox-detail-profile-markdown-plan.md`：记录测试、实现 commit 和 Cloudflare 部署号。

## 十、代码规范检查

- 已检查项目文档入口，仓库当前没有 `docs/index.md` 或 `docs/INDEX.md`。
- 参考 `AGENTS.md`、`CONTRIBUTING.md`、Desktop `InboxListPane` / `InboxDetailPane` 与现有 Web profile、Avatar、Markdown 实现。
- 不新增状态库或 Markdown 依赖，复用现有 React、TanStack Router、Tailwind、`ProfileAvatar` 和 `MessageMarkdown`。
- 每个 Todo 只对应一个文件；完成后执行 Web check、完整 Playwright 矩阵、signed-off commit 和 Cloudflare 部署。

## 十一、确认门

鹿鹿子大王确认后，将本方案与 Web Track detail 方案作为同一批代码任务实现、测试、提交并部署。
