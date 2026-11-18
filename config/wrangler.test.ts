import { experimental_readRawConfig } from "wrangler";
import { describe, expect, it } from "vitest";

// Guards against the preview Worker inheriting production routes/hosts.
describe("wrangler.jsonc preview env", () => {
  const { rawConfig } = experimental_readRawConfig({ config: "./wrangler.jsonc" });
  const preview = rawConfig.env?.preview;

  it("has no routes (must override production's)", () => {
    expect(preview?.routes).toEqual([]);
  });

  it("uses the request's own host and origin", () => {
    expect(preview?.vars?.ADMIN_HOST).toBe("");
    expect(preview?.vars?.CANONICAL_ORIGIN).toBe("");
  });
});
