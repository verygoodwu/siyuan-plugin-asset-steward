/* 资产管家 · 移动端界面（作用域 .asm-m）
 * M1：底部 Tab 壳 + 记一笔（全功能）；总览/流水在 M2 填充。
 * 数据层零改动：只读 H.state，写操作走与桌面端相同的字段约定。
 */
import { AppState, Tx, today } from "./state";

export interface MobileHost {
    state: AppState;
    save: () => void;
    toast: (msg: string, type?: string) => void;
}

function esc(s: string): string {
    return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function money(v: number): string {
    return "¥" + Math.abs(v).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
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

export function mountMobile(el: HTMLElement, H: MobileHost) {
    const S = H.state;

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
          <div class="asm-m-empty">
            <div class="big">📊</div>
            <b>总览简版</b>
            <div>净资产 · 本月收支 · 今日待办<br>将在 v1.1.0 M2 提供</div>
            <div class="mini">当前净资产：<b data-role="mNet"></b></div>
          </div>
        </div>

        <!-- ========= 流水（M2） ========= -->
        <div class="asm-m-page" data-p="txs">
          <div class="asm-m-empty">
            <div class="big">🧾</div>
            <b>流水查看</b>
            <div>最近流水的卡片式列表与搜索<br>将在 v1.1.0 M2 提供</div>
            <div class="mini">已记录 <b data-role="mTxCount">0</b> 笔流水</div>
          </div>
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
        refresh();
    }));

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
        }));
    }
    function renderAccts() {
        acctEl.innerHTML = S.accounts.map(a => `<option value="${esc(a.name)}">${esc(a.name)}（${money(a.bal)}）</option>`).join("");
        (q<HTMLDivElement>("noAcct")).style.display = S.accounts.length ? "none" : "block";
    }
    function refresh() {
        renderCats();
        renderAccts();
        const net = S.accounts.reduce((s, a) => s + a.bal, 0);
        const netEl = el.querySelector('[data-role="mNet"]') as HTMLElement | null;
        if (netEl) netEl.textContent = money(net);
        const cnt = el.querySelector('[data-role="mTxCount"]') as HTMLElement | null;
        if (cnt) cnt.textContent = String(S.txs.length);
    }

    typeBtns.forEach(b => b.addEventListener("click", () => {
        curType = (b as HTMLElement).dataset.t as "支出" | "收入";
        typeBtns.forEach(x => x.classList.toggle("on", x === b));
        renderCats();
    }));

    q<HTMLButtonElement>("save").addEventListener("click", () => {
        const v = parseFloat(amtEl.value);
        if (!v || v <= 0) { H.toast("请输入有效金额", "error"); return; }
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
        S.txs.unshift(tx);
        const acct = S.accounts.find(a => a.name === tx.a);
        if (acct) acct.bal += tx.v;
        upsertSnap(S);
        H.save();
        H.toast("已记账 " + money(v));
        amtEl.value = "";
        noteEl.value = "";
        amtEl.blur();
        refresh();
    });

    refresh();
}
