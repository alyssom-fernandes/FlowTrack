import { defineConfig, devices } from '@playwright/test'

// Roda contra um build local na demonstração (dados no navegador, sem servidor).
// Para testar outro endereço: E2E_BASE_URL=https://... npm run e2e
const externo = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: externo || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: externo ? undefined : {
    command: 'npm --prefix frontend run build && npm --prefix frontend run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/login',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'celular', use: { ...devices['Pixel 5'] } },
  ],
})
