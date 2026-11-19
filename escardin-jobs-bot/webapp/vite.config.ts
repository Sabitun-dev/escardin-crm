// Builds the Mini App into public/app/ (served at https://YOUR-SITE/app/).
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/app/",
  plugins: [react()],
  build: {
    outDir: "../public/app",
    emptyOutDir: true,
    target: "es2019", // old Android phones
    cssTarget: "chrome70",
    chunkSizeWarningLimit: 400,
  },
  server: { fs: { allow: [".."] } },
});
