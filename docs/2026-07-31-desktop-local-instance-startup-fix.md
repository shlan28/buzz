# Desktop 本地实例与代理绕过启动修复方案

> 更新日期：2026-07-31
> 更新说明：已完成 Desktop localhost 代理绕过、显式稳定实例 slug、回归测试和端到端启动验证。

## 一、产品目标

开发者使用两个终端分别启动 relay 和 Desktop 时，应当只需要简单、可重复的命令，不需要手工维护一长串 Tauri JSON 和代理环境变量。

修复后：

1. 所有本地 Desktop 启动入口自动将 `localhost`、`127.0.0.1` 和 `::1` 合并进 `NO_PROXY`/`no_proxy`。
2. 现有用户自定义的代理排除项必须保留，不能被覆盖。
3. 开发者可以显式指定稳定的本地实例 slug，例如 `dev`，始终复用 `xyz.block.buzz.app.dev.dev` 数据目录和 `buzz-desktop-dev.dev` Keychain service。
4. 不指定 slug 时，保持现有默认行为：主 checkout 使用 canonical dev 实例，Git worktree 继续自动隔离。
5. 不迁移、删除或再次修改任何 Agent 数据。

## 二、根因

### 2.1 502

macOS 系统 HTTP/HTTPS/SOCKS 代理指向 `127.0.0.1:7890`。强制通过该代理访问 `http://localhost:3000/events` 会返回空 body 的 HTTP 502；直连同一 URL 能正常到达 Buzz relay。

Desktop 的 profile reconciliation 使用 reqwest HTTP 客户端。当启动环境没有 `NO_PROXY/no_proxy` 时，localhost `/query` 和 `/events` 请求可能被本机代理截走，且 relay 日志中不会有对应的请求。

### 2.2 本地实例分叉

`scripts/instance-env.sh` 目前只在检测到 Git worktree 时为 Tauri identifier 增加分支 slug。开发者没有受支持的显式 override，所以为了打开已有 `dev.dev` 数据，只能手写 `BUZZ_TAURI_CONFIG`。这会使 identifier、product name、Keychain service 和清理脚本容易不一致。

## 三、技术方案

### 3.1 统一本地代理排除

在 `scripts/instance-env.sh` 中实现可测试的逗号列表合并逻辑：

- 读取现有 `NO_PROXY`；若为空则再读取 `no_proxy`。
- 保留原顺序和原有条目。
- 追加缺失的 `localhost`、`127.0.0.1`、`::1`。
- 去除精确重复项，不做模糊重写。
- 将最终值同时 export 为 `NO_PROXY` 和 `no_proxy`。

该逻辑由 `dev`、`desktop-standalone`、`staging` 和其他已 source 该脚本的桌面入口共享。

### 3.2 显式稳定实例

新增环境变量 `BUZZ_DEV_INSTANCE_SLUG`：

- 仅允许小写字母、数字和单个连字号分隔的 slug；无效值直接失败，不静默降级。
- 显式 slug 优先于 worktree 自动推导。
- 指定 `dev` 时，生成 identifier `xyz.block.buzz.app.dev.dev`、product name `Buzz Dev (dev)` 和 Keychain service `buzz-desktop-dev.dev`。
- 不指定时保持当前 canonical/worktree 行为，不迫使其他开发者迁移数据。
- `BUZZ_TAURI_CONFIG`、`BUZZ_INSTANCE_SLUG`、`BUZZ_WORKTREE_LABEL`、`VITE_DEV_BRANCH` 和开发图标必须由同一个解析结果产生。

### 3.3 简化启动命令

`desktop-standalone` 继续使用 `scripts/instance-env.sh`，Keychain service 从脚本导出的最终 slug 构造。本机用户恢复当前数据后，只需：

```bash
BUZZ_DEV_INSTANCE_SLUG=dev just desktop-standalone
```

Relay 可在另一终端继续使用：

```bash
just relay-release
```

### 3.4 回归测试

新增 shell 回归测试，在临时 Git 仓库/工作树中 source `instance-env.sh`，验证：

- 空代理排除列表会得到三个 localhost 条目。
- 已有 `NO_PROXY` 项被保留。
- 重复 localhost 项不被重复追加。
- `NO_PROXY` 与 `no_proxy` 最终相同。
- canonical checkout 不指定 slug 时行为不变。
- 显式 `dev` slug 生成 `xyz.block.buzz.app.dev.dev` 及配套变量。
- 无效 slug 失败。
- worktree 自动隔离仍正常。

## 四、Todolist

- [x] 修改 `scripts/instance-env.sh`：实现 localhost 代理排除合并和显式稳定实例 slug。
- [x] 新增 `scripts/test-instance-env.sh`：覆盖代理排除、canonical checkout、显式 slug、无效 slug 和 worktree 回归。
- [x] 修改 `Justfile`：将 `test-instance-env.sh` 接入合适的脚本检查入口，并保证 `desktop-standalone` 使用统一的实例解析结果。

## 五、验收标准

- `BUZZ_DEV_INSTANCE_SLUG=dev just desktop-standalone` 打开 `xyz.block.buzz.app.dev.dev` 数据目录。
- Desktop 读取 `buzz-desktop-dev.dev` Keychain service。
- Desktop 进程同时具有包含 `localhost,127.0.0.1,::1` 的 `NO_PROXY` 和 `no_proxy`。
- `http://localhost:3000/query` 与 `/events` 不经过 `127.0.0.1:7890` 代理。
- Agent profile reconciliation 不再出现空 body 502。
- 原有非 localhost 代理排除项不丢失。
- 不指定 `BUZZ_DEV_INSTANCE_SLUG` 时，既有主 checkout/worktree 行为不变。
- 新 shell 回归测试通过。
- `just fmt-check` 通过。

## 六、风险与回滚

- 风险：代理排除合并误删用户原有条目。
  控制：只追加缺失的精确条目，并以回归测试锁定保留行为。
- 风险：显式 slug 包含路径或 JSON 特殊字符。
  控制：使用严格 slug 格式校验，无效值立即失败。
- 风险：新变量改变既有开发者默认数据目录。
  控制：新能力必须显式 opt-in，默认行为不变。
- 回滚：还原 `scripts/instance-env.sh`、删除 `scripts/test-instance-env.sh`并还原 `Justfile`；本次不写入 Desktop 本地数据，无需数据回滚。

## 七、执行结果

- `scripts/test-instance-env.sh` 直接执行通过。
- `just instance-env-test` 通过。
- `bash -n scripts/instance-env.sh scripts/test-instance-env.sh` 通过。
- `just fmt-check` 通过。
- `git diff --check` 通过。
- 真实命令 `BUZZ_DEV_INSTANCE_SLUG=dev just desktop-standalone` 已成功启动 Desktop。
- 运行中 Desktop identifier 为 `xyz.block.buzz.app.dev.dev`。
- 运行中 Keychain service 为 `buzz-desktop-dev.dev`。
- 运行中 `NO_PROXY` 和 `no_proxy` 均为 `localhost,127.0.0.1,::1`。
- Relay 健康检查为 `ok`，本次启动没有新的 HTTP 502。
