import { AppState, Loan, LoanPayment, Recurring, loanCalc, today } from "./state";

export const cents = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export function monthDate(month: string, day: number): string {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export function activeIn(r: Recurring, month: string) {
    return r.on && (!r.start || r.start <= month) && (!r.end || r.end >= month);
}
export function paymentKey(l: Loan, p: LoanPayment) { return `loan:${l.id}:${p.date}`; }
export function recurringKey(r: Recurring, month: string) { return `recurring:${r.id}:${month}`; }
export function housingSummary(s: AppState, month: string) {
    const flows = (s.recurring || []).filter(r => r.housing && activeIn(r, month));
    const income = flows.filter(r => r.direction === "收入").reduce((n, r) => n + r.amount, 0);
    const rent = flows.filter(r => r.direction === "支出").reduce((n, r) => n + r.amount, 0);
    let mortgage = 0, principal = 0, estimated = false, missing = false;
    for (const l of s.loans.filter(l => l.on && l.cat === "房贷" && l.paid < l.months)) {
        const plans = (l.schedule || []).filter(p => p.date.startsWith(month));
        if (plans.length) {
            mortgage += plans.reduce((n, p) => n + p.principal + p.interest, 0);
            principal += plans.reduce((n, p) => n + p.principal, 0);
        } else if (l.schedule?.length) { missing = true; }
        else { mortgage += loanCalc(l).M; principal += l.method === "等额本金" ? l.total / l.months : Math.max(0, loanCalc(l).M - loanCalc(l).remainPrin * l.rate / 1200); estimated = true; }
    }
    return { income: cents(income), rent: cents(rent), mortgage: cents(mortgage), principal: cents(principal), gap: cents(mortgage + rent - income), cost: cents(mortgage - principal + rent - income), estimated, missing };
}
export function monthlyCommitments(s: AppState, month: string) {
    let total = s.subs.filter(x=>x.on).reduce((n,x)=>n+(x.cyc==="每年"?x.v/12:x.cyc==="每周"?x.v*52/12:x.v),0) + s.policies.filter(x=>x.on).reduce((n,x)=>n+(x.cyc==="每年"?x.v/12:x.v),0);
    const flows=(s.recurring||[]).filter(x=>activeIn(x,month));
    const income=flows.filter(x=>x.direction==="收入").reduce((n,x)=>n+x.amount,0);
    total+=flows.filter(x=>x.direction==="支出").reduce((n,x)=>n+x.amount,0);
    let missing=false;
    for(const l of s.loans.filter(x=>x.on&&x.paid<x.months)) {
        const plans=(l.schedule||[]).filter(p=>p.date.startsWith(month));
        if(plans.length)total+=plans.reduce((n,p)=>n+p.principal+p.interest,0);
        else if(l.schedule?.length)missing=true;
        else total+=loanCalc(l).M;
    }
    for(const a of s.accounts) for(const p of a.repayment?.schedule||[]) if(p.date.startsWith(month))total+=p.principal+p.interest;
    return {total:cents(total),income:cents(income),missing};
}
export function parseSchedule(text: string): LoanPayment[] {
    const rows = text.trim() ? text.trim().split(/\n+/).map(line => {
        const [date, rawP, rawI, ...extra] = line.trim().split(/[,，\s]+/);
        const principal = Number(rawP), interest = Number(rawI);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || !rawP || !rawI || !Number.isFinite(principal) || !Number.isFinite(interest) || principal <= 0 || interest < 0 || extra.length) throw Error("每行请输入：日期 本金 利息；金额应有效且本金大于零");
        return { date, principal: cents(principal), interest: cents(interest) };
    }) : [];
    if (new Set(rows.map(p => p.date)).size !== rows.length) throw Error("还款日期不能重复");
    return rows.sort((a, b) => a.date.localeCompare(b.date));
}
export function settle(s: AppState, key: string, account: string, date: string, direction: "收入" | "支出", amount: number, name: string, principal = 0, category = "其他") {
    if ((s.settlements || []).includes(key) || s.txs.some(t => t.sourceKey === key)) throw Error("这期已经确认过，不能重复记账");
    if (!date || date > today()) throw Error("实际收付日期不能晚于今天");
    const a = s.accounts.find(a => a.name === account && a.g === "现金流");
    if (!a) throw Error("请选择有效的现金流账户");
    if (!Number.isFinite(amount) || amount <= 0 || principal < 0 || principal > amount) throw Error("收付金额无效");
    const v = cents(direction === "收入" ? amount : -amount);
    s.txs.unshift({ d: date, t: direction, c: principal && category === "其他" ? "房贷还款" : category, a: account, n: name, v, sourceKey: key, principal });
    a.bal = cents(a.bal + v);
    (s.settlements ||= []).push(key);
}
