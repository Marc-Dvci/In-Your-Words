import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "web/test/e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 1440, height: 900 }, acceptDownloads: true },
  webServer: { command: "npm run build -w web && npm run preview -w web", url: "http://127.0.0.1:4173", reuseExistingServer: true, timeout: 120_000 },
});
