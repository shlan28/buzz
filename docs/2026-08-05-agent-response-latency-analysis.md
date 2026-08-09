# 多 Agent 回复速度差异分析与优化方案

> 更新日期：2026-08-05
> 更新说明：首次分析 Hermes、Buzz Agent 与 Codex 的回复速度差异，记录当前环境证据、根因判断、验证指标和分阶段优化 Todo List。

## 1. 结论摘要

当前观察到的“Hermes 最快、Codex 最慢”基本符合现有配置，但它不是对三个 Agent 框架的公平性能比较。

三个 Agent 实际使用了不同模型、不同执行策略和不同进程结构：

| Agent | 当前模型 | 当前并发 | 主要特征 | 对速度的影响 |
|---|---|---:|---|---|
| Hermes | `deepseek:deepseek-v4-flash` | 1 个运行实例 | Flash 模型、原生工具循环、上下文缓存命中率高 | 首字和短回复通常最快 |
| Buzz Agent | `deepseek-ai/DeepSeek-V4-Pro` | 10 个 worker | Pro 模型；LLM 响应聚合后才发 ACP message chunk | 模型较慢，用户还看不到生成过程 |
| Codex | `gpt-5.6-sol` | 10 个 worker | 高能力 coding agent；经 `codex-acp` 和 Codex app-server；倾向先分析、读文件、调用工具再交付 | 完成时间通常最长，资源占用也最高 |

首要根因是“模型与工作量不等价”，其次才是 ACP adapter 和 Buzz 链路。不能仅凭当前体验得出“Hermes 框架一定比 Codex 框架快”的结论。

## 2. 用户实际感受到的“速度”包含什么

回复速度至少应拆成四个指标：

1. **排队时间**：消息到达 relay 后，多久被 worker 接手；
2. **首个活动时间**：多久出现 typing、thought、tool call 或首段文本；
3. **首条可见回复时间**：多久在 Buzz 对话中出现消息；
4. **任务完成时间**：Agent 完成全部推理、工具调用和消息发送所需时间。

当前 Buzz 的“Agent Activity”与“对话消息”是两个不同表面。ACP 的 `agent_message_chunk` 只进入活动流；真正的对话回复通常要求 Agent 再调用 `buzz messages send`。如果 Agent 没有成功调用，harness 会再发一轮 `[Delivery Required]`，仍失败才由 harness fallback 发布。因此，模型已经生成答案并不等于用户已经看到答案。

这会放大体感延迟，也会让不同 Agent 的工具遵循能力影响测速结果。

## 3. 当前环境证据

### 3.1 模型档位差异是第一主因

- Hermes 当前使用 `deepseek-v4-flash`；日志中的大多数单次 API 请求约为 1.2–6.8 秒，并且后续请求经常有 82%–100% 的 prompt cache 命中。
- Buzz Agent 当前使用 `DeepSeek-V4-Pro`，不是 Flash 档；Pro 模型不能与 Hermes 的 Flash 模型直接比较响应速度。
- Codex 当前使用 `gpt-5.6-sol`。这是面向复杂编码任务的 agentic 模型，通常会花更多时间分析、规划、读文件和使用工具；其目标更偏向任务正确完成，而不是最短聊天延迟。

因此当前比较同时改变了“模型供应商、模型档位、推理策略、工具策略”四个变量。

### 3.2 Buzz Agent 的非流式实现放大等待感

`buzz-agent` 的 LLM 客户端先等待一次 provider 请求完整返回，再把完整 reasoning/text 作为 ACP chunk 发出。即使 provider 本身支持流式 token，当前实现也没有把 token 增量持续传给 Buzz。

产品结果是：用户在模型生成期间主要只能看到 working/typing，而不是逐字出现的答案。总耗时可能只比 Hermes 多一些，但主观上会显得慢很多。

### 3.3 Codex 的工作链路更长、默认行为更重

Codex 的当前链路是：

`buzz-acp → Node codex-acp → Codex app-server → 模型/工具 → buzz-dev-mcp → buzz CLI → relay`

Hermes 当前没有配置独立的 `buzz-dev-mcp`，而 Codex 和 Buzz Agent 都加载了它。Codex 还会执行自己的规划、沙箱和工具编排。对于简单问答，这些能力是额外成本；对于复杂代码任务，它们可能换来更高完成质量。

当前 `codex-acp` 版本为 1.1.7，已通过项目的最低版本门禁，因此“旧 adapter”不是眼下最有力的解释。

### 3.4 并发被统一设为 10，但实际收益与成本不匹配

当前 Hermes 已实际以 1 个实例运行，而 Buzz Agent 和 Codex 各以 10 个 worker 运行。进程现场显示：

- Buzz Agent 常驻约 10 个子进程；
- Codex 常驻约 10 组 `codex-acp + app-server`，另有 Codex 辅助进程；
- Hermes 当前只常驻 1 个 Agent 进程。

`parallelism=10` 只提升不同频道同时处理任务的吞吐量，不会让单条消息的推理快 10 倍。同一频道仍串行处理。对 Codex 来说，它反而显著增加内存、进程调度、连接和初始化成本。

如果实际并没有十个频道同时高频触发同一个 Agent，这个配置偏离产品负载。

### 3.5 交付补偿会增加一整轮模型调用

Hermes 历史日志中多次出现：

- Agent 回合结束，但 harness 未识别到成功的 `buzz messages send`；
- harness 发出 `[Delivery Required]`；
- 最后由 ACP fallback 发布消息。

部分该问题已由 Hermes terminal wire-shape 修复覆盖，但日志表明“生成答案 → 发送到对话”仍是应独立测量的阶段。Codex 历史日志也出现过同类补偿，并曾伴随 relay `POST /events` 400。

这类问题会额外增加一次完整模型回合，可能把数秒放大为数十秒甚至数分钟。

### 3.6 Relay 稳定性是共同噪声，不是 Codex 专属根因

日志存在 WebSocket pong 超时、连接重置和 `502 Bad Gateway`，重连退避可持续数十秒。它会影响所有 Agent，且可能造成某次 Codex 特别慢；但因为三个 Agent共享 relay，它不能解释长期稳定的 Hermes > Buzz Agent > Codex 排序。

## 4. 根因优先级

### P0：当前测速没有控制变量

Flash、Pro 和高能力 Codex 模型承担的计算量不同。先统一任务与测量口径，否则优化 adapter 很可能只改善小头。

### P0：缺少端到端延迟分段指标

现有日志能看到部分 provider latency、pool ready 和 delivery warning，但无法稳定回答“消息在哪一段慢了”。没有统一的 event ID / turn ID 串起 relay 接收、排队、首活动、首文本、首次发送和结束。

### P1：简单会话使用了过重的 Codex 模型与策略

`gpt-5.6-sol` 更适合复杂代码任务。把它作为所有聊天和轻任务的默认 Agent，速度和成本都不合理。应按任务路由，而不是要求同一个高能力 Agent 同时追求最低延迟。

### P1：worker 数量过高

Codex 与 Buzz Agent 的 10 worker 对当前单用户/少频道场景收益很小。它主要提升吞吐，不降低单请求 latency。

### P1：Buzz Agent 不提供真正的 token 流式输出

这主要影响首字时间和主观速度，也降低了用户判断 Agent 是否正常工作的能力。

### P1：对话交付依赖 Agent 自觉调用工具

把“展示最终回复”交给模型决定并用二次提示纠错，会引入可避免的额外回合。交付应尽量成为确定性的 harness 能力。

## 5. 推荐修复路径

### 第一阶段：无需改代码的立即调整

1. 将每个 Agent 的 `parallelism` 先降到 1；只有确认存在跨频道并发积压后再逐步升到 2–4。
2. 为 Codex 增设“快速问答”和“深度编码”两个档位：普通聊天使用更快模型/较低 reasoning，复杂代码任务才使用 `gpt-5.6-sol`。
3. 用相同的 10 条固定问题做 A/B 测试。分别记录首活动、首条可见消息和完成时间，不用肉眼印象评判。
4. 测试时使用新会话或相同上下文长度，避免 Hermes 的高缓存命中与 Codex 的长会话历史造成偏差。
5. 将 relay 断线/502 的样本单独剔除并标记，避免把基础设施故障算作模型速度。

预期：降低 worker 不一定让单条请求显著提速，但会明显降低 Codex 常驻资源和冷启动压力；切换轻量模型才是立即改善聊天速度的主要手段。

### 第二阶段：增加可观测性

为每个 turn 统一记录以下时间点和标签：

- `relay_event_received_at`
- `queue_dispatched_at`
- `session_ready_at`
- `first_activity_at`
- `first_agent_text_at`
- `first_buzz_send_started_at`
- `first_buzz_message_accepted_at`
- `turn_completed_at`
- `runtime`、`model`、`provider`、`worker_index`、`session_reused`
- LLM 请求次数、工具次数、输入/输出 token、cache 命中、是否触发 delivery correction

Desktop 应展示至少三个产品指标：开始响应、回复可见、任务完成。否则“思考很久但工作正常”和“任务卡死”在用户看来没有区别。

### 第三阶段：代码层优化

1. 为 Buzz Agent 的 provider client 增加流式读取，将 reasoning/text delta 立即转发为 ACP chunk。
2. 将普通 ACP 最终文本的对话交付改成确定性策略：如果 Agent 未调用 `buzz messages send`，优先直接发布已生成的最终文本，不先消耗一整轮 `[Delivery Required]`；只有目标频道或线程语义不明确时才回问 Agent。
3. 为 managed Agent 提供按 runtime 推荐的并发默认值，不再统一默认为 10；Codex/Hermes/Buzz Agent 默认 1，允许高级用户按吞吐需求调整。
4. 为“聊天优先”和“任务完成优先”提供明确模式，映射到模型、reasoning effort、工具权限与最大回合数。
5. 对 session 初始化、MCP 初始化和模型首请求分别计时，验证 Codex adapter 是否还有独立于模型的固定开销，再决定是否优化或替换 adapter。

## 6. 建议的基准测试

每个 runtime 在相同网络、相同频道、全新 session 下重复 10 次：

- A 类：一句事实问答，不调用工具；
- B 类：读取一个固定小文件并总结；
- C 类：执行一个固定只读命令并解释输出；
- D 类：完成一个小型代码诊断，但不修改文件。

结果按中位数和 P95 汇总，而不是只看平均值。需要同时报告：

| 指标 | 含义 |
|---|---|
| Queue latency | Buzz 调度是否成为瓶颈 |
| Time to first activity | 用户多久知道 Agent 已开始工作 |
| Time to first visible reply | 用户真正感受到的响应速度 |
| Completion latency | 整体任务效率 |
| Delivery correction rate | Agent 与 Buzz 交付协议是否稳定 |
| Tool calls / LLM rounds | 慢是因为模型，还是做了更多工作 |

公平比较应做两组：一组使用各 runtime 的推荐默认模型，反映真实产品体验；另一组尽可能使用同一底层模型和相同工具约束，隔离 harness/adapter 开销。

## 7. Constructive Suggestion

不建议把目标定义为“让 Codex 和 Hermes 一样快”。它们当前承担的产品角色不同。更合理的目标是：

- 简单问题由快速 Agent 在数秒内给出可见回复；
- 复杂编码任务允许 Codex 更慢，但持续展示活动、阶段和进度；
- 用户能够明确选择“快答”或“深度执行”；
- 无论使用哪个 Agent，Buzz 自身增加的调度与交付开销都应可测、稳定且尽量低。

## 8. Todo List

> 每个 Todo 只对应一个文件；以下均为待确认的后续代码任务，本次分析不修改代码。

- [ ] `crates/buzz-acp/src/usage.rs`：设计并记录端到端 turn 分段延迟指标。
- [ ] `crates/buzz-acp/src/pool.rs`：评估取消首次 delivery correction，改为直接发布已有最终文本。
- [ ] `crates/buzz-agent/src/llm.rs`：为支持的 provider 实现真正的流式响应读取。
- [ ] `crates/buzz-agent/src/agent.rs`：将 provider delta 增量转发为 ACP thought/message chunk。
- [ ] `desktop/src-tauri/src/managed_agents/types.rs`：将新 Agent 的默认并发从统一值改为 runtime-aware 策略。
- [ ] `desktop/src/features/agents/ui/AgentConfigFields.tsx`：增加“聊天优先 / 深度执行”与并发配置的产品解释。
- [ ] `desktop/src/features/agents/ui/agentSessionTranscriptHelpers.ts`：展示首活动、首条可见回复和完成耗时。
- [ ] `crates/buzz-acp/tests/latency_benchmark.rs`：增加可重复的跨 runtime 延迟基准框架。
- [x] `docs/2026-08-05-agent-response-latency-analysis.md`：记录现状、根因、修复顺序与验收指标。

## 9. 本次边界

本次结论来自当前本机 managed-agent 配置、正在运行的进程、Agent 日志以及相关实现代码。没有向三个 Agent 主动发送新的基准问题，因此可以确认配置和链路差异，但还不能给出三个 runtime 的严格 P50/P95 性能排名。下一步应先执行受控 A/B benchmark，再决定代码改动范围。
