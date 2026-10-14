/* 资产管家 · 数据层：类型、常量、种子数据、状态读写 */

export interface Tx { d: string; t: "支出" | "收入"; c: string; a: string; n: string; v: number; }
export interface Acct { name: string; type: string; g: string; bal: number; limit?: number; cap?: number; }
export interface Sub { n: string; v: number; cyc: string; next: string; on: boolean; cat?: string; }
export interface Pol { n: string; v: number; cyc: string; next: string; years: string; on: boolean; }
export interface Loan { cat: string; n: string; total: number; rate: number; method: string; months: number; paid: number; on: boolean; }
export interface Saving { n: string; target: number; saved: number; monthly: number; rate: number; acct: string; deadline: string; }
export interface Snap { d: string; v: number; }

export interface AppState {
    accounts: Acct[];
    txs: Tx[];
    cats: Record<string, [string, string][]>;
    subs: Sub[];
    policies: Pol[];
    loans: Loan[];
    savings: Saving[];
    warn: { pct: number; delSkip?: string };
    snaps: Snap[];
}

export const STORAGE_NAME = "data.json";
export const BUDGET = 6000; // 月预算（后续可在设置中改）

export const GROUPS: [string, string][] = [
    ["现金流", "💧"], ["投资资产", "📈"], ["固定资产", "🏠"], ["贵重物品", "💎"], ["负债", "🔻"],
];

export const DEF_CATS: Record<string, [string, string][]> = {
    "支出": [["🍜", "餐饮"], ["🚇", "交通"], ["🏠", "房租"], ["🚿", "水电"], ["🛒", "日用"], ["📱", "数码"], ["🎮", "娱乐"], ["💊", "医疗"], ["📚", "学习"], ["✈️", "旅行"], ["🚗", "车辆"], ["👶", "育儿"], ["🐾", "宠物"], ["📦", "其他"]],
    "收入": [["💼", "工资"], ["📈", "理财收益"], ["🎁", "红包"], ["💼", "副业"], ["🏠", "租金收入"], ["↩️", "退款入账"], ["🎁", "礼金"], ["📦", "其他"]],
};

export const BANKS = ["招商银行", "工商银行", "建设银行", "农业银行", "中国银行", "交通银行", "邮储银行", "中信银行", "浦发银行", "民生银行", "平安银行", "广发银行", "兴业银行", "支付宝", "微信", "自定义"];

export const ACCT_TYPES: Record<string, { g: string; credit?: boolean }> = {
    "借记卡": { g: "现金流" }, "信用卡": { g: "现金流", credit: true }, "现金": { g: "现金流" },
    "网络账户": { g: "现金流" }, "余额宝": { g: "现金流" },
    "基金": { g: "投资资产" }, "贵金属": { g: "投资资产" }, "股票": { g: "投资资产" },
    "房产": { g: "固定资产" }, "车辆": { g: "固定资产" },
    "电子产品": { g: "贵重物品" }, "珠宝手表": { g: "贵重物品" },
    "花呗": { g: "负债", credit: true }, "京东白条": { g: "负债", credit: true }, "借呗": { g: "负债", credit: true },
    "京东金条": { g: "负债", credit: true }, "微粒贷": { g: "负债", credit: true }, "美团月付": { g: "负债", credit: true },
    "抖音月付": { g: "负债", credit: true }, "分期乐": { g: "负债", credit: true }, "招联金融": { g: "负债", credit: true },
    "其他借贷": { g: "负债", credit: true },
};

export const CREDIT_WORDS = ["信用卡", "花呗", "白条", "贷款", "借呗", "分期", "消费信贷"];
export const CAT_EMOJIS = ["🍜", "🚇", "🏠", "🛒", "📱", "🎮", "💊", "📚", "✈️", "🚗", "👶", "🐾", "📦", "💰", "💼", "📈", "🎁", "↩️", "🧾", "☕", "🍺", "🎬", "👗", "💄", "⚽", "🪒", "🔧", "💧", "🀄", "🎤", "🖼️", "🐱", "🐶", "🚲", "🛠️", "🧧", "📤", "🪙", "🎓", "🏥", "💡", "🌐", "📋", "🔒"];
export const CAT_COLORS = ["#3b82f6", "#f59e0b", "#22c55e", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b", "#14b8a6", "#a855f7"];
export const CAT_TIPS: Record<string, string> = {
    "餐饮": "减少外卖/外食频次，或给每餐设预算",
    "娱乐": "设置娱乐月度上限，超出部分次月扣减",
    "数码": "大件先放愿望单冷静 7 天再决定",
    "购物": "列购物清单，非清单商品 24 小时后再买",
    "交通": "高频打车可换成地铁/公交组合",
    "旅行": "按季度规划旅行预算，避免临时起意",
    "学习": "优先消化已购课程，再考虑新的投入",
};

function dstr(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
export function today(offsetDays = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return dstr(d);
}

/* 正式版：出厂零数据，用户从空白开始（资产页添加账户 → 记账 → 规划） */
function seedState(): AppState {
    return {
        accounts: [],
        txs: [],
        cats: JSON.parse(JSON.stringify(DEF_CATS)),
        subs: [],
        policies: [],
        loans: [],
        savings: [],
        warn: { pct: 80 },
        snaps: [],
    };
}

/** 合并已保存数据与默认结构（兼容旧版/增量字段） */
export function normalizeState(saved: any): AppState {
    const def = seedState();
    if (!saved || typeof saved !== "object") return def;
    const s: any = def;
    for (const k of ["accounts", "txs", "subs", "policies", "loans", "savings", "snaps"]) {
        if (Array.isArray(saved[k]) && saved[k].length) s[k] = saved[k];
        else if (Array.isArray(saved[k])) s[k] = saved[k]; // 显式空数组也尊重
    }
    if (saved.cats && saved.cats["支出"]) s.cats = saved.cats;
    if (saved.warn && typeof saved.warn.pct === "number") s.warn = saved.warn;
    return s as AppState;
}

export function newSeedState(): AppState {
    return seedState();
}

/* ---------- 共用计算 ---------- */
export function isCredit(t: string): boolean {
    return !!(ACCT_TYPES[t] && ACCT_TYPES[t].credit) || CREDIT_WORDS.some(w => (t || "").includes(w));
}

export function groupTypes(g: string): string[] {
    const opts = Object.keys(ACCT_TYPES).filter(k => ACCT_TYPES[k].g === g);
    opts.push("自定义");
    return opts.length ? opts : ["网络账户", "自定义"];
}

export function subMonthly(v: number, cyc: string): number {
    return cyc === "每年" ? v / 12 : cyc === "每周" ? v * 52 / 12 : v;
}

export function daysLeft(ds: string): number {
    return Math.ceil((new Date(ds).getTime() - new Date(today()).getTime()) / 86400000);
}

export function loanCalc(l: Loan): { M: number; dec: number; remainPrin: number; remainInt: number } {
    const r = l.rate / 100 / 12;
    if (l.method === "等额本金") {
        const mp = l.total / l.months;
        const remainPrin = Math.max(0, l.total - mp * l.paid);
        const nextPay = mp + remainPrin * r;
        let ri = 0;
        for (let k = l.paid; k < l.months; k++) ri += (l.total - mp * k) * r;
        return { M: nextPay, dec: mp * r, remainPrin, remainInt: Math.max(0, ri) };
    }
    const M = l.total * r * Math.pow(1 + r, l.months) / (Math.pow(1 + r, l.months) - 1);
    const remainPrin = l.total * (Math.pow(1 + r, l.months) - Math.pow(1 + r, l.paid)) / (Math.pow(1 + r, l.months) - 1);
    const remainInt = M * (l.months - l.paid) - remainPrin;
    return { M, dec: 0, remainPrin, remainInt };
}

export function estInterest(s: Saving): number {
    if (!(s.rate > 0) || !(s.monthly > 0)) return 0;
    const remain = s.target - s.saved;
    if (remain <= 0) return 0;
    const n = Math.ceil(remain / s.monthly), r = s.rate / 100 / 12;
    let bal = s.saved;
    for (let k = 0; k < n; k++) bal = bal * (1 + r) + s.monthly;
    return Math.max(0, bal - s.saved - s.monthly * n);
}
