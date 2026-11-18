import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Worker tests run inside the workers runtime.
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            // Tests run against a tiny fixture shell so they don't depend on `vite build`.
            miniflare: {
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
    ],
  },
});
