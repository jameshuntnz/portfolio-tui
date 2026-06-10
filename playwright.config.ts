/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    webServer: {
        command: 'pnpm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: 'http://localhost:5173',
            },
        },
    ],
});
