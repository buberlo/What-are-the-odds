import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    dir: "./test",
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
