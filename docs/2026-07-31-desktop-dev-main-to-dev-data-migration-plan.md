# Desktop `dev.main` → `dev.dev` 本地数据迁移方案

> 更新日期：2026-07-31
> 更新说明：已执行 `dev.main` 到 `dev.dev` 的本地数据与 Keychain 迁移，补充实际验证结果和剩余问题。

## 一、产品目标

当前 relay 中的 Agent 定义没有丢失，但 Desktop 开发环境被拆成了两个本地实例：

- 旧实例 `dev.main`：包含完整的 Fizz、Honey、Bumble、daily-assistant 本地运行记录、全局 Agent 配置和历史保留数据。
- 当前实例 `dev.dev`：已从 relay 拉取部分 Agent 定义，但本地运行记录不完整，并且误新建了一个 Bumble 实例。

迁移后的产品效果：

1. 仍使用当前 `dev` 分支代码。
2. Desktop 当前实例恢复旧身份和原有 Agent 列表。
3. 保留旧 Agent 的配置、团队数据、日志和 retention 历史。
4. 不修改 relay/Postgres，不重发 Agent 定义，不手工拼接 JSON。
5. 任何一步失败时，都可以恢复到迁移前状态。

## 二、已确认的现状

### Relay 与服务端数据

- Relay `http://localhost:3000/health` 返回 `200 ok`。
- Desktop 已使用旧 owner 公钥完成 NIP-42 鉴权。
- Postgres 中仍有 4 条 kind `30177` managed-agent 定义。
- Relay 日志显示已向 Desktop 返回这 4 条定义。
- Relay 日志中没有对应的 HTTP 502，所以本次迁移不把 502 当作 relay 数据丢失问题处理。

### Desktop 本地数据

源目录（作为迁移主数据）：

`/Users/lu/Library/Application Support/xyz.block.buzz.app.dev.main`

目标目录（当前 Desktop 使用）：

`/Users/lu/Library/Application Support/xyz.block.buzz.app.dev.dev`

差异摘要：

| 数据 | `dev.main` | `dev.dev` | 处理决策 |
|---|---:|---:|---|
| `managed-agents.json` 记录 | 8 | 4 | 以旧文件为准，不做 JSON 合并 |
| `global-agent-config.json` | 存在 | 不存在 | 恢复旧全局配置 |
| `teams.json` | 存在 | 存在 | 以旧文件为准 |
| retention DB | 有完整历史 | 多为新建空库 | 以旧数据库为准 |
| Agent 日志 | 有完整历史 | 仅有误新建 Bumble 日志 | 保留旧日志 |
| Agent PID 记录 | 存在旧记录 | 存在当前记录 | 不恢复，启动前清空 |

## 三、根因说明

问题由 Desktop 开发实例隔离间接引起，而不是 Git 分支修改了 relay 数据。

Desktop 的 Tauri app identifier 会决定 macOS 本地数据目录。当启动环境使用 `xyz.block.buzz.app.dev.dev` 时，系统会把它视为与 `xyz.block.buzz.app.dev.main` 不同的应用实例。Relay 中的 Agent 定义仍然可见，但本地运行密钥、Agent 记录、retention DB 和配置不会自动共享。

## 四、迁移策略

### 4.1 迁移原则

- 先停止 Desktop 和所有由 Desktop 启动的 Agent 子进程。
- Relay 和 Docker 基础设施不是覆盖对象，可以保持运行。
- 在任何覆盖前，分别对源目录和目标目录生成独立备份包。
- 备份必须能通过解包列表和 SHA-256 校验。
- 目标目录采用“旧目录移出 + 新目录原子就位”，不在原目录上边复制边覆盖。
- 不迁移 `agent-pids` 内的记录；PID 是一次运行态，不是可恢复数据。
- 不手工修改 agent 公钥、owner 公钥、relay URL 或 retention DB。
- 误新建的 `dev.dev` Bumble 不合并进主数据，但会在 `dev.dev` 备份中保留。

### 4.2 拟执行顺序

1. 记录当前 Desktop、relay、Vite 和 Agent 进程。
2. 停止 Desktop/Vite，并终止由当前 Desktop 启动的 Agent 子进程。
3. 确认两个应用数据目录在停止后不再发生写入。
4. 将 `dev.main` 打包为独立时间戳备份。
5. 将 `dev.dev` 打包为独立时间戳备份。
6. 校验两个备份的文件列表、大小与 SHA-256。
7. 在临时目录中恢复 `dev.main` 备份。
8. 删除临时恢复目录中的 `agents/agent-pids` 运行态记录。
9. 将现有 `dev.dev` 目录原子改名为回滚副本。
10. 将准备好的临时目录原子改名为 `xyz.block.buzz.app.dev.dev`。
11. 确认文件 owner/权限与原目录一致。
12. 使用当前 `dev` 代码重新启动 Desktop。
13. 验证身份、community、4 个 Agent、全局配置、team 和 retention 历史。
14. 观察日志，确认没有新的重复 Agent、公钥变化或错误的 PID 恢复。

## 五、Todolist

> 下列每个待办只指向一个具体文件。目录原子切换是执行步骤，不会被拆成多文件的手工编辑。

- [x] 创建 `dev.main-20260731-223430.tar.gz` 完整备份文件。
- [x] 创建 `dev.dev-20260731-223430.tar.gz` 完整备份文件。
- [x] 创建 `dev.main-20260731-223430.tar.gz.sha256` 校验文件。
- [x] 创建 `dev.dev-20260731-223430.tar.gz.sha256` 校验文件。
- [x] 以旧 `agents/managed-agents.json` 替换目标实例同名文件。
- [x] 以旧 `agents/global-agent-config.json` 恢复目标实例同名文件。
- [x] 以旧 `agents/teams.json` 替换目标实例同名文件。
- [x] 恢复 `agents/retention/05fa02ede5c0502212efc790c297d168a90cc52de50dcd54bdeb0d062d07d7d7.db`。
- [x] 恢复 `agents/retention/2112c1ddf5b395c236b1634547e5dd30faed40dd6a42b56e56a05bcfeb5002c8.db`。
- [x] 恢复 `agents/retention/28180cd5f3e1744fb1e3965881116ba995b3b9054ccb1f47fe42a60be7df0ffa.db`。
- [x] 在重启前确认目标 `agents/agent-pids` 不含旧 PID 记录。
- [x] 将原 `buzz-desktop-dev.dev` Keychain 条目备份为 `buzz-desktop-dev.dev.pre-migration-20260731-223430`。
- [x] 将 `buzz-desktop-dev.main` Keychain 条目迁移至 `buzz-desktop-dev.dev`。

Agent 日志数量较多，将由目录级原子恢复一次性就位，不手工改写日志文件。

## 六、验收标准

### 基础连接

- Relay 健康检查仍为 `200 ok`。
- Desktop 连接 `ws://localhost:3000`。
- Desktop 使用与 4 条 kind `30177` 定义相同的 owner 身份。

### Agent 数据

- Agent 页面显示 Fizz、Honey、Bumble、daily-assistant。
- 没有额外的重复 Bumble。
- 原 Agent 公钥不变。
- `managed-agents.json` 能被 Desktop 正常读取，无 JSON 解析错误。
- 全局 Agent 配置与迁移前 `dev.main` 一致。
- team 列表与 `dev.main` 一致。
- retention DB 能打开，不出现 SQLite busy/corrupt 错误。

### 运行状态

- 启动前没有恢复旧 PID 记录。
- Desktop 不会把旧 Agent 误判为正在运行。
- 手动启动一个 Agent 后，只产生一条新 PID 记录。
- Agent 可完成 relay 连接和 channel 订阅。

### 502 分离验证

如数据恢复后仍出现 502，必须记录具体界面、操作、请求 URL 和时间点，再分别检查：

- Desktop media proxy；
- Agent LLM provider/OpenRouter；
- 其他上游 HTTP 服务。

不应在没有 relay 502 日志的情况下，把它归因为 Postgres 中的 Agent 定义丢失。

## 七、回滚方案

任一验收项失败时：

1. 立即退出 Desktop，并停止新启动的 Agent 子进程。
2. 将迁移后的 `dev.dev` 目录改名保留，不直接删除。
3. 从 `dev.dev-<timestamp>.tar.gz` 恢复迁移前目标目录。
4. 复核恢复目录的 SHA-256 和文件数量。
5. 重新启动 Desktop，确认已回到迁移前的 `dev.dev` 状态。

Relay/Postgres 不在本次迁移的写入范围内，因此回滚不需要恢复服务端数据库。

## 八、后续建议

本次先恢复数据，不同时修改启动脚本。迁移验收后，建议单独调查为什么当前主 checkout 启动时使用了 `xyz.block.buzz.app.dev.dev`，并设计稳定的开发实例命名规则。否则未来切换分支或工作树时，还可能出现新的本地数据目录。

## 九、执行结果

- 两份目录备份已通过 SHA-256 与压缩包可读性校验。
- 原 `dev.dev` 目录仍保留为 `xyz.block.buzz.app.dev.dev.pre-migration-20260731-223430`。
- 当前 `dev.dev` 已恢复 8 条本地 Agent 记录、全局 Agent 配置、team 数据和 3 份 retention DB。
- 3 份 retention DB 的 SQLite `PRAGMA integrity_check` 均为 `ok`。
- 重启前 PID 记录为 0。
- `dev.dev` Keychain 已与 `dev.main` Keychain 通过内容哈希比对，未输出或落盘私钥明文。
- Desktop 重启后不再出现 4 个旧 Agent 缺少密钥的错误。
- daily-assistant 已使用原公钥启动，成功连接 relay，并发现、订阅 2 个 channel。
- 502 已确认不由 relay 生成：macOS 全局 HTTP/HTTPS/SOCKS 代理指向 `127.0.0.1:7890`，强制经过该代理请求 `http://localhost:3000/events` 会返回空 body 的 502，而直连会正常到达 Buzz relay。
- Desktop 已使用 `NO_PROXY=localhost,127.0.0.1,::1` 和同值的 `no_proxy` 重启。重启后请求正常进入 relay，没有再产生 profile reconciliation 502。
- 后续分开启动 Desktop 时必须保留上述 localhost 代理排除；否则 reqwest HTTP 请求仍可被本机 7890 代理截走。
