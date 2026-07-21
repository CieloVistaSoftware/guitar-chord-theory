import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1, // dev-server.spec.js manipulates the shared port-4000 server's state -- not safe to run alongside other files in parallel workers
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx http-server . -p 4000 -c-1',
    url: 'http://127.0.0.1:4000',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
