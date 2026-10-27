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
