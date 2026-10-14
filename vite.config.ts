import { defineConfig } from "vite";
import { existsSync, cpSync } from "fs";

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
        for (const f of ["plugin.json", "README.md", "icon.png"]) {
          if (existsSync(f)) cpSync(f, "dev/" + f);
        }
        if (existsSync("i18n")) cpSync("i18n", "dev/i18n", { recursive: true });
      },
    },
  ],
});
