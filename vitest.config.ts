import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The "@/..." import alias from tsconfig.json, so tests can import route handlers and server modules.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
