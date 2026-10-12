import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  // One Solid for the demo and any linked package (e.g. a local solid-viewport).
  resolve: { dedupe: ["solid-js"] },
  build: {
    target: "esnext",
    copyPublicDir: true,
  },
});
