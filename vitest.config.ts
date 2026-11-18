import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
  test: {
    include: ["worker/**/*.test.ts"],
  },
});
