> 更新日期：2026-08-23 13:43 CST
> 更新说明：已解除自定义星期与月日期组合的首次日期锁定，补充 Desktop、CLI 和 E2E 回归验证。

# Calendar 自定义重复日期解锁修复方案

## 一、问题

创建重复日程时，Custom weekdays 会默认选中开始日期对应的星期，并禁止取消。

例如开始日期是 Sunday：

- Sunday 默认选中；
- 点击 Sunday 不会改变状态；
- 用户无法创建只在 Monday、Wednesday 等日期发生的系列。

这不是 checkbox 组件故障，而是当前产品逻辑主动锁定了首次日期：

- Desktop `toggleRepeatValue()` 遇到首次日期会直接返回；
- Desktop recurrence validator 要求规则包含首次日期；
- CLI 使用相同约束拒绝不包含首次日期的规则。

Custom month days 也存在相同问题，只是表现为无法取消开始日期对应的几号。

## 二、修复后的产品语义

开始日期改为“重复搜索起点和时间锚点”，不再强制成为第一个 occurrence。

- Custom weekdays 可以自由选择或取消 Sunday 至 Saturday 中的任意一天，但至少保留一天。
- Custom month days 可以自由选择或取消 1–31 中的任意日期，但至少保留一天。
- 如果开始日期不符合最终规则，从开始日期向后寻找第一个命中的日期作为 occurrence 0。
- 日程的小时、分钟、持续时间和全天属性继续以创建表单中的 start/end 为模板。
- 按次数结束时，次数从第一个实际命中的 occurrence 开始计算。
- 按截止日期结束时，只生成开始日期至截止日期之间命中的 occurrences；没有任何命中时禁止保存并显示错误。

示例：

```text
开始日期：Sunday 2026-08-23 09:00
规则：Monday + Wednesday
次数：3

结果：
2026-08-24 Monday 09:00
2026-08-26 Wednesday 09:00
2026-08-31 Monday 09:00
```

## 三、交互调整

- 切换到 Custom weekdays 时仍默认选中开始日期对应星期，减少常规创建步骤，但该选项可以取消。
- 切换到 Custom month days 时仍默认选中开始日期对应日期，但该选项可以取消。
- 用户取消最后一个选项时，表单显示 `Choose at least one valid repeat day.`，Save 禁用。
- 不自动替用户重新勾选开始日期，也不静默移动 start 输入框。

## 四、跨端一致性

Desktop 和 `buzz calendar create` 使用一致语义：规则不再必须包含 start 对应星期或月日期。

CLI 示例：

```bash
buzz calendar create \
  --title "Workout" \
  --start "2026-08-23T09:00:00+08:00" \
  --end "2026-08-23T10:00:00+08:00" \
  --timezone Asia/Shanghai \
  --weekdays mon,wed \
  --repeat-count 3
```

虽然 start 是 Sunday，命令仍合法，首个实例从 Monday 开始。

## 五、测试方案

- Desktop recurrence unit：Sunday 起点只选 Monday/Wednesday，首个实例落在 Monday。
- Desktop recurrence unit：自定义月日期取消 start 日后，从下一个命中日期开始。
- Desktop recurrence unit：空组合继续被拒绝。
- Desktop E2E：打开 Sunday，选择 Custom weekdays，取消 Sunday，并成功创建 Monday/Wednesday 系列。
- CLI unit：Sunday start + `--weekdays mon,wed` 被接受并正确展开。
- 保持现有 Daily、月缺失日期跳过、截止日期、部分失败和幂等测试通过。

## 六、Todolist

每个 todo 只对应一个文件；获得确认后再修改代码。

- [x] `desktop/src/features/calendar/ui/CalendarEventDialog.tsx`：移除首次星期/月日期不可取消的交互锁。
- [x] `desktop/src/features/calendar/lib/calendarRecurrence.ts`：移除必须包含首次日期的校验，保留空组合校验。
- [x] `desktop/src/features/calendar/lib/calendarRecurrence.test.mjs`：将首次日期拒绝测试改为首次命中日期展开测试，并覆盖月日期组合。
- [x] `desktop/tests/e2e/calendar.spec.ts`：覆盖 Sunday 可以取消并从下一命中星期创建系列。
- [x] `crates/buzz-cli/src/commands/calendar.rs`：移除 CLI 首次日期约束并更新单元测试。
- [x] `docs/2026-08-23-calendar-recurring-events-plan.md`：同步最终产品语义，删除“首次日程必须属于组合”的旧说明。
- [x] `docs/2026-08-23-calendar-custom-repeat-unlock-fix.md`：记录完成项与验证结果。

## 七、实施结果

- Sunday 及其他开始日期对应选项不再锁定，可以正常取消。
- 开始日期不命中规则时，Desktop 与 CLI 均从之后最早命中日期生成 occurrence 0。
- 自定义星期和自定义月日期使用相同语义。
- 空组合仍被表单和 CLI 校验拒绝。

## 八、验证结果

- Desktop TypeScript 类型检查通过。
- Desktop Biome 检查通过。
- recurrence 单元测试 6/6 通过。
- CLI calendar 单元测试 6/6 通过。
- Calendar Playwright smoke 14/14 通过，包含取消 Sunday 后创建 Monday/Wednesday 系列。
- `cargo fmt --all -- --check` 与 `cargo clippy -p buzz-cli --all-targets -- -D warnings` 通过。
- `git diff --check` 通过。

## 九、验收标准

- Sunday 可以在 Custom weekdays 中被取消。
- 取消后选择 Monday/Wednesday 可以成功保存。
- occurrence 0 是 start 当天或之后第一个符合规则的日期。
- Custom month days 遵守相同语义。
- Desktop 与 CLI 展开结果一致。
- 现有重复日程测试无回归。
