import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 12_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    // Behavior checks use a bounded raster size in SwiftShader. The reference
    // captures explicitly set 1680px; viewport coverage remains separate.
    viewport: { width: 800, height: 700 },
    screenshot: 'only-on-failure',
    // Continuous trace screenshots compete with SwiftShader on the two CPU budget.
    // Keep DOM/action traces; explicit review captures and videos supply images.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
