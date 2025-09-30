// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/schedule": "http://localhost:8000",
      "/scheduled": "http://localhost:8000",
      "/upload": "http://localhost:8000",
    },
  },
});


