import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/lucide")) {
            return "icon-vendor";
          }
          if (
            id.includes("node_modules/mermaid") ||
            id.includes("node_modules/@mermaid-js") ||
            id.includes("node_modules/cytoscape") ||
            id.includes("node_modules/d3") ||
            id.includes("node_modules/katex")
          ) {
            return "diagram-vendor";
          }
          if (id.includes("node_modules/@tiptap") || id.includes("node_modules/prosemirror")) {
            return "editor-vendor";
          }
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
