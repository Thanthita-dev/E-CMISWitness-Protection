import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        // e2e/ holds Playwright specs — vitest must not collect them (`pnpm exec playwright test` runs those)
        exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    },
})
