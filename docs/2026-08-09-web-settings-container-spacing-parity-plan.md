> 更新日期：2026-08-09
> 更新说明：修复 Web Settings 的容器层级与操作区间距，对齐 Desktop 的双层 Settings surface；Appearance 移除多余背景框，Connection 和 Paired device 按钮不再贴底边；补充遗漏的 Desktop settings 三层框修复。

# Web Settings 容器与间距对齐方案

## 一、问题

Web Settings 当前复用了一个带边框和背景的 `Panel` 包裹所有内容，造成三类视觉问题：

1. Appearance 的 System/Light/Dark 三个模式按钮外面多了一层完整背景框；
2. Connection 的 `Check connection` 按钮缺少底部操作区 padding，贴在卡片底边；
3. Paired device 的 `Clear pairing` / `Pair with Mac` 同样贴底边。

## 二、Desktop 结构事实

Desktop Settings 有两个主要 surface 层级：

- 外层：`settings-content-surface`，是 Settings 主内容的白色圆角内容面；
- 内层：具体设置项使用 option group/card，形成第二层内容组织。

但 Appearance 的 System/Light/Dark 是例外：它直接位于页面内容面上，三个按钮各自有边框和选中态，不再套一层 option group 背景。

因此正确修复不是删除 Settings 的所有内层框，而是区分两类内容：

- Appearance mode selector：无外部卡片框；
- Profile、Connection、Paired device：保留内层 option group，与外层 content surface 形成 Desktop 的两层结构。

## 三、Appearance 修复

- 标题和说明保持现有位置；
- System/Light/Dark 直接放在页面内容层；
- 每个选项保留独立圆角边框；
- 选中态使用 `border-primary + bg-primary/10`，未选中使用较轻的 `border-border/70`；
- 不增加整组背景、整组边框或额外 shadow；
- iPad 窄屏仍保持三项同排；触控高度至少 40px。

## 四、Connection 与 Paired device 修复

内层 option group 拆成明确的两个区域：

- rows 区：SettingRow 列表，继续使用行间 divider；
- actions 区：按钮 footer，使用 `px-4 pb-4 pt-3`，与底边保持至少 16px 间距。

操作区不额外增加第三层卡片：

- `Check connection` 位于 Connection option group 内部 footer；
- `Clear pairing` / `Pair with Mac` 位于 Paired device option group 内部 footer；
- 按钮与上一行之间有稳定间距；
- focus ring、disabled 和 destructive 样式保持可辨认；
- footer 与卡片底边、左右边距一致。

## 五、双层框验收

Web 的 Settings 页面必须保留：

1. `DesktopParityAppShell` 提供的外层圆角 content surface；
2. Profile、Connection、Paired device 内部的 option group。

不得出现：

- Appearance selector 的第三层整组背景框；
- option group 内再套一张 actions 卡片；
- 按钮贴住边框；
- 为了“看起来有层次”新增 shadow 或更重的边框颜色。

## 六、Todo List

- [x] `web/src/features/settings/SettingsPage.tsx`：增加 plain/option-group 两种内容布局，移除 Appearance 外框，并为 Connection/Paired device 增加 actions footer padding。
- [x] `web/tests/e2e/work-console.spec.ts`：覆盖 Appearance 无整组背景框、Settings 两层 surface 和两个操作按钮的底部间距。
- [x] `web/tests/e2e/ipad-layout.spec.ts`：覆盖三项 Appearance 同排、操作按钮不溢出及窄屏 Settings 无横向滚动。
- [x] `web/tests/e2e/desktop-parity.visual.spec.ts`：增加 Appearance、Connection、Paired device 的 Light/Dark Settings 视觉基线。
- [x] `web/playwright.config.ts`：Settings 视觉与布局测试已通过现有 smoke testMatch 纳入门禁，无需配置变更。
- [x] `docs/2026-08-09-web-settings-container-spacing-parity-plan.md`：记录测试、commit、部署号与公网资源版本。

## 七、验收标准

- Appearance 三个选项外面没有整组背景框；
- 选项本身仍有清晰边框、hover、focus 和 active 状态；
- Connection `Check connection` 与卡片底边至少 16px；
- Paired device 操作按钮与卡片底边至少 16px；
- Settings 外层 content surface 与内层 option group 两层结构清楚；
- Appearance 不出现第三层整组框；Connection/Device 不出现第三层 actions 框；
- Chrome、iPad 横屏、iPad 竖屏完整矩阵及 Light/Dark 视觉回归通过后再部署。

## 八、确认门

鹿鹿子大王确认后，再修改 Web Settings 代码、补测试、提交并部署。

## 九、完成记录

- 代码提交：`5c8bd4f76`；
- Appearance mode selector 已移除整组背景框，仅保留三个独立选项按钮；
- Profile、Connection、Paired device 继续保留外层 content surface + 内层 option group 两层结构；
- Connection 与 Paired device 操作区使用独立 footer spacing，几何测试确认按钮与底边至少 16px；
- Compact iPad 下三项 Appearance 同排且无横向溢出；
- `pnpm check`、TypeScript、production/E2E build 通过；完整 Chrome、iPad 横屏、iPad 竖屏矩阵 121/121 通过；
- Appearance、Connection、Paired device 共六张 Light/Dark 视觉基线已生成并复跑通过；
- Cloudflare Pages 部署：`ad7dd353`；生产资源：`index-ByRVeFtC.js`、`index-CejEDruc.css`。

## 十、Desktop settings 遗漏修复

### 10.1 当前问题

Web `Desktop settings` 当前存在三层 surface：

1. `DesktopParityAppShell` 的外层 content surface；
2. `Panel` 生成的 option group；
3. option group 内部再次创建的 `rounded-xl border bg-muted/30` 灰色说明卡片。

第三层灰框没有新的交互或信息分组价值，只是重复包裹一段说明文字，因此应删除。

### 10.2 修复结构

- 保留外层 Settings content surface；
- 保留 Desktop settings 的内层 option group；
- 说明文字直接作为 option group 内容，使用 `px-4 py-4`；
- 移除说明文字自己的 border、rounded、background；
- 保持现有文字、换行和只读语义，不新增跳转或虚假 Desktop 控件；
- Light/Dark 下内层 option group 的背景与 Profile、Connection、Paired device 使用同一规则。

### 10.3 追加 Todo List

- [ ] `web/src/features/settings/SettingsPage.tsx`：删除 Desktop settings 最内层灰色说明卡片，将说明文字直接放入 option group。
- [ ] `web/tests/e2e/work-console.spec.ts`：断言 Desktop settings 只有一个内层 option group，不存在嵌套 border/background card。
- [ ] `web/tests/e2e/desktop-parity.visual.spec.ts`：增加 Desktop settings Light/Dark 视觉基线。
- [ ] `docs/2026-08-09-web-settings-container-spacing-parity-plan.md`：记录补漏修复的测试、commit、部署号与公网资源版本。

### 10.4 追加验收标准

- Desktop settings 总共只保留外层 content surface + 内层 option group；
- 说明文字外不存在第三层灰框、第三层 border 或第三层 rounded card；
- 与其他 Settings 子页面的内容宽度、内边距和边框颜色一致；
- 完整浏览器矩阵与 Desktop settings Light/Dark 基线通过后再部署。

## 十一、补漏确认门

鹿鹿子大王确认后，再修改 Desktop settings 子页面、补测试、提交并重新部署。
