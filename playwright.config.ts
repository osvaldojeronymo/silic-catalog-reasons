import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI
const port = isCI ? 4173 : 5173

export default defineConfig({
  testDir: 'e2e',
  webServer: isCI
    ? {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: false
      }
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true
      },
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [['list'], ['html', { outputFolder: 'test-results/e2e' }]]
})
