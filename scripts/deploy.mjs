import { existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { resolve, join, basename } from "path";

// 用法: node scripts/deploy.mjs <思源工作区路径>
// 作用: 把 dev/ 构建产物复制为 <工作区>/data/plugins/asset-steward 真实目录。
//
// 注意1: 不要用 junction/符号链接 —— 思源内核(Go)扫描插件目录时，
//        junction 的 DirEntry 既不算普通目录也不算 ModeSymlink，会被静默跳过。
// 注意2: 不用 fs.cpSync —— 本机托管版 Node 22 的递归 cpSync 存在静默失败问题
//        （无报错但文件未复制），因此这里用 copyFileSync 逐文件复制并自检。
// 注意3: 首次部署需在 data/storage/petal/petals.json 注册一次（已完成，无需重复）。
const workspace = process.argv[2] || process.env.SIYUAN_WORKSPACE;
if (!workspace) {
    console.error("用法: node scripts/deploy.mjs <思源工作区路径>  例: node scripts/deploy.mjs D:\\siyuan");
    process.exit(1);
}
const target = resolve(workspace, "data/plugins/asset-steward");
const src = resolve(process.cwd(), "dev");

if (!existsSync(src)) {
    console.error("dev 目录不存在，请先执行 npm run build");
    process.exit(1);
}

function copyDir(from, to) {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
        const s = join(from, name);
        const d = join(to, name);
        if (statSync(s).isDirectory()) {
            copyDir(s, d);
        } else {
            copyFileSync(s, d);
        }
    }
}

if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
}
copyDir(src, target);

// 部署自检
const mustHave = ["index.js", "index.css", "plugin.json"];
const missing = mustHave.filter(f => !existsSync(join(target, f)));
if (missing.length) {
    console.error("部署自检失败，缺少文件:", missing.join(", "));
    process.exit(1);
}
const deployed = statSync(join(target, "index.js"));
const built = statSync(join(src, "index.js"));
if (deployed.size !== built.size) {
    console.error(`部署自检失败: index.js 大小不一致 (部署 ${deployed.size} vs 构建 ${built.size})`);
    process.exit(1);
}
console.log("已部署并自检通过:", src, "->", target, `(index.js ${deployed.size} bytes)`);

// 注册自愈：确保 petals.json 里有本插件的条目（云同步可能被其他设备删掉）
const manifest = JSON.parse(readFileSync(join(src, "plugin.json"), "utf-8"));
const petalsPath = resolve(workspace, "data/storage/petal/petals.json");
if (existsSync(petalsPath)) {
    let petals = JSON.parse(readFileSync(petalsPath, "utf-8"));
    const entry = petals.find(p => p.name === manifest.name);
    if (!entry) {
        petals.push({
            name: manifest.name,
            displayName: manifest.displayName?.zh_CN || manifest.displayName?.default || manifest.name,
            version: manifest.version,
            enabled: true,
            incompatible: false,
            disabledInPublish: false,
            userDisabledInPublish: false,
            disallowInstall: false,
            js: "",
            css: "",
            i18n: null,
            kernel: { js: "", existed: false, incompatible: true },
        });
        writeFileSync(petalsPath, JSON.stringify(petals, null, "\t"));
        console.log("已重新注册到 petals.json（云同步会清除，属正常现象，每次部署会自动补回）");
    } else {
        console.log("petals.json 注册正常 (enabled:", entry.enabled + ")");
    }
}
console.log("下一步: 思源内重载界面（或重启）即可加载新构建。");
