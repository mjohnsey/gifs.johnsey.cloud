import { applyD1Migrations, env, SELF } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertAlias, insertItem } from "./db";
import { canonicalOrigin } from "./hosts";
import app from "./index";
import type { Env } from "./env";
import type { ItemsResponse } from "../src/shared/types";

const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const gif = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
const base = "https://stash.johnsey.cloud";
const old = "https://gifs.johnsey.cloud";

function row(shelf: "gifs" | "emoji", name: string, ext: "gif" | "png") {
  return {
    shelf,
    name,
    ext,
    key: `${shelf}/${name}.${ext}`,
    contentType: ext === "gif" ? "image/gif" : "image/png",
    bytes: gif.byteLength,
    width: 1,
    height: 1,
    sha256: name,
    posterKey: null,
    sourceUrl: null,
  };
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await testEnv.DB.prepare("DELETE FROM items").run();
  await testEnv.MEDIA.put("gifs/bunk-smh.gif", gif);
  await insertItem(testEnv.DB, row("gifs", "bunk-smh", "gif"));
  await insertAlias(testEnv.DB, "gifs", "smh", "bunk-smh");
  await insertItem(testEnv.DB, row("emoji", "party", "png"));
});

/** Calls the app directly so a test can supply different vars (the preview env). */
function fetchWith(vars: Partial<Env>, url: string, init?: RequestInit) {
  return app.fetch(new Request(url, init), { ...testEnv, ...vars });
}

describe("canonicalOrigin", () => {
  const url = new URL("https://x.workers.dev/api/items");
  it("uses CANONICAL_ORIGIN when set", () => {
    expect(canonicalOrigin({ CANONICAL_ORIGIN: base } as Env, url)).toBe(base);
  });
  it("falls back to the request origin when empty", () => {
    expect(canonicalOrigin({ CANONICAL_ORIGIN: "" } as Env, url)).toBe("https://x.workers.dev");
  });
});

describe("old host", () => {
  it("redirects the root", async () => {
    const res = await SELF.fetch(`${old}/`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${base}/`);
  });

  it("redirects page paths keeping path and query", async () => {
    const res = await SELF.fetch(`${old}/gifs/?q=smh`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${base}/gifs/?q=smh`);
    const admin = await SELF.fetch(`${old}/admin`, { redirect: "manual" });
    expect(admin.status).toBe(301);
    expect(admin.headers.get("location")).toBe(`${base}/admin`);
  });

  it("redirects API paths too", async () => {
    const res = await SELF.fetch(`${old}/api/items`, { redirect: "manual" });
    expect(res.status).toBe(301);
  });

  it("serves files directly", async () => {
    const res = await SELF.fetch(`${old}/gifs/smh.gif`, { redirect: "manual" });
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(gif);
    const inv = await SELF.fetch(`${old}/inventory.json`, { redirect: "manual" });
    expect(inv.status).toBe(200);
    await inv.arrayBuffer();
  });
});

describe("SPA pages on the canonical host", () => {
  for (const path of ["/gifs/", "/emoji/", "/admin"]) {
    it(`serves the shell for ${path}`, async () => {
      const res = await SELF.fetch(`${base}${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      await res.arrayBuffer();
    });
  }
});

describe("inventory.json", () => {
  it("lists every gif and alias with sorted keys, gifs only", async () => {
    const res = await SELF.fetch(`${base}/inventory.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const text = await res.text();
    expect(text.replace(/\s/g, "")).toBe('{"gifs":{"bunk-smh":"gifs/bunk-smh.gif","smh":"gifs/smh.gif"}}');
    expect(JSON.parse(text)).toEqual({
      gifs: { "bunk-smh": "gifs/bunk-smh.gif", smh: "gifs/smh.gif" },
    });
  });
});

describe("/api/items", () => {
  it("returns items with the production canonical origin", async () => {
    const res = await SELF.fetch(`${base}/api/items`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ItemsResponse;
    expect(body.canonicalOrigin).toBe(base);
    expect(body.adminAvailable).toBe(true);
    expect(body.items.map((i) => i.name).sort()).toEqual(["bunk-smh", "party"]);
    expect(body.items.find((i) => i.name === "bunk-smh")!.aliases).toEqual(["smh"]);
  });

  it("filters by shelf", async () => {
    const body = (await (await SELF.fetch(`${base}/api/items?shelf=emoji`)).json()) as ItemsResponse;
    expect(body.items.map((i) => i.name)).toEqual(["party"]);
  });

  it("rejects an unknown shelf", async () => {
    const res = await SELF.fetch(`${base}/api/items?shelf=bogus`);
    expect(res.status).toBe(400);
    await res.arrayBuffer();
  });

  it("uses the request origin and offers admin in the preview env", async () => {
    const res = await fetchWith(
      { CANONICAL_ORIGIN: "", ADMIN_HOST: "" },
      "https://stash-preview.example.workers.dev/api/items",
    );
    const body = (await res.json()) as ItemsResponse;
    expect(body.canonicalOrigin).toBe("https://stash-preview.example.workers.dev");
    expect(body.adminAvailable).toBe(true);
  });

  it("adminAvailable is false on a host other than ADMIN_HOST", async () => {
    const res = await fetchWith({}, "https://other.example.com/api/items");
    const body = (await res.json()) as ItemsResponse;
    expect(body.adminAvailable).toBe(false);
  });
});
