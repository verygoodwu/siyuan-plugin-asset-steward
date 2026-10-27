# 资产管家 v1.1.0 · 移动端适配设计

> 状态：v1.1.0已实现手机端快速记账、基础总览与只读流水搜索。本文保留原设计规划；流水编辑/删除、完整待办和M3真机验证不在本次发布范围。实际能力及验证以「同步与移动端验证.md」为准。
> 原则：数据层零改动，桌面端零回归，移动端只做「记账 + 展示」

---

## 1. 目标与范围

| 做 | 不做（v1.1.0） |
|---|---|
| 手机端快速记账（核心） | 资产编辑模式 |
| 手机端总览简版（净资产/收支/待办） | 规划表单（订阅/保单/贷款/储蓄编辑） |
| 手机端流水查看/搜索 | 报表图表与消费诊断 |
| 同一账本多端互通（现有机制） | 平板专属布局 |

## 2. 事实依据（已查证思源源码/本机构建产物）

| 机制 | 结论 | 来源 |
|---|---|---|
| `addDock` 跨端 | **同一调用**，桌面走 `model`，手机自动走 `mobileModel`（MobileCustom：同一 element + init 回调） | app/src/plugin/index.ts L713 |
| 手机顶栏入口 | `addToolbarItem(IMenuItem)`：往手机顶部工具条加图标按钮（name/icon/label/click） | app/src/plugin/index.ts L175 |
| 手机打开界面 | `openTab({custom:{type}})` 在手机端打开**全屏 Tab**（MobileCustom 渲染） | 同上 + MobileCustom.ts |
| 运行时平台检测 | `!!window.siyuan.mobile`（移动端专属对象）或 `!!document.getElementById("mobileTopBar")` | mobile/main.js 构建产物 |
| 声明开关 | `plugin.json.frontends` 增加 `"mobile"`、`"browser-mobile"`；不加则手机集市不可见（现状） | bazaar 规范 |

**关键收益**：现有 `addDock("assetDock")` 不用改——手机端思源会在侧滑面板里自动出现「资产管家」面板项；我们主要新增手机专属的记账页 + 简版总览。

## 3. 平台分支架构

```
src/
  index.ts          onload 检测 isMobile → 注册不同入口
  state.ts          不动（数据层唯一来源）
  charts.ts         不动（手机端不用图表）
  full.ts           桌面完整界面（不动）
  mobile.ts         【新增】手机端：记账页 + 总览简版 + 流水
```

```ts
const isMobile = !!window.siyuan.mobile;

if (isMobile) {
    this.addToolbarItem({ name: "assetQuickAdd", icon: "iconAssetSteward",
        label: "记一笔", click: () => this.openMobileTab("mTx") });
    // addDock 保留：手机侧滑面板出现「资产管家」→ 总览简版
} else {
    // 现有桌面入口全部不变
}
```

## 4. 移动端功能矩阵

| 页面 | 内容 | 交互 |
|---|---|---|
| **记一笔**（全屏 Tab） | 金额大键盘输入（`inputmode="decimal"`）、支出/收入切换、分类 emoji chips（横滑）、账户下拉、备注 | 保存即写 state.txs 并联动账户余额，`saveData` 持久化 |
| **总览简版**（Dock 面板 / Tab） | 净资产大字卡、本月收入/支出两列、今日待办（预警+到期） | 只读展示，点「记一笔」跳记账 |
| **流水**（Tab 内子页） | 最近 30 条流卡片式列表、关键词搜索、点条目可删除 | 复用 state 筛选逻辑 |
| 资产/规划/报表 | 置灰占位：「该模块请在桌面端使用」（数据可看不可改，v1.2 再议） | — |

## 5. 布局规格

- 底部 Tab 导航（总览 / 记账 / 流水 / 更多），固定 56px，安全区适配 `env(safe-area-inset-bottom)`
- 记账页金额输入 ≥ 32px 字号，分类 chips 单行横滑（overflow-x），保存按钮通栏
- 卡片间距 12px，正文字号 ≥ 14px，触控目标 ≥ 44px
- 全部 `.asm-m` 作用域前缀，不污染思源移动端样式；暗色适配沿用 v1.2 计划，先亮色

## 6. 数据与同步

- 零新增存储结构：手机端只调 `state.ts` 现有读写（`saveData("data.json")`）
- 冲突面与现状一致（思源云同步负责），手机记账是「追加流水」为主，冲突概率低
- 每日快照：手机端打开也记一个点（与桌面同逻辑，去重按日期）

## 7. 里程碑

| 里程碑 | 内容 | 验证方式 |
|---|---|---|
| M1 | frontends + 平台检测 + 手机入口（toolbar/dock）+ 记账页 | 本地 browser-mobile 模拟 |
| M2 | 总览简版 + 流水查看 | 同上 |
| M3 | 响应式打磨 + 真机联调 | **需用户手机装思源实测一轮** |
| M4 | 打包 v1.1.0 → 集市 release | 走既有发版流程 |

## 8. 风险

| 风险 | 应对 |
|---|---|
| 手机端思源版本行为差异（iOS/Android） | M3 真机验证，问题在 M3 内修 |
| `addToolbarItem` 在旧版手机内核不可用 | minAppVersion 已是 3.7.4，该 API 同期存在；fallback：侧滑面板入口仍在 |
| 记账表单触屏体验（键盘遮挡） | 金额输入置顶 + `inputmode`，M3 真机调 |
| 桌面端回归 | 桌面代码路径零改动（仅 onload 加分支），构建后桌面全功能回归一遍 |
