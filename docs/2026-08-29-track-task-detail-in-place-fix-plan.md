> 更新日期：2026-08-29 16:15 CST
> 更新说明：完成 Track 详情页原位打开 Task 右侧详情抽屉的实现与验证，避免查看或编辑 Task 时丢失当前 Track 上下文。

# Track 页面原位打开 Task 详情修复方案

## 1. 结论

当前用户从 Track 详情页点击 Task 后，会被导航到全局 Tasks 页面，再由 `/tasks?task=<task-id>` 打开右侧详情抽屉。这个行为打断了用户正在查看的 Track、看板/列表视图与任务上下文。

本次修复将 Task 详情作为 Track 页的辅助面板：用户点击 Task 后仍停留在 `/tracks/$trackId`，右侧打开既有 `TaskDetailPanel`；关闭面板后回到同一个 Track 页面。URL 使用 `/tracks/$trackId?task=<task-id>`，支持刷新恢复、复制链接和浏览器历史语义。

## 2. 问题原因

- `TrackDetailScreen` 的 Board 和 List 点击处理器都直接导航到 `/tasks?task=<task-id>`；
- `TaskDetailPanel` 目前只挂载在 `TasksScreen`；
- Track 路由没有声明 `task` 查询参数，也没有根据该参数选择 Task；
- 因此 Track 页面只能展示和拖拽 Task，不能在原页面打开完整详情。

这与客户端 UI 规范中“临时查看优先使用右侧辅助面板，保留主内容上下文”的原则存在偏差。

## 3. 目标体验

```text
/tracks/<track-id>
  点击 Task
        ↓
/tracks/<track-id>?task=<task-id>
  Track 看板保持在主内容区
  TaskDetailPanel 在右侧打开
        ↓ 关闭
/tracks/<track-id>
  返回原 Track，不跳转到全局 Tasks
```

成功标准：

- Board 和 List 中点击 Task 都在当前 Track 页面打开右侧抽屉；
- 抽屉继续支持编辑、删除、执行、取消执行、查看执行结果和历史；
- 修改成功后当前 Track 的 Task 卡片、列表和进度使用现有查询缓存立即更新；
- 关闭或删除成功后只清除 `task` 查询参数，不离开当前 Track；
- 直接打开带 `task` 参数的 Track URL 能恢复抽屉；
- 无效、不可见或不属于当前可读任务集合的 Task ID 不打开错误对象；
- 全局 Tasks 页现有 `/tasks?task=` 行为保持不变；
- `View tasks` 按钮仍用于主动进入带当前 Track 筛选的全局 Tasks 页面。

## 4. 产品与交互取舍

### 4.1 复用既有详情面板

Track 页面直接复用 `TaskDetailPanel`，不新建第二套 Task 编辑器。这样 Task 字段、权限、执行状态、错误提示和历史展示与全局 Tasks 保持一致。

### 4.2 URL 是抽屉选择状态

使用查询参数而不是仅用组件本地 state：

- 刷新页面不会丢失正在查看的 Task；
- 链接可复制并重新定位；
- 关闭抽屉只替换当前 URL，不制造额外的 Track 页面跳转；
- 不需要新增独立 Task 页面或改变 Relay 数据模型。

### 4.3 保留全局 Tasks 的职责

原位抽屉用于“查看或修改当前 Track 中的一项 Task”；`View tasks` 仍用于进入全局 Tasks 工作面，进行跨 Track 筛选、分组和批量浏览。两者不是重复入口。

## 5. 技术方案

### 5.1 路由

为 `/tracks/$trackId` 声明可选的 `task` 查询参数，只接受非空字符串。Track 页面读取该参数，并从已经由 `useTasks()` 返回的可见 Task 中选择详情对象。

### 5.2 Track 页面编排

- 将 Board/List 的 `onOpen` 改为更新当前 Track 路由的 `task` 参数；
- 在 `TrackDetailScreen` 末尾按选中 Task 条件挂载 `TaskDetailPanel`；
- 接入与 `TasksScreen` 一致的更新、删除、执行、取消执行和执行结果跳转；
- 使用独立的 Task 详情错误状态，避免与 Track 编辑错误、Task 创建错误混用；
- 清除选择时保留 `trackId`，并移除 `task` 参数。

### 5.3 不变范围

- 不修改 Relay、事件格式、权限模型和数据库；
- 不改变全局 Tasks 页面；
- 不改变 Track 创建、编辑、归档和恢复；
- 不建立新的 Task 详情组件。

## 6. 风险与建议

- `TrackDetailScreen` 已同时承担 Track 元数据、Task 看板、创建与编辑编排；继续直接加入详情编排会增加文件职责。此次改动范围较小，可以先保持单文件，但若后续再增加 Track 内 Task 筛选或批量操作，建议抽取共享的 Task 详情控制器，避免 `TasksScreen` 与 `TrackDetailScreen` 的 mutation wiring 漂移。
- 当前 Track 的 Board/List view 使用本地 state，刷新深链后会回到默认 Board。这不阻塞本次修复；若未来要求完整恢复工作面，可再把 `view` 一并放入查询参数。

## 7. 验证方案

- E2E：从 Track Board 点击 Task，断言 URL 仍为 Track 路由且右侧详情出现；
- E2E：关闭详情，断言回到同一个 Track 且查询参数被清除；
- E2E：从 Track List 点击 Task，同样原位打开；
- E2E：直接访问 `/tracks/$trackId?task=<task-id>`，断言详情恢复；
- E2E：在抽屉修改 Task 后，断言 Track 页面内容更新；
- 回归：`View tasks` 仍进入带 Track 筛选的全局 Tasks 页面；
- 运行 Desktop 格式、类型检查及 Tracks smoke E2E；完成实现后再按仓库要求运行适当的更大质量门。

## 8. Todolist

得到鹿鹿子大王确认后再执行以下代码修改；每个 Todo 只对应一个文件。

- [x] `desktop/src/app/routes/tracks.$trackId.tsx`：声明并校验可选 `task` 查询参数。
- [x] `desktop/src/features/tracks/ui/TrackDetailScreen.tsx`：在当前 Track 路由管理 Task 选择状态并复用 `TaskDetailPanel` 完成查看、编辑、删除与执行编排。
- [x] `desktop/tests/e2e/tracks.spec.ts`：增加 Board、List、深链、关闭、编辑和 `View tasks` 回归覆盖。

## 9. 实施结果

- `pnpm exec biome check --write ...`：通过，目标文件无需额外格式化；
- `pnpm exec tsc --noEmit`：通过；
- `pnpm build:e2e`：通过；
- `pnpm exec playwright test tests/e2e/tracks.spec.ts --project=smoke`：通过，10 项测试全部成功；
- `pnpm check:px-text`：通过；
- `pnpm check:pubkey-truncation`：通过；
- `git diff --check`：通过；
- `pnpm check`：Biome 通过，但仓库当前基线中 6 个与本修复无关的既有超限文件相对 file-size ratchet 增长，因此完整命令停在 `check:file-sizes`。本次修改的文件不在失败列表中。
