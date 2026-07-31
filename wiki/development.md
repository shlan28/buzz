# Buzz 开发与测试

> 更新日期：2026-07-31
> 更新说明：首次汇总本地环境、分支纪律、代码约束和分层测试策略。

## 本地环境

```bash
. ./bin/activate-hermit
cp .env.example .env
just setup
just dev
```

Hermit 是仓库预期工具链。运行 Git hook、Rust、Node 或 Flutter 命令前先激活，避免用临时 PATH workaround 掩盖环境问题。

## 分支与提交

- 新修复从最新本地 `dev` 创建 `codex/` 前缀分支；
- 完成后合并回 `dev`，不直接从/进 `main`；
- 保留用户未提交的无关改动；
- commit 使用 `git commit -s`，满足 DCO；
- 代码任务完成必须提交 commit。

## 核心代码约束

- 禁止 `unsafe`；
- production path 不新增 `unwrap()` / `expect()`；
- public API 需要 doc comment；
- 新业务优先 event kind 而不是专用 HTTP endpoint；
- channel scope 使用 `h` tag；
- relay query 指定 kinds；
- reply 写入更新 thread counters。

## 客户端约束

Desktop：

- feature slice + shared；
- Biome 格式与 lint；
- 可读文本使用 rem token；
- E2E 必须 `pnpm build:e2e`；
- 截图前等待 animation；
- community-scoped singleton 接入 reset。

Mobile：

- Riverpod + Hooks；
- 禁止 `StatefulWidget`；
- feature 不跨 feature import；
- 使用 theme/Grid/Radii；
- 仅运行 `flutter test`、`flutter analyze`、`dart format`，Agent 不运行 Flutter build/run/clean/upgrade。

## 测试层次

- `just test-unit`：无基础设施单元测试；
- `just test`：需要 Postgres/Redis 的 integration；
- `just ci`：PR 前完整本地质量门；
- relay/db/auth 变更需要 integration；
- Desktop Tauri tests 单独指定 manifest；
- Desktop E2E 使用 mock bridge 或 integration 配置；
- Mobile UI 优先 widget test；
- 形式化模型与 conformance 用于多租户和协议关键性质。

## PR 截图

只能用仓库截图脚本与 `scripts/post-screenshots.sh` 发布，不能使用 relay media 或第三方图床。多个状态截图必须先比较 hash，防止重复像素被误当成不同状态。

## 相关页面

- [模块地图](modules.md)
- [部署、运维与发布](operations.md)
- [客户端 UI 设计规范](../docs/2026-07-31-buzz-client-ui-design-standard.md)

## 证据入口

- `AGENTS.md`
- `CONTRIBUTING.md`
- `TESTING.md`
- `crates/buzz-cli/TESTING.md`
- `desktop/package.json`
- `mobile/README.md`
- `Justfile`
