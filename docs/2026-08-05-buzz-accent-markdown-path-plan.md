# Buzz 全局 Accent 与 Markdown 文件路径方案

> 更新日期：2026-08-05
> 更新说明：首次提出解除 Buzz 主题的中性 Accent 锁定，并让可点击的本地 Markdown 文件路径直接使用全局 Accent。

## 1. 产品结论

Buzz 与 Buzz Dark 主题应和其他主题一样，在 Settings → Appearance 中展示 Accent color 选择器。用户选择 Accent 后，Buzz 的主要操作、选中状态、焦点语义和 Agent 消息中的可点击本地 Markdown 文件路径使用同一套重点色。

不新增“文件路径颜色”独立设置。一个全局 Accent 比两个相互竞争的颜色设置更容易理解，也能保持产品视觉一致。

## 2. 用户体验

1. 用户打开 Settings → Appearance。
2. 无论当前选择 Buzz、Buzz Dark 或其他主题，都能看到 Accent color。
3. 点击色点后立即应用，不需要 Save。
4. Agent 消息中的 `.md` 路径随全局 Accent 同步更新。
5. 路径继续使用文件图标、重点色文字与下划线表达可点击性，不能只依赖颜色。

Accent 继续提供现有选项，包括 Neutral、Blue、Cyan、Green、Orange、Red、Pink、Lilac、Purple 与 Indigo。用户可选择非蓝色 Accent；本次不另建一套文件专属色板。

## 3. 默认值与迁移

当前实现把 Buzz / Buzz Dark 强制解析为 Neutral，同时全局 Accent 在没有本地记录时默认 Blue。直接删除主题锁定会导致从未选择过 Accent 的 Buzz 用户突然变成蓝色。

建议采用以下规则：

- 已有 `buzz-accent-color`：尊重用户保存的全局 Accent，Buzz 主题立即使用它。
- 没有 `buzz-accent-color`：默认使用 Neutral，保持 Buzz 当前黑白外观。
- 用户以后主动选择 Blue 或其他颜色：所有主题统一应用该选择。
- 切换主题不重置 Accent。

这既解除 Buzz 的能力限制，也避免默认外观未经用户操作发生突变。

## 4. 技术方案

### 4.1 ThemeProvider

保留 `isBuzzTheme()` 对 Buzz sidebar、vibrancy 和主题配对的判断，但删除它对 Accent 的特殊解析。缓存恢复、主题切换和 Accent effect 都直接调用存储的全局 Accent。

把无存储值时的 Accent fallback 从 Blue 改为 Neutral。Neutral 仍动态映射为当前主题的 foreground / background，保证亮暗模式可读。

### 4.2 Appearance

删除 `accentPickerHidden` 和相关显示/隐藏动画分支，让 `AccentPickerContent` 对所有主题持续可见。主题网格不再因为 Buzz 模式隐藏 Accent 选择器。

### 4.3 Markdown 文件路径

`LocalMarkdownPath` 已使用 `text-primary`、`hover:text-primary/80` 与 `ring` 语义 token。全局 Accent 会更新 `--primary`，因此不需要写入硬编码 HEX，也不需要增加新的文件路径设置或存储键。

路径继续保留下划线和文件图标，确保色觉差异或 Neutral 模式下仍可识别。

## 5. 测试与验收

- Buzz 和 Buzz Dark 中始终显示 Accent color。
- Fresh profile 使用 Neutral，不会默认变蓝。
- 已保存 Mauve / Purple 等 Accent 的用户切回 Buzz 后仍使用该颜色。
- 切换 System / Light / Dark 和主题时 Accent 不闪回 Neutral。
- 频道/DM 与 Inbox 中的本地 Markdown 路径都使用 `text-primary`。
- Neutral 下路径仍可通过文件图标和下划线识别。
- Accent 更改后路径无需刷新消息或重启应用即可更新。

实施后运行 Desktop 单测、主题相关测试、lint、E2E smoke，并在 Buzz 主题下截取 Appearance 和消息路径的作用域截图。

## 6. Todo List

每个 Todo 只对应一个文件。

- [x] `desktop/src/shared/theme/ThemeProvider.tsx`：移除 Buzz Accent 强制 Neutral 解析，将 fresh profile 默认 Accent 改为 Neutral，并更新相关注释。
- [x] `desktop/src/features/settings/ui/SettingsPanels.tsx`：让 Accent color 在 Buzz / Buzz Dark 主题中持续显示，移除不再需要的隐藏动画分支。
- [x] `desktop/src/shared/theme/ThemeProvider.test.mjs`：验证 Buzz 使用已保存 Accent、无存储时使用 Neutral，以及非 Accent 的 Buzz 专属能力不受影响。
- [x] `desktop/src/shared/ui/markdown/LocalMarkdownPath.tsx`：确认路径已直接使用全局 `primary` 语义色，无需增加重复 token 或代码改动。
- [x] `desktop/tests/e2e/local-markdown-preview.spec.ts`：增加 Buzz 下 Agent Markdown 路径继承全局 Accent 的回归验证。
- [x] `desktop/tests/e2e/buzz-theme-screenshots.spec.ts`：把 Buzz 隐藏 Accent 的旧断言改为始终显示并即时应用 Accent，同时更新对应截图。

## 7. 实施约束

- 实施前由鹿鹿子大王确认本方案，尤其是 fresh profile 默认 Neutral 的迁移规则。
- 不新增硬编码业务颜色或文件路径专属存储键。
- 不改变 Buzz sidebar、vibrancy、主题配对或 System 模式逻辑。
- 不引入 arbitrary px/rem 文字字号。
- 完成后使用 signed-off commit 提交到当前功能分支；在鹿鹿子大王测试完成并明确要求前，不合并到 `dev`。
