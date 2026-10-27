/* 资产管家 · 移动端界面（作用域 .asm-m）
 * 快速记账、基础总览与流水搜索，复用桌面账本及同步保护。
 * 数据层零改动：只读 H.state，写操作走与桌面端相同的字段约定。
 */
import { AppState, Tx, today } from "./state";
import type { FullView } from "./full";

export interface MobileHost {
    state: AppState;
    save: () => Promise<boolean>;
    toast: (msg: string, type?: string) => void;
    canMutate?(): boolean;
    onIdle?(): void;
}

function esc(s: string): string {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function money(v: number): string {
    return (v < 0 ? "-" : "") + "¥" + Math.abs(v).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}
/** 每日净值快照（与桌面 recordSnap 同逻辑，按日期去重） */
function upsertSnap(s: AppState) {
    const d = today();
    const v = s.accounts.reduce((sum, a) => sum + a.bal, 0);
    const last = s.snaps[s.snaps.length - 1];
    if (!last || last.d !== d) s.snaps.push({ d, v });
    else last.v = v;
    if (s.snaps.length > 366) s.snaps = s.snaps.slice(-366);
}

const TABS: [string, string, string][] = [
    ["add", "✍️", "记账"],
    ["dash", "📊", "总览"],
    ["txs", "🧾", "流水"],
    ["more", "⚙️", "更多"],
];

export function mountMobile(el: HTMLElement, H: MobileHost): FullView {
    const S = H.state;
    const lifetime = new AbortController();
    let busy = false, clean = "";

    el.innerHTML = `
    <div class="asm-m">
      <div class="asm-m-body">

        <!-- ========= 记一笔（M1 全功能） ========= -->
        <div class="asm-m-page on" data-p="add">
          <div class="asm-m-warn" data-role="noAcct" style="display:none">
            ⚠️ 还没有账户。请先在桌面端「资产」页添加账户（手机端账户编辑将在后续版本提供）。
          </div>
          <div class="asm-m-type">
            <button class="on" data-t="支出">支出</button>
            <button data-t="收入">收入</button>
          </div>
          <div class="asm-m-amt">
            <span>¥</span><input data-role="amt" type="number" inputmode="decimal" step="0.01" placeholder="0.00">
          </div>
          <div class="asm-m-lab">分类</div>
          <div class="asm-m-cats" data-role="cats"></div>
          <div class="asm-m-lab">账户</div>
          <select class="asm-m-sel" data-role="acct"></select>
          <div class="asm-m-grid">
            <div>
              <div class="asm-m-lab">日期</div>
              <input class="asm-m-in" data-role="date" type="date" value="${today()}">
            </div>
            <div>
              <div class="asm-m-lab">备注 / 标签</div>
              <input class="asm-m-in" data-role="note" type="text" placeholder="午饭 #工作餐">
            </div>
          </div>
          <button class="asm-m-save" data-role="save">记一笔</button>
        </div>

        <!-- ========= 总览（M2） ========= -->
        <div class="asm-m-page" data-p="dash">
          <h3>资产总览</h3><div class="asm-m-stats" data-role="stats"></div>
          <h3>近期流水</h3><div data-role="recent"></div>
        </div>

        <!-- ========= 流水（M2） ========= -->
        <div class="asm-m-page" data-p="txs">
          <h3>流水查看</h3><input class="asm-m-in" data-role="search" aria-label="搜索流水" placeholder="搜索分类、备注或账户">
          <p class="asm-m-muted" data-role="count"></p><div data-role="txs"></div>
        </div>

        <!-- ========= 更多 ========= -->
        <div class="asm-m-page" data-p="more">
          <div class="asm-m-empty">
            <div class="big">⚙️</div>
            <b>更多</b>
            <div>资产编辑、规划表单与报表请在桌面端使用；<br>手机端能力将逐步开放。</div>
          </div>
        </div>
      </div>

      <div class="asm-m-tabbar">
        ${TABS.map(([k, ic, name]) =>
            `<button data-tab="${k}" class="${k === "add" ? "on" : ""}"><span>${ic}</span>${name}</button>`).join("")}
      </div>
    </div>`;

    const q = <T extends HTMLElement>(r: string) => el.querySelector(`[data-role="${r}"]`) as T;

    /* ---------- 页签切换 ---------- */
    el.querySelectorAll(".asm-m-tabbar button").forEach(b => b.addEventListener("click", () => {
        const k = (b as HTMLElement).dataset.tab;
        el.querySelectorAll(".asm-m-tabbar button").forEach(x => x.classList.toggle("on", x === b));
        el.querySelectorAll(".asm-m-page").forEach(p => p.classList.toggle("on", (p as HTMLElement).dataset.p === k));
        summaries(); H.onIdle?.();
    }, { signal: lifetime.signal }));

    /* ---------- 记账表单 ---------- */
    let curType: "支出" | "收入" = "支出";
    let curCat = "";
    const typeBtns = el.querySelectorAll<HTMLButtonElement>(".asm-m-type button");
    const catsEl = q<HTMLDivElement>("cats");
    const amtEl = q<HTMLInputElement>("amt");
    const noteEl = q<HTMLInputElement>("note");
    const dateEl = q<HTMLInputElement>("date");
    const acctEl = q<HTMLSelectElement>("acct");

    function renderCats() {
        const list = S.cats[curType] || [];
        if (!list.find(([, n]) => n === curCat)) curCat = list[0] ? list[0][1] : "";
        catsEl.innerHTML = list.map(([e, n]) =>
            `<button class="asm-m-cat${n === curCat ? " on" : ""}" data-c="${esc(n)}"><span>${e}</span>${esc(n)}</button>`).join("")
            || `<div style="color:#94a3b8;font-size:13px">暂无分类</div>`;
        catsEl.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
            curCat = (b as HTMLElement).dataset.c || "";
            catsEl.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
        }, { signal: lifetime.signal }));
    }
    function renderAccts() {
        const selected = acctEl.value;
        acctEl.innerHTML = S.accounts.map(a => `<option value="${esc(a.name)}">${esc(a.name)}（${money(a.bal)}）</option>`).join("");
        if (S.accounts.some(a => a.name === selected)) acctEl.value = selected;
        (q<HTMLDivElement>("noAcct")).style.display = S.accounts.length ? "none" : "block";
    }
    const formKey = () => JSON.stringify([curType, curCat, acctEl.value, dateEl.value]);
    const cards = (items: Tx[]) => items.length ? items.map(tx => `<article class="asm-m-tx"><div><b>${esc(tx.c)}</b><span>${esc(tx.d)} · ${esc(tx.a)}</span><small>${esc(tx.n)}</small></div><strong class="${tx.v>=0?"up":"down"}">${money(tx.v)}</strong></article>`).join("") : '<p class="asm-m-muted">暂无匹配流水</p>';
    function summaries() {
        const monthly = S.txs.filter(tx => tx.d.startsWith(today().slice(0,7)));
        const income = monthly.filter(tx=>tx.t==="收入").reduce((s,tx)=>s+tx.v,0);
        const expense = -monthly.filter(tx=>tx.t==="支出").reduce((s,tx)=>s+tx.v,0);
        const net = S.accounts.reduce((s,a)=>s+a.bal,0);
        q("stats").innerHTML = [["净资产",net],["本月收入",income],["本月支出",expense]].map(([label,value])=>`<div><span>${label}</span><b>${money(Number(value))}</b></div>`).join("");
        q("recent").innerHTML = cards(S.txs.slice(0,5));
        const keyword = q<HTMLInputElement>("search").value.trim().toLowerCase();
        const matches = S.txs.filter(tx=>!keyword||[tx.c,tx.n,tx.a,tx.d].join(" ").toLowerCase().includes(keyword));
        q("count").textContent = `共 ${matches.length} 笔${matches.length>30?"，显示最近30笔":""}`;
        q("txs").innerHTML = cards(matches.slice(0,30));
    }
    function refresh(discardDraft = false) {
        const body = el.querySelector<HTMLElement>(".asm-m-body")!, top = body.scrollTop;
        if (discardDraft) {amtEl.value="";noteEl.value="";dateEl.value=today();curType="支出";curCat="";
            typeBtns.forEach(b=>b.classList.toggle("on",b.dataset.t===curType));}
        renderCats();
        renderAccts();
        summaries(); clean = formKey(); body.scrollTop = top;
    }

    typeBtns.forEach(b => b.addEventListener("click", () => {
        curType = (b as HTMLElement).dataset.t as "支出" | "收入";
        typeBtns.forEach(x => x.classList.toggle("on", x === b));
        renderCats();
    }, {signal:lifetime.signal}));

    q<HTMLButtonElement>("save").addEventListener("click", async () => {
        if (busy || H.canMutate?.() === false) return;
        const v = parseFloat(amtEl.value);
        if (!Number.isFinite(v) || v <= 0) { H.toast("请输入有效金额", "error"); return; }
        if (!acctEl.value) { H.toast("请先在桌面端「资产」页添加账户", "error"); return; }
        if (!curCat) { H.toast("暂无可用分类", "error"); return; }
        const tx: Tx = {
            d: dateEl.value || today(),
            t: curType,
            c: curCat,
            a: acctEl.value,
            n: noteEl.value.trim() || "—",
            v: curType === "收入" ? Math.abs(v) : -Math.abs(v),
        };
        const previous = JSON.parse(JSON.stringify(S)) as AppState;
        const saveButton=q<HTMLButtonElement>("save"); busy=true;saveButton.disabled=true;saveButton.textContent="正在保存…";
        S.txs.unshift(tx);
        const acct = S.accounts.find(a => a.name === tx.a);
        if (acct) acct.bal += tx.v;
        upsertSnap(S);
        try {
            if (!await H.save()) {Object.assign(S,previous);return;}
            H.toast("已记账 " + money(v)); amtEl.value="";noteEl.value="";amtEl.blur();refresh();
        } catch {Object.assign(S,previous);H.toast("保存失败，输入已保留，请重试","error");}
        finally {busy=false;saveButton.disabled=false;saveButton.textContent="记一笔";}
    }, {signal:lifetime.signal});
    q("search").addEventListener("input",summaries,{signal:lifetime.signal});
    el.addEventListener("focusout",()=>window.setTimeout(()=>{if(!lifetime.signal.aborted)H.onIdle?.();},0),{signal:lifetime.signal});

    refresh();
    return {hasDraft:()=>busy||!!amtEl.value.trim()||!!noteEl.value.trim()||formKey()!==clean,
        refresh,destroy:()=>lifetime.abort()};
}
