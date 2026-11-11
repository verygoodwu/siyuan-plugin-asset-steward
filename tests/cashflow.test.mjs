import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compile = async file => { const r = await build({entryPoints:[file],bundle:true,format:'esm',write:false}); return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64')); };
const {housingSummary, parseSchedule, settle, monthDate} = await compile('src/cashflow.ts');
const {normalizeState,loanCalc} = await compile('src/state.ts');
const seed = () => normalizeState({accounts:[{name:'现金',g:'现金流',type:'现金',bal:10000}],txs:[],loans:[{cat:'房贷',n:'房子',total:360000,rate:2.9,method:'等额本金',months:360,paid:19,on:true,bankBalance:341000,schedule:parseSchedule('2026-12-01 1000 800')}],recurring:[{id:'rent',name:'收租',direction:'收入',amount:1500,housing:true,property:'房子',on:true},{id:'home',name:'租房',direction:'支出',amount:2000,housing:true,property:'',on:true}]});
test('现金流账户余额为负时仍可确认收入', () => {
    const state = seed();
    settle(state, 'expense', '现金', '2026-10-01', '支出', 10050, '计划支出');
    assert.equal(state.accounts[0].bal, -50);
    settle(state, 'income', '现金', '2026-10-01', '收入', 100, '计划收入');
    assert.equal(state.accounts[0].bal, 50);
});
test('银行账单按月汇总，缺失月份不借用其他月份；本金不算成本',()=>{
 const s=seed(), h=housingSummary(s,'2026-12'); assert.equal(h.gap,2300);assert.equal(h.cost,1300);assert.equal(h.principal,1000);assert.equal(h.missing,false);assert.equal(housingSummary(s,'2026-11').missing,true);
 s.recurring[0].on=false; assert.equal(housingSummary(s,'2026-12').gap,3800);
});
test('日期解析、月底截断和金额校验',()=>{assert.equal(monthDate('2027-02',31),'2027-02-28');for(const t of ['2026-02-30 1 2','2026-12-01 0 2','2026-12-01 1 -2','2026-12-01 1 2\n2026-12-01 1 2']) assert.throws(()=>parseSchedule(t));});
test('确认收付只记一笔，失败不影响账户，旧账本字段兼容',()=>{
 const s=seed();settle(s,'k','现金','2026-10-01','收入',1500,'收租');assert.equal(s.accounts[0].bal,11500);assert.equal(s.txs.length,1);assert.throws(()=>settle(s,'k','现金','2026-10-01','收入',1500,'收租'));assert.equal(s.accounts[0].bal,11500);
 assert.throws(()=>settle(s,'k2','现金','2099-01-01','支出',2000,'租房'));assert.equal(s.txs.length,1);assert.equal(normalizeState(s).recurring.length,2);
});
test('银行余额优先，零利率和结清不产生非法月供',()=>{const l=seed().loans[0];assert.equal(loanCalc(l).remainPrin,341000);assert.equal(loanCalc({...l,rate:0,method:'等额本息'}).M,360000/360);assert.equal(loanCalc({...l,paid:360}).M,0);});
