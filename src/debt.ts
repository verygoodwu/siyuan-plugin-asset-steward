import { AppState, Acct, LoanPayment, today } from "./state";
import { cents, monthDate, settle } from "./cashflow";
export function debtKey(a: Acct, p: LoanPayment) { return `debt:${a.repayment!.id}:${p.date}`; }
export function isSettled(s: AppState, key: string) { return (s.settlements || []).includes(key) || s.txs.some(t => t.sourceKey === key); }
export function generateDebtSchedule(balance: number, firstDate: string, periods: number, fee: number): LoanPayment[] {
    if (!Number.isFinite(balance) || balance <= 0 || !Number.isInteger(periods) || periods < 1 || periods > 600 || !Number.isFinite(fee) || fee < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(firstDate) || !Number.isFinite(Date.parse(firstDate)) || new Date(firstDate).toISOString().slice(0,10) !== firstDate) throw Error("请填写有效的还款日期、期数及每期费用");
    const total = Math.round(balance * 100), base = Math.floor(total / periods), day = Number(firstDate.slice(8));
    if (!base) throw Error("分期期数过多，每期本金不能小于一分钱");
    const [year, month] = firstDate.split("-").map(Number);
    return Array.from({ length: periods }, (_, i) => {
        const d = new Date(year, month - 1 + i, 1), ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
        return { date: monthDate(ym, day), principal: (i === periods - 1 ? total - base * (periods - 1) : base) / 100, interest: cents(fee) };
    });
}
export function outstanding(s: AppState, a: Acct) { return (a.repayment?.schedule || []).filter(p => !isSettled(s, debtKey(a,p))).sort((a,b)=>a.date.localeCompare(b.date)); }
export function repayDebt(s: AppState, index: number, date: string, account: string, actual: string) {
    const a = s.accounts[index], p = a && outstanding(s,a)[0];
    if (!p || p.date !== date) throw Error("请按顺序确认尚未还款的账单");
    if (p.date > today() || actual < p.date) throw Error("不能确认未来账单，实际日期不能早于还款日");
    if (p.principal > cents(-a.bal)) throw Error("计划本金大于当前负债，请核对余额");
    settle(s,debtKey(a,p),account,actual,"支出",cents(p.principal+p.interest),`${a.name} 还款 ${p.date}`,p.principal,"借贷还款");
    a.bal = cents(a.bal + p.principal);
}
export function debtReminders(s: AppState) {
    return s.accounts.filter(a=>a.bal<0).map(a=>({account:a,next:outstanding(s,a)[0]}));
}
