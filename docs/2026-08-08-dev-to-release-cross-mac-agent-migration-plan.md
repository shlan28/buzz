# Dev App 到另一台 Mac 正式版 App 的 Agent 数据迁移方案

> 更新日期：2026-08-08
> 更新说明：首次形成一次性跨电脑迁移方案，覆盖 User 身份校验、Agent 配置与私钥迁移、敏感数据加密传输、Relay 数据恢复、本地 runtime 重配、Agent Pubkey 验证及失败回滚。

## 一、迁移目标

把当前电脑 dev 版 Buzz Desktop 中已经创建和使用的 Agent，迁移到另一台 Mac 的正式版 Buzz Desktop，并满足：

1. 目标电脑使用与源电脑相同的 User Key；
2. 每个 Agent 的 Pubkey 在迁移前后完全一致；
3. Agent 名称、Persona、Team、System Prompt、模型偏好、回复范围等配置保留；
4. 频道消息、DM、Task、Track 等 Relay 数据继续可见；
5. 日志可选择归档迁移，但不作为 Agent 恢复条件；
6. Codex、Hermes、模型 API Key 和工作目录按目标电脑实际情况重新配置或选择性迁移；
7. 源电脑 dev 数据不删除，迁移失败可回滚；
8. 整个过程不在终端、日志、聊天或普通文件中暴露明文私钥。

## 二、结论

本次迁移不能只复制 `managed-agents.json`。

Agent Pubkey 由 Agent 私钥决定，而当前私钥优先保存在 macOS Keychain。要保持同一个 Agent，必须同时完成：

```text
相同 User Key
    +
Agent 配置文件
    +
每个 Agent 对应的同一份私钥
    =
目标电脑恢复出相同 Agent Pubkey
```

频道、DM、Task、Track 等已经进入 Relay 的数据不需要打包复制；目标正式版使用相同 User Key 和 Relay 后会重新拉取。当前 Codex/Hermes 原生 session 并没有可移植的 Buzz 云端检查点，因此本次迁移能恢复对话事实历史，但不能承诺把旧电脑 runtime 的原生 session 原样续接。

## 三、当前数据位置

### 3.1 源电脑 dev 版

Agent 数据目录：

```text
~/Library/Application Support/xyz.block.buzz.app.dev.dev/agents/
```

关键文件：

| 文件或目录 | 作用 | 迁移策略 |
|---|---|---|
| `managed-agents.json` | Agent 实例和本地配置 | 必须迁移 |
| `global-agent-config.json` | 全局模型、Provider 和环境变量配置 | 默认迁移，敏感处理 |
| `teams.json` | Team 的本地安装信息 | 建议迁移 |
| `logs/` | Agent 运行日志 | 可选归档，不导入运行态 |
| `retention/` | 本机待同步/保留事件缓存 | 不迁移，以 Relay 为准 |
| `agent-pids/` | 当前机器进程记录 | 禁止迁移 |
| `managed-agents.before-*.json` | 历史备份 | 只归档，不作为目标配置 |

dev Keychain service：

```text
buzz-desktop-dev.dev
```

其中统一 secrets 集合至少可能包含：

- `identity`：User 私钥；
- `agent:<pubkey>`：各 Agent 私钥。

### 3.2 目标电脑正式版

Agent 数据目录：

```text
~/Library/Application Support/xyz.block.buzz.app/agents/
```

正式版 Keychain service：

```text
buzz-desktop
```

不能把 dev Keychain 条目按 service 名原样复制过去；必须转换到正式版 service，并在写入前校验目标 User 身份。

## 四、迁移边界

### 4.1 必须迁移

- User 身份，或确认目标正式版已经是完全相同的 User Pubkey；
- `managed-agents.json` 中的 Agent 实例配置；
- 每个 `agent:<pubkey>` 对应的 Agent 私钥；
- `teams.json` 中目标配置引用到的 Team 本地信息；
- Agent Pubkey清单和配置文件校验和。

### 4.2 默认迁移，但需作为敏感数据处理

- `global-agent-config.json`；
- `managed-agents.json` 中的 `env_vars`；
- Provider 本地配置中可能存在的模型 API Key。

这些字段可能包含明文 API Key。为了让目标电脑尽可能恢复现有能力，默认放入加密迁移包；如果鹿鹿子大王希望目标电脑使用独立模型 Key，则在导出时生成去敏副本，不携带这些字段。

### 4.3 可选归档

- `logs/`：只作为旧机器排障记录；
- 历史 `managed-agents.before-*.json`：只用于人工回滚和比对。

日志可能包含对话片段、文件路径和错误信息，必须与私钥包采用同等级加密，不能通过普通网盘明文传输。

### 4.4 禁止迁移

- `agent-pids/`；
- SQLite 的 `-wal`、`-shm` 临时文件；
- 旧电脑 runtime PID 和进程状态；
- 旧电脑绝对工作目录作为目标电脑的有效目录；
- 未经验证的 Codex/Hermes 原生 sessionId；
- dev App 的整个 Application Support 根目录。

整目录照搬会把开发实例标识、过期进程状态、缓存和机器路径一起带入正式版，风险高于收益。

## 五、推荐迁移流程

### 阶段 A：迁移前冻结

1. 确认源 dev App 当前连接的 Relay URL；
2. 在源电脑记录 User Pubkey和全部 Agent Pubkey；
3. 停止所有 Agent；
4. 完全退出源电脑 dev App；
5. 完全退出目标电脑正式版 App；
6. 确认没有 `buzz-desktop`、`buzz-acp` 或受管 Agent 进程仍在写数据；
7. 对源数据和目标现有数据分别创建只读备份。

迁移窗口内不要再次打开源 dev App 修改 Agent，否则导出的配置、Keychain 和 Relay 最新状态可能出现时间差。

### 阶段 B：源电脑安全导出

建立一个权限为 `0700` 的临时迁移目录，只放以下内容：

```text
buzz-agent-migration/
├── manifest.json
├── config/
│   ├── managed-agents.json
│   ├── global-agent-config.json
│   └── teams.json
├── secrets/
│   └── keychain-agent-secrets.json
└── optional/
    └── logs/
```

`manifest.json` 只记录非敏感校验信息：

```json
{
  "schemaVersion": 1,
  "sourceApp": "dev.dev",
  "targetApp": "release",
  "relayUrl": "wss://achoverse.xyz",
  "userPubkey": "<hex>",
  "agentPubkeys": ["<hex>"],
  "createdAt": "<UTC>",
  "includeModelSecrets": true,
  "includeLogs": false,
  "checksums": {}
}
```

导出 Keychain 时只允许把 User identity 和与清单匹配的 `agent:<pubkey>` 放入 secrets 文件。程序或操作脚本不得把 Keychain 返回值打印到 stdout/stderr。

导出完成后：

1. 校验每个 Agent 私钥计算出的 Pubkey与 `managed-agents.json` 一致；
2. 计算迁移包内每个文件的 SHA-256；
3. 把整个目录封装成 AES-256 加密磁盘映像或同等强度的加密容器；
4. 加密口令通过与文件不同的通道传递；
5. 删除明文临时目录并确认只留下加密包。

### 阶段 C：把迁移包送到目标电脑

推荐顺序：

1. 隔空投送加密包；
2. 加密移动硬盘；
3. 已确认端到端加密的文件传输工具。

不建议：

- 把明文目录发到微信、邮箱或普通网盘；
- 把 nsec 复制到聊天窗口；
- 把 Keychain 导出结果放进 Git；
- 用截图保存私钥。

### 阶段 D：目标正式版预检

1. 安装并启动一次正式版，让 macOS 创建正式版数据目录和 Keychain 权限；
2. 设置正确 Relay；
3. 如果正式版已经登录，读取其 User Pubkey并与 manifest 比较；
4. Pubkey不一致时立即停止，不覆盖目标 identity；
5. Pubkey一致时，可以保留目标现有 identity，只导入 Agent 私钥；
6. 如果正式版尚未登录，则导入同一 User Key 后再次校验 Pubkey；
7. 完全退出正式版 App，再执行文件与 Keychain 导入。

### 阶段 E：目标电脑导入

导入遵循“备份、合并、验证、再替换”的顺序：

1. 备份目标正式版当前 `agents/` 目录；
2. 备份正式版 Keychain secrets 集合；
3. 挂载加密迁移包并校验 manifest 中所有 SHA-256；
4. 解析源 `managed-agents.json`，建立所需 Agent Pubkey集合；
5. 只导入这些 Pubkey对应的 Agent 私钥；
6. 如果目标 Keychain 已有同名 `agent:<pubkey>`：
   - 私钥计算出的 Pubkey一致且密钥相同：跳过；
   - Pubkey标签相同但密钥不同：停止并报告冲突，不能覆盖；
7. 保留目标正式版现有 `identity`，除非目标尚未登录且已经明确选择导入源 identity；
8. 把 Agent 配置写入正式版 `agents/managed-agents.json`；
9. 按选择导入 `global-agent-config.json` 和 `teams.json`；
10. 不复制 `agent-pids/` 和 `retention/`；
11. 日志只放入独立归档目录，不混入正式版正在使用的 `logs/`；
12. 卸载加密迁移包，删除目标电脑上的明文临时文件。

如果目标正式版已经创建了新的 Agent，不直接整文件覆盖；需要按 Agent Pubkey 合并记录。源、目标出现相同 Pubkey但关键配置不一致时，应先保留两份并人工决定，不能使用文件时间自动裁决。

### 阶段 F：首次启动验证

第一次打开目标正式版时暂不自动启动 Agent，依次验证：

1. User Pubkey与源电脑一致；
2. Relay URL 与 community 一致；
3. Agent 数量和名称符合 manifest；
4. 每个 Agent 显示的 Pubkey逐字节匹配源清单；
5. Keychain 中每个 Agent 私钥都能计算出该 Pubkey；
6. Persona、Team、System Prompt、模型和回复范围正确；
7. 频道、DM、Task、Track 从 Relay 正常恢复；
8. Codex/Hermes runtime 可被发现；
9. 模型 Key 可用，或明确显示为待配置；
10. 工作目录重新选择，不沿用旧电脑无效路径；
11. 只启动一个低风险 Agent，发送测试消息并确认只回复一次；
12. 验证通过后再逐个启用其余 Agent。

## 六、上下文能迁移到什么程度

### 6.1 本次可以恢复

- Relay 中的频道消息和 Thread；
- User 与 Agent 的 DM 历史；
- Task、Track 和执行事件；
- Relay 中已有的 Agent Engram、Canvas 等持久内容；
- `buzz-acp` 下一轮可重新抓取的最近对话上下文。

### 6.2 本次不能保证恢复

- Codex/Hermes/Goose 进程内部的原生 session；
- 只存在于旧电脑内存中的 sessionId 映射；
- 旧电脑未提交的 Git 修改和本地临时文件；
- 没有发到 Relay、没有写入文件的运行中思考状态；
- 只存在于本地日志、尚未整理为 Agent 记忆的内容。

因此迁移完成后，Agent 是同一个身份，也能看到同一套 Relay 对话事实，但第一轮可能表现为“创建新 runtime session 后根据历史恢复”。真正无感的跨端上下文续接，需要实施《多电脑 Agent 身份与上下文同步方案》中的标准化上下文检查点。

## 七、API Key 与 runtime 策略

### 7.1 推荐默认值

- Agent 私钥：必须迁移；
- 模型 API Key：放入加密迁移包迁移，导入后仍只保存在目标本地；
- Codex/Hermes 登录 token：不迁移，在目标电脑重新登录；
- runtime 二进制：不迁移，在目标电脑重新安装或发现；
- 工作目录：不迁移，在目标电脑重新选择；
- 日志：默认不迁移，只在有排障需求时归档。

### 7.2 建议

如果两台电脑长期并行使用，建议为模型 Provider 创建独立 API Key，便于区分用量和单独撤销。它不会改变 Agent Pubkey，因为 Agent 身份私钥与模型 API Key 是两套不同凭据。

## 八、回滚方案

出现以下任一情况立即回滚：

- User Pubkey不一致；
- 任一 Agent 私钥计算出的 Pubkey不一致；
- Keychain 导入后正式版无法读取 identity；
- `managed-agents.json` 解析失败；
- 正式版启动后出现重复 Agent 或意外自动运行；
- Relay/community 与源环境不一致。

回滚步骤：

1. 退出目标正式版；
2. 停止所有 Agent 进程；
3. 恢复目标 `agents/` 目录备份；
4. 恢复目标正式版 Keychain secrets 备份；
5. 再次启动正式版确认恢复到迁移前状态；
6. 源电脑 dev 数据保持不动，可继续使用。

迁移成功并稳定观察前，不删除源电脑 dev 数据、不撤销旧 Keychain、不清理加密迁移包。

## 九、最终验收清单

- [ ] 源、目标 User Pubkey一致；
- [ ] 源、目标 Relay URL 一致；
- [ ] 每个 Agent Pubkey一致；
- [ ] Agent 私钥只存在于 Keychain 或加密迁移包；
- [ ] Agent 配置、Persona、Team 正确；
- [ ] 消息、DM、Task、Track 可以读取；
- [ ] 目标 runtime 和模型凭据状态清晰；
- [ ] 旧电脑路径没有被当作目标有效路径；
- [ ] 没有迁移 PID 和 retention 临时状态；
- [ ] 测试 Agent 只回复一次；
- [ ] 目标备份可以恢复；
- [ ] 明文临时迁移目录已经安全清理。

## 十、实施方式建议

本次属于一次性高敏感迁移，建议由迁移脚本完成，而不是人工打开 JSON、复制 nsec。脚本应分成三个显式命令：

```text
inspect   只读盘点，不导出秘密
export    源电脑生成加密迁移包
import    目标电脑预检、备份、合并、验证
```

每一步输出只允许包含 Pubkey、文件路径、数量、校验和和成功/失败状态；禁止输出 nsec、API Key、token 或完整环境变量。

在现有跨设备加密身份包功能完成前，这是一条安全的一次性迁移路径；后续产品化后，应由 Desktop 的“迁移到另一台 Mac”界面替代。

## 十一、代码规范检查

已优先检查：

- `wiki/index.md`；
- `wiki/code-spec.md`；
- Desktop 当前 Agent 存储、Keychain 和全局配置实现。

本方案遵循身份与 community 隔离优先、敏感信息不得进入日志、失败必须可回滚、Relay 作为持久业务数据事实来源等约束。本轮只写方案，不修改应用代码。

## 十二、后续执行 Todo List

> 每个 Todo 只对应一个文件。鹿鹿子大王确认后，先实现迁移工具并测试，再执行真实数据迁移；真实秘密不会提交到 Git。

- [ ] `scripts/buzz-agent-migration.sh`：实现 `inspect/export/import` 三阶段迁移、加密容器、备份、Keychain 合并和敏感输出防护。
- [ ] `scripts/tests/buzz-agent-migration.bats`：覆盖身份不一致、Agent 密钥冲突、缺失文件、校验和失败和回滚。
- [ ] `docs/2026-08-08-dev-to-release-cross-mac-agent-migration-runbook.md`：记录经测试的源电脑导出和目标电脑导入操作手册。
- [ ] `docs/2026-08-08-dev-to-release-cross-mac-agent-migration-verification.md`：记录迁移结果，只保存 Pubkey、数量、校验和和验证状态，不保存秘密。

