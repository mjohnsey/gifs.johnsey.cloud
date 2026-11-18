import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("worker", () => {
  it("serves the SPA shell for /", async () => {
    const res = await SELF.fetch("https://stash.johnsey.cloud/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
