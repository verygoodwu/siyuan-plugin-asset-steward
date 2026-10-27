# 资产管家 v1.1.0

## 手机端初版

- 支持手机 App 与移动浏览器专用入口、底部导航和触屏布局。
- 快速记录收入和支出，选择分类、账户、日期与备注；联动账户余额和每日净资产快照。
- 基础总览显示净资产、本月收入、本月支出和近期流水；流水页支持关键词搜索，最多显示最近30条匹配记录。
- 切换页签保留记账输入与账户选择；保存期间阻止重复提交，失败保留输入，重试不重复记账。
- 账户编辑、规划和完整报表继续使用桌面端；本次不提供手机端流水编辑或删除。

## 同步与稳定性

- 修复同步数据变化触发整插件重新加载、界面闪烁的问题。
- 相同内容不重复写盘、不重建表单；每日快照仅在内容变化时保存。
- 桌面和手机端均保护未提交输入；有草稿时暂缓应用外部更新，提供明确的加载入口。
- 空闲更新保留当前页签和滚动位置；调整宽度不再重建桌面规划表单。
- 保存请求串行执行，并增加写前版本检查、写后回读确认；读取失败、文件缺失和检测到冲突时停止覆盖。

## 验证范围

- 12项状态同步测试、9组桌面浏览器回归、12组手机触屏浏览器回归，TypeScript 检查和生产构建通过。
- 手机布局覆盖320/390/430像素宽度，验证记账余额、重复提交、失败重试、流水搜索和同步草稿保护。
- Windows 思源3.8.2已安装验证同步修复；曾只读观察190秒，账本内容及写入时间未变化，该期间未发生新的跨端通知。
- iOS/Android实体设备、系统软键盘和真实手机云同步仍需后续反馈，不将浏览器模拟验证视为真机验证。

---

# Asset Steward v1.1.0

- Adds a mobile app/browser interface for quick income/expense entry, a basic account summary, and searchable transactions.
- Preserves form drafts and selected accounts across tabs; blocks duplicate submissions and keeps inputs after failed saves.
- Handles synchronized data changes without reloading the plugin. Unchanged content does not rewrite storage or rebuild forms.
- Defers external updates while editing, preserves the current page and scroll position when idle, and checks for common save conflicts.
- Account editing, plans and full reports remain desktop features. Mobile transaction editing/deletion is not included.
- Validation: 12 state tests, 9 desktop browser groups and 12 touch/mobile browser groups, type checking and production build. Physical iOS/Android devices, native keyboards and real phone sync were not verified in this release.


# v1.0.4 展示图更新

- 更换集市详情页展示图，突出资产总览、月预算和收支统计。
- 本次仅更新展示素材，记账与资产管理功能保持不变。

# v1.0.0 首个正式版

多端资产管理与记账插件，数据保存在思源笔记内，随云同步多端可用。

## 功能

- **总览**：净资产 / 月预算 / 每日净值快照趋势 / 资产构成 / 收支概况（周月年环比）/ 今日待办
- **记账**：分类 chips + 自定义分类（emoji 选择器）、筛选搜索、编辑删除、CSV 导出
- **资产**：五分组（现金流/投资/固定/贵重/负债）、银行卡与信贷模板、额度与月支出上限预警、编辑模式行内管理
- **规划**：订阅与固定支出（自动折算月付）、保单、贷款（等额本息/本金、剩余利息估算）、储蓄（利率利息估算、超期预警）
- **报表**：近 6 月收支、分类占比、30 天趋势、消费诊断规则提示

## 说明

- 出厂零数据，从「资产」页添加账户开始
- 图表全部 Canvas 手绘，零外部依赖
- 快捷键 `⌥⌘A` 快速记一笔
