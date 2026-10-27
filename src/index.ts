import { Plugin, Dialog, showMessage, openTab, getFrontend } from "siyuan";
import "./index.css";
import {
    AppState, STORAGE_NAME, newSeedState, today,
} from "./state";
import { mountFull, FullHost, FullView } from "./full";
import { StateSync, readWorkspaceState } from "./state-sync";
import { mountMobile } from "./mobile";

export default class AssetStewardPlugin extends Plugin {
    private state: AppState = newSeedState();
    private dockEl: HTMLElement | null = null;
    private fullEl: HTMLElement | null = null;
    private bootAt = Date.now();
    private sync!: StateSync;
    private fullView: FullView | null = null;
    private mobileView: FullView | null = null;
    private mobileEl: HTMLElement | null = null;
    private mobileToolbarRegistered = false;
    private mobileToolbarRetry: number | undefined;
    private lifecycle = new AbortController();
    private dockRetry: number | undefined;
    private dockHookElement: HTMLElement | null = null;
    private notice: HTMLElement | null = null;
    private quickDialogOpen = false;

    async onload() {
        this.bootAt = Date.now();
        this.addIcons(
            `<symbol id="iconAssetSteward" viewBox="0 0 32 32">` +
            `<rect x="3" y="7" width="26" height="19" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>` +
            `<path d="M3 12.5h26" stroke="currentColor" stroke-width="2"/>` +
            `<circle cx="23" cy="19.5" r="2.6" fill="currentColor"/></symbol>` +
            `<symbol id="iconAssetDash" viewBox="0 0 32 32">` +
            `<rect x="4" y="4" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>` +
            `<rect x="18" y="4" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>` +
            `<rect x="4" y="18" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>` +
            `<rect x="18" y="18" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></symbol>`,
        );
        try {
            this.sync = new StateSync(this.state, () => readWorkspaceState(this.name), async state => {
                const response = await this.saveData(STORAGE_NAME, state);
                if (response?.code) throw new Error("账本保存失败：" + response.code);
            });
            await this.sync.initialize();
            await this.saveAll();
        } catch (e) {
            console.error("[资产管家] 账本加载失败，停止写入", e);
            showMessage("资产管家：账本未能安全加载，暂不允许保存", 6000, "error");
        }

        if (this.isMobile()) this.onloadMobile();
        else this.onloadDesktop();
    }

    private isMobile() {
        const frontend = typeof getFrontend === "function" ? getFrontend() : "";
        return !!(window.siyuan as any)?.mobile || frontend === "mobile" || frontend === "browser-mobile";
    }

    private onloadMobile() {
        const self = this;
        this.addTab({ type: "assetMobile", init() {
            self.mobileEl = this.element as HTMLElement;
            self.mobileView?.destroy();
            self.mobileView = mountMobile(self.mobileEl, {
                ...self.fullHost(), save: () => self.saveAll()
            });
            self.updateSyncNotice();
        }, destroy() { self.mobileView?.destroy(); self.mobileView = null; self.mobileEl = null; self.notice = null; } });
        this.registerMobileToolbar();
        this.addDock({ config: {position:"RightBottom",size:{width:360,height:300},icon:"iconAssetSteward",title:"资产管家",hotkey:""}, data:{},type:"assetDock", init() {
            const button = document.createElement("button"); button.className="asm-open-full";button.textContent="打开资产管家";
            button.addEventListener("click",()=>self.openMobileTab(),{signal:self.lifecycle.signal});
            this.element.replaceChildren(button);
        } });
    }

    onLayoutReady() { if (this.isMobile()) this.registerMobileToolbar(); }

    private registerMobileToolbar() {
        if (this.mobileToolbarRegistered || this.lifecycle.signal.aborted) return;
        const attempt = () => {
            if (this.mobileToolbarRegistered || this.lifecycle.signal.aborted) return true;
            try {
                this.addToolbarItem({name:"asmQuickAdd",icon:"iconAssetSteward",label:"记一笔",click:()=>this.openMobileTab()} as any);
                this.mobileToolbarRegistered = true;
                return true;
            } catch { return false; }
        };
        if (attempt() || this.mobileToolbarRetry !== undefined) return;
        let retries = 0;
        this.mobileToolbarRetry = window.setInterval(()=>{ if(attempt() || ++retries >= 30) {window.clearInterval(this.mobileToolbarRetry);this.mobileToolbarRetry=undefined;} },400);
    }

    private openMobileTab() {
        if (this.mobileEl?.isConnected) return;
        try { (openTab as any)({app:this.app,custom:{type:"assetMobile",id:this.name+"assetMobile",icon:"iconAssetSteward",title:"资产管家"}}); }
        catch(e) {showMessage("资产管家：打开失败",4000,"error");console.error(e);}
    }

    private onloadDesktop() {
        const self = this;

        // Dock 图标 = 完整界面开关。
        // 思源对图标点击的处理是 document 级全局 click 委托（本机构建产物 common.js 实锤：
        // hasClosestByClassName(target,"dock__item") → toggleModel）。
        // 因此在图标元素上挂「捕获阶段」监听并 stopPropagation，即可拦下原生逻辑——
        // 面板完全不弹出（零闪烁），点击直接切换中间完整界面。
        this.addDock({
            config: {
                position: "RightBottom",
                size: { width: 360, height: 300 },
                icon: "iconAssetSteward",
                title: "资产管家（点击打开 / 关闭完整界面）",
                hotkey: "",
            },
            data: {},
            type: "assetDock",
            init() {
                const el = this.element as HTMLElement;
                self.dockEl = el;
                el.innerHTML = `
                <div class="asm-panel" style="padding:16px;text-align:center">
                  <div style="font-size:28px;margin:14px 0 6px">📊</div>
                  <div style="font-weight:700;margin-bottom:4px">资产管家</div>
                  <div style="font-size:12px;color:#7a8595;line-height:1.7;margin-bottom:14px">
                    点击 Dock 栏的本图标<br>= 打开 / 关闭完整界面<br>快速记账请用顶栏右侧的钱包图标
                  </div>
                  <button class="asm-open-full" data-role="openFull">打开 / 关闭完整界面</button>
                  <button data-type="min" style="display:none"></button>
                </div>`;
                const btn = el.querySelector("[data-role=openFull]") as HTMLElement;
                if (btn) btn.addEventListener("click", () => self.toggleFullTab());
                // 思源启动时若按上次状态恢复显示本面板，静默收起（默认不打开）
                if (Date.now() - self.bootAt < 1500) {
                    setTimeout(() => self.collapseDock(), 400);
                }
            },
            destroy() { self.dockEl = null; },
        });

        // 拦截 Dock 图标点击：捕获阶段吃掉事件，原生 toggleModel 不再执行（面板不弹），
        // 改为切换完整界面。图标由思源异步渲染，绑定失败则短暂重试。
        self.bindDockClickHook();

        // 中心 Tab：完整界面（总览/记账/资产/规划/报表）
        this.addTab({
            type: "assetFull",
            init() {
                self.fullEl = this.element as HTMLElement;
                self.fullView?.destroy();
                self.fullView = mountFull(self.fullEl, self.fullHost());
                self.updateSyncNotice();
            },
            destroy() { self.fullView?.destroy(); self.fullView = null; self.fullEl = null; self.notice = null; },
        });

        // 顶栏：快速记一笔
        this.addTopBar({
            icon: "iconAssetSteward",
            title: "快速记一笔",
            position: "right",
            callback: () => this.openQuickAdd(),
        });

        // 顶栏：完整界面开关（与 Dock 图标等效，双保险）
        this.addTopBar({
            icon: "iconAssetDash",
            title: "资产管家（打开 / 关闭完整界面）",
            position: "right",
            callback: () => this.toggleFullTab(),
        });

        this.addCommand({
            langKey: "quickAdd",
            langText: "资产管家：快速记一笔",
            hotkey: "⌥⌘A",
            callback: () => this.openQuickAdd(),
        });
    }

    onunload() {
        this.lifecycle.abort();
        if (this.dockHookElement) delete this.dockHookElement.dataset.asmHooked;
        this.dockHookElement = null;
        window.clearInterval(this.dockRetry);
        window.clearInterval(this.mobileToolbarRetry);
        this.fullView?.destroy();
        this.mobileView?.destroy(); this.mobileView = null; this.mobileEl = null;
        this.fullView = null;
        this.dockEl = null;
        this.fullEl = null;
    }

    /* ---------- 持久化 ---------- */
    private async saveAll() {
        try {
            this.recordSnap();
            await this.sync.save();
            this.updateSyncNotice();
            return true;
        } catch (e) {
            console.error("[资产管家] 保存失败", e);
            showMessage("资产管家：" + (e as Error).message, 6000, "error");
            this.updateSyncNotice();
            return false;
        }
    }

    async onDataChanged() {
        if (this.lifecycle.signal.aborted) return;
        try {
            const result = await this.sync.receive(() => !this.quickDialogOpen && !this.fullView?.hasDraft() && !this.mobileView?.hasDraft());
            if (this.lifecycle.signal.aborted) return;
            if (result === "applied") { this.fullView?.refresh(); this.mobileView?.refresh(); }
            this.updateSyncNotice();
        } catch (e) {
            showMessage("资产管家：同步读取失败，已保留当前内容", 5000, "error");
            console.error("[资产管家] 同步读取失败", e);
        }
    }

    private updateSyncNotice() {
        const root = this.fullEl || this.mobileEl;
        if (!root) return;
        if (!this.sync?.pending && this.sync?.ready) { this.notice?.remove(); this.notice = null; return; }
        if (this.notice?.isConnected) return;
        const notice = document.createElement("div");
        notice.className = "asm-sync-notice";
        const text = document.createElement("span");
        text.textContent = this.sync?.ready ? "其他设备有更新，当前输入已保留。" : "账本尚未安全加载，已暂停保存。";
        const button = document.createElement("button"); button.textContent = "加载同步更新";
        button.addEventListener("click", async () => {
            if (!window.confirm("加载其他设备的最新账本？当前未提交的输入和未保存修改将被放弃。")) return;
            try { await this.sync.reload(); this.fullView?.refresh(true); this.mobileView?.refresh(true); this.updateSyncNotice(); }
            catch { showMessage("读取失败，当前内容仍已保留", 5000, "error"); }
        }, { signal: this.lifecycle.signal });
        notice.append(text, button);
        root.querySelector(".main,.asm-m-body")?.prepend(notice);
        this.notice = notice;
    }

    private fullHost(): FullHost {
        return {
            state: this.state,
            save: () => this.saveAll(),
            toast: (msg, type) => showMessage(msg, 3000, (type as any) || "info"),
            canMutate: () => {
                if (this.sync?.ready && !this.sync.pending) return true;
                this.updateSyncNotice();
                showMessage("请先加载同步更新；当前输入已保留", 4000, "info");
                return false;
            },
            onIdle: () => { if (this.sync?.pending) void this.onDataChanged(); },
        };
    }

    /** 通过面板内隐藏的 data-type="min" 按钮走思源官方通道收起 Dock 面板 */
    private collapseDock() {
        setTimeout(() => {
            const minBtn = this.dockEl?.querySelector('[data-type="min"]') as HTMLElement | null;
            if (minBtn) minBtn.click();
        }, 80);
    }

    /** 捕获阶段拦截 Dock 图标 click：阻止原生 toggleModel（面板不弹），改为切换完整界面 */
    private bindDockClickHook() {
        const tryBind = (): boolean => {
            const item = document.querySelector<HTMLElement>('.dock__item[data-type$="assetDock"]');
            if (item && !(item as any).dataset.asmHooked) {
                this.dockHookElement = item;
                (item as any).dataset.asmHooked = "1";
                item.addEventListener("click", (e) => {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    this.toggleFullTab();
                }, { capture: true, signal: this.lifecycle.signal });
                console.log("[资产管家] Dock 图标点击拦截已绑定");
                return true;
            }
            return false;
        };
        if (tryBind()) return;
        let n = 0;
        const t = this.dockRetry = window.setInterval(() => {
            if (tryBind() || ++n > 150) window.clearInterval(t);
        }, 200);
    }

    /** 每日净值快照（真实数据，打开思源时记录一次） */
    private recordSnap() {
        const d = today();
        const v = this.state.accounts.reduce((s, a) => s + a.bal, 0);
        const last = this.state.snaps[this.state.snaps.length - 1];
        if (!last || last.d !== d) this.state.snaps.push({ d, v });
        else last.v = v;
        if (this.state.snaps.length > 366) this.state.snaps = this.state.snaps.slice(-366);
    }

    /* ---------- 完整界面 Tab 开关 ---------- */
    private isFullOpen(): boolean {
        return !!this.fullEl && this.fullEl.isConnected;
    }

    private toggleFullTab() {
        if (!this.isFullOpen()) {
            try {
                // 同时传 type/id/icon/title，兼容不同版本 openTab 的 custom 字段
                (openTab as any)({ app: this.app, custom: { type: "assetFull", id: this.name + "assetFull", icon: "iconAssetSteward", title: "资产管家" } });
            } catch (e) {
                console.error("[资产管家] openTab 失败", e);
                showMessage("资产管家：打开完整界面失败 " + (e as Error).message, 4000, "error");
            }
        } else {
            this.closeFullTab();
        }
    }

    /**
     * 关闭完整界面 Tab。
     * 思源源码（layout/Tab.ts）中页签面板与页签头共享同一 data-id，
     * 页签头 li.item[data-id] 内 .item__close 的 click 即原生关闭（Wnd.ts L818）。
     */
    private closeFullTab() {
        const panel = this.fullEl;
        if (!panel) return;
        const id = panel.getAttribute("data-id") || panel.closest("[data-id]")?.getAttribute("data-id");
        this.fullEl = null;
        if (!id) return;
        const closeBtn = document.querySelector(`li.item[data-id="${id}"] .item__close`) as HTMLElement | null;
        if (closeBtn) closeBtn.click();
    }
    /* ---------- 快速记账表单（Dock / 弹窗共用） ---------- */
    private formHTML(): string {
        const s = this.state;
        const acctOpts = s.accounts.map(a => `<option value="${a.name}">${a.name}</option>`).join("");
        const catOpts = (s.cats["支出"] || []).map(([, n]) => `<option>${n}</option>`).join("");
        const noAcctTip = s.accounts.length ? "" :
            `<div style="font-size:12px;color:#d97706;background:#fef4e0;border-radius:8px;padding:8px 10px;margin-bottom:8px">⚠️ 还没有账户，请先到完整界面「资产」页添加账户，再记账。</div>`;
        return `
        <div class="asm-form">
          ${noAcctTip}
          <div class="asm-chips">
            <button class="asm-chip on" data-t="支出">🍜 支出</button>
            <button class="asm-chip" data-t="收入">💰 收入</button>
          </div>
          <div class="asm-row">
            <select data-role="cat">${catOpts}</select>
            <select data-role="acct">${acctOpts}</select>
          </div>
          <div class="asm-row">
            <input data-role="amt" type="number" inputmode="decimal" placeholder="金额 ¥" step="0.01">
            <input data-role="date" type="date" value="${today()}">
          </div>
          <div class="asm-row">
            <input data-role="note" type="text" placeholder="备注 / #标签">
            <button class="asm-btn" data-role="submit">记一笔</button>
          </div>
        </div>`;
    }

    private bindForm(root: HTMLElement, onDone: () => void) {
        const form = root.querySelector(".asm-form") as HTMLElement;
        if (!form) return;
        let curType: "支出" | "收入" = "支出";
        form.querySelectorAll(".asm-chip").forEach(ch => ch.addEventListener("click", () => {
            curType = (ch as HTMLElement).dataset.t as "支出" | "收入";
            form.querySelectorAll(".asm-chip").forEach(x => x.classList.toggle("on", x === ch));
            const cat = form.querySelector('[data-role="cat"]') as HTMLSelectElement;
            cat.innerHTML = (this.state.cats[curType] || []).map(([, n]) => `<option>${n}</option>`).join("");
        }));
        form.querySelector('[data-role="submit"]')!.addEventListener("click", async () => {
            if (!this.fullHost().canMutate?.()) return;
            const q = (r: string) => form.querySelector(`[data-role="${r}"]`) as HTMLInputElement | HTMLSelectElement;
            const v = parseFloat(q("amt").value);
            if (!v || v <= 0) { showMessage("请输入有效金额", 2500, "error"); return; }
            if (!q("acct").value) { showMessage("请先在「资产」页添加账户", 3000, "error"); return; }
            const tx = {
                d: q("date").value || today(),
                t: curType,
                c: q("cat").value,
                a: q("acct").value,
                n: q("note").value.trim() || "—",
                v: curType === "收入" ? Math.abs(v) : -Math.abs(v),
            };
            this.state.txs.unshift(tx);
            const acct = this.state.accounts.find(a => a.name === tx.a);
            if (acct) acct.bal += tx.v;
            this.recordSnap();
            if (!await this.saveAll()) return;
            showMessage("已记账 ¥" + Math.abs(v).toLocaleString(), 2000);
            onDone();
        });
    }

    private openQuickAdd() {
        this.quickDialogOpen = true;
        const dlg = new Dialog({
            title: "资产管家 · 快速记一笔",
            content: `<div class="asm-dialog">${this.formHTML()}</div>`,
            width: "420px",
            destroyCallback: () => { this.quickDialogOpen = false; if (this.sync.pending) void this.onDataChanged(); },
        });
        this.bindForm(dlg.element, () => dlg.destroy());
    }
}
