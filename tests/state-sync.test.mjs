import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const { outputFiles } = await build({ entryPoints: ["src/state-sync.ts"], bundle: true, format: "esm", write: false });
const { StateSync, stateKey, SyncConflictError } = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
const seed = () => ({ accounts: [], txs: [], cats: { 支出: [["📦", "其他"]] }, subs: [], policies: [], loans: [], savings: [], warn: { pct: 80 }, snaps: [] });
const clone = obj => obj === null ? null : JSON.parse(JSON.stringify(obj));
function setup() {
    let remote = seed(), writes = 0, readFails = false, writeFails = false;
    const local = seed();
    const sync = new StateSync(local, async () => { if (readFails) throw Error("offline"); return clone(remote); }, async value => { if (writeFails) throw Error("offline"); remote = clone(value); writes++; });
    return { sync, local, get remote() { return remote; }, set remote(v) { remote = v; }, get writes() { return writes; }, failRead(v) { readFails = v; }, failWrite(v) { writeFails = v; } };
}
test("unchanged loads, saves and repeated sync events never write", async () => {
    const f = setup(); await f.sync.initialize();
    for (let i = 0; i < 100; i++) { assert.equal(await f.sync.save(), false); assert.equal(await f.sync.receive(() => true), "unchanged"); }
    assert.equal(f.writes, 0);
});
test("comparison ignores object key order but respects array order", () => {
    assert.equal(stateKey({ a: 1, b: 2 }), stateKey({ b: 2, a: 1 }));
    assert.notEqual(stateKey([1, 2]), stateKey([2, 1]));
});
test("one genuine edit writes once and duplicate saves are skipped", async () => {
    const f = setup(); await f.sync.initialize(); f.local.subs.push({ n: "synthetic", v: 10 });
    assert.equal(await f.sync.save(), true); assert.equal(await f.sync.save(), false);
    assert.equal(f.writes, 1); assert.equal(f.remote.subs[0].n, "synthetic");
});
test("sync updates data in place without a writeback", async () => {
    const f = setup(); await f.sync.initialize(); const identity = f.local;
    f.remote.subs.push({ n: "remote", v: 12 });
    assert.equal(await f.sync.receive(() => true), "applied"); assert.equal(f.local, identity);
    assert.equal(f.local.subs[0].n, "remote"); assert.equal(f.writes, 0); assert.equal(await f.sync.save(), false);
});
test("incoming changes defer while the form has a draft, then apply when idle", async () => {
    const f = setup(); await f.sync.initialize(); f.remote.subs.push({ n: "remote" });
    assert.equal(await f.sync.receive(() => false), "deferred"); assert.equal(f.local.subs.length, 0); assert.equal(f.sync.pending, true);
    assert.equal(await f.sync.receive(() => true), "applied"); assert.equal(f.sync.pending, false); assert.equal(f.writes, 0);
});
test("concurrent remote edit is never silently overwritten by a stale local save", async () => {
    const f = setup(); await f.sync.initialize(); f.local.subs.push({ n: "local" }); f.remote.subs.push({ n: "remote" });
    await assert.rejects(f.sync.save(), SyncConflictError); assert.equal(f.writes, 0);
    assert.equal(f.local.subs[0].n, "local"); assert.equal(f.remote.subs[0].n, "remote");
    assert.equal(await f.sync.receive(() => true), "deferred");
});
test("read failures and corrupt or deleted files preserve the current state", async () => {
    const f = setup(); await f.sync.initialize(); f.local.subs.push({ n: "local" });
    f.failRead(true); await assert.rejects(f.sync.save()); f.failRead(false);
    f.remote = null; await assert.rejects(f.sync.save()); await assert.rejects(f.sync.receive(() => true));
    f.remote = { invalid: true }; await assert.rejects(f.sync.reload());
    assert.equal(f.local.subs[0].n, "local"); assert.equal(f.writes, 0);
});
test("failed initialization disables saving instead of replacing the source with defaults", async () => {
    const f = setup(); f.failRead(true); await assert.rejects(f.sync.initialize());
    f.failRead(false); await assert.rejects(f.sync.save()); assert.equal(f.writes, 0);
});
test("failed writes remain retryable and are not marked saved", async () => {
    const f = setup(); await f.sync.initialize(); f.local.subs.push({ n: "retry" });
    f.failWrite(true); await assert.rejects(f.sync.save()); f.failWrite(false);
    assert.equal(await f.sync.save(), true); assert.equal(f.writes, 1);
});
test("save requests serialize and retain edits made while a write is in flight", async () => {
    let remote = seed(), release; const written = [];
    const local = seed();
    const sync = new StateSync(local, async () => clone(remote), async state => {
        if (!written.length) await new Promise(resolve => release = resolve);
        written.push(clone(state)); remote = clone(state);
    });
    await sync.initialize(); local.subs.push({ n: "first" }); const first = sync.save();
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    local.subs.push({ n: "second" }); const second = sync.save(); release(); await Promise.all([first, second]);
    assert.equal(written.length, 2); assert.deepEqual(remote.subs.map(s => s.n), ["first", "second"]);
});
test("new workspaces can create their first file, but subsequent deletion is protected", async () => {
    const f = setup(); f.remote = null; await f.sync.initialize(); f.local.subs.push({ n: "first" });
    assert.equal(await f.sync.save(), true); f.remote = null; f.local.subs.push({ n: "next" }); await assert.rejects(f.sync.save());
});
test("an existing remote copy of the desired state is acknowledged without rewriting", async () => {
    const f = setup(); await f.sync.initialize(); f.local.subs.push({ n: "same" }); f.remote = clone(f.local);
    assert.equal(await f.sync.save(), false); assert.equal(f.writes, 0); assert.equal(f.sync.pending, false);
});
