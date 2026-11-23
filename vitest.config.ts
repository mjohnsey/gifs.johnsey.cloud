import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    test: {
      projects: [
        {
          // Worker tests run inside the workers runtime.
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              // Tests run against a tiny fixture shell so they don't depend on `vite build`.
              miniflare: {
                // Pinned so a local .dev.vars (ADMIN_HOST=, DEV_BYPASS_ACCESS=1) never leaks into tests.
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  CANONICAL_ORIGIN: "https://stash.johnsey.cloud",
                  ADMIN_HOST: "stash.johnsey.cloud",
                  OLD_HOST: "gifs.johnsey.cloud",
                  ENVIRONMENT: "production",
                  DEV_BYPASS_ACCESS: "",
                },
                assets: {
                  directory: "./worker/test-assets",
                  binding: "ASSETS",
                  routerConfig: { invoke_user_worker_ahead_of_assets: true },
                  assetConfig: { not_found_handling: "single-page-application" },
                },
              },
            }),
          ],
          test: { name: "worker", include: ["worker/**/*.test.ts"] },
        },
        {
          // Config guards run in plain node.
          test: { name: "config", environment: "node", include: ["config/**/*.test.ts"] },
        },
        {
          // Migration/verification scripts run in plain node.
          test: { name: "scripts", environment: "node", include: ["scripts/**/*.test.ts"] },
        },
        {
          // Shared helpers and React UI run in jsdom.
          test: { name: "ui", environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
        },
      ],
    },
  };
});
