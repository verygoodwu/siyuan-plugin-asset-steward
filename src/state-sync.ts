import { AppState, normalizeState, newSeedState } from "./state";

// Compare content rather than file timestamps or JSON property order.
export function stateKey(value: unknown): string {
    const stable = (item: any): any => Array.isArray(item) ? item.map(stable)
        : item && typeof item === "object"
            ? Object.fromEntries(Object.keys(item).sort().map(key => [key, stable(item[key])])) : item;
    return JSON.stringify(stable(value));
}

export class SyncConflictError extends Error {
    constructor() { super("其他设备已更新账本，本地内容已保留，请先处理同步更新"); }
}

export class StateSync {
    private baseline = "";
    private queue: Promise<unknown> = Promise.resolve();
    private initiallyMissing = false;
    pending = false;
    ready = false;
    constructor(readonly state: AppState, private read: () => Promise<unknown>, private write: (state: AppState) => Promise<void>) {}
    private serial<T>(task: () => Promise<T>): Promise<T> {
        const next = this.queue.then(task);
        this.queue = next.catch(() => undefined);
        return next;
    }
    private decode(value: unknown): AppState {
        if (value === null) return newSeedState();
        if (!value || typeof value !== "object" || Array.isArray(value)
            || !Array.isArray((value as any).accounts) || !Array.isArray((value as any).txs)) {
            throw new Error("账本读取异常，已停止写入以保留原文件");
        }
        return normalizeState(value);
    }
    private apply(state: AppState) {
        Object.assign(this.state, state);
        this.baseline = stateKey(state);
        this.pending = false;
        this.ready = true;
    }
    initialize() { return this.serial(async () => {
        const raw = await this.read(); this.initiallyMissing = raw === null; this.apply(this.decode(raw));
    }); }
    receive(canApply: () => boolean): Promise<"unchanged" | "deferred" | "applied"> {
        return this.serial(async () => {
            if (!this.ready) throw new Error("账本尚未成功加载");
            const raw = await this.read();
            if (raw === null && !this.initiallyMissing) throw new Error("账本文件已不存在，已保留当前内容");
            if (raw !== null) this.initiallyMissing = false;
            const remote = this.decode(raw);
            if (stateKey(remote) === this.baseline) { this.pending = false; return "unchanged"; }
            if (stateKey(this.state) !== this.baseline || !canApply()) { this.pending = true; return "deferred"; }
            this.apply(remote);
            return "applied";
        });
    }
    reload() { return this.serial(async () => {
        const raw = await this.read();
        if (raw === null && !this.initiallyMissing) throw new Error("账本文件已不存在，已保留当前内容");
        if (raw !== null) this.initiallyMissing = false;
        this.apply(this.decode(raw));
    }); }
    save(): Promise<boolean> {
        return this.serial(async () => {
            if (!this.ready) throw new Error("账本读取失败，已停止保存");
            const snapshot: AppState = JSON.parse(JSON.stringify(this.state));
            const desired = stateKey(snapshot);
            if (desired === this.baseline) return false;
            const rawRemote = await this.read();
            if (rawRemote === null && !this.initiallyMissing) throw new Error("账本文件已不存在，已停止保存");
            if (rawRemote !== null) this.initiallyMissing = false;
            const remote = stateKey(this.decode(rawRemote));
            if (remote === desired) { this.baseline = desired; this.pending = false; return false; }
            if (remote !== this.baseline) { this.pending = true; throw new SyncConflictError(); }
            await this.write(snapshot);
            if (stateKey(this.decode(await this.read())) !== desired) {
                this.pending = true;
                throw new SyncConflictError();
            }
            this.baseline = desired;
            this.initiallyMissing = false;
            this.pending = false;
            return true;
        });
    }
}

export async function readWorkspaceState(pluginName: string): Promise<unknown> {
    const response = await fetch("/api/file/getFile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: `/data/storage/petal/${pluginName}/data.json` }),
        cache: "no-store", signal: AbortSignal.timeout(15000)
    });
    if (response.status === 404) return null;
    if (!response.ok && response.status !== 202) throw new Error(`读取账本失败：HTTP ${response.status}`);
    const data = await response.json();
    if (response.status === 202 && data?.code === 404) return null;
    if (data?.code !== undefined) throw new Error(`读取账本失败：${data.code}`);
    return data;
}
