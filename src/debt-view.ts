import { AppState, today } from "./state";
import { cents } from "./cashflow";
import { debtKey, generateDebtSchedule, outstanding, isSettled, repayDebt } from "./debt";
const esc = (v: unknown) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const money = (n: number) => `¥${n.toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
interface Host { state: AppState; save(): void | Promise<boolean>; toast(m: string,t?: string): void; canMutate?(): boolean; onSaved?(): void; }
export function mountDebtPlans(root: HTMLElement, host: Host, editing = true) {
    root.classList.add("asm-cashflow","asm-debts"); const s=host.state; let busy=false, clean="", expanded=true;
    const formKey=()=>JSON.stringify(Array.from(root.querySelectorAll<HTMLInputElement>("input,select")).map(e=>e.value));
    function render() {
        const list=s.accounts.filter(a=>a.bal<0 || a.repayment);
        root.innerHTML=list.length ? `<details class="card cf-debt-section" ${expanded ? "open" : ""}><summary><div><h3>负债还款计划</h3><p>共 ${list.length} 笔负债 · 点击展开或收起</p></div><span class="cf-fold-arrow" aria-hidden="true">▸</span></summary><div class="cf-debt-list">${list.map(a=>{
            const i=s.accounts.indexOf(a), plan=a.repayment, rows=plan?.schedule||[], pending=outstanding(s,a), next=pending[0], count=rows.length-pending.length;
            const status=next ? next.date<today()?"已到期，待确认":next.date===today()?"今天还款":"待还款" : plan?"已完成":"未设置";
            return `<article class="cf-debt" data-debt="${i}"><div class="cf-heading"><div><h4>${esc(a.name)}</h4><span class="cf-muted">当前负债 ${money(Math.max(0,-a.bal))}</span></div><span class="cf-badge ${next&&next.date<=today()?"is-warning":""}">${status}</span></div>
            <div class="cf-next"><div><span>下次还款日</span><strong>${next?.date || "待设置"}</strong></div><div><span>下期应还</span><strong>${next?money(cents(next.principal+next.interest)):"—"}</strong></div><div><span>还款方式</span><strong>${plan?`${plan.mode} · ${count}/${rows.length} 期已还`:"待设置"}</strong></div></div>
            <details class="cf-editor"><summary>编辑</summary><div class="cf-form-grid">
            <label>还款方式<select data-d="mode"><option ${plan?.mode!=="分期"?"selected":""}>一次性</option><option ${plan?.mode==="分期"?"selected":""}>分期</option></select></label>
            <label>首次还款日期<input type="date" data-d="date" value="${plan?.firstDate||""}"></label><label>分期期数<input type="number" min="1" max="600" data-d="periods" value="${plan?.periods||1}"></label><label>每期利息 / 手续费<input type="number" min="0" step="0.01" data-d="fee" value="${plan?.fee||0}"></label></div><p class="cf-muted">按当前剩余负债均分本金，尾期补齐分差；每期费用请按平台账单填写，不会根据额度推算利息。一次性还款为 1 期。</p><div class="cf-actions"><button data-debt-act="save" data-i="${i}">${plan?"重新生成未还计划":"生成并保存计划"}</button></div>
            ${rows.length?`<div class="cf-schedule-wrap"><table class="cf-schedule"><thead><tr><th>期次</th><th>还款日期</th><th>本金</th><th>费用</th><th>应还合计</th><th>状态</th></tr></thead><tbody>${rows.map((p,j)=>`<tr><td>${j+1}</td><td>${p.date}</td><td>${money(p.principal)}</td><td>${money(p.interest)}</td><td>${money(cents(p.principal+p.interest))}</td><td>${isSettled(s,debtKey(a,p))?"已还款":"待还款"}</td></tr>`).join("")}</tbody></table></div>`:""}
            ${next?`<div class="cf-payment-inline"><h4>确认本期已还款</h4><div class="cf-paybar"><label>付款账户<select data-d="account"><option value="">请选择账户</option>${s.accounts.filter(x=>x.g==="现金流").map(x=>`<option>${esc(x.name)}</option>`).join("")}</select></label><label>实际还款日期<input type="date" data-d="actual" value="${today()}"></label><button data-debt-act="pay" data-i="${i}" ${next.date>today()?"disabled":""}>确认记账</button></div></div>`:""}</details></article>`;
        }).join("")}</div></details>`:"";
        if (!editing) root.querySelectorAll(".cf-editor").forEach(editor => editor.remove());
        clean=formKey();
    }
    root.addEventListener("toggle", e => { const section=e.target as HTMLDetailsElement; if(section.classList.contains("cf-debt-section")) expanded=section.open; }, true);
    root.onclick=async e=>{
        const button=(e.target as Element).closest<HTMLButtonElement>("[data-debt-act]");if(!editing||!button||busy||host.canMutate?.()===false)return;
        const i=Number(button.dataset.i), a=s.accounts[i], snapshot=JSON.parse(JSON.stringify(s));
        const get=(k:string)=>(root.querySelector(`[data-debt="${i}"] [data-d="${k}"]`) as HTMLInputElement).value;
        busy=true;button.disabled=true;
        try{
            if(button.dataset.debtAct==="save"){
                const mode=get("mode") as "一次性"|"分期", periods=mode==="一次性"?1:Number(get("periods")), firstDate=get("date"), fee=Number(get("fee"));
                const previous=a.repayment, paid=previous?.schedule.filter(p=>isSettled(s,debtKey(a,p)))||[];
                if(paid.some(p=>p.date>=firstDate))throw Error("新计划的首次日期必须晚于已确认还款的日期");
                const schedule=generateDebtSchedule(-a.bal,firstDate,periods,fee);
                a.repayment={id:previous?.id||crypto.randomUUID(),mode,firstDate,periods,fee,schedule:[...paid,...schedule]};
            }else repayDebt(s,i,outstanding(s,a)[0].date,get("account"),get("actual"));
            if(await host.save()===false)throw Error("保存失败，输入已保留");render();host.onSaved?.();host.toast("已保存还款计划");
        }catch(error){Object.assign(s,snapshot);button.disabled=false;host.toast((error as Error).message,"error");}finally{busy=false;}
    };
    render();return {hasDraft:()=>busy||formKey()!==clean,refresh:render};
}
