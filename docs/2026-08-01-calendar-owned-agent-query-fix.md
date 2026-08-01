> 更新日期：2026-08-01
> 更新说明：已完成 Calendar 当前 Relay 作者过滤、错误重试界面及跨 Relay Agent 回归测试。

# Calendar owned Agent 日程不可见修复方案

## 一、问题与产品目标

daily-assistant 已成功创建日程，Relay 也正确保存了日程及 Agent owner 关系，但用户在 Desktop Calendar 中看不到这些日程。

修复后的产品行为应为：

1. Calendar 展示用户本人创建的日程。
2. Calendar 展示当前 Relay 明确登记为该用户 owned Agent 的日程。
3. 其他 Relay 的本地 Agent、未注册 Agent 和属于其他用户的 Agent，不参与当前 Relay 的日历查询。
4. 某个本地 Agent 不属于当前 Relay 时，不得导致本人及其他 owned Agent 的全部日程消失。
5. Relay 查询失败时显示明确的错误和重试入口，不把错误伪装成“没有日程”。

## 二、已确认的根因

当前 Desktop 本地有 7 个带公钥的托管 Agent，但其中 3 个不是 `achoverse.xyz` 上当前用户登记的 owned Agent。

Calendar 现有逻辑把所有本地托管 Agent 都加入同一个 Nostr `authors` 过滤器。Relay 的日历权限规则会验证过滤器中的每一位作者；只要其中一位不是当前用户或当前 Relay 登记的 owned Agent，Relay 就拒绝整条查询。

这会产生两个错误表现：

- daily-assistant 的合法日程与非法作者处于同一个查询中，因此一起无法返回；
- Calendar 没有渲染查询错误，最终看起来像一个正常的空日历。

已排除以下原因：

- 日程没有写入：数据库和 `buzz calendar list` 均能返回日程；
- Agent owner 不正确：daily-assistant 的 owner 是当前 Desktop 身份；
- Relay ACL 不支持 owner：使用当前 Desktop 身份按 daily-assistant 作者查询已经成功；
- 日期范围错误：目标日程位于 2026-08-02，直接查询该日已返回结果。

## 三、修复设计

### 3.1 当前 Relay 是日历作者集合的唯一来源

Calendar 不再把 `useManagedAgentsQuery()` 返回的全部本地 Agent 直接视为当前 Relay 的可查询作者。

日历作者集合改为：

```text
当前用户
+ 当前 Relay agent profile 中 ownerPubkey 等于当前用户的 Agent
```

Agent profile 的 `auth` tag 已包含 owner 公钥；现有 `getUsersBatch()` 会把它转换为 `ownerPubkey`。Relay 仍是最终权限裁决者，前端只负责避免构造必然被拒绝的批量过滤器。

本地托管 Agent 列表继续用于显示名称等本地 UI 信息，但不再单独赋予当前 Relay 的日历读取资格。这样不会改变 Home、Agent observer 等其他功能对本地 Agent 的既有语义。

### 3.2 保持查询原子性

Calendar 继续使用一个包含本人及合法 owned Agent 的批量 `authors` 查询，避免为每个 Agent 发起独立请求。

不采用“逐 Agent 查询并忽略 403”的方案，因为它会制造无意义的拒绝请求、增加 Relay 压力，并掩盖 owner 数据不一致。

### 3.3 增加可见错误状态

Calendar 页面增加查询失败状态：

- 显示“Calendar couldn't be loaded”及简短原因；
- 提供 Retry 按钮；
- 查询失败时不渲染成空白日历；
- 保持创建/编辑弹窗的既有错误处理不变。

### 3.4 不在本次扩展的内容

以下性能优化另行处理，不混入本次正确性修复：

- 使用 `calendar_from/calendar_to` 做服务端日期范围过滤；
- 消除 Calendar 对 Agent profile 的阻塞等待；
- 优化 Cloudflare Tunnel 延迟；
- 增加新的 owned-agent Relay API。

## 四、测试方案

### 4.1 单元与类型检查

- 验证 Calendar 作者集合不会包含只有本地托管记录、但不属于当前 Relay 的 Agent。
- 验证 owner profile 属于当前用户的 Agent 会被保留。
- 验证其他用户拥有的 Agent 会被排除。
- 运行 Desktop TypeScript 类型检查和 Biome。

### 4.2 Desktop E2E

- 同时注入 owned Agent 和非当前 Relay 的本地 Agent；确认 owned Agent 日程仍可见。
- 模拟日历查询被 Relay 拒绝；确认页面显示错误和 Retry，而不是空日历。
- 保留现有日历导航、全天时间轴、点击创建、拖拽创建和 Agent 日程详情测试。

### 4.3 真实 Relay 验证

- 使用当前 Desktop 身份打开 2026-08-02。
- 确认 daily-assistant 创建的日程可见。
- 确认详情展示 `Created by daily-assistant`。
- 确认其他 Relay 的本地 Agent 不会导致 Calendar 查询被拒绝。

## 五、Todolist

- [x] 修改 `desktop/src/features/calendar/hooks.ts`：仅将当前 Relay profile 确认 owned 的 Agent 加入日历作者集合，并向页面暴露查询失败状态。
- [x] 修改 `desktop/src/features/calendar/ui/CalendarScreen.tsx`：增加 Calendar 加载失败提示和 Retry 操作。
- [x] 修改 `desktop/src/testing/e2eBridge.ts`：让 Calendar mock 执行 owned-author ACL，并支持错误后手动重试场景。
- [x] 修改 `desktop/tests/helpers/bridge.ts`：声明 Calendar 错误重试测试配置。
- [x] 修改 `desktop/tests/e2e/calendar.spec.ts`：覆盖跨 Relay 本地 Agent 不污染查询及错误重试状态。
- [x] 更新 `docs/2026-08-01-calendar-owned-agent-query-fix.md`：记录实施结果、验证结果和方案偏差。

## 六、验收标准

- 用户打开 2026-08-02 时能看到 daily-assistant 创建的日程。
- Calendar 发出的 `authors` 不包含未在当前 Relay 声明为该用户 owned 的 Agent。
- 一个无权访问的本地 Agent 不再使全部日程查询失败。
- 查询失败时页面显示错误和 Retry，不显示误导性的空日历。
- 现有日历 E2E 全部通过。
- `pnpm typecheck`、Biome、相关 Desktop 测试和 `git diff --check` 通过。

## 七、风险与回滚

- 风险：Agent kind 0 profile 尚未同步 owner 时，该 Agent 的日程暂时不进入作者集合。
  - 控制：Calendar 等待现有 profile 查询完成；Agent profile 同步后 React Query 会刷新作者集合。Relay 仍是 owner 关系的最终事实源。
- 风险：直接修改全局 owned-Agent helper 会影响其他页面。
  - 控制：只在 Calendar hook 中收紧 Relay 作者集合，不改变共享 helper 的全局语义。
- 回滚：恢复 Calendar 原作者集合和页面状态渲染；不涉及数据迁移，已创建日程不会丢失。

## 八、实施结果

- Calendar 不再把全部本地托管 Agent 直接加入当前 Relay 的 `authors`。
- 当前用户与当前 Relay profile 明确声明 owned 的 Agent 组成唯一查询作者集合。
- 本地托管 Agent 仍用于作者名称显示，其他页面的全局 owned-Agent 逻辑未改变。
- Calendar 查询失败时显示独立错误状态和 Retry；失败时不再渲染空日历。
- E2E mock 增加与真实 Relay 一致的 Calendar owned-author 校验，能够复现原问题。
- 测试方案为覆盖真实重试行为，新增了两个测试基础设施文件；产品代码范围没有扩大。

验证结果：

- Desktop Biome：通过。
- `pnpm typecheck`：通过。
- `pnpm build:e2e`：通过。
- Calendar Playwright E2E：6/6 通过。
- 使用当前 Desktop owner 身份执行 `buzz calendar list --author <daily-assistant>`：成功返回 daily-assistant 日程，确认 Relay ACL 与数据正常。
