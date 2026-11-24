import { defineConfig } from "vite";
import { resolve } from "node:path";

const here = import.meta.dirname;

// `vite build` makes the MV3 extension in dist/. `vite build --mode web` makes the hosted
// version in dist-web/: same app, no extension files, and App Check via reCAPTCHA instead of
// a debug token (see .env.web).
export default defineConfig(({ mode }) => {
  const web = mode === "web";
  return {
    root: resolve(here, "src"),
    publicDir: web ? false : resolve(here, "public"),
    envDir: here,
    build: {
      outDir: resolve(here, web ? "dist-web" : "dist"),
      emptyOutDir: true,
      target: "chrome120",
      sourcemap: mode === "development",
      modulePreload: false,
      rollupOptions: {
        input: {
          app: resolve(here, "src/app.html"),
          demo: resolve(here, "src/demo-shop.html"),
          ...(web ? {} : { background: resolve(here, "src/background.ts") }),
        } as Record<string, string>,
        output: {
          entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
        },
      },
    },
    preview: { port: 4173, strictPort: true },
  };
});
