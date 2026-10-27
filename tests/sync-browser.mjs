import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import("playwright-core");
let remote = { accounts: [], txs: [], subs: [], policies: [], loans: [], savings: [], snaps: [], warn: { pct: 80 }, cats: { 支出: [["📦", "其他"]], 收入: [["💼", "工资"]] } };
let writes = 0, readStatus = 200;
const checks = [], errors = [];
const host = `<!doctype html><html><head><link rel="stylesheet" href="/index.css"><style>html,body{margin:0;height:100%}#view{height:100%;width:100%}.dock__item{display:none}</style></head><body><div class="dock__item" data-type="assetDock"></div><div id="view"></div>
<script>
window.notices=[];window.tabs={};window.bars=[];window.siyuan={config:{readonly:false}};
class Plugin {
 constructor(){this.name='asset-steward';this.app={};}
 addIcons(){} addDock(){} addCommand(){} addTab(o){tabs[o.type]=o;}
 addTopBar(o){bars.push(o);}
 async saveData(n,value){return fetch('/mock-write',{method:'POST',body:JSON.stringify(value)}).then(r=>r.json());}
 onDataChanged(){}
}
const sdk={Plugin,showMessage:(msg)=>notices.push(msg),openTab:()=>tabs.assetFull.init.call({element:document.getElementById('view')}),Dialog:class {constructor(o){this.element=document.createElement('div');this.element.innerHTML=o.content;document.body.append(this.element);this.o=o;}destroy(){this.element.remove();this.o.destroyCallback?.();}}};
window.require=()=>sdk;window.module={exports:{}};window.sdk=sdk;
</script><script src="/index.js"></script><script>
(async()=>{window.plugin=new(module.exports.default||module.exports)();await plugin.onload();sdk.openTab();window.ready=true;})().catch(e=>window.bootError=String(e));
</script></body></html>`;
const server = createServer(async (req, res) => {
    try {
        const path = new URL(req.url, "http://localhost").pathname;
        res.setHeader("Cache-Control", "no-store");
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        if (path === "/api/file/getFile") { res.writeHead(readStatus, { "Content-Type": "application/json" }); res.end(JSON.stringify(remote)); return; }
        if (path === "/mock-write") { remote = JSON.parse(Buffer.concat(chunks)); writes++; res.end('{"code":0}'); return; }
        if (path === "/index.js" || path === "/index.css") { res.setHeader("Content-Type", path.endsWith("css") ? "text/css" : "text/javascript"); res.end(await readFile("dev" + path)); return; }
        res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(host);
    } catch(e) { res.writeHead(500).end(String(e)); }
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
await mkdir("reports", {recursive:true});
const browser = await chromium.launch({headless:true,executablePath:process.env.TEST_CHROME || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : chromium.executablePath())});
try {
    const page = await browser.newPage({viewport:{width:1100,height:800},timezoneId:"Asia/Shanghai"});
    page.on("pageerror", e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>window.ready || window.bootError);
    assert.equal(await page.evaluate(()=>window.bootError),undefined);
    assert.equal(writes,1); writes=0;
    assert.equal(await page.evaluate(()=>plugin.onDataChanged === sdk.Plugin.prototype.onDataChanged),false);
    checks.push("实现思源数据变化回调，首次快照保存后不再启动回写");
    await page.locator('[data-pg="plan"]').click();
    await page.evaluate(()=>window.originalInput=document.getElementById('as-sub-name'));
    for(let i=0;i<100;i++)await page.evaluate(()=>plugin.onDataChanged());
    assert.equal(writes,0);
    assert.equal(await page.evaluate(()=>originalInput===document.getElementById('as-sub-name')),true);
    checks.push("100次相同同步通知：零写盘、零表单重建");

    await page.locator('#as-sub-name').fill('未提交草稿');
    await page.locator('#as-sub-amt').fill('19');
    await page.setViewportSize({width:1000,height:800});
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#as-sub-name').inputValue(),'未提交草稿');
    assert.equal(await page.evaluate(()=>originalInput===document.getElementById('as-sub-name')),true);
    checks.push("容器变宽不会重建规划表单或清空输入");

    remote.subs.push({n:'其他设备同步项目',v:12,cyc:'每月',next:'2026-11-28',on:true});
    await page.evaluate(()=>plugin.onDataChanged());
    assert.equal(await page.locator('#as-sub-name').inputValue(),'未提交草稿');
    assert.equal(await page.evaluate(()=>originalInput===document.getElementById('as-sub-name')),true);
    assert.equal(await page.locator('.asm-sync-notice').count(),1);
    await page.locator('[data-act="addSub"]').click();
    assert.equal(writes,0); assert.equal(remote.subs.length,1);
    assert.equal(await page.locator('#as-sub-name').inputValue(),'未提交草稿');
    checks.push("有草稿时暂缓真实同步更新，阻止旧表单覆盖新账本并保留输入");
    page.once('dialog',d=>d.accept());
    await page.locator('.asm-sync-notice button').click();
    await page.waitForFunction(()=>!document.querySelector('.asm-sync-notice'));
    assert.equal(await page.locator('#as-sub-name').inputValue(),'');
    assert.ok((await page.locator('#as-p-plan').textContent()).includes('其他设备同步项目'));
    assert.equal(await page.locator('[data-pg="plan"]').getAttribute('class'),'active');
    assert.equal(writes,0);
    checks.push("明确加载更新后仍在原页签，新账本不回写");

    await page.locator('#as-sub-name').fill('本机新增项目');
    await page.locator('#as-sub-amt').fill('10');
    await page.locator('[data-act="addSub"]').click();
    await page.waitForFunction(()=>notices.every(n=>!n.includes('保存失败')));
    for(let i=0;i<50 && writes<1;i++)await page.waitForTimeout(20);
    assert.equal(writes,1); assert.equal(remote.subs.length,2);
    await page.evaluate(()=>plugin.onDataChanged()); assert.equal(writes,1);
    checks.push("实际新增只保存一次，再收到同步通知不重复写盘");

    remote.subs.push(...Array.from({length:18},(_,i)=>({n:'同步项目'+i,v:3,cyc:'每月',next:'2026-11-28',on:true})));
    await page.evaluate(()=>plugin.onDataChanged());
    await page.evaluate(()=>document.querySelector('.main').scrollTop=160);
    const scroll=await page.locator('.main').evaluate(e=>e.scrollTop);
    remote.subs[0].v=15;
    await page.evaluate(()=>plugin.onDataChanged());
    assert.equal(await page.locator('.main').evaluate(e=>e.scrollTop),scroll);
    assert.equal(writes,1);
    checks.push("空闲时真实数据就地刷新，保留页签及滚动位置");

    const latest=JSON.stringify(remote);
    await page.reload(); await page.waitForFunction(()=>window.ready);
    assert.equal(JSON.stringify(remote),latest); assert.equal(writes,1);
    checks.push("关闭重开无变化账本，不重复保存");
    readStatus=500;
    await page.reload(); await page.waitForFunction(()=>window.ready);
    await page.locator('[data-pg="plan"]').click();
    await page.locator('#as-sub-name').fill('读取失败时草稿');
    await page.locator('#as-sub-amt').fill('5');
    await page.locator('[data-act="addSub"]').click();
    assert.equal(writes,1); assert.equal(JSON.stringify(remote),latest);
    assert.equal(await page.locator('#as-sub-name').inputValue(),'读取失败时草稿');
    checks.push("启动读取失败时停止写入，原账本和草稿均保留");
    assert.deepEqual(errors,[]);
    await writeFile('reports/browser-sync-result.json',JSON.stringify({passed:checks.length,checks,errors},null,2));
    console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
} finally {await browser.close();await new Promise(r=>server.close(r));}
