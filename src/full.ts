/* 资产管家 · 完整界面（总览/记账/资产/规划/报表），移植自 Web Demo v0.7.2 */
import {
    AppState, Tx, Acct, GROUPS, CAT_EMOJIS, CAT_TIPS,
    BUDGET, isCredit, groupTypes, subMonthly, daysLeft, loanCalc, estInterest, today,
} from "./state";
import { drawLine, drawDoughnut, drawBars, bindChartHover } from "./charts";

export interface FullHost {
    state: AppState;
    save(): void;
    toast(msg: string, type?: string): void;
    renderDock?(): void;
    canMutate?(): boolean;
    onIdle?(): void;
}

export interface FullView {
    hasDraft(): boolean;
    refresh(discardDraft?: boolean): void;
    destroy(): void;
}

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function mountFull(el: HTMLElement, H: FullHost) {
    const lifetime = new AbortController();
    const listen = (type: string, handler: (event: Event) => void) => el.addEventListener(type, handler, { signal: lifetime.signal });
    const cleanInputs = new WeakMap<Element, string>();
    const inputValue = (input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => input instanceof HTMLInputElement && ["checkbox", "radio"].includes(input.type) ? String(input.checked) : input.value;
    const captureInputs = () => el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea").forEach(input => {
        if (!cleanInputs.has(input)) cleanInputs.set(input, inputValue(input));
    });
    const S = H.state;
    /* ---------- 页面内可变状态 ---------- */
    let curPg = "dash";
    let curType: "支出" | "收入" = "支出", curCat = S.cats["支出"][0][1], editing = -1;
    let assetEditMode = false, inlineAddGroup: string | null = null, inlineEditIdx: number | null = null;
    let lnEditIdx: number | null = null, svEditIdx: number | null = null;
    let delFn: (() => void) | null = null, depIdx = -1;
    let cmEmoji = "📦", cmType: "支出" | "收入" = "支出";

    const $ = (id: string) => el.querySelector("#" + id) as HTMLElement | null;
    const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;

    /* ---------- 骨架 ---------- */
    el.innerHTML = `
    <div class="asm-full">
      <aside class="side">
        <div class="logo"><span class="dot"></span>资产管家</div>
        <div class="nav" id="as-nav">
          <button data-pg="dash" class="active">📊 总览</button>
          <button data-pg="tx">✍️ 记账</button>
          <button data-pg="asset">🏦 资产</button>
          <button data-pg="plan">📅 规划</button>
          <button data-pg="report">📈 报表</button>
        </div>
        <div class="foot">资产管家 v1.0 · 数据保存在思源笔记<br>多端同步 · 本地优先</div>
      </aside>
      <main class="main">
        <section class="page active" id="as-p-dash"></section>
        <section class="page" id="as-p-tx"></section>
        <section class="page" id="as-p-asset"></section>
        <section class="page" id="as-p-plan"></section>
        <section class="page" id="as-p-report"></section>
      </main>
      <!-- 删除确认 -->
      <div id="as-del" class="asm-mask" style="display:none">
        <div class="asm-dlg" style="width:340px;text-align:center">
          <div style="font-size:30px;margin-bottom:8px">🗑️</div>
          <div id="as-del-msg" style="font-weight:600;margin-bottom:6px"></div>
          <div style="font-size:12.5px;color:var(--sub);margin-bottom:14px">相关流水/记录不受影响</div>
          <label style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;color:var(--sub);margin-bottom:16px;cursor:pointer">
            <input type="checkbox" id="as-del-skip"> 今天不再弹出
          </label>
          <div style="display:flex;gap:10px;justify-content:center">
            <button class="btn ghost" style="min-width:100px" data-act="delClose" data-ok="0">取消</button>
            <button class="btn" style="min-width:100px" data-act="delClose" data-ok="1">确定删除</button>
          </div>
        </div>
      </div>
      <!-- 存入一笔 -->
      <div id="as-dep" class="asm-mask" style="display:none">
        <div class="asm-dlg" style="width:340px">
          <div style="font-weight:700;margin-bottom:10px">💰 存入一笔</div>
          <div id="as-dep-msg" style="font-size:13px;color:var(--sub);margin-bottom:10px"></div>
          <input type="number" inputmode="decimal" id="as-dep-amt" placeholder="金额 ¥" step="0.01" min="0" style="width:100%">
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
            <button class="btn ghost" style="min-width:90px" data-act="depClose" data-ok="0">取消</button>
            <button class="btn" style="min-width:90px" data-act="depClose" data-ok="1">存入</button>
          </div>
        </div>
      </div>
      <!-- 自定义分类 -->
      <div id="as-cat" class="asm-mask" style="display:none">
        <div class="asm-dlg" style="width:340px">
          <div style="font-weight:700;margin-bottom:12px">自定义分类 <span class="tag b" id="as-cm-type"></span></div>
          <div style="font-size:12px;color:var(--sub);margin-bottom:6px">选择图标</div>
          <div id="as-cm-grid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;max-height:150px;overflow:auto;margin-bottom:12px"></div>
          <div style="font-size:12px;color:var(--sub);margin-bottom:6px">分类名称</div>
          <input type="text" id="as-cm-name" placeholder="如：化妆品、钓鱼" style="width:100%;margin-bottom:14px">
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn ghost" data-act="catClose">取消</button>
            <button class="btn" data-act="catConfirm">确定</button>
          </div>
        </div>
      </div>
    </div>`;

    /* ---------- 通用工具 ---------- */
    const money = (v: number) => (v < 0 ? "-" : "") + "¥" + Math.abs(Math.round(v)).toLocaleString();
    const fillSel = (sel: HTMLSelectElement | null, items: string[], cur?: string) => {
        if (!sel) return;
        sel.innerHTML = items.map(i => `<option value="${esc(i)}"${i === cur ? " selected" : ""}>${esc(i)}</option>`).join("");
    };

    function confirmDel(msg: string, fn: () => void) {
        if (S.warn.delSkip === today()) { fn(); return; }
        const m = $("as-del")!;
        ($("as-del-msg") as HTMLElement).textContent = msg;
        ($("as-del-skip") as HTMLInputElement).checked = false;
        delFn = fn;
        (m as HTMLElement).style.display = "flex";
    }

    /* ---------- 记账表单 ---------- */
    function renderCats() {
        const box = $("as-cat-chips");
        if (!box) return;
        box.innerHTML = (S.cats[curType] || []).map(([e, n]) =>
            `<button class="chip${n === curCat ? " on" : ""}" data-act="pickCat" data-c="${esc(n)}">${e} ${esc(n)}</button>`).join("") +
            `<button class="chip" data-act="addCat" style="border-style:dashed;color:var(--blue)">＋ 自定义</button>`;
    }
    function syncTxForm() {
        fillSel($("as-acct") as HTMLSelectElement, S.accounts.map(a => a.name));
        const amt = $("as-amt") as HTMLInputElement;
        if (amt) amt.placeholder = curType + "金额 ¥";
        renderCats();
    }
    function setTpl(t: "支出" | "收入") {
        curType = t; curCat = (S.cats[t] || [["📦", "其他"]])[0][1];
        el.querySelectorAll("#as-quick-tpl .chip").forEach(x => x.classList.toggle("on", (x as HTMLElement).dataset.a === t));
        syncTxForm();
        const btn = el.querySelector("#as-tx-add") as HTMLElement;
        if (btn) btn.textContent = "记一笔";
        editing = -1;
    }
    function fillMonth() {
        const sel = $("as-f-month") as HTMLSelectElement;
        if (!sel) return;
        const months = [...new Set(S.txs.map(x => x.d.slice(0, 7)))].sort().reverse();
        const cur = sel.value;
        sel.innerHTML = '<option value="">全部月份</option>' + months.map(m => `<option value="${m}">${m}</option>`).join("");
        if (months.includes(cur)) sel.value = cur;
    }
    function filtered(): Tx[] {
        const m = ($("as-f-month") as HTMLSelectElement)?.value || "";
        const t = ($("as-f-type") as HTMLSelectElement)?.value || "";
        const kw = (($("as-f-kw") as HTMLInputElement)?.value || "").trim().toLowerCase();
        return S.txs.filter(x => (!m || x.d.startsWith(m)) && (!t || x.t === t) &&
            (!kw || [x.c, x.n, x.a].join(" ").toLowerCase().includes(kw)));
    }
    function renderTxTable() {
        const list = filtered();
        const inc = list.filter(x => x.v > 0 && x.t === "收入").reduce((s, x) => s + x.v, 0);
        const exp = list.filter(x => x.v < 0 && x.t === "支出").reduce((s, x) => s + x.v, 0);
        const sum = $("as-tx-sum");
        if (sum) sum.innerHTML = `共 ${list.length} 笔　<b class="up">收入 +¥${inc.toLocaleString()}</b>　<b class="down">支出 -¥${Math.abs(exp).toLocaleString()}</b>　净 <b class="${inc + exp >= 0 ? "up" : "down"}">¥${(inc + exp).toLocaleString()}</b>`;
        const tb = el.querySelector("#as-tx-table tbody");
        if (tb) tb.innerHTML = list.length ? list.map(x => {
            const i = S.txs.indexOf(x);
            const cls = x.v > 0 ? "up" : "down";
            return `<tr><td>${x.d}</td><td><span class="tag ${x.t === "收入" ? "g" : "r"}">${x.t}</span></td><td>${esc(x.c)}</td><td>${esc(x.a)}</td><td style="color:var(--sub)">${esc(x.n)}</td><td class="num ${cls}" style="text-align:right">${x.v > 0 ? "+" : ""}${x.v.toLocaleString()}</td>
        <td style="text-align:right;white-space:nowrap"><button class="ibtn" title="编辑" data-act="editTx" data-i="${i}">✏️</button> <button class="ibtn" title="删除" data-act="delTx" data-i="${i}">🗑️</button></td></tr>`;
        }).join("") : '<tr><td colspan="7" class="empty">没有匹配的流水</td></tr>';
        fillMonth();
    }
    function addTx() {
        if (editing >= 0) { saveEdit(); return; }
        const v = parseFloat(($("as-amt") as HTMLInputElement).value);
        if (!v || v <= 0) { H.toast("请输入有效金额", "error"); return; }
        const d = ($("as-date") as HTMLInputElement).value || today();
        const a = ($("as-acct") as HTMLSelectElement).value;
        if (!a) { H.toast("请先在「资产」页添加账户", "error"); return; }
        S.txs.unshift({ d, t: curType, c: curCat, a, n: ($("as-note") as HTMLInputElement).value || "—", v: curType === "收入" ? Math.abs(v) : -Math.abs(v) });
        const acct = S.accounts.find(x => x.name === a);
        if (acct) acct.bal += curType === "收入" ? Math.abs(v) : -Math.abs(v);
        H.save(); renderTxTable(); recordSnap(); H.renderDock?.();
        ($("as-amt") as HTMLInputElement).value = ""; ($("as-note") as HTMLInputElement).value = "";
        H.toast("已记账 " + money(Math.abs(v)));
    }
    function editTx(i: number) {
        const x = S.txs[i]; editing = i;
        curType = x.t; curCat = x.c;
        el.querySelectorAll("#as-quick-tpl .chip").forEach(c => c.classList.toggle("on", (c as HTMLElement).dataset.a === x.t));
        syncTxForm();
        ($("as-amt") as HTMLInputElement).value = String(Math.abs(x.v));
        ($("as-acct") as HTMLSelectElement).value = x.a;
        ($("as-date") as HTMLInputElement).value = x.d;
        ($("as-note") as HTMLInputElement).value = x.n === "—" ? "" : x.n;
        const btn = el.querySelector("#as-tx-add") as HTMLElement;
        if (btn) btn.textContent = "保存修改";
        $("as-p-tx")?.scrollIntoView({ behavior: "smooth" });
    }
    function saveEdit() {
        const v = parseFloat(($("as-amt") as HTMLInputElement).value);
        if (!v || v <= 0) { H.toast("请输入有效金额", "error"); return; }
        const x = S.txs[editing];
        const oldV = x.v;
        const oldA = S.accounts.find(a => a.name === x.a);
        x.d = ($("as-date") as HTMLInputElement).value;
        x.c = curCat;
        x.a = ($("as-acct") as HTMLSelectElement).value;
        x.n = ($("as-note") as HTMLInputElement).value || "—";
        x.v = x.t === "收入" ? Math.abs(v) : -Math.abs(v);
        if (oldA) oldA.bal -= oldV;
        const newA = S.accounts.find(a => a.name === x.a);
        if (newA) newA.bal += x.v;
        editing = -1; H.save(); renderTxTable(); recordSnap(); H.renderDock?.();
        ($("as-amt") as HTMLInputElement).value = ""; ($("as-note") as HTMLInputElement).value = "";
        (el.querySelector("#as-tx-add") as HTMLElement).textContent = "记一笔";
    }
    function exportCSV() {
        const rows = [["日期", "类型", "分类", "账户", "备注", "金额(元)"]].concat(filtered().map(x => [x.d, x.t, x.c, x.a, x.n, String(x.v)]));
        const blob = new Blob(["\ufeff" + rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "流水.csv"; a.click();
    }

    /* ---------- 自定义分类 ---------- */
    function openCatModal() {
        cmEmoji = "📦";
        ($("as-cm-type") as HTMLElement).textContent = curType;
        const seen = new Set<string>();
        ($("as-cm-grid") as HTMLElement).innerHTML = CAT_EMOJIS.filter(e => !seen.has(e) && seen.add(e)).map(e =>
            `<button class="chip" data-act="pickEmoji" data-e="${e}" style="font-size:17px;padding:5px 0;text-align:center">${e}</button>`).join("");
        ($("as-cm-name") as HTMLInputElement).value = "";
        ($("as-cat") as HTMLElement).style.display = "flex";
    }
    function confirmCat() {
        const name = ($("as-cm-name") as HTMLInputElement).value.trim();
        if (!name) { H.toast("请输入分类名称", "error"); return; }
        if ((S.cats[curType] || []).some(([, n]) => n === name)) { H.toast("该分类已存在", "error"); return; }
        S.cats[curType].push([cmEmoji, name]);
        curCat = name;
        H.save(); renderCats();
        ($("as-cat") as HTMLElement).style.display = "none";
    }

    /* ---------- 资产页 ---------- */
    const warnBadge = (a: Acct) => {
        const used = Math.abs(a.bal), r = used / (a.limit || 1) * 100;
        return r >= S.warn.pct ? '<span class="tag r">额度预警</span>' : r >= 60 ? '<span class="tag a">接近阈值</span>' : '<span class="tag g">正常</span>';
    };
    function monthlySpend(a: Acct): number {
        const m = today().slice(0, 7);
        return S.txs.filter(x => x.a === a.name && x.t === "支出" && x.d.startsWith(m)).reduce((s, x) => s + Math.abs(x.v), 0);
    }
    function inlineEditRow(i: number): string {
        const a = S.accounts[i];
        const opts = groupTypes(a.g);
        const known = opts.includes(a.type);
        const credit = isCredit(a.type);
        return `<tr><td colspan="3" style="background:#fafbfd;padding:10px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${a.name !== a.type ? `<b style="min-width:80px">${esc(a.name)}</b>` : ""}
          <select id="as-ie-type" style="min-width:110px" data-chg="ieCredit">
            ${known ? "" : `<option selected>${esc(a.type)}</option>`}
            ${opts.map(o => `<option${o === a.type ? " selected" : ""}>${o}</option>`).join("")}
          </select>
          <input type="text" id="as-ie-custom" placeholder="自定义类型名" style="width:120px;display:none" data-inp="ieCredit">
          <input type="number" inputmode="decimal" id="as-ie-bal" placeholder="¥" style="width:100px" value="${Math.abs(a.bal)}">
          <span id="as-ie-credit" style="display:${credit ? "flex" : "none"};gap:6px;align-items:center">
            <input type="number" inputmode="decimal" id="as-ie-limit" placeholder="额度 ¥" style="width:90px" value="${a.limit || ""}">
            <input type="number" inputmode="decimal" id="as-ie-cap" placeholder="月上限 ¥" style="width:90px" value="${a.cap || ""}">
          </span>
          <span style="margin-left:auto;display:flex;gap:6px">
            <button class="ibtn" title="保存" data-act="saveIe" data-i="${i}">✅</button>
            <button class="ibtn" title="取消" data-act="cancelIe">✖️</button>
          </span>
        </div></td></tr>`;
    }
    function ieToggleCredit() {
        const tSel = $("as-ie-type") as HTMLSelectElement;
        const t = tSel ? tSel.value : "";
        const custom = t === "自定义";
        const custInp = $("as-ie-custom") as HTMLInputElement;
        if (custInp) custInp.style.display = custom ? "" : "none";
        const credit = isCredit(custom ? (custInp?.value || "") : t);
        const cr = $("as-ie-credit") as HTMLElement;
        if (cr) cr.style.display = credit ? "flex" : "none";
    }
    function saveInlineEdit(i: number) {
        const a = S.accounts[i];
        const tSel = $("as-ie-type") as HTMLSelectElement;
        const custInp = $("as-ie-custom") as HTMLInputElement;
        const typeName = tSel.value === "自定义" ? ((custInp?.value || "").trim() || "自定义") : tSel.value;
        const credit = isCredit(typeName);
        const bal = parseFloat(($("as-ie-bal") as HTMLInputElement).value) || 0;
        const limit = parseFloat(($("as-ie-limit") as HTMLInputElement).value) || 0;
        if (credit && !limit) { H.toast("信贷类账户（" + typeName + "）请填写额度", "error"); return; }
        const autoNamed = a.name === a.type;
        a.type = typeName;
        if (autoNamed) {
            a.name = typeName;
            let base = a.name, n = 2;
            while (S.accounts.some(x => x.name === a.name && S.accounts.indexOf(x) !== i)) { a.name = base + (n++); }
        }
        a.bal = credit ? -Math.abs(bal) : bal;
        if (credit) { a.limit = limit; a.cap = parseFloat(($("as-ie-cap") as HTMLInputElement).value) || 0; }
        else { delete a.limit; delete a.cap; }
        inlineEditIdx = null;
        H.save(); renderAssetsPage(); H.renderDock?.();
    }
    function inlineAddRow(g: string): string {
        if (inlineAddGroup !== g) {
            return `<tr><td colspan="3" style="padding:6px 10px"><button class="ibtn add" style="width:100%;border-style:dashed" data-act="iaOpen" data-g="${g}">＋ 添加</button></td></tr>`;
        }
        const opts = groupTypes(g);
        return `<tr><td colspan="3" style="background:#fafbfd;padding:10px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <select id="as-ia-type" style="min-width:110px" data-chg="iaCredit">${opts.map(o => `<option>${o}</option>`).join("")}</select>
          <input type="text" id="as-ia-custom" placeholder="自定义类型名" style="width:120px;display:none" data-inp="iaCredit">
          <input type="number" inputmode="decimal" id="as-ia-bal" placeholder="¥" style="width:100px">
          <span id="as-ia-credit" style="display:none;gap:6px;align-items:center">
            <input type="number" inputmode="decimal" id="as-ia-limit" placeholder="额度 ¥" style="width:90px">
            <input type="number" inputmode="decimal" id="as-ia-cap" placeholder="月上限 ¥" style="width:90px">
          </span>
          <span style="margin-left:auto;display:flex;gap:6px">
            <button class="ibtn" title="保存" data-act="iaSave" data-g="${g}">✅</button>
            <button class="ibtn" title="取消" data-act="iaCancel">✖️</button>
          </span>
        </div></td></tr>`;
    }
    function iaToggleCredit() {
        const tSel = $("as-ia-type") as HTMLSelectElement;
        const t = tSel ? tSel.value : "";
        const custom = t === "自定义";
        const custInp = $("as-ia-custom") as HTMLInputElement;
        if (custInp) custInp.style.display = custom ? "" : "none";
        const credit = isCredit(custom ? (custInp?.value || "") : t);
        const cr = $("as-ia-credit") as HTMLElement;
        if (cr) cr.style.display = credit ? "flex" : "none";
    }
    function confirmInlineAdd(g: string) {
        const tSel = $("as-ia-type") as HTMLSelectElement;
        const custInp = $("as-ia-custom") as HTMLInputElement;
        const typeName = tSel.value === "自定义" ? ((custInp?.value || "").trim() || "自定义") : tSel.value;
        const credit = isCredit(typeName);
        const bal = parseFloat(($("as-ia-bal") as HTMLInputElement).value) || 0;
        let limit = parseFloat(($("as-ia-limit") as HTMLInputElement).value) || 0;
        if (credit && !limit) { H.toast("信贷类账户（" + typeName + "）请填写额度", "error"); return; }
        let name = typeName, base = name, n = 2;
        while (S.accounts.some(a => a.name === name)) { name = base + (n++); }
        const a: Acct = { name, g, type: typeName, bal: credit ? -Math.abs(bal) : bal };
        if (credit) { a.limit = limit; a.cap = parseFloat(($("as-ia-cap") as HTMLInputElement).value) || 0; }
        S.accounts.push(a);
        inlineAddGroup = null;
        H.save(); renderAssetsPage(); H.renderDock?.();
    }
    function moveAcct(i: number, dir: number) {
        const g = S.accounts[i].g;
        let j = i + dir;
        while (j >= 0 && j < S.accounts.length && S.accounts[j].g !== g) j += dir;
        if (j < 0 || j >= S.accounts.length) return;
        [S.accounts[i], S.accounts[j]] = [S.accounts[j], S.accounts[i]];
        H.save(); renderAssetsPage();
    }
    function renderAssetsPage() {
        const pg = $("as-p-asset")!;
        const asset = S.accounts.filter(a => a.bal > 0).reduce((s, a) => s + a.bal, 0);
        const liab = S.accounts.filter(a => a.bal < 0).reduce((s, a) => s + a.bal, 0);
        const net = asset + liab;
        pg.innerHTML = `
        <h2>资产与负债 <button class="btn ghost" style="float:right;padding:6px 16px" data-act="toggleAssetEdit">${assetEditMode ? "✅ 完成" : "✏️ 编辑"}</button></h2>
        <div class="grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="card"><h3>总资产</h3><div class="kpi">${money(asset)}</div></div>
          <div class="card"><h3>总负债</h3><div class="kpi down">-${money(Math.abs(liab))}</div></div>
          <div class="card"><h3>净资产</h3><div class="kpi">${money(net)}</div></div>
          <div class="card"><h3>负债率</h3><div class="kpi">${asset > 0 ? (Math.abs(liab) / asset * 100).toFixed(1) : "0.0"}%</div></div>
        </div>
        <div id="as-asset-groups">${GROUPS.map(([g, icon]) => {
            const list = S.accounts.filter(a => a.g === g);
            if (!list.length && !assetEditMode) return "";
            const sub = list.reduce((s, a) => s + a.bal, 0);
            return `<div class="card" style="margin-top:14px"><h3>${icon} ${g} <span class="num" style="float:right;color:var(--ink)">${money(sub)}</span></h3>
        <table><tbody>${list.map(a => {
                const i = S.accounts.indexOf(a);
                const subTxt = a.name === a.type ? "" : `<br><small style="color:var(--sub)">${esc(a.type)}</small>`;
                if (assetEditMode && inlineEditIdx === i) return inlineEditRow(i);
                if (a.limit) {
                    const used = Math.abs(a.bal), avail = a.limit - used, r = Math.min(100, used / a.limit * 100);
                    return `<tr><td style="width:130px"><b>${esc(a.name)}</b>${subTxt}</td>
          <td><div style="height:10px;background:#eef2f7;border-radius:6px"><div style="width:${r}%;height:100%;border-radius:6px;background:${r >= 80 ? "#ef4444" : r >= 60 ? "#f59e0b" : "#3b82f6"}"></div></div>
          <small style="color:var(--sub)">已用 ${money(used)} / 额度 ${money(a.limit)} · 可用 ${money(avail)} · 本月已花 ${money(monthlySpend(a))}</small></td>
          <td style="width:200px;text-align:right;white-space:nowrap">${warnBadge(a)}${assetEditMode ? ` <button class="ibtn" title="上移" data-act="moveUp" data-i="${i}">⬆️</button> <button class="ibtn" title="下移" data-act="moveDown" data-i="${i}">⬇️</button> <button class="ibtn" title="编辑" data-act="ieOpen" data-i="${i}">✏️</button> <button class="ibtn" title="删除" data-act="delAcct" data-i="${i}">🗑️</button>` : ""}</td></tr>`;
                }
                const ops = assetEditMode ? `<td style="width:200px;text-align:right;white-space:nowrap"><button class="ibtn" title="上移" data-act="moveUp" data-i="${i}">⬆️</button> <button class="ibtn" title="下移" data-act="moveDown" data-i="${i}">⬇️</button> <button class="ibtn" title="编辑" data-act="ieOpen" data-i="${i}">✏️</button> <button class="ibtn" title="删除" data-act="delAcct" data-i="${i}">🗑️</button></td>` : '<td style="width:10px"></td>';
                return `<tr><td><b>${esc(a.name)}</b>${subTxt}</td><td class="num" style="text-align:right;${a.bal < 0 ? "color:var(--red)" : ""}">${a.bal.toLocaleString()}</td>${ops}</tr>`;
            }).join("")}${assetEditMode ? inlineAddRow(g) : ""}</tbody></table></div>`;
        }).join("")}</div>${S.accounts.length ? "" : `
        <div class="card" style="margin-top:14px;text-align:center;padding:28px">
          <div style="font-size:30px;margin-bottom:8px">🏦</div>
          <div style="font-weight:700;margin-bottom:6px">还没有任何资产或负债</div>
          <div style="color:var(--sub);font-size:13px;line-height:1.8">点击右上角 <b>✏️ 编辑</b>，在对应分组下「＋ 添加」你的银行卡、支付宝、花呗等账户<br>添加后即可记账、看净资产趋势和消费报表</div>
        </div>`}`;
    }

    /* ---------- 规划页 ---------- */
    function renderPlanPage() {
        const pg = $("as-p-plan")!;
        const subM = S.subs.filter(s => s.on).reduce((s, x) => s + subMonthly(x.v, x.cyc), 0);
        const polM = S.policies.filter(p => p.on).reduce((s, x) => s + subMonthly(x.v, x.cyc), 0);
        const loanM = S.loans.filter(l => l.on).reduce((s, l) => s + loanCalc(l).M, 0);
        pg.innerHTML = `
        <h2>规划 <span class="tag a">订阅 · 保单 · 贷款 · 储蓄</span></h2>
        <div class="card"><h3>📺 订阅 &amp; 固定支出 <span class="num" style="float:right;color:var(--ink)">启用中 月均 ${money(subM)}</span></h3>
          <div class="form-row">
            <select id="as-sub-cat" style="width:100px"><option>订阅</option><option>房租</option><option>水电燃气</option><option>物业</option><option>其他固定</option></select>
            <input type="text" id="as-sub-name" placeholder="名称，如：iCloud / 房租" style="width:150px">
            <input type="number" inputmode="decimal" id="as-sub-amt" placeholder="金额 ¥" style="width:95px">
            <select id="as-sub-cyc" style="width:90px"><option>每月</option><option>每年</option><option>每周</option></select>
            <input type="date" id="as-sub-next" style="width:145px">
            <button class="btn" data-act="addSub">＋ 添加</button>
          </div>
          <table style="margin-top:10px"><thead><tr><th>名称</th><th>类别</th><th>金额</th><th>周期</th><th>折合月付</th><th>下次扣费</th><th>状态</th><th style="text-align:right">操作</th></tr></thead><tbody>${S.subs.map((s, i) => {
            const dl = daysLeft(s.next);
            const dlTxt = !s.on ? '<span class="tag" style="background:#f1f5f9;color:#94a3b8">已停用</span>' : dl < 0 ? '<span class="tag r">已过期</span>' : dl <= 3 ? `<span class="tag r">${dl} 天后扣费</span>` : `<span style="color:var(--sub)">${dl} 天后</span>`;
            const cycTag = s.cyc === "每年" ? '<span class="tag b">年付</span>' : s.cyc === "每周" ? '<span class="tag b">周付</span>' : '<span class="tag" style="background:#eef2f7;color:#64748b">月付</span>';
            const catTag = (s.cat || "订阅") === "订阅" ? '<span class="tag a">订阅</span>' : `<span class="tag g">${esc(s.cat)}</span>`;
            return `<tr style="${s.on ? "" : "opacity:.55"}">
            <td><b>${esc(s.n)}</b></td><td>${catTag}</td><td class="num">¥${s.v.toLocaleString()}</td><td>${cycTag}</td>
            <td class="num" style="color:${s.cyc === "每月" ? "var(--sub)" : "#2563eb"};font-weight:${s.cyc === "每月" ? "400" : "700"}">¥${Math.round(subMonthly(s.v, s.cyc)).toLocaleString()}${s.cyc !== "每月" ? "/月" : ""}</td>
            <td>${s.next} ${dlTxt}</td>
            <td><label class="switch"><input type="checkbox" data-chg="subOn" data-i="${i}" ${s.on ? "checked" : ""}><span></span></label></td>
            <td style="text-align:right;white-space:nowrap"><button class="ibtn" title="删除" data-act="delSub" data-i="${i}">🗑️</button></td></tr>`;
        }).join("")}${S.subs.length ? "" : '<tr><td colspan="8" class="empty">📭 暂无订阅或固定支出，用上方表单添加第一笔（如房租、视频会员）</td></tr>'}</tbody></table></div>
        <div class="card" style="margin-top:14px"><h3>🛡️ 保险保单 <span class="num" style="float:right;color:var(--ink)">缴费中 月均 ${money(polM)}</span></h3>
          <div class="form-row">
            <input type="text" id="as-pol-name" placeholder="险种名称，如：百万医疗险" style="width:170px">
            <input type="number" inputmode="decimal" id="as-pol-amt" placeholder="保费 ¥" style="width:95px">
            <select id="as-pol-cyc" style="width:90px"><option>每月</option><option>每年</option></select>
            <input type="text" id="as-pol-years" placeholder="缴费方式，如：20 年缴" style="width:130px">
            <input type="date" id="as-pol-next" style="width:145px">
            <button class="btn" data-act="addPol">＋ 添加保单</button>
          </div>
          <table style="margin-top:10px"><thead><tr><th>保单</th><th>保费</th><th>周期</th><th>折合月付</th><th>缴费方式</th><th>下次缴费</th><th>状态</th><th style="text-align:right">操作</th></tr></thead><tbody>${S.policies.map((p, i) => {
            const dl = daysLeft(p.next);
            const dlTxt = !p.on ? '<span class="tag" style="background:#f1f5f9;color:#94a3b8">已停缴</span>' : dl < 0 ? '<span class="tag r">已逾期</span>' : dl <= 15 ? `<span class="tag r">${dl} 天后缴费</span>` : `<span style="color:var(--sub)">${dl} 天后</span>`;
            const cycTag = p.cyc === "每年" ? '<span class="tag b">年缴</span>' : '<span class="tag" style="background:#eef2f7;color:#64748b">月缴</span>';
            return `<tr style="${p.on ? "" : "opacity:.55"}">
            <td><b>${esc(p.n)}</b></td><td class="num">¥${p.v.toLocaleString()}</td><td>${cycTag}</td>
            <td class="num" style="color:${p.cyc === "每月" ? "var(--sub)" : "#2563eb"}">¥${Math.round(subMonthly(p.v, p.cyc)).toLocaleString()}${p.cyc !== "每月" ? "/月" : ""}</td>
            <td style="color:var(--sub)">${esc(p.years)}</td><td>${p.next} ${dlTxt}</td>
            <td><label class="switch"><input type="checkbox" data-chg="polOn" data-i="${i}" ${p.on ? "checked" : ""}><span></span></label></td>
            <td style="text-align:right;white-space:nowrap"><button class="ibtn" title="删除" data-act="delPol" data-i="${i}">🗑️</button></td></tr>`;
        }).join("")}${S.policies.length ? "" : '<tr><td colspan="8" class="empty">📭 暂无保单，添加后可追踪缴费周期与月均负担</td></tr>'}</tbody></table></div>
        <div class="card" style="margin-top:14px"><h3>🏦 贷款还款规划 <span class="num" style="float:right;color:var(--ink)">下期月供合计 ${money(loanM)}</span></h3>
          <div class="form-row">
            <select id="as-ln-cat" style="width:90px"><option>房贷</option><option>车贷</option><option>其他贷款</option></select>
            <input type="text" id="as-ln-name" placeholder="名称（可留空）" style="width:110px">
            <input type="number" inputmode="decimal" id="as-ln-total" placeholder="贷款总额 ¥" style="width:105px">
            <input type="number" inputmode="decimal" id="as-ln-rate" placeholder="年利率 %" step="0.01" style="width:80px">
            <select id="as-ln-method" style="width:110px"><option>等额本息</option><option>等额本金</option></select>
            <input type="number" inputmode="decimal" id="as-ln-months" placeholder="总期数(月)" style="width:90px">
            <input type="number" inputmode="decimal" id="as-ln-paid" placeholder="已还期数" style="width:85px">
            <button class="btn" data-act="addLoan">＋ 添加贷款</button>
          </div>
          <div style="margin-top:10px">${S.loans.map((l, i) => {
            const c = loanCalc(l);
            const r = Math.min(100, l.paid / l.months * 100);
            const col = r >= 100 ? "#22c55e" : r >= 60 ? "#3b82f6" : "#f59e0b";
            const name = l.n ? l.cat + " · " + l.n : l.cat;
            const mTxt = l.method === "等额本金"
                ? `下期月供 <b style="color:var(--ink)">${money(c.M)}</b>，此后每月递减 ${money(c.dec)}（等额本金）`
                : `月供 <b style="color:var(--ink)">${money(c.M)}</b>（等额本息）`;
            if (lnEditIdx === i) {
                const fld = (label: string, inner: string) => `<label style="display:flex;flex-direction:column;gap:3px"><small style="color:var(--sub);font-size:11.5px">${label}</small>${inner}</label>`;
                return `<div style="background:#fafbfd;border-radius:10px;padding:12px;margin:10px 0">
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
              ${fld("类型", '<select id="as-le-cat" style="width:95px">' + ["房贷", "车贷", "其他贷款"].map(cc => `<option${cc === l.cat ? " selected" : ""}>${cc}</option>`).join("") + "</select>")}
              ${fld("名称", `<input type="text" id="as-le-name" value="${esc(l.n || "")}" placeholder="可留空" style="width:100px">`)}
              ${fld("贷款总额 ¥", `<input type="number" inputmode="decimal" id="as-le-total" style="width:105px" value="${l.total}">`)}
              ${fld("年利率 %", `<input type="number" inputmode="decimal" id="as-le-rate" step="0.01" style="width:75px" value="${l.rate}">`)}
              ${fld("还款方式", '<select id="as-le-method" style="width:105px">' + ["等额本息", "等额本金"].map(m => `<option${m === l.method ? " selected" : ""}>${m}</option>`).join("") + "</select>")}
              ${fld("总期数(月)", `<input type="number" inputmode="decimal" id="as-le-months" style="width:85px" value="${l.months}">`)}
              ${fld("已还期数", `<input type="number" inputmode="decimal" id="as-le-paid" style="width:80px" value="${l.paid}">`)}
              <span style="margin-left:auto;display:flex;gap:6px;padding-bottom:2px">
                <button class="ibtn" title="保存" data-act="saveLn" data-i="${i}">✅</button>
                <button class="ibtn" title="取消" data-act="cancelLn">✖️</button>
              </span>
            </div></div>`;
            }
            return `<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #eef2f7">
            <div style="flex:1">
              <b>${esc(name)}</b> <span class="tag" style="background:#eef2f7;color:#64748b">年化 ${l.rate}%</span> <span class="tag a">${l.method}</span> ${l.on ? "" : '<span class="tag" style="background:#f1f5f9;color:#94a3b8">已结清/停用</span>'}
              <div style="height:10px;background:#eef2f7;border-radius:6px;margin:6px 0 4px"><div style="width:${r}%;height:100%;border-radius:6px;background:${col}"></div></div>
              <small style="color:var(--sub)">${mTxt} · 已还 ${l.paid}/${l.months} 期（${r.toFixed(0)}%）· 剩余本金 <b style="color:var(--ink)">${money(c.remainPrin)}</b> · 预计还要还利息 <b class="down">${money(c.remainInt)}</b></small>
            </div>
            <span style="display:flex;gap:6px">
              <label class="switch" title="启用"><input type="checkbox" data-chg="loanOn" data-i="${i}" ${l.on ? "checked" : ""}><span></span></label>
              <button class="ibtn" title="编辑" data-act="editLn" data-i="${i}">✏️</button>
              <button class="ibtn" title="删除" data-act="delLoan" data-i="${i}">🗑️</button>
            </span>
          </div>`;
        }).join("")}${S.loans.length ? "" : '<div class="empty" style="padding:16px 0">📭 暂无贷款规划，添加后自动计算月供与剩余利息</div>'}</div></div>
        <div class="card" style="margin-top:14px"><h3>💰 储蓄计划</h3>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <label style="display:flex;flex-direction:column;gap:3px"><small style="color:var(--sub);font-size:11.5px">计划名称</small><input type="text" id="as-sv-name" placeholder="如：旅行基金" style="width:130px"></label>
            <label style="display:flex;flex-direction:column;gap:3px"><small style="color:var(--sub);font-size:11.5px">目标 ¥</small><input type="number" inputmode="decimal" id="as-sv-target" style="width:90px"></label>
            <label style="display:flex;flex-direction:column;gap:3px"><small style="color:var(--sub);font-size:11.5px">每月存 ¥</small><input type="number" inputmode="decimal" id="as-sv-monthly" style="width:90px"></label>
            <label style="display:flex;flex-direction:column;gap:3px"><small style="color:var(--sub);font-size:11.5px">存入账户</small><select id="as-sv-acct" style="width:125px">${S.accounts.length ? S.accounts.map(a => `<option>${esc(a.name)}</option>`).join("") : '<option value="">（暂无账户）</option>'}</select></label>
            <label style="display:flex;flex-direction:column;gap:3px"><small style="color:var(--sub);font-size:11.5px">年化利率 %</small><input type="number" inputmode="decimal" id="as-sv-rate" step="0.01" style="width:80px" placeholder="0"></label>
            <label style="display:flex;flex-direction:column;gap:3px"><small style="color:var(--sub);font-size:11.5px">达成期限</small><input type="date" id="as-sv-deadline" style="width:145px"></label>
            <button class="btn" data-act="addSaving">＋ 添加计划</button>
          </div>
          <div style="margin-top:10px">${(() => {
            const total = S.savings.reduce((s, x) => s + x.saved, 0);
            return `<div style="margin-bottom:8px;color:var(--sub);font-size:13px">共 ${S.savings.length} 个计划 · 已存 <b class="up">${money(total)}</b> · 每月自动转入 <b>${money(S.savings.reduce((s, x) => s + (x.monthly || 0), 0))}</b></div>` +
                (S.savings.length ? "" : '<div class="empty" style="padding:10px 0 14px">📭 暂无储蓄计划，设一个小目标开始攒钱吧</div>') +
                S.savings.map((s, i) => {
                    const r = Math.min(100, s.saved / s.target * 100);
                    const col = r >= 100 ? "#22c55e" : r >= 60 ? "#3b82f6" : "#f59e0b";
                    const remain = s.target - s.saved;
                    const eta = s.monthly > 0 ? Math.ceil(remain / s.monthly) : null;
                    const etaTxt = r >= 100 ? "✅ 已达成" : eta != null ? `按每月 ${money(s.monthly)}，约 <b>${eta}</b> 个月达成` : "未设置每月存入";
                    const late = s.deadline && s.deadline !== "—" && eta != null && r < 100 && new Date().setMonth(new Date().getMonth() + eta) > new Date(s.deadline).getTime();
                    const it = estInterest(s);
                    const itTxt = (s.rate > 0 && it > 0) ? ` · 预计利息 <b class="up">+¥${Math.round(it).toLocaleString()}</b>（年化 ${s.rate}%）` : (s.rate > 0 ? ` · 年化 ${s.rate}%` : " · 无利息");
                    if (svEditIdx === i) {
                        const fld = (label: string, inner: string) => `<label style="display:flex;flex-direction:column;gap:3px"><small style="color:var(--sub);font-size:11.5px">${label}</small>${inner}</label>`;
                        return `<div style="background:#fafbfd;border-radius:10px;padding:12px;margin:10px 0">
              <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
                ${fld("计划名称", `<input type="text" id="as-se-name" value="${esc(s.n)}" style="width:140px">`)}
                ${fld("目标 ¥", `<input type="number" inputmode="decimal" id="as-se-target" style="width:95px" value="${s.target}">`)}
                ${fld("已存 ¥", `<input type="number" inputmode="decimal" id="as-se-saved" style="width:95px" value="${s.saved}">`)}
                ${fld("每月存 ¥", `<input type="number" inputmode="decimal" id="as-se-monthly" style="width:95px" value="${s.monthly || ""}">`)}
                ${fld("存入账户", '<select id="as-se-acct" style="width:125px">' + S.accounts.map(a => `<option${a.name === (s.acct || "") ? " selected" : ""}>${esc(a.name)}</option>`).join("") + (s.acct && !S.accounts.some(a => a.name === s.acct) ? `<option selected>${esc(s.acct)}</option>` : "") + "</select>")}
                ${fld("年化利率 %", `<input type="number" inputmode="decimal" id="as-se-rate" step="0.01" style="width:80px" value="${s.rate || ""}">`)}
                ${fld("达成期限", `<input type="date" id="as-se-deadline" value="${s.deadline === "—" ? "" : s.deadline}" style="width:145px">`)}
                <span style="margin-left:auto;display:flex;gap:6px;padding-bottom:2px">
                  <button class="ibtn" title="保存" data-act="saveSv" data-i="${i}">✅</button>
                  <button class="ibtn" title="取消" data-act="cancelSv">✖️</button>
                </span>
              </div></div>`;
                    }
                    return `<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #eef2f7">
              <div style="flex:1">
                <b>${esc(s.n)}</b>${late ? ' <span class="tag r">按期完不成</span>' : ""} <span class="tag b" title="存入账户">🏦 ${esc(s.acct || "未指定")}</span> <small style="color:var(--sub)">期限 ${esc(s.deadline)}</small>
                <div style="height:10px;background:#eef2f7;border-radius:6px;margin:6px 0 4px"><div style="width:${r}%;height:100%;border-radius:6px;background:${col}"></div></div>
                <small style="color:var(--sub)">${money(s.saved)} / ${money(s.target)}（${r.toFixed(0)}%）· ${etaTxt}${itTxt}</small>
              </div>
              <span style="display:flex;gap:6px">
                <button class="ibtn" title="编辑" data-act="editSv" data-i="${i}">✏️</button>
                <button class="ibtn" title="存入一笔" data-act="depSv" data-i="${i}">＋</button>
                <button class="ibtn" title="删除" data-act="delSv" data-i="${i}">🗑️</button>
              </span>
            </div>`;
                }).join("");
        })()}</div></div>`;

        const dateInp = $("as-sub-next") as HTMLInputElement;
        if (dateInp && !dateInp.value) dateInp.value = today(30);
    }

    /* ---------- 总览 ---------- */
    function periodStats(f: string, t: string) {
        const list = S.txs.filter(x => x.d >= f && x.d <= t);
        const inc = list.filter(x => x.t === "收入").reduce((s, x) => s + x.v, 0);
        const exp = list.filter(x => x.t === "支出").reduce((s, x) => s - x.v, 0);
        const days = Math.max(1, Math.round((new Date(t).getTime() - new Date(f).getTime()) / 86400000) + 1);
        return { inc, exp, net: inc - exp, rate: inc > 0 ? (inc - exp) / inc * 100 : null, daily: exp / days };
    }
    function mondayOf(offsetWeeks = 0) {
        const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - offsetWeeks * 7);
        return d;
    }
    function cmpArrow(cur: number, prev: number, lowerBetter?: boolean) {
        if (!prev) return "";
        const diff = cur - prev, pct = Math.abs(diff / prev * 100);
        if (!isFinite(pct)) return "";
        const good = lowerBetter ? diff < 0 : diff > 0;
        if (Math.abs(diff) < 0.005 * Math.abs(prev || 1)) return `<small style="color:var(--sub)">持平</small>`;
        return `<small class="${good ? "up" : "down"}">${diff > 0 ? "↑" : "↓"}${pct.toFixed(0)}%</small>`;
    }
    function warnings(): string[] {
        return S.accounts.filter((a): a is Acct & { limit: number } => !!a.limit).map(a => {
            const used = Math.abs(a.bal), r1 = used / a.limit * 100, ms = monthlySpend(a), r2 = a.cap ? ms / a.cap * 100 : 0;
            if (r1 >= S.warn.pct) return `⚠️ <b>${esc(a.name)}</b> 已用额度 ${r1.toFixed(0)}%（${money(used)} / ${money(a.limit)}）`;
            if (a.cap && r2 >= S.warn.pct) return `⚠️ <b>${esc(a.name)}</b> 本月已花 ${money(ms)}，达支出上限 ${money(a.cap)} 的 ${r2.toFixed(0)}%`;
            return null;
        }).filter(Boolean) as string[];
    }
    function netWorth(): number {
        return S.accounts.reduce((s, a) => s + a.bal, 0);
    }
    function recordSnap() {
        const d = today();
        const last = S.snaps[S.snaps.length - 1];
        if (!last || last.d !== d) S.snaps.push({ d, v: netWorth() });
        else last.v = netWorth();
        if (S.snaps.length > 366) S.snaps = S.snaps.slice(-366);
    }
    function renderDash() {
        const pg = $("as-p-dash")!;
        const asset = S.accounts.filter(a => a.bal > 0).reduce((s, a) => s + a.bal, 0);
        const liab = S.accounts.filter(a => a.bal < 0).reduce((s, a) => s + a.bal, 0);
        const net = asset + liab;
        const now = new Date();
        const mon = mondayOf();
        const wkF = dstrOf(mon), wkT = today();
        const pwF = dstrOf(mondayOf(1)), pwT = dstrOf(new Date(mon.getTime() - 86400000));
        const mF = dstrOf(new Date(now.getFullYear(), now.getMonth(), 1));
        const pmF = dstrOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const pmT = dstrOf(new Date(now.getFullYear(), now.getMonth(), 0));
        const yF = now.getFullYear() + "-01-01";
        const wks = periodStats(wkF, wkT), wksP = periodStats(pwF, pwT);
        const mo = periodStats(mF, wkT), moP = periodStats(pmF, pmT);
        const yr = periodStats(yF, wkT);
        const rateTxt = (r: number | null) => r == null ? '<span style="color:var(--sub)">—</span>' : r.toFixed(0) + "%";
        const rows = [
            { name: "收入", raw: (s: any) => s.inc, fmt: (v: number) => money(v), cls: "up" },
            { name: "支出", raw: (s: any) => s.exp, fmt: (v: number) => money(v), cls: "down", lower: true },
            { name: "结余", raw: (s: any) => s.net, fmt: (v: number) => `<b class="${v >= 0 ? "up" : "down"}">${money(v)}</b>` },
            { name: "储蓄率", raw: (s: any) => s.rate, fmt: (v: any) => rateTxt(v) },
            { name: "日均支出", raw: (s: any) => s.daily, fmt: (v: number) => money(v), lower: true },
        ];
        const statsHtml = rows.map(r => {
            const cell = (cur: any, prev: any) => {
                const v = r.raw(cur);
                const cmp = (prev && isFinite(v) && isFinite(r.raw(prev))) ? " " + cmpArrow(v, r.raw(prev), r.lower) : "";
                return `<td class="num ${r.cls || ""}">${r.fmt(v)}${cmp}</td>`;
            };
            return `<tr><td style="color:var(--sub)">${r.name}</td>${cell(wks, wksP)}${cell(mo, moP)}<td class="num ${r.cls || ""}">${r.fmt(r.raw(yr))}</td></tr>`;
        }).join("");
        const r = Math.min(100, mo.exp / BUDGET * 100);
        const subM = S.subs.filter(s => s.on).reduce((s, x) => s + subMonthly(x.v, x.cyc), 0);
        const polM = S.policies.filter(p => p.on).reduce((s, x) => s + subMonthly(x.v, x.cyc), 0);
        const loanM = S.loans.filter(l => l.on).reduce((s, l) => s + loanCalc(l).M, 0);
        const w = warnings();
        const dueSubs = S.subs.filter(s => s.on && daysLeft(s.next) >= 0 && daysLeft(s.next) <= 7);
        pg.innerHTML = `
        <h2>总览</h2>
        <div class="grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="card"><h3>净资产</h3><div class="kpi">${money(net)}</div></div>
          <div class="card"><h3>总资产 / 总负债</h3><div class="kpi" style="font-size:17px"><span>${money(asset)}</span><span class="down" style="font-size:15px">　负债 -${money(Math.abs(liab))}</span></div></div>
          <div class="card"><h3>本月支出 / 预算 ${money(BUDGET)}</h3><div class="kpi">${money(mo.exp)}<small>${mo.exp > BUDGET ? `<span class="down">超支 ${money(mo.exp - BUDGET)}</span>` : "剩余 " + money(BUDGET - mo.exp)}</small></div>
            <div style="height:8px;background:#eef2f7;border-radius:6px;margin-top:8px"><div style="width:${r}%;height:100%;border-radius:6px;background:${r >= 100 ? "#ef4444" : "linear-gradient(90deg,#3b82f6,#60a5fa)"}"></div></div></div>
          <div class="card"><h3>每月固定负担</h3><div class="kpi" style="font-size:22px">${money(subM + polM + loanM)}</div><small style="color:var(--sub)">📺 ${Math.round(subM).toLocaleString()} · 🛡️ ${Math.round(polM).toLocaleString()} · 🏦 ${Math.round(loanM).toLocaleString()}（不含储蓄）</small></div>
        </div>
        <div class="grid" style="grid-template-columns:2fr 1fr;margin-top:14px">
          <div class="card"><h3>净资产趋势（每日快照 · 打开思源自动记录）</h3><canvas id="as-c-net" height="150"></canvas></div>
          <div class="card"><h3>资产构成</h3><canvas id="as-c-pie" height="200"></canvas></div>
        </div>
        <div class="card" style="margin-top:14px"><h3>收支概况 <span class="tag b" style="margin-left:6px">本周 / 本月 / 今年 · 来自真实流水</span></h3>
          <table style="margin-top:6px"><thead><tr><th style="width:110px">指标</th><th>本周</th><th>本月</th><th>今年</th></tr></thead><tbody>${statsHtml}</tbody></table>
        </div>
        <div class="card" style="margin-top:14px"><h3>今日待办（来自真实数据）</h3><div>${w.map(x => `<div style="margin:4px 0">${x}</div>`).join("")}${dueSubs.map(s => `<div style="margin:4px 0"><span class="dot-lg" style="background:#f59e0b"></span>${daysLeft(s.next) === 0 ? "今天" : daysLeft(s.next) + " 天后"}：${esc(s.n)} 扣费 ${money(s.v)}（${esc(s.cyc)}）</div>`).join("")}${(!w.length && !dueSubs.length) ? '<div class="empty">暂无待办与预警</div>' : ""}</div></div>`;
        // 图表（真实数据）
        try {
            const netCv = $("as-c-net") as HTMLCanvasElement, pieCv = $("as-c-pie") as HTMLCanvasElement;
            if (S.snaps.length >= 2) {
                const pts = S.snaps.slice(-30);
                drawLine(netCv, pts.map(p => p.d.slice(5).replace("-", "/")), pts.map(p => p.v), pts.map(p => p.d));
            } else {
                const ctx = netCv.getContext("2d")!;
                ctx.fillStyle = INK; ctx.textAlign = "center";
                ctx.fillText("快照收集中：每天打开思源自动记录一个点", netCv.clientWidth / 2 || 150, 60);
            }
            const groups = GROUPS.map(([g]) => ({ g, v: S.accounts.filter(a => a.g === g && a.bal > 0).reduce((s, a) => s + a.bal, 0) })).filter(x => x.v > 0);
            if (groups.length) { drawDoughnut(pieCv, groups.map(x => x.g), groups.map(x => x.v), ["#3b82f6", "#f59e0b", "#22c55e", "#8b5cf6", "#94a3b8"]); }
            else {
                const ctx = pieCv.getContext("2d")!;
                ctx.fillStyle = INK; ctx.textAlign = "center";
                ctx.fillText("暂无资产，到「资产」页添加账户后展示构成", (pieCv.clientWidth || 300) / 2, 80);
            }
            bindChartHover(netCv); bindChartHover(pieCv);
        } catch (e) { console.error("[资产管家] 总览图表", e); }
    }
    const dstrOf = (d: Date) => { const p = (n: number) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
    const INK = "#7a8595";

    /* ---------- 报表 ---------- */
    function renderReportPage() {
        const pg = $("as-p-report")!;
        const now = new Date();
        const ym = today().slice(0, 7);
        const months: string[] = [];
        for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")); }
        const sumMonth = (m: string, t: string) => S.txs.filter(x => x.d.startsWith(m) && x.t === t).reduce((s, x) => s + Math.abs(x.v), 0);
        const byCat: Record<string, number> = {};
        S.txs.filter(x => x.d.startsWith(ym) && x.t === "支出").forEach(x => { byCat[x.c] = (byCat[x.c] || 0) + Math.abs(x.v); });
        const catItems = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v], i) => ({ label: c, value: v, color: CAT_COLORS_ARR[i % CAT_COLORS_ARR.length] }));
        const expThis = catItems.reduce((s, x) => s + x.value, 0);
        const expPrev = sumMonth(months[4], "支出");
        const incThis = sumMonth(ym, "收入");
        const incPrev = sumMonth(months[4], "收入");
        const mom = expPrev > 0 ? (expThis - expPrev) / expPrev * 100 : null;
        const day = now.getDate();
        const dailyAvg = expThis / day;
        // 诊断
        const warns: { lv: string; txt: string; tip: string }[] = [];
        catItems.forEach(it => {
            const pv = S.txs.filter(x => x.d.startsWith(months[4]) && x.t === "支出" && x.c === it.label).reduce((s, x) => s + Math.abs(x.v), 0);
            if (pv > 50 && it.value >= pv * 1.2 && it.value >= 100) {
                warns.push({ lv: "high", txt: `<b>${esc(it.label)}</b> 本月 ${money(it.value)}，环比上月 <b class="down">+${((it.value - pv) / pv * 100).toFixed(0)}%</b>（上月 ${money(pv)}）`, tip: CAT_TIPS[it.label] || "建议检查该类消费频次，并设置月度上限" });
            }
        });
        catItems.forEach(it => {
            if (expThis > 0 && it.value / expThis >= 0.35 && it.value >= 200) {
                warns.push({ lv: "mid", txt: `<b>${esc(it.label)}</b> 占本月支出 <b>${(it.value / expThis * 100).toFixed(0)}%</b>（${money(it.value)}），是最大开销来源`, tip: "单类占比超过 35% 说明消费结构偏科，建议分散或压缩" });
            }
        });
        const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const budgetDaily = BUDGET / dim;
        if (dailyAvg > budgetDaily && expThis > 0) {
            warns.push({ lv: "high", txt: `日均支出 <b>${money(dailyAvg)}</b>，超过预算日均 ${money(budgetDaily)}（月预算 ${money(BUDGET)} 均摊）`, tip: `按当前节奏，月底预计支出 ${money(dailyAvg * dim)}，将超支约 ${money(dailyAvg * dim - BUDGET)}` });
        }
        const top3 = catItems.slice(0, 3);
        const rateT = incThis > 0 ? (incThis - expThis) / incThis * 100 : null;
        const rateP = incPrev > 0 ? (incPrev - expPrev) / incPrev * 100 : null;
        const lines: string[] = [];
        if (top3.length) lines.push(`本月支出前三：<b>${esc(top3.map(x => x.label).join("、"))}</b>，合计占 <b>${(top3.reduce((s, x) => s + x.value, 0) / Math.max(expThis, 1) * 100).toFixed(0)}%</b>。`);
        if (mom != null) lines.push(`支出环比上月${mom > 0 ? '<b class="down">增加</b>' : '<b class="up">减少</b>'} ${Math.abs(mom).toFixed(0)}%，${mom > 0 ? "节奏偏快，注意大额非必需消费" : "控制得不错，继续保持"}。`);
        if (rateT != null) lines.push(`本月储蓄率 <b>${rateT.toFixed(0)}%</b>${rateP != null ? `（上月 ${rateP.toFixed(0)}%）` : ""}，${rateP != null && rateT < rateP ? "较上月下滑，留意非必要支出" : "趋势健康"}。`);
        pg.innerHTML = `
        <h2>报表 <span class="tag b">全部基于真实流水实时计算</span></h2>
        <div class="grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="card"><h3>本月支出</h3><div class="kpi">${money(expThis)}</div></div>
          <div class="card"><h3>日均支出（本月）</h3><div class="kpi">${money(dailyAvg)}</div></div>
          <div class="card"><h3>最大开销分类</h3><div class="kpi" style="font-size:20px">${catItems.length ? `${esc(catItems[0].label)}<small>${(catItems[0].value / Math.max(expThis, 1) * 100).toFixed(0)}% · ${money(catItems[0].value)}</small>` : "—"}</div></div>
          <div class="card"><h3>支出环比上月</h3><div class="kpi" style="font-size:20px">${mom == null ? "—" : `<span class="${mom > 0 ? "down" : "up"}">${mom > 0 ? "↑" : "↓"} ${Math.abs(mom).toFixed(0)}%</span><small>上月 ${money(expPrev)}</small>`}</div></div>
        </div>
        <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:14px">
          <div class="card"><h3>近 6 个月收支</h3><canvas id="as-c-bar" height="170"></canvas></div>
          <div class="card"><h3>本月支出分类占比</h3><canvas id="as-c-cat" height="200"></canvas></div>
        </div>
        <div class="card" style="margin-top:14px"><h3>近 30 天消费趋势（每日支出）</h3><canvas id="as-c-trend" height="150"></canvas></div>
        <div class="card" style="margin-top:14px"><h3>⚠️ 消费诊断 · 哪些需要控制</h3><div style="line-height:1.9">${warns.length ? warns.map(w2 => `<div style="padding:8px 0;border-bottom:1px solid #eef2f7"><span class="tag ${w2.lv === "high" ? "r" : "a"}">${w2.lv === "high" ? "需控制" : "关注"}</span> ${w2.txt}<br><small style="color:var(--sub)">💡 ${w2.tip}</small></div>`).join("") : '<div style="padding:8px 0"><span class="tag g">健康</span> 本月各项消费均在合理范围内，继续保持。</div>'}</div></div>
        <div class="card" style="margin-top:14px"><h3>AI 财务点评（规则生成 · 后续接 DeepSeek）</h3><div style="line-height:2;color:#374151;font-size:13.5px">${lines.length ? lines.map(l => '<p style="margin:4px 0">· ' + l + "</p>").join("") : '<p style="margin:4px 0;color:var(--sub)">📭 记账数据积累后，这里会生成支出结构、储蓄率等点评。</p>'}</div></div>`;
        // 图表
        try {
            const labels = months.map(m => (+m.slice(5, 7)) + "月");
            drawBars($("as-c-bar") as HTMLCanvasElement, labels, [
                { label: "收入", data: months.map(m => sumMonth(m, "收入")), color: "#22c55e" },
                { label: "支出", data: months.map(m => sumMonth(m, "支出")), color: "#ef4444" },
            ]);
            bindChartHover($("as-c-bar") as HTMLCanvasElement);
            const catCv = $("as-c-cat") as HTMLCanvasElement;
            if (catItems.length) {
                drawDoughnut(catCv, catItems.map(x => x.label), catItems.map(x => x.value), catItems.map(x => x.color));
            } else {
                const ctx = catCv.getContext("2d")!;
                ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.fillText("本月暂无支出记录", (catCv.clientWidth || 300) / 2, 100);
            }
            bindChartHover(catCv);
            const days: Date[] = [];
            for (let i = 29; i >= 0; i--) days.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
            const dstrs = days.map(dstrOf);
            const daily = dstrs.map(f => S.txs.filter(x => x.d === f && x.t === "支出").reduce((s, x) => s + Math.abs(x.v), 0));
            const sparse = dstrs.map((f, i) => (i % 5 === 0 || i === dstrs.length - 1) ? (+f.slice(5, 7)) + "/" + (+f.slice(8, 10)) : "");
            const tipL = dstrs.map(f => (+f.slice(5, 7)) + "月" + (+f.slice(8, 10)) + "日");
            drawLine($("as-c-trend") as HTMLCanvasElement, sparse, daily, tipL);
            bindChartHover($("as-c-trend") as HTMLCanvasElement);
        } catch (e) { console.error("[资产管家] 报表图表", e); }
    }
    const CAT_COLORS_ARR = ["#3b82f6", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b", "#14b8a6", "#a855f7"];

    /* ---------- 记账页整体 ---------- */
    function renderTxPage() {
        const pg = $("as-p-tx")!;
        pg.innerHTML = `
        <h2>快速记账 <span class="tag b">One Touch 式模板</span></h2>
        <div class="card">
          <div class="form-row" id="as-quick-tpl">
            <button class="chip on" data-act="tpl" data-a="支出">🍜 支出</button>
            <button class="chip" data-act="tpl" data-a="收入">💰 收入</button>
          </div>
          <div class="form-row" id="as-cat-chips"></div>
          <div class="form-row">
            <select id="as-acct" style="min-width:120px"></select>
            <input type="number" inputmode="decimal" id="as-amt" placeholder="支出金额 ¥" step="0.01" style="width:110px">
            <input type="date" id="as-date" value="${today()}">
            <input type="text" id="as-note" placeholder="备注 / #标签" style="flex:1;min-width:140px">
            <button class="btn" id="as-tx-add" data-act="txAdd">记一笔</button>
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <h3>近期流水</h3>
          <div class="form-row">
            <select id="as-f-month"><option value="">全部月份</option></select>
            <select id="as-f-type"><option value="">全部类型</option><option>支出</option><option>收入</option></select>
            <input type="text" id="as-f-kw" placeholder="搜索分类 / 备注 / 账户" style="flex:1;min-width:140px">
            <button class="btn ghost" data-act="csv">导出 CSV</button>
            <button class="btn ghost" data-act="clearTx">清空</button>
          </div>
          <div class="form-row" id="as-tx-sum" style="font-size:13px;color:var(--sub)"></div>
          <table id="as-tx-table"><thead><tr><th>日期</th><th>类型</th><th>分类</th><th>账户</th><th>备注</th><th style="text-align:right">金额</th><th style="text-align:right">操作</th></tr></thead><tbody></tbody></table>
        </div>`;
        setTpl(curType);
        renderTxTable();
    }

    /* ---------- 页面切换 ---------- */
    function setPg(pg: string) {
        curPg = pg;
        el.querySelectorAll("#as-nav button").forEach(x => x.classList.toggle("active", (x as HTMLElement).dataset.pg === pg));
        el.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        ($("as-p-" + pg) as HTMLElement).classList.add("active");
        if (pg === "dash") renderDash();
        if (pg === "tx") renderTxPage();
        if (pg === "asset") renderAssetsPage();
        if (pg === "plan") renderPlanPage();
        if (pg === "report") renderReportPage();
        captureInputs();
        queueMicrotask(() => H.onIdle?.());
    }

    /* ---------- 事件委托 ---------- */
    // A pending remote version must be loaded before any index-based mutation.
    const guardAction = (event: Event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>("[data-act],[data-inp]");
        if (!button || !H.canMutate) return;
        const action = button.dataset.act || button.dataset.inp || "";
        if (["csv", "tpl", "pickCat", "pickEmoji", "catClose", "cancelIe", "iaCancel", "cancelLn", "cancelSv"].includes(action)) return;
        if (["delClose", "depClose"].includes(action) && button.dataset.ok === "0") return;
        if (!H.canMutate()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const guardedClick = "click", guardedChange = "change";
    el.addEventListener(guardedClick, guardAction, { capture: true, signal: lifetime.signal });
    el.addEventListener(guardedChange, guardAction, { capture: true, signal: lifetime.signal });
    listen("focusout", () => window.setTimeout(() => { if (!lifetime.signal.aborted) H.onIdle?.(); }, 0));
    // 侧边导航（委托到根元素，避免绑定时机早于骨架渲染导致失效）
    listen("click", (e: Event) => {
        const nb = (e.target as HTMLElement).closest("#as-nav button") as HTMLElement | null;
        if (nb && nb.dataset.pg) setPg(nb.dataset.pg);
    });
    listen("click", (e: Event) => {
        const t = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
        if (!t) return;
        const act = t.dataset.act!;
        const i = t.dataset.i != null ? +t.dataset.i : -1;
        switch (act) {
            case "tpl": setTpl(t.dataset.a as "支出" | "收入"); break;
            case "pickCat": curCat = t.dataset.c!; renderCats(); break;
            case "addCat": openCatModal(); break;
            case "pickEmoji": {
                cmEmoji = t.dataset.e!;
                el.querySelectorAll("#as-cm-grid .chip").forEach(x => (x as HTMLElement).style.background = "");
                t.style.background = "#eaf1fe";
                break;
            }
            case "catConfirm": confirmCat(); break;
            case "catClose": ($("as-cat") as HTMLElement).style.display = "none"; break;
            case "txAdd": addTx(); break;
            case "editTx": editTx(i); break;
            case "delTx": confirmDel("删除这笔流水？", () => { const x = S.txs[i]; const a = S.accounts.find(ac => ac.name === x.a); if (a) a.bal -= x.v; S.txs.splice(i, 1); H.save(); renderTxTable(); recordSnap(); H.renderDock?.(); }); break;
            case "csv": exportCSV(); break;
            case "clearTx": confirmDel("清空全部流水？", () => { S.txs = []; H.save(); renderTxTable(); recordSnap(); H.renderDock?.(); }); break;
            case "toggleAssetEdit":
                assetEditMode = !assetEditMode;
                inlineAddGroup = null; inlineEditIdx = null;
                renderAssetsPage(); break;
            case "ieOpen": inlineEditIdx = (inlineEditIdx === i) ? null : i; inlineAddGroup = null; renderAssetsPage(); break;
            case "cancelIe": inlineEditIdx = null; renderAssetsPage(); break;
            case "saveIe": saveInlineEdit(i); break;
            case "iaOpen": inlineAddGroup = t.dataset.g!; renderAssetsPage(); break;
            case "iaCancel": inlineAddGroup = null; renderAssetsPage(); break;
            case "iaSave": confirmInlineAdd(t.dataset.g!); break;
            case "moveUp": moveAcct(i, -1); break;
            case "moveDown": moveAcct(i, 1); break;
            case "delAcct": confirmDel(`删除账户「${S.accounts[i].name}」？`, () => { S.accounts.splice(i, 1); H.save(); renderAssetsPage(); H.renderDock?.(); }); break;
            case "delClose": {
                if (t.dataset.ok === "1") {
                    if (($("as-del-skip") as HTMLInputElement).checked) { S.warn.delSkip = today(); H.save(); }
                    const fn = delFn; delFn = null;
                    ($("as-del") as HTMLElement).style.display = "none";
                    if (fn) fn();
                } else {
                    delFn = null;
                    ($("as-del") as HTMLElement).style.display = "none";
                }
                break;
            }
            case "depClose": {
                if (t.dataset.ok === "1") {
                    const v = parseFloat(($("as-dep-amt") as HTMLInputElement).value);
                    if (!v || v <= 0) { H.toast("请输入有效金额", "error"); return; }
                    const s = S.savings[depIdx];
                    s.saved = Math.min(s.target, s.saved + v);
                    H.save(); renderPlanPage();
                }
                ($("as-dep") as HTMLElement).style.display = "none";
                break;
            }
            case "addSub": {
                const n = ($("as-sub-name") as HTMLInputElement).value.trim();
                const v = parseFloat(($("as-sub-amt") as HTMLInputElement).value);
                const next = ($("as-sub-next") as HTMLInputElement).value;
                if (!n) { H.toast("请输入名称", "error"); return; }
                if (!v || v <= 0) { H.toast("请输入有效金额", "error"); return; }
                if (!next) { H.toast("请选择下次扣费日期", "error"); return; }
                S.subs.unshift({ n, v, cyc: ($("as-sub-cyc") as HTMLSelectElement).value, next, on: true, cat: ($("as-sub-cat") as HTMLSelectElement).value });
                H.save(); renderPlanPage();
                ($("as-sub-name") as HTMLInputElement).value = ""; ($("as-sub-amt") as HTMLInputElement).value = "";
                break;
            }
            case "delSub": confirmDel(`删除订阅「${S.subs[i].n}」？`, () => { S.subs.splice(i, 1); H.save(); renderPlanPage(); }); break;
            case "addPol": {
                const n = ($("as-pol-name") as HTMLInputElement).value.trim();
                const v = parseFloat(($("as-pol-amt") as HTMLInputElement).value);
                const next = ($("as-pol-next") as HTMLInputElement).value;
                if (!n) { H.toast("请输入险种名称", "error"); return; }
                if (!v || v <= 0) { H.toast("请输入有效保费", "error"); return; }
                if (!next) { H.toast("请选择下次缴费日期", "error"); return; }
                S.policies.unshift({ n, v, cyc: ($("as-pol-cyc") as HTMLSelectElement).value, next, years: ($("as-pol-years") as HTMLInputElement).value.trim() || "—", on: true });
                H.save(); renderPlanPage();
                ($("as-pol-name") as HTMLInputElement).value = ""; ($("as-pol-amt") as HTMLInputElement).value = "";
                break;
            }
            case "delPol": confirmDel(`删除保单「${S.policies[i].n}」？`, () => { S.policies.splice(i, 1); H.save(); renderPlanPage(); }); break;
            case "editLn": lnEditIdx = (lnEditIdx === i) ? null : i; renderPlanPage(); break;
            case "cancelLn": lnEditIdx = null; renderPlanPage(); break;
            case "saveLn": {
                const l = S.loans[i];
                const total = parseFloat(($("as-le-total") as HTMLInputElement).value);
                const months = parseInt(($("as-le-months") as HTMLInputElement).value);
                if (!total || total <= 0) { H.toast("请输入有效贷款总额", "error"); return; }
                if (!months || months <= 0) { H.toast("请输入有效总期数", "error"); return; }
                l.cat = ($("as-le-cat") as HTMLSelectElement).value;
                l.n = ($("as-le-name") as HTMLInputElement).value.trim();
                l.total = total;
                l.rate = parseFloat(($("as-le-rate") as HTMLInputElement).value) || 0;
                l.method = ($("as-le-method") as HTMLSelectElement).value;
                l.months = months;
                l.paid = Math.min(parseInt(($("as-le-paid") as HTMLInputElement).value) || 0, months);
                lnEditIdx = null;
                H.save(); renderPlanPage();
                break;
            }
            case "addLoan": {
                const total = parseFloat(($("as-ln-total") as HTMLInputElement).value);
                const rate = parseFloat(($("as-ln-rate") as HTMLInputElement).value);
                const months = parseInt(($("as-ln-months") as HTMLInputElement).value);
                const paid = parseInt(($("as-ln-paid") as HTMLInputElement).value) || 0;
                if (!total || total <= 0) { H.toast("请输入贷款总额", "error"); return; }
                if (!(rate >= 0)) { H.toast("请输入年利率", "error"); return; }
                if (!months || months <= 0) { H.toast("请输入总期数", "error"); return; }
                S.loans.unshift({ cat: ($("as-ln-cat") as HTMLSelectElement).value, n: ($("as-ln-name") as HTMLInputElement).value.trim(), total, rate, method: ($("as-ln-method") as HTMLSelectElement).value, months, paid: Math.min(paid, months), on: true });
                H.save(); renderPlanPage();
                break;
            }
            case "delLoan": confirmDel(`删除「${S.loans[i].n || S.loans[i].cat}」还款规划？`, () => { S.loans.splice(i, 1); H.save(); renderPlanPage(); }); break;
            case "editSv": svEditIdx = (svEditIdx === i) ? null : i; renderPlanPage(); break;
            case "cancelSv": svEditIdx = null; renderPlanPage(); break;
            case "saveSv": {
                const s = S.savings[i];
                const n = ($("as-se-name") as HTMLInputElement).value.trim();
                const target = parseFloat(($("as-se-target") as HTMLInputElement).value);
                if (!n) { H.toast("请输入计划名称", "error"); return; }
                if (!target || target <= 0) { H.toast("请输入有效目标金额", "error"); return; }
                s.n = n; s.target = target;
                s.saved = parseFloat(($("as-se-saved") as HTMLInputElement).value) || 0;
                s.monthly = parseFloat(($("as-se-monthly") as HTMLInputElement).value) || 0;
                s.acct = ($("as-se-acct") as HTMLSelectElement).value || "未指定";
                s.rate = parseFloat(($("as-se-rate") as HTMLInputElement).value) || 0;
                s.deadline = ($("as-se-deadline") as HTMLInputElement).value || "—";
                svEditIdx = null;
                H.save(); renderPlanPage();
                break;
            }
            case "depSv": {
                depIdx = i;
                const s = S.savings[i];
                ($("as-dep-msg") as HTMLElement).textContent = `向「${s.n}」存入（存于 ${s.acct || "未指定"} · 已存 ${money(s.saved)} / 目标 ${money(s.target)}）`;
                ($("as-dep-amt") as HTMLInputElement).value = "";
                ($("as-dep") as HTMLElement).style.display = "flex";
                setTimeout(() => ($("as-dep-amt") as HTMLInputElement).focus(), 50);
                break;
            }
            case "addSaving": {
                const n = ($("as-sv-name") as HTMLInputElement).value.trim();
                const target = parseFloat(($("as-sv-target") as HTMLInputElement).value);
                const monthly = parseFloat(($("as-sv-monthly") as HTMLInputElement).value) || 0;
                const rate = parseFloat(($("as-sv-rate") as HTMLInputElement).value) || 0;
                const acct = ($("as-sv-acct") as HTMLSelectElement).value || "未指定";
                const deadline = ($("as-sv-deadline") as HTMLInputElement).value;
                if (!n) { H.toast("请输入计划名称", "error"); return; }
                if (!target || target <= 0) { H.toast("请输入有效目标金额", "error"); return; }
                S.savings.unshift({ n, target, saved: 0, monthly, rate, acct, deadline: deadline || "—" });
                H.save(); renderPlanPage();
                break;
            }
            case "delSv": confirmDel(`删除储蓄计划「${S.savings[i].n}」？`, () => { S.savings.splice(i, 1); H.save(); renderPlanPage(); }); break;
        }
    });
    listen("change", (e: Event) => {
        const t = (e.target as HTMLElement).closest("[data-chg]") as HTMLElement | null;
        if (!t) return;
        const i = +t.dataset.i!;
        switch (t.dataset.chg) {
            case "subOn": S.subs[i].on = (t as HTMLInputElement).checked; H.save(); renderPlanPage(); break;
            case "polOn": S.policies[i].on = (t as HTMLInputElement).checked; H.save(); renderPlanPage(); break;
            case "loanOn": S.loans[i].on = (t as HTMLInputElement).checked; H.save(); renderPlanPage(); break;
            case "ieCredit": ieToggleCredit(); break;
            case "iaCredit": iaToggleCredit(); break;
        }
    });
    listen("input", (e: Event) => {
        const t = (e.target as HTMLElement).closest("[data-inp]") as HTMLElement | null;
        if (!t) return;
        if (t.dataset.inp === "ieCredit") ieToggleCredit();
        if (t.dataset.inp === "iaCredit") iaToggleCredit();
    });
    // 页内筛选
    listen("input", (e: Event) => {
        const t = e.target as HTMLElement;
        if (t.id === "as-f-kw") renderTxTable();
    });
    listen("change", (e: Event) => {
        const t = e.target as HTMLElement;
        if (t.id === "as-f-month" || t.id === "as-f-type") renderTxTable();
        if (t.id === "as-dep-amt" && (e as KeyboardEvent).key === "Enter") { /* noop */ }
    });

    /* ---------- 启动 ---------- */
    setPg("dash");

    /* ---------- 容器尺寸变化 → 重绘当前页（Dock 面板展开/拖宽时图表才画得出来） ---------- */
    let lastW = 0, roTimer: number | undefined;
    const resize = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w === lastW) return;
        lastW = w;
        if (w > 0) {
            clearTimeout(roTimer);
            roTimer = window.setTimeout(() => {
                // Forms need no JS repaint on resize; rebuilding them erased drafts.
                if (curPg === "dash") renderDash();
                if (curPg === "report") renderReportPage();
            }, 120);
        }
    });
    resize.observe(el);
    const inputObserver = new MutationObserver(captureInputs);
    inputObserver.observe(el, { childList: true, subtree: true });
    captureInputs();
    return {
        hasDraft() {
            if (editing >= 0 || inlineEditIdx !== null || inlineAddGroup !== null || lnEditIdx !== null || svEditIdx !== null) return true;
            if (el.querySelectorAll<HTMLElement>(".asm-mask").length && Array.from(el.querySelectorAll<HTMLElement>(".asm-mask")).some(mask => mask.style.display !== "none")) return true;
            if (el.contains(document.activeElement) && document.activeElement?.matches("input,select,textarea")) return true;
            return Array.from(el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(".page.active input,.page.active select,.page.active textarea")).some(input => cleanInputs.has(input) && cleanInputs.get(input) !== inputValue(input));
        },
        refresh(discardDraft = false) {
            if (discardDraft) { editing = -1; inlineEditIdx = null; inlineAddGroup = null; lnEditIdx = null; svEditIdx = null; delFn = null;
                el.querySelectorAll<HTMLElement>(".asm-mask").forEach(mask => mask.style.display = "none"); }
            const scrolls: [HTMLElement, number, number][] = [];
            for (let parent: HTMLElement | null = el; parent; parent = parent.parentElement) scrolls.push([parent, parent.scrollTop, parent.scrollLeft]);
            const main = el.querySelector<HTMLElement>(".main"); if (main) scrolls.push([main, main.scrollTop, main.scrollLeft]);
            setPg(curPg);
            for (const [element, top, left] of scrolls) { element.scrollTop = top; element.scrollLeft = left; }
        },
        destroy() { lifetime.abort(); resize.disconnect(); inputObserver.disconnect(); window.clearTimeout(roTimer); }
    } satisfies FullView;
}
