# Buzz Wiki 维护日志

> 更新日期：2026-07-31
> 更新说明：创建追加式维护日志；历史条目不得改写。

## [2026-07-31] ingest | 初始项目 wiki

- 读取根目录产品、架构、贡献、测试、发布和 Agent 指南；
- 扫描 Rust crates、Desktop features、Mobile features、主题与共享组件；
- 建立产品概念、架构、流程、Agent、客户端、模块、开发、运维和缺口页面；
- 建立 wiki schema、索引和交叉链接；
- 外部方法参考：Karpathy 的 LLM Wiki 思想；
- 状态：首次基线，后续应随代码变更持续 ingest 和 lint。

## [2026-07-31] lint | 初始基线检查

- 检查 14 个新增 Markdown 文件的更新日期与更新说明；
- 检查 wiki 内相对链接；
- 检查文中列出的仓库证据路径；
- 检查未完成标记、Git whitespace 与变更范围；
- 修正 relay connection、subscription、config 与 kind registry 的证据路径；
- 结果：通过。
