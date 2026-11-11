import { AppState, today } from "./state";
import { activeIn, cents, housingSummary, monthDate, parseSchedule, paymentKey, recurringKey, settle } from "./cashflow";

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (v: number) => `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function cashflowSummary(s: AppState, month = today().slice(0, 7)) {
    const h = housingSummary(s, month);
    return `<section class="card cf-housing"><div class="cf-heading"><h3>住房收支计划</h3><span class="cf-badge">${esc(month)}</span></div><div class="cf-metrics"><div><span>收租等收入</span><strong class="up">${money(h.income)}</strong></div><div><span>租房等支出</span><strong>${money(h.rent)}</strong></div><div><span>本月房贷</span><strong>${h.missing ? "待补账单" : money(h.mortgage)}</strong></div><div><span>每月需要补入</span><strong class="down">${h.missing ? "待补账单" : money(h.gap)}</strong></div></div><div class="cf-summary-note">还贷本金 ${h.missing ? "待核对" : money(h.principal)}<span>不含本金的住房净成本 ${h.missing ? "待补账单" : money(h.cost)}</span></div><p class="cf-muted">${h.missing ? "所选月份缺少银行账单，补齐后计算完整现金缺口。" : h.estimated ? "房贷金额按现有参数试算。" : "房贷金额来自所选月份银行账单。"}计划确认收付后才会记入流水。</p></section>`;
}
interface Host { state: AppState; save(): void | Promise<boolean>; toast(msg: string, type?: string): void; canMutate?(): boolean; }
export function mountCashflow(root: HTMLElement, host: Host) {
    root.classList.add("asm-cashflow");
    const s = host.state;
    let month = today().slice(0, 7), busy = false, clean = "";
    let pendingPayment: HTMLButtonElement | null = null;
    let openNew = false;
    const formKey = () => JSON.stringify(Array.from(root.querySelectorAll<HTMLInputElement>("input,select,textarea")).map(e => e.type === "checkbox" ? e.checked : e.value));
    const hasDraft = () => busy || formKey() !== clean;
    function render() {
        const flows = s.recurring || [];
        const accounts = s.accounts.filter(a => a.g === "现金流");
        const done = (key: string) => (s.settlements || []).includes(key) || s.txs.some(t => t.sourceKey === key);
        root.innerHTML = `<div class="card cf-manager"><div class="cf-heading"><div><h3>固定收支与住房管理</h3><p>安排每月收入、支出和房贷，按实际收付确认记账。</p></div><label>计划月份<input type="month" data-cf="month" value="${month}"></label></div>${cashflowSummary(s, month)}
        <dialog class="cf-payment-dialog"><div class="cf-heading"><h3>确认实际收付</h3></div><div class="cf-paybar"><label>收付款账户<select data-cf="account"><option value="">请选择现金流账户</option>${accounts.map(a => `<option>${esc(a.name)}</option>`).join("")}</select></label><label>实际收付日期<input type="date" data-cf="actual" value="${today()}"></label></div><p class="cf-muted">确认后才会记入流水，同一期只记一次。</p><div class="cf-actions"><button data-cash="cancelPayment">取消</button><button class="btn" data-cash="confirmPayment">确认记账</button></div></dialog>
        <h3>每月固定收入 / 支出</h3>
        <div class="cf-flow-list">${flows.map((r, i) => `<article class="cf-flow" data-flow="${i}"><div class="cf-heading"><h4>${esc(r.name)}</h4><span class="cf-badge ${r.direction === "收入" ? "is-income" : ""}">${r.direction} · ${money(r.amount)} / 月</span></div><details class="cf-editor"><summary>编辑</summary><div class="cf-form-grid"><label>名称<input data-f="name" value="${esc(r.name)}" aria-label="收支名称"></label><label>关联房产<input data-f="property" value="${esc(r.property)}" placeholder="可选"></label><label>收支方向<select data-f="direction"><option ${r.direction === "收入" ? "selected" : ""}>收入</option><option ${r.direction === "支出" ? "selected" : ""}>支出</option></select></label><label>每月金额<input data-f="amount" type="number" min="0.01" step="0.01" value="${r.amount}"></label><label>每月收付日<input data-f="day" type="number" min="1" max="31" value="${r.day || ""}" placeholder="待定"></label><label>起始月份<input data-f="start" type="month" value="${r.start || ""}"></label><label>结束月份<input data-f="end" type="month" value="${r.end || ""}"></label><div class="cf-checks"><label><input type="checkbox" data-f="on" ${r.on ? "checked" : ""}>启用计划</label><label><input type="checkbox" data-f="housing" ${r.housing ? "checked" : ""}>计入住房收支</label></div></div><div class="cf-actions"><button class="btn ghost" data-cash="saveFlow" data-i="${i}">保存修改</button><button class="btn ghost" data-cash="deleteFlow" data-i="${i}">删除计划</button></div></details><div class="cf-footer"><span class="cf-muted">${r.day ? monthDate(month, r.day) + (monthDate(month, r.day) <= today() && !done(recurringKey(r, month)) ? " · 待确认收付" : "") : "收付日期待设置"}</span><div class="cf-actions">${activeIn(r, month) ? `<button class="btn" data-cash="settleFlow" data-i="${i}" ${done(recurringKey(r, month)) ? "disabled" : ""}>${done(recurringKey(r, month)) ? "本月已确认" : r.direction === "收入" ? "确认已到账" : "确认已付款"}</button>` : ""}</div></div></article>`).join("")}</div><button class="btn ghost" data-cash="addFlow">＋ 新增固定收支</button>
        <h3 style="margin-top:20px">房贷</h3>
        ${s.loans.map((l, i) => `<details data-loan="${i}" style="margin:12px 0"><summary>${esc(l.n || l.cat)} · 银行余额 ${l.bankBalance === undefined ? "未登记" : money(l.bankBalance)}</summary><details class="cf-editor"><summary>编辑银行资料</summary><p class="cf-muted">还款计划每行：日期 本金 利息。利率变化后请更新银行账单。</p><div class="form-row" style="margin-top:10px"><label>银行剩余本金<input type="number" data-l="balance" min="0" step="0.01" value="${l.bankBalance ?? ""}"></label><label>余额日期<input type="date" data-l="date" value="${l.balanceDate || ""}"></label><label>每月还款日<input type="number" data-l="day" min="1" max="31" value="${l.repaymentDay || ""}"></label><label>重定价说明<input data-l="reprice" value="${esc(l.reprice || "")}" placeholder="如：每年4月1日，LPR减60基点"></label></div><textarea data-l="schedule" rows="5" style="width:100%;box-sizing:border-box" aria-label="银行还款计划">${(l.schedule || []).map(p => `${p.date} ${p.principal} ${p.interest}`).join("\n")}</textarea><button class="btn ghost" data-cash="saveBank" data-i="${i}">保存银行资料</button></details><div style="overflow:auto"><table><thead><tr><th>还款日</th><th>本金</th><th>利息</th><th>总额</th><th>操作</th></tr></thead><tbody>${(l.schedule || []).map((p, j) => `<tr><td>${p.date}</td><td>${money(p.principal)}</td><td>${money(p.interest)}</td><td>${money(cents(p.principal + p.interest))}</td><td><button class="btn ghost" data-cash="settleLoan" data-i="${i}" data-j="${j}" ${done(paymentKey(l, p)) ? "disabled" : ""}>${done(paymentKey(l, p)) ? "已还款" : "确认已还款"}</button></td></tr>`).join("")}</tbody></table></div></details>`).join("")}
        <details class="cf-explanation"><summary>查看本金与成本统计</summary><p><small>实际流水中的还贷本金合计：${money(s.txs.reduce((n, t) => n + (t.principal || 0), 0))}；消费成本合计（排除还贷本金）：${money(s.txs.filter(t => t.t === "支出").reduce((n, t) => n - t.v - (t.principal || 0), 0))}。原有支出报表仍按现金流出统计。</small></p></details></div>`;
        if (openNew) { root.querySelector<HTMLDetailsElement>(".cf-flow:last-child .cf-editor")!.open = true; openNew = false; }
        clean = formKey();
    }
    root.onchange = e => {
        const target = e.target as HTMLInputElement;
        if (target.dataset.cf === "month" && target.value) { month = target.value; render(); }
    };
    root.onclick = async e => {
        const button = (e.target as Element).closest<HTMLButtonElement>("[data-cash]");
        if (!button || busy || host.canMutate?.() === false) return;
        const action = button.dataset.cash, i = Number(button.dataset.i);
        const dialog = root.querySelector<HTMLDialogElement>(".cf-payment-dialog")!;
        if (action === "cancelPayment") { dialog.close(); pendingPayment = null; return; }
        if (action === "confirmPayment") { if (!pendingPayment) return; const target = pendingPayment; dialog.close(); pendingPayment = null; target.dataset.confirmed = "1"; target.click(); return; }
        if ((action === "settleFlow" || action === "settleLoan") && button.dataset.confirmed !== "1") { pendingPayment = button; dialog.showModal(); return; }
        delete button.dataset.confirmed;
        const snapshot = JSON.parse(JSON.stringify(s));
        const get = (selector: string) => (root.querySelector(selector) as HTMLInputElement).value;
        busy = true; button.disabled = true;
        try {
            if (action === "addFlow") { openNew = true; (s.recurring ||= []).push({ id: crypto.randomUUID(), name: "新固定收支", direction: "支出", amount: 1, housing: false, property: "", on: false }); }
            if (action === "deleteFlow") s.recurring!.splice(i, 1);
            if (action === "saveFlow") {
                const row = root.querySelector(`[data-flow="${i}"]`)!;
                const f = (key: string) => row.querySelector<HTMLInputElement>(`[data-f="${key}"]`)!;
                const amount = Number(f("amount").value), day = f("day").value ? Number(f("day").value) : undefined;
                if (!f("name").value.trim() || !(amount > 0) || !Number.isFinite(amount) || (day !== undefined && (!Number.isInteger(day) || day < 1 || day > 31)) || (f("end").value && f("start").value > f("end").value)) throw Error("请检查名称、金额、日期和起止月份");
                Object.assign(s.recurring![i], { name: f("name").value.trim(), property: f("property").value.trim(), direction: f("direction").value, amount: cents(amount), day, start: f("start").value, end: f("end").value, housing: f("housing").checked, on: f("on").checked });
            }
            if (action === "saveBank") {
                const f = (k: string) => get(`[data-loan="${i}"] [data-l="${k}"]`);
                const l = s.loans[i], balance = f("balance") ? Number(f("balance")) : undefined, day = f("day") ? Number(f("day")) : undefined;
                const schedule = parseSchedule(f("schedule"));
                if ((balance !== undefined && (!Number.isFinite(balance) || balance < 0 || !f("date"))) || (day !== undefined && (!Number.isInteger(day) || day < 1 || day > 31))) throw Error("请检查余额、余额日期和还款日");
                for (const old of l.schedule || []) if ((s.settlements || []).includes(paymentKey(l, old)) && !schedule.some(p => p.date === old.date && p.principal === old.principal && p.interest === old.interest)) throw Error("已确认还款的账单不可修改或删除");
                Object.assign(l, { id: l.id || crypto.randomUUID(), bankBalance: balance, balanceDate: f("date"), repaymentDay: day, reprice: f("reprice"), schedule });
            }
            if (action === "settleFlow") {
                const r = s.recurring![i];
                if (!activeIn(r, month) || month > today().slice(0, 7)) throw Error("不能确认未来月份或停用的计划");
                settle(s, recurringKey(r, month), get('[data-cf="account"]'), get('[data-cf="actual"]'), r.direction, r.amount, `${r.name}（${month}）`, 0, r.housing ? r.direction === "收入" ? "租金收入" : "房租" : "其他");
            }
            if (action === "settleLoan") {
                const l = s.loans[i], p = l.schedule![Number(button.dataset.j)];
                if (!l.on || !l.id || l.bankBalance === undefined) throw Error("请先启用贷款并登记银行余额");
                if (p.date > today() || (l.balanceDate && p.date <= l.balanceDate)) throw Error("不能确认未来账单或已包含在银行余额中的账单");
                if (get('[data-cf="actual"]') < p.date) throw Error("实际还款日期不能早于这期账单日期");
                if (l.schedule!.some(row => row.date < p.date && row.date > (l.balanceDate || "") && !(s.settlements || []).includes(paymentKey(l, row)))) throw Error("请按日期顺序确认还款");
                if (p.principal > l.bankBalance || l.paid >= l.months) throw Error("本金或剩余期数不符，请核对银行余额");
                settle(s, paymentKey(l, p), get('[data-cf="account"]'), get('[data-cf="actual"]'), "支出", cents(p.principal + p.interest), `${l.n} 房贷 ${p.date}`, p.principal);
                l.bankBalance = cents(l.bankBalance - p.principal); l.balanceDate = p.date; l.paid++;
            }
            if (await host.save() === false) throw Error("保存失败，请重试或先处理同步更新");
            render(); host.toast("已保存");
        } catch (error) { Object.assign(s, snapshot); for (const key of ["recurring", "settlements"] as const) if (!(key in snapshot)) delete s[key]; host.toast((error as Error).message, "error"); button.disabled = false; }
        finally { busy = false; }
    };
    render();
    return { hasDraft, refresh: render };
}
