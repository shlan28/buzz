> 更新日期：2026-08-10
> 更新说明：完成 Web Task Execution 取消机制、客户端状态收敛与测试；Cloudflare Pages 尚未发布。

# Web Task Execution 取消机制与 Pages 发布方案

## 一、目标

让 `https://app.achoverse.xyz` 的 Web/PWA 与 Desktop 使用同一套 Task Execution 生命周期：

- `queued` 和 `running` 显示 `Cancel execution`；
- 提交取消时显示 `Cancelling…` 并防止重复操作；
- Relay 接受后显示 `Execution cancelled`；
- cancelled 为终态，可再次 `Execute`；
- finished/failed 不显示取消按钮；
- 取消失败时保留 Relay 的真实 active 状态并显示错误。

本次不修改 Relay 协议。Web 复用已经在 Relay、数据库和 ACP 中完成的 kind `42504`、`status=cancelled`、权限校验与 Agent turn 取消能力。

## 二、现状与差异

Web 已具备 Execute，但当前实现落后于 Desktop：

1. `TaskExecutionStatus` 只包含 queued/running/finished/failed；
2. Relay State 解析器不接受 cancelled，因此即使取消已经成功，Web 也会忽略该状态；
3. 只有 kind `42503` Execute Request builder，没有 kind `42504` Cancel Update builder；
4. `TaskExecutionControl` 只有 Execute 按钮，active execution 会永久禁用 Execute，却没有结束入口；
5. Tasks 页面和 Track 详情页各自维护 Execute pending/error，需要同时接入 cancel pending/error；
6. 现有 E2E 只覆盖 Execute、Queued 和 Finished 后重试。

## 三、产品与协议行为

### 3.1 取消事件

Web 使用已落地的 Task Execution Update：

```text
kind = 42504
d = execution UUID
t = task-id:<task UUID>
status = cancelled
p = assigned Agent pubkey, marker=agent
content = Cancelled by user
```

事件由当前配对身份签名并发送给 Relay。Relay 从已持久化的 Execution State 校验真实 requester、owner 和 assignee，不信任 Web 自行声明权限。

### 3.2 界面状态

- queued/running：Execute 保持禁用，同时显示 `Cancel execution`；
- 取消提交中：按钮变为 `Cancelling…`；
- cancelled：显示 `Execution cancelled.`，Execute 按钮恢复为 `Execute again`；
- 取消被拒绝或网络状态不明：保留当前 execution，并展示可操作错误；
- WebSocket 重连后：以 Relay 最新 State 覆盖本地临时状态。

建设性建议：Web 不做“点击后立即假装 cancelled”的乐观终态。只有收到 Relay 成功响应或后续 State 后再结束 active 状态，避免网络中断时 UI 与服务端分叉。

## 四、Cloudflare Pages 部署方式

当前仓库没有 Cloudflare Pages 的 Git 自动部署 workflow 或 Wrangler 配置文件。项目运行指南记录的是手动发布：

1. 在本地 `web/` 运行 typecheck、check 和 E2E；
2. 重新执行生产 `pnpm build`，生成本地 `web/dist`；
3. 使用 Wrangler 将这个本地 `dist` 上传到 `achoverse-app` 的 `dev` 生产分支；
4. 先验证 Wrangler 返回的单次部署 URL，再验证 `https://app.achoverse.xyz`。

因此，这条命令发布的是**当前本地工作区构建出的代码**，并不要求先 push，也不会重新从远端 `dev` 拉代码：

```bash
cd /Users/lu/buzz/web
. ../bin/activate-hermit
pnpm typecheck
pnpm check
pnpm test:e2e:smoke
pnpm build
npx --yes wrangler pages deploy dist \
  --project-name achoverse-app \
  --branch dev \
  --commit-dirty=true
```

`app.achoverse.xyz` 是 Cloudflare Pages；`achoverse.xyz` 是经 Cloudflare Tunnel 指向本机 Relay。更新 Web 不需要重启本机 3200 Relay，也不要重启 Tunnel。

## 五、测试与验收

### 5.1 自动化测试

- cancelled Relay State 能被解析；
- cancel builder 的 kind、execution ID、task ID、status 和 Agent tag 完整；
- queued/running 显示取消按钮；
- 点击取消只发布一次 cancelled Update；
- pending 显示 `Cancelling…`；
- cancelled 显示终态并允许 `Execute again`；
- Relay 拒绝取消时保留 active execution 并显示错误；
- Tasks 页面与 Track 详情页行为一致。

### 5.2 发布验收

- Wrangler 单次部署 URL 能打开；
- `app.achoverse.xyz` 的 Task 详情出现 Cancel execution；
- queued 取消后转为 cancelled，并可再次 Execute；
- running 取消后 Agent Activity 停止，刷新后仍为 cancelled；
- Desktop 同一 Task 能实时看到相同终态；
- `achoverse.xyz/health` 和本机 3200 不受 Web 发布影响。

## 六、Todo List

- [x] `web/src/features/tasks/types.ts`：增加 cancelled execution 状态。
- [x] `web/src/shared/domain/eventKinds.ts`：登记 Task Execution Update kind `42504`。
- [x] `web/src/features/tasks/eventCodec.ts`：解析 Relay 返回的 cancelled State。
- [x] `web/src/features/tasks/taskExecution.ts`：构建并发布 cancellation Update，统一取消错误映射。
- [x] `web/src/features/tasks/useTaskExecutions.ts`：提供取消成功后的状态刷新/收敛能力。
- [x] `web/src/features/tasks/TaskExecutionControl.tsx`：增加取消按钮、pending/error 和 cancelled 后重新执行展示。
- [x] `web/src/features/tasks/TaskDetailPanel.tsx`：向执行控制区传入取消状态和操作。
- [x] `web/src/features/tasks/TasksPage.tsx`：接入 Tasks 页面取消 mutation 状态。
- [x] `web/src/features/tracks/TrackDetailPage.tsx`：接入 Track 详情页取消 mutation 状态。
- [x] `web/src/vite-env.d.ts`：声明 Web E2E cancellation publication seam。
- [x] `web/tests/e2e/task-execution.spec.ts`：覆盖取消事件、cancelled 解析、pending 和重新执行。
- [x] `web/tests/e2e/work-console.spec.ts`：将只读工作台说明更新为 Execute/Cancel。
- [x] `docs/2026-08-01-local-startup-and-relay-guide.md`：补充 Task cancellation 发布验收与当前 smoke 数量。
- [x] `docs/2026-08-10-web-task-execution-cancellation-and-pages-deploy-plan.md`：完成 Todo 并记录本地验证结果。

## 七、确认门

鹿鹿子大王确认本文后才修改 Web 代码。完成后先提交并合并回本地 `dev`；Cloudflare Pages 发布属于外部生产变更，代码验证通过后会在实际执行 Wrangler 部署前再次明确报告待发布 commit 和本地工作区状态。

## 八、实现与验证结果

- Web 已与 Desktop 共用 kind `42504`、`status=cancelled` 和相同 Agent `p` tag 语义。
- Tasks 与 Track 详情均支持 queued/running 取消、`Cancelling…`、取消错误、cancelled 终态和再次 Execute。
- 取消成功后先以 Relay 已接受的结果更新本地状态，随后由 Global Execution State 实时订阅收敛。
- `pnpm typecheck`、`pnpm check`、Task Execution 定向 E2E 和 88 项 Web smoke 均通过。
- 已重新执行生产 `pnpm build`，当前本地生产资源为 `index-DN8vJpQg.js`；尚未执行 Wrangler Pages 部署。
