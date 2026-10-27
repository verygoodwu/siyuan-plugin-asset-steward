import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
const seed = () => ({accounts:[{name:"现金",type:"现金",g:"现金流",bal:100},{name:"备用账户",type:"网络账户",g:"现金流",bal:200}],txs:[],subs:[],policies:[],loans:[],savings:[],snaps:[],warn:{pct:80},cats:{支出:[["📦","其他"]],收入:[["💼","工资"]]}});
let remote=seed(), writes=0, failRead=false, failWrite=false;
const checks=[],errors=[];
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/index.css"><style>html,body{height:100%;margin:0}#view{height:100%;width:100%}</style></head><body><div id="view"></div><script>
window.mode=new URLSearchParams(location.search).get('mode')||'mobile';window.tabs={};window.toolbar=[];window.bars=[];window.notices=[];
window.siyuan={config:{readonly:false},mobile:mode==='mobile'?{}:undefined};
class Plugin{constructor(){this.name='asset-steward';this.app={};}addIcons(){}addDock(){}addCommand(){}addTab(o){tabs[o.type]=o;}addTopBar(o){bars.push(o);}addToolbarItem(o){toolbar.push(o);}async saveData(n,value){return fetch('/mock-write',{method:'POST',body:JSON.stringify(value)}).then(r=>r.json());}onDataChanged(){}}
window.sdk={Plugin,getFrontend:()=>mode,showMessage:msg=>notices.push(msg),openTab:o=>tabs[o.custom.type].init.call({element:document.getElementById('view')}),Dialog:class{}};
window.require=()=>sdk;window.module={exports:{}};
</script><script src="/index.js"></script><script>(async()=>{window.plugin=new(module.exports.default||module.exports)();await plugin.onload();plugin.onLayoutReady();plugin.onLayoutReady();window.ready=true;})().catch(e=>window.bootError=String(e));</script></body></html>`;
const server=createServer(async(req,res)=>{
    try{
        const path=new URL(req.url,"http://localhost").pathname;res.setHeader("Cache-Control","no-store");
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        if(path==="/api/file/getFile"){res.writeHead(failRead?500:200,{"Content-Type":"application/json"});res.end(JSON.stringify(remote));return;}
        if(path==="/mock-write"){
            if(failWrite){res.writeHead(500).end('{"code":1}');return;}
            await new Promise(r=>setTimeout(r,60));remote=JSON.parse(Buffer.concat(chunks));writes++;res.end('{"code":0}');return;
        }
        if(path==="/index.js"||path==="/index.css"){res.setHeader("Content-Type",path.endsWith("css")?"text/css":"text/javascript");res.end(await readFile("dev"+path));return;}
        res.setHeader("Content-Type","text/html; charset=utf-8");res.end(html);
    }catch(e){res.writeHead(500).end(String(e));}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));await mkdir("reports",{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.TEST_CHROME||(process.platform==="win32"?"C:/Program Files/Google/Chrome/Application/chrome.exe":chromium.executablePath())});
try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,timezoneId:"Asia/Shanghai"});
    page.on("pageerror",e=>errors.push(e.message));
    const open=async(mode="mobile")=>{
        await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);await page.waitForFunction(()=>window.ready||window.bootError);
        assert.equal(await page.evaluate(()=>window.bootError),undefined);
        assert.equal(await page.evaluate(()=>toolbar.length),1);
        assert.equal(await page.evaluate(()=>bars.length),0);
        await page.evaluate(()=>toolbar[0].click());await page.waitForSelector('.asm-m');
    };
    const role=name=>page.locator(`[data-role="${name}"]`);
    const save=role("save");
    await open();assert.equal(writes,1);writes=0;
    checks.push("手机顶栏入口注册一次，布局回调不重复注册，使用独立手机界面");
    for(const width of [320,390,430]){
        await page.setViewportSize({width,height:844});
        assert.ok(await page.locator('.asm-m').evaluate(e=>e.scrollWidth<=e.clientWidth+2));
    }
    await page.setViewportSize({width:390,height:844});
    checks.push("320/390/430宽度无横向溢出，触屏页面可操作");
    await role("amt").fill('0');await save.click();assert.equal(writes,0);
    await role("acct").selectOption('备用账户');await role("amt").fill('12.5');await role("note").fill('午饭测试');
    await page.locator('[data-tab="dash"]').click();await page.locator('[data-tab="add"]').click();
    assert.equal(await role("acct").inputValue(),'备用账户');assert.equal(await role("amt").inputValue(),'12.5');
    checks.push("无效金额不保存；切换页签保留金额、备注和选中账户");
    await save.dblclick({delay:5});await page.waitForFunction(()=>document.querySelector('[data-role="amt"]').value==='');
    assert.equal(writes,1);assert.equal(remote.txs.length,1);assert.equal(remote.accounts[1].bal,187.5);assert.equal(remote.accounts[0].bal,100);
    assert.equal(remote.txs[0].a,'备用账户');assert.equal(remote.txs[0].v,-12.5);
    checks.push("支出只扣选中账户，快速重复点击不重复记账，成功后清空输入");
    await page.locator('[data-t="收入"]').click();await role("acct").selectOption('现金');await role("amt").fill('20');await role("note").fill('工资测试');
    await save.click();await page.waitForFunction(()=>document.querySelector('[data-role="amt"]').value==='');
    assert.equal(writes,2);assert.equal(remote.accounts[0].bal,120);assert.equal(remote.txs[0].v,20);assert.equal(remote.snaps.length,1);
    assert.equal(remote.snaps[0].v,307.5);
    await page.locator('[data-tab="dash"]').click();
    const stats=await role('stats').textContent();assert.ok(stats.includes('307.5')&&stats.includes('20')&&stats.includes('12.5'));
    checks.push("收入联动余额和每日快照，总览正确显示净资产及本月收支");
    await page.locator('[data-tab="txs"]').click();await role('search').fill('午饭');assert.equal(await role('txs').locator('.asm-m-tx').count(),1);
    assert.ok((await role('txs').textContent()).includes('午饭测试'));
    checks.push("手机流水按备注、分类和账户搜索，列表只读展示");
    await page.locator('[data-tab="add"]').click();await role('amt').fill('5');await role('note').fill('同步时保留草稿');
    await page.evaluate(()=>window.amountNode=document.querySelector('[data-role="amt"]'));
    for(let i=0;i<100;i++)await page.evaluate(()=>plugin.onDataChanged());
    assert.equal(writes,2);assert.equal(await page.evaluate(()=>amountNode===document.querySelector('[data-role="amt"]')),true);
    assert.equal(await role('note').inputValue(),'同步时保留草稿');
    remote.accounts[0].bal+=1;await page.evaluate(()=>plugin.onDataChanged());
    assert.equal(await page.locator('.asm-sync-notice').count(),1);await save.click();assert.equal(writes,2);assert.equal(await role('amt').inputValue(),'5');
    checks.push("100次相同通知不刷新；真实更新有草稿时延期，阻止旧账本覆盖");
    page.once('dialog',d=>d.accept());await page.locator('.asm-sync-notice button').click();await page.waitForFunction(()=>!document.querySelector('.asm-sync-notice'));
    assert.equal(await role('amt').inputValue(),'');assert.equal(await role('note').inputValue(),'');assert.equal(writes,2);
    checks.push("明确加载同步更新后清理草稿，不向远端重复回写");
    failWrite=true;const before=JSON.stringify(remote);await role('amt').fill('8');await role('note').fill('失败重试测试');await save.click();
    await page.waitForFunction(()=>!document.querySelector('[data-role="save"]').disabled);
    assert.equal(JSON.stringify(remote),before);assert.equal(await role('amt').inputValue(),'8');assert.equal(await role('note').inputValue(),'失败重试测试');
    failWrite=false;await save.click();await page.waitForFunction(()=>document.querySelector('[data-role="amt"]').value==='');
    assert.equal(writes,3);assert.equal(remote.txs.filter(tx=>tx.n==='失败重试测试').length,1);
    checks.push("保存失败保留表单并回滚内存，重试不产生重复流水");
    await page.locator('[data-tab="dash"]').click();await page.screenshot({path:'reports/mobile-overview.png'});
    await open('browser-mobile');assert.equal(writes,3);assert.equal(await page.locator('.asm-m').count(),1);
    checks.push("移动浏览器由官方前端类型识别，重开不重复保存");
    remote=seed();remote.accounts=[];await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>toolbar[0].click());
    const previousWrites=writes;await role('amt').fill('10');await save.click();assert.equal(writes,previousWrites);assert.equal(await role('noAcct').isVisible(),true);
    checks.push("无账户时显示说明并阻止写入");
    failRead=true;await page.reload();await page.waitForFunction(()=>window.ready);await page.evaluate(()=>toolbar[0].click());
    await role('amt').fill('9');await save.click();assert.equal(writes,previousWrites);
    checks.push("启动读取异常时手机端同样停止保存");
    assert.deepEqual(errors,[]);
    const result={passed:checks.length,checks,errors};await writeFile('reports/mobile-browser-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
