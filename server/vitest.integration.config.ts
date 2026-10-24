import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        include: ["src/**/*.itest.ts"],
        testTimeout: 30_000,
        hookTimeout: 30_000,
        fileParallelism: false,
        env: { NODE_ENV: "test" },
    },
})
