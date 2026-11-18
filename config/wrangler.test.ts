import { readFileSync } from "node:fs";
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

describe("wrangler.jsonc production", () => {
  const { rawConfig } = experimental_readRawConfig({ config: "./wrangler.jsonc" });

  it("is pinned to the production admin host and environment", () => {
    expect(rawConfig.vars?.ADMIN_HOST).toBe("stash.johnsey.cloud");
    expect(rawConfig.vars?.ENVIRONMENT).toBe("production");
  });

  it("never mentions the Access bypass, in any environment", () => {
    expect(readFileSync("./wrangler.jsonc", "utf8")).not.toContain("DEV_BYPASS_ACCESS");
  });
});
