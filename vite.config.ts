import { defineConfig } from "vite";
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";

export default defineConfig({
  build: {
    outDir: "dev",
    emptyOutDir: true,
    lib: {
      entry: "src/index.ts",
      formats: ["cjs"],            // 思源以 CJS require 方式加载插件
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["siyuan"],        // 运行时由思源宿主注入
      output: {
        assetFileNames: "index[extname]",  // css 输出为 index.css（思源约定）
      },
    },
  },
  plugins: [
    {
      name: "copy-static",
      closeBundle() {
        for (const f of ["plugin.json", "README.md", "icon.png", "preview.png"]) {
          if (existsSync(f)) copyFileSync(f, "dev/" + f);
        }
        if (existsSync("i18n")) {
          // 注意：本机托管 Node 的 cpSync 递归会静默失败，必须逐文件复制
          mkdirSync("dev/i18n", { recursive: true });
          for (const f of readdirSync("i18n")) copyFileSync(`i18n/${f}`, `dev/i18n/${f}`);
        }
      },
    },
  ],
});
