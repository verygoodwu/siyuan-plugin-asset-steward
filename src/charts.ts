/* 资产管家 · 内置迷你图表（Canvas 手绘 + 悬浮提示，零依赖） */
import { CAT_COLORS } from "./state";

const INK = "#7a8595", LINE = "#e8ecf1", FONT = '12px "Microsoft YaHei"';

function prep(cv: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max((cv.parentElement?.clientWidth ?? 300) - 4, 10), h = +(cv.getAttribute("height") || 150);
    cv.width = Math.max(w * dpr, 10); cv.height = h * dpr;
    cv.style.width = w + "px"; cv.style.height = h + "px";
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("canvas 不可用");
    ctx.scale(dpr, dpr); ctx.font = FONT;
    return { ctx, w, h };
}

function nice(v: number) {
    return v >= 10000 ? (v / 10000).toFixed(v % 10000 ? 1 : 0) + "w" : v >= 1000 ? (v / 1000) + "k" : String(Math.round(v));
}

function yRange(arr: number[]): [number, number] {
    let mn = Math.min(...arr, 0), mx = Math.max(...arr, 1);
    const pad = (mx - mn) * 0.15 || 1; mn = Math.max(0, mn - pad); mx += pad;
    return [mn, mx];
}

export function drawLine(cv: HTMLCanvasElement, labels: string[], data: number[], tipLabels?: string[]) {
    const tips = tipLabels || labels;
    const { ctx, w, h } = prep(cv); const [mn, mx] = yRange(data);
    const L = 44, B = 22, pw = w - L - 10, ph = h - B - 12;
    const X = (i: number) => L + pw * (i / (labels.length - 1)), Y = (v: number) => 12 + ph * (1 - (v - mn) / (mx - mn));
    ctx.strokeStyle = LINE; ctx.fillStyle = INK; ctx.textAlign = "right";
    for (let k = 0; k <= 4; k++) {
        const v = mn + (mx - mn) * k / 4, y = Y(v);
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - 10, y); ctx.stroke();
        ctx.fillText("¥" + nice(v), L - 6, y + 4);
    }
    ctx.textAlign = "center"; labels.forEach((t, i) => { if (t) ctx.fillText(t, X(i), h - 6); });
    const grd = ctx.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, "rgba(59,130,246,.25)"); grd.addColorStop(1, "rgba(59,130,246,0)");
    ctx.beginPath(); data.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(0), Y(v)));
    ctx.strokeStyle = "#3b82f6"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.lineTo(X(data.length - 1), 12 + ph); ctx.lineTo(X(0), 12 + ph); ctx.closePath();
    ctx.fillStyle = grd; ctx.fill();
    data.forEach((v, i) => { ctx.beginPath(); ctx.arc(X(i), Y(v), 3.5, 0, 7); ctx.fillStyle = "#3b82f6"; ctx.fill(); });
    (cv as any)._hits = data.map((v, i) => ({ type: "dot", x: X(i), y: Y(v), r: 14, label: tips[i], value: v }));
}

export function drawDoughnut(cv: HTMLCanvasElement, labels: string[], data: number[], colors: string[]) {
    const { ctx, w, h } = prep(cv);
    const cx = w * 0.32, cy = h / 2, R = Math.min(cx, cy) - 10, r = R * 0.62;
    const total = data.reduce((a, b) => a + b, 0); let a0 = -Math.PI / 2;
    (cv as any)._hits = [];
    data.forEach((v, i) => {
        const a1 = a0 + Math.PI * 2 * v / total;
        ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.arc(cx, cy, r, a1, a0, true); ctx.closePath();
        ctx.fillStyle = colors[i]; ctx.fill();
        (cv as any)._hits.push({ type: "arc", cx, cy, R, r, a0, a1, label: labels[i], value: v, pct: (v / total * 100) });
        a0 = a1;
    });
    ctx.fillStyle = "#1c2430"; ctx.font = 'bold 14px "Microsoft YaHei"'; ctx.textAlign = "center";
    ctx.fillText("¥" + nice(total), cx, cy + 2); ctx.font = FONT;
    const lx = w * 0.58, lh = Math.min(20, (h - 10) / labels.length);
    labels.forEach((t, i) => {
        const y = 12 + i * lh + (lh - 12) / 2;
        ctx.fillStyle = colors[i]; ctx.fillRect(lx, y - 8, 10, 10);
        ctx.fillStyle = INK; ctx.textAlign = "left";
        ctx.fillText(t + " ¥" + nice(data[i]), lx + 16, y + 1);
    });
}

export function drawBars(cv: HTMLCanvasElement, labels: string[], ds: { label: string; data: number[]; color: string }[]) {
    const { ctx, w, h } = prep(cv);
    const all = ds.flatMap(d => d.data); const [mn, mx] = yRange(all);
    const L = 44, B = 22, pw = w - L - 10, ph = h - B - 12;
    const Y = (v: number) => 12 + ph * (1 - (v - mn) / (mx - mn));
    ctx.strokeStyle = LINE; ctx.fillStyle = INK; ctx.textAlign = "right";
    for (let k = 0; k <= 4; k++) {
        const v = mn + (mx - mn) * k / 4, y = Y(v);
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - 10, y); ctx.stroke();
        ctx.fillText("¥" + nice(v), L - 6, y + 4);
    }
    ctx.textAlign = "center";
    labels.forEach((t, i) => ctx.fillText(t, L + pw * (i + .5) / labels.length, h - 6));
    const gw = pw / labels.length, bw = Math.min(16, gw / (ds.length + 1));
    (cv as any)._hits = [];
    ds.forEach((d, di) => {
        ctx.fillStyle = d.color;
        d.data.forEach((v, i) => {
            const x = L + gw * i + gw / 2 - (ds.length * bw) / 2 + di * bw;
            const y = Y(v); ctx.beginPath();
            ctx.rect(x, y, bw, 12 + ph - y);
            if (y < 12 + ph) { ctx.fill(); (cv as any)._hits.push({ type: "rect", x, y, w: bw, h: 12 + ph - y, label: labels[i] + " · " + d.label, value: v }); }
        });
    });
    ctx.textAlign = "left"; let lx = L;
    ds.forEach(d => {
        ctx.fillStyle = d.color; ctx.fillRect(lx, 2, 10, 10);
        ctx.fillStyle = INK; ctx.fillText(d.label, lx + 14, 11); lx += ctx.measureText(d.label).width + 34;
    });
}

export function drawHBars(cv: HTMLCanvasElement, items: { label: string; value: number; color: string; pct?: number }[]) {
    const { ctx, w, h } = prep(cv);
    ctx.font = FONT;
    const max = Math.max(...items.map(i => i.value), 1);
    const rowH = h / Math.max(items.length, 1);
    const lx = 84, barMax = Math.max(w - lx - 70, 20);
    (cv as any)._hits = [];
    items.forEach((it, i) => {
        const y = i * rowH + rowH / 2;
        ctx.fillStyle = INK; ctx.textAlign = "left";
        ctx.fillText(it.label, 0, y + 4, lx - 10);
        const bw = Math.max(4, barMax * it.value / max), by = y - 9, bh = 18;
        ctx.fillStyle = it.color;
        ctx.beginPath(); ctx.rect(lx, by, bw, bh); ctx.fill();
        ctx.fillStyle = "#1c2430"; ctx.textAlign = "right";
        ctx.fillText("¥" + nice(it.value), w - 4, y + 4);
        (cv as any)._hits.push({ type: "rect", x: lx, y: by, w: Math.max(bw, 30), h: bh, label: it.label, value: it.value, pct: it.pct });
    });
}

const fmtFull = (v: number) => "¥" + Math.round(v).toLocaleString();

function chartTip(): HTMLElement {
    let tipEl = document.getElementById("asm-chart-tip");
    if (!tipEl) {
        tipEl = document.createElement("div");
        tipEl.id = "asm-chart-tip";
        tipEl.style.cssText = "position:fixed;display:none;pointer-events:none;z-index:9999;background:#1c2430;color:#fff;padding:6px 10px;border-radius:8px;font-size:12.5px;line-height:1.5;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap";
        document.body.appendChild(tipEl);
    }
    return tipEl;
}

export function bindChartHover(cv: HTMLCanvasElement) {
    if (!cv || (cv as any)._hoverBound) return;
    (cv as any)._hoverBound = true;
    cv.addEventListener("mousemove", e => {
        const hits = (cv as any)._hits || [];
        const rect = cv.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        let hit: any = null;
        for (const hpt of hits) {
            if (hpt.type === "dot" && Math.hypot(mx - hpt.x, my - hpt.y) <= hpt.r) { hit = hpt; break; }
            if (hpt.type === "rect" && mx >= hpt.x - 2 && mx <= hpt.x + hpt.w + 2 && my >= hpt.y - 4 && my <= hpt.y + hpt.h + 4) { hit = hpt; break; }
            if (hpt.type === "arc") {
                const dx = mx - hpt.cx, dy = my - hpt.cy, dist = Math.hypot(dx, dy);
                if (dist >= hpt.r * 0.55 && dist <= hpt.r + 4) {
                    let ang = Math.atan2(dy, dx); if (ang < -Math.PI / 2) ang += Math.PI * 2;
                    if (ang >= hpt.a0 && ang <= hpt.a1) { hit = hpt; break; }
                }
            }
        }
        const tip = chartTip();
        if (hit) {
            tip.innerHTML = (hit.pct != null)
                ? `<b>${hit.label}</b><br>${fmtFull(hit.value)} · 占比 ${hit.pct.toFixed(1)}%`
                : `<b>${hit.label}</b><br>${fmtFull(hit.value)}`;
            tip.style.display = "block";
            const tw = tip.offsetWidth, th = tip.offsetHeight;
            let px = e.clientX + 14, py = e.clientY - th - 10;
            if (px + tw > window.innerWidth - 8) px = e.clientX - tw - 14;
            if (py < 8) py = e.clientY + 16;
            tip.style.left = px + "px"; tip.style.top = py + "px";
            cv.style.cursor = "pointer";
        } else {
            tip.style.display = "none";
            cv.style.cursor = "default";
        }
    });
    cv.addEventListener("mouseleave", () => {
        const tip = document.getElementById("asm-chart-tip");
        if (tip) tip.style.display = "none";
        cv.style.cursor = "default";
    });
}

export { CAT_COLORS };
