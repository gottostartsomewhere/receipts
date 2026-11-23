import { defineConfig } from "vite";
import { resolve } from "node:path";

const here = import.meta.dirname;

// Builds the MV3 extension into dist/. Static files (manifest, icons) come from public/.
export default defineConfig(({ mode }) => ({
  root: resolve(here, "src"),
  publicDir: resolve(here, "public"),
  envDir: here,
  build: {
    outDir: resolve(here, "dist"),
    emptyOutDir: true,
    target: "chrome120",
    sourcemap: mode === "development",
    modulePreload: false,
    rollupOptions: {
      input: {
        app: resolve(here, "src/app.html"),
        background: resolve(here, "src/background.ts"),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
      },
    },
  },
  preview: { port: 4173, strictPort: true },
}));
