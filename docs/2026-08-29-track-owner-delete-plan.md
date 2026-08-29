> 更新日期：2026-08-29 22:17 CST
> 更新说明：完成 Track owner 直接永久删除实施并记录验证结果与实时同步边界。

# Track Owner 直接删除方案

## 1. 结论

Track 增加永久删除能力，采用以下产品规则：

- 只有 Track 当前 owner 本人可以删除；
- 不要求 Track 先归档，`planned / active / paused / completed / canceled` 均可直接删除；
- 只要仍有任何 Task 关联该 Track，就拒绝删除；
- 归档 Task 仍然算作关联 Task；已经永久删除的 Task 不再算；
- 删除不可撤销、没有回收站；
- 删除后原 Track ID 不允许重新创建，避免旧事件重放造成复活。

这里的“永久删除”是产品语义：普通 Relay 查询、Desktop、Web、CLI 和 Agent 都不再看到 Track。数据库仍保留带 `deleted_at` 的历史事件和最小删除标记，供审计与防复活使用。

## 2. 权限

删除权限比编辑权限更严格：

```text
canDeleteTrack = actor.pubkey == track.owner
```

不允许以下身份仅凭现有身份删除：

- Track member；
- Track creator（如果已经不是 owner）；
- owner 名下托管 Agent；
- community Owner/Admin（如果不是该 Track owner）。

这是对鹿鹿子大王“Track 的 owner 能删除”的字面执行。Owner Agent 仍可按现有规则编辑 Track，但永久删除需要人类 owner 本人明确确认，避免 Agent 自动化误删整个工作容器。

Relay 是最终权限边界。隐藏客户端按钮只改善体验，不能替代服务端校验。

## 3. 什么叫“有 Task”

Relay 以数据库中的当前 Task State 为准，而不是客户端当前能看到的列表：

- 任何 community 内、当前状态带有 `track-id:<track-id>` 的 Task 都会阻止删除；
- Task 是否归档、负责人是谁、Channel 是否私密、删除者能否读取该 Task，都不影响阻止结果；
- 已永久删除的 Task 没有当前 Task State，因此不再阻止；
- Task 历史上曾属于该 Track、但当前已经移出，不阻止删除；
- Task Execution 不单独阻止；存在 Execution 的前提 Task 已关联时，本身已经由 Task State 阻止。

错误文案只返回：

```text
Track still has linked tasks. Move or delete them before deleting the Track.
```

不返回不可见 Task 的标题、数量、Channel 或负责人，避免通过删除接口泄露受限 Task 信息。

## 4. 界面行为

### 4.1 Desktop

Track 详情页为 owner 本人显示 `Delete Track` 危险操作：

1. 点击后打开二次确认对话框；
2. 明确显示 Track 名称和“无法恢复”；
3. 再次点击红色 `Delete Track` 才提交；
4. 删除中禁用重复提交；
5. 成功后进入 `/tracks`，该 Track 从 Current/Completed/Archived 消失；
6. 有关联 Task 时保留当前页面和确认框，展示可恢复错误；
7. owner Agent、member、creator、非 owner 管理员不显示删除入口。

客户端可以根据已加载 Task 提前禁用或提示，但这只能作为辅助。最终是否存在关联 Task 必须由 Relay 在删除事务中重新判断。

### 4.2 CLI 与 Agent

增加：

```bash
buzz tracks delete --id <track-uuid> --expected-event <current-state-id>
```

成功返回稳定 JSON；有关联 Task、权限不足、Track 已变化或不存在时返回现有 CLI 错误类别。必须携带最新 State ID，避免用户确认期间 owner、名称或关联状态发生变化后误删。

### 4.3 Web

Web Tracks 当前只读，不提供删除按钮，但需要识别 Track Delete marker，使打开的 Web 会话能实时移除已删除 Track；刷新后的历史查询也必须不再返回该 Track。

## 5. 协议

新增 Actor 签名命令 kind：

```text
42512  KIND_TRACK_DELETE
```

请求只包含：

- `t=track-id:<uuid>`；
- `previous=<latest Track State event id>`；
- `e=<latest Track State event id>,marker=previous`；
- 空 content；
- 删除者签名和时间。

Relay 成功后保留同一个 `42512` 最小删除 marker。marker 不包含名称、描述、owner、成员或 Task 信息。

删除与归档语义保持分离：

- Archive 是 Track mutation，可恢复；
- Delete 让 Track 退出正常产品查询，不可恢复；
- Delete 不要求 archived，也不改变 status。

## 6. 数据一致性

删除必须在一个 PostgreSQL 事务中完成：

1. 获取 Track 级 advisory transaction lock；
2. 确认 Track 当前 State 存在且 ID 等于 `expected-event`；
3. 在锁内确认当前 owner；
4. 查询是否存在任何未删除、仍带当前 Track 关联的 Task State；
5. 如果存在，整个事务拒绝，不写 marker、不修改任何事件；
6. 将 Track State、Create/Mutate 历史标记为 `deleted_at`；
7. 插入最小 Track Delete marker；
8. 提交后发布删除 marker，客户端据此移除缓存。

### 6.1 并发竞态

只在删除事务中查询 Task 不足以保证规则：Task 可能在“查询无关联”之后、删除提交之前刚好关联该 Track。

因此所有会新增或更换 `track-id` 的 Task Create/Mutate 事务，也必须获取目标 Track 的同一 advisory lock，并在锁内重新验证 Track 当前 State。若 Task 从 Track A 移到 Track B，按稳定 UUID 顺序获取涉及的 Track locks，再获取 Task lock，避免死锁。

最终保证：

- 要么 Task 先成功关联，随后 Track 删除看到关联并拒绝；
- 要么 Track 先删除，随后 Task 关联看到 Track 不存在并拒绝；
- 不允许出现 Task 指向已删除 Track 的提交结果。

## 7. 删除后的行为

- `/tracks/$trackId` 显示 Track not found；
- `/tracks`、CLI list/get、Web 和 Agent 查询不再返回；
- 同 ID Create 被删除 marker 拒绝；
- 历史深链失效，不跳转到其他 Track；
- 删除 Track 不删除任何 Task、Channel、消息、Project 或人员；实际上存在关联 Task 时删除已被拒绝；
- 产品不提供 Undo、Restore 或数据库级恢复入口。

## 8. Constructive suggestion

建议确认框不要提供“自动把所有 Task 移出 Track 后删除”。这个组合动作会跨越多项 Task 的权限、并发版本和私密 Channel 边界，也可能产生部分成功。让用户先明确迁移或删除 Task，虽然多一步，但结果更可理解、可审计。

另外建议错误只说明“仍有关联 Task”，不显示数量。删除者虽是 Track owner，但不一定具有 Track 下每个私密 Channel Task 的读取权；数量本身也可能构成信息泄露。

## 9. 验收标准

- owner 本人可以从任意未删除 Track 状态直接发起删除，无需先归档；
- 有一个或多个当前关联 Task 时删除被拒绝，包括 archived Task；
- Task 移出或永久删除后，Track 可以删除；
- owner Agent、member、旧 creator、community admin 均被 Relay 拒绝；
- stale expected State ID 被拒绝，Track 保持存在；
- 删除后所有普通查询不可见，同 ID 不可复用；
- Track Delete 与 Task 关联并发时，不产生悬空引用；
- Desktop 二次确认、失败保留和成功跳转正确；
- CLI 输出和错误码稳定；
- Web/Desktop 收到 marker 后实时移除缓存。

## 10. Todolist

得到鹿鹿子大王确认后再修改代码；每个 Todo 只对应一个文件。

### Core、SDK 与数据库

- [ ] `crates/buzz-core/src/kind.rs`：新增 `KIND_TRACK_DELETE = 42512`，纳入 Track kind registry、分类和协议约束测试。
- [ ] `crates/buzz-sdk/src/lib.rs`：定义 Track Delete 输入结构并导出。
- [ ] `crates/buzz-sdk/src/builders.rs`：构造最小 Track Delete command，校验 UUID 与 previous State ID 并增加测试。
- [ ] `crates/buzz-db/src/tracks.rs`：实现 Track 删除原子事务、关联 Task 阻止、防复活、冲突及删除后不可见测试。
- [ ] `crates/buzz-db/src/tasks.rs`：为 Task Track 关联事务接入共享 Track locks 和锁内存在性校验，覆盖删除/关联竞态。
- [ ] `crates/buzz-db/src/lib.rs`：暴露 Track 删除与 Task/Track 一致性数据库接口。

### Relay 与 E2E

- [ ] `crates/buzz-relay/src/handlers/ingest.rs`：接入 Track Delete kind、写入 scope 和入口校验。
- [ ] `crates/buzz-relay/src/handlers/command_executor.rs`：校验 owner 本人、latest State、关联 Task错误映射并发布最小 marker。
- [ ] `crates/buzz-test-client/tests/e2e_relay.rs`：覆盖 owner 直接删除、有关联 Task 拒绝、越权、冲突、删除后不可查询与防复活。

### CLI

- [ ] `crates/buzz-cli/src/lib.rs`：增加 `buzz tracks delete --id --expected-event`。
- [ ] `crates/buzz-cli/src/commands/tracks.rs`：实现删除请求、稳定 JSON 输出和错误映射。
- [ ] `crates/buzz-cli/TESTING.md`：补充真实 Relay 的 Track 删除验收步骤。

### Desktop

- [ ] `desktop/src/shared/constants/kinds.ts`：同步 Track Delete kind。
- [ ] `desktop/src/features/tracks/lib/trackEvents.ts`：构建与识别 Track Delete marker。
- [ ] `desktop/src/features/tracks/lib/trackEvents.test.mjs`：覆盖最小删除事件、previous 引用和 marker 解析。
- [ ] `desktop/src/features/tracks/hooks.ts`：增加 delete mutation、成功清理缓存和实时 marker 刷新。
- [ ] `desktop/src/features/tracks/ui/TrackDeleteDialog.tsx`：实现 owner 专属二次确认、等待和错误展示。
- [ ] `desktop/src/features/tracks/ui/TrackDetailScreen.tsx`：接入删除入口，成功返回 Tracks，失败保留当前上下文。
- [ ] `desktop/src/testing/e2eBridge.ts`：模拟有关联 Task拒绝、成功删除和实时 marker。
- [ ] `desktop/tests/e2e/tracks.spec.ts`：覆盖无需归档删除、关联 Task 阻止、owner-only UI、成功移除与不可恢复。

### Web 与文档

- [ ] `web/src/shared/domain/eventKinds.ts`：同步 Track Delete kind。
- [ ] `web/src/shared/hooks/useWorkConsoleData.ts`：订阅 Track Delete marker 并从只读缓存移除 Track。
- [ ] `web/tests/e2e/work-console.spec.ts`：覆盖 Track 删除后的实时移除。
- [ ] `wiki/concepts.md`：补充 owner-only、无关联 Task、无需归档的 Track 删除规则。
- [ ] `docs/2026-08-06-tracks-work-management-plan.md`：追加 Track 删除能力演进说明，保留首版无删除的历史决策。
- [ ] `docs/2026-08-29-track-owner-delete-plan.md`：实施完成后记录测试结果、commit 和已知限制。

## 11. 实施结果（2026-08-29）

删除协议、数据库原子约束、Relay owner-only 授权、CLI 命令与 Desktop 二次确认已完成。Task Create / Mutate 在关联 Track 时会获取相同 Track 锁并重新确认 Track 存在，避免删除与新增关联并发产生悬空引用。Desktop 已覆盖 owner 直接删除、有关联 Task 拒绝、member 与 owner Agent 无删除入口。

普通历史查询不会返回已删除 Track，最小 marker 用于防止同 UUID 复活。当前实时 marker 仅投递给执行删除的 owner；其他已打开客户端在下一次刷新或重新查询后移除 Track。这比原方案“所有可见者实时移除”更保守，因为删除后已不存在可用于重新计算原 Track ACL 的当前状态。Web 当前没有 Track live subscription，因此同样在刷新后反映删除。

已通过相关 Rust workspace package 编译、Core / SDK / CLI 定向测试、Desktop Track 单元测试、Desktop 13 个 Track E2E 场景与 Web domain codec 6 个 E2E 场景。数据库事务测试保留为需 PostgreSQL 的 ignored 测试；本轮未新增 Relay live E2E 和 Web live-console E2E。
