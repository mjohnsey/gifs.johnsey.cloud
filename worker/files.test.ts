import { applyD1Migrations, env, SELF } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertAlias, insertItem } from "./db";
import { isFilePath } from "./hosts";

const testEnv = env as unknown as {
  DB: D1Database;
  MEDIA: R2Bucket;
  TEST_MIGRATIONS: D1Migration[];
};
// Same bytes as test/fixtures/tiny.gif. The workers pool can't import binary files as bytes.
const gif = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);
const base = "https://stash.johnsey.cloud";

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await testEnv.DB.prepare("DELETE FROM items").run();
  await testEnv.MEDIA.put("gifs/bunk-smh.gif", gif);
  await insertItem(testEnv.DB, {
    shelf: "gifs",
    name: "bunk-smh",
    ext: "gif",
    key: "gifs/bunk-smh.gif",
    contentType: "image/gif",
    bytes: gif.byteLength,
    width: 1,
    height: 1,
    sha256: "x",
    posterKey: "posters/bunk-smh.webp",
    sourceUrl: null,
  });
  await insertAlias(testEnv.DB, "gifs", "smh", "bunk-smh");
});

async function bytesOf(res: Response) {
  return new Uint8Array(await res.arrayBuffer());
}

describe("file serving", () => {
  it("serves a gif with caching headers", async () => {
    const res = await SELF.fetch(`${base}/gifs/bunk-smh.gif`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(res.headers.get("etag")).toBeTruthy();
    expect(res.headers.get("content-length")).toBe(String(gif.byteLength));
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=86400");
    expect(await bytesOf(res)).toEqual(gif);
  });

  it("serves an alias without redirecting", async () => {
    const res = await SELF.fetch(`${base}/gifs/smh.gif`, { redirect: "manual" });
    expect(res.status).toBe(200);
    expect(await bytesOf(res)).toEqual(gif);
  });

  it("answers HEAD with headers and no body", async () => {
    const res = await SELF.fetch(`${base}/gifs/bunk-smh.gif`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(gif.byteLength));
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it("returns 304 for a matching If-None-Match", async () => {
    const first = await SELF.fetch(`${base}/gifs/bunk-smh.gif`);
    const etag = first.headers.get("etag")!;
    await first.arrayBuffer();
    const res = await SELF.fetch(`${base}/gifs/bunk-smh.gif`, {
      headers: { "if-none-match": etag },
    });
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe(etag);
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it("serves byte ranges with 206", async () => {
    const res = await SELF.fetch(`${base}/gifs/bunk-smh.gif`, {
      headers: { range: "bytes=0-9" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-9/${gif.byteLength}`);
    expect(res.headers.get("content-length")).toBe("10");
    expect(await bytesOf(res)).toEqual(gif.slice(0, 10));
  });

  it("serves suffix ranges", async () => {
    const res = await SELF.fetch(`${base}/gifs/bunk-smh.gif`, {
      headers: { range: "bytes=-5" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(
      `bytes ${gif.byteLength - 5}-${gif.byteLength - 1}/${gif.byteLength}`,
    );
    expect(await bytesOf(res)).toEqual(gif.slice(-5));
  });

  it("returns 416 for an unsatisfiable range", async () => {
    const res = await SELF.fetch(`${base}/gifs/bunk-smh.gif`, {
      headers: { range: "bytes=9999-10000" },
    });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe(`bytes */${gif.byteLength}`);
    const zero = await SELF.fetch(`${base}/gifs/bunk-smh.gif`, { headers: { range: "bytes=-0" } });
    expect(zero.status).toBe(416);
  });

  it("ignores a malformed Range and serves the whole file", async () => {
    const res = await SELF.fetch(`${base}/gifs/bunk-smh.gif`, { headers: { range: "bytes=abc" } });
    expect(res.status).toBe(200);
    expect(await bytesOf(res)).toEqual(gif);
  });

  it("returns 404 for unknown names and the wrong shelf", async () => {
    expect((await SELF.fetch(`${base}/gifs/nope.gif`)).status).toBe(404);
    expect((await SELF.fetch(`${base}/emoji/bunk-smh.gif`)).status).toBe(404);
    expect((await SELF.fetch(`${base}/gifs/bunk-smh.png`)).status).toBe(404);
  });

  it("returns 404 for invalid names", async () => {
    expect((await SELF.fetch(`${base}/gifs/Bunk-SMH.gif`)).status).toBe(404);
    expect((await SELF.fetch(`${base}/gifs/bunk--smh.gif`)).status).toBe(404);
    expect((await SELF.fetch(`${base}/gifs/%2e%2e.gif`)).status).toBe(404);
  });

  it("serves emoji with their own content type", async () => {
    await testEnv.MEDIA.put("emoji/party.png", gif);
    await insertItem(testEnv.DB, {
      shelf: "emoji",
      name: "party",
      ext: "png",
      key: "emoji/party.png",
      contentType: "image/png",
      bytes: gif.byteLength,
      width: 1,
      height: 1,
      sha256: "y",
      posterKey: null,
      sourceUrl: null,
    });
    const res = await SELF.fetch(`${base}/emoji/party.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("serves posters by key, and 404s when absent", async () => {
    await testEnv.MEDIA.put("posters/bunk-smh.webp", gif);
    const res = await SELF.fetch(`${base}/posters/bunk-smh.webp`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(await bytesOf(res)).toEqual(gif);
    expect((await SELF.fetch(`${base}/posters/other.webp`)).status).toBe(404);
  });
});

describe("isFilePath", () => {
  it("matches file URLs only", () => {
    for (const p of [
      "/inventory.json",
      "/gifs/a.gif",
      "/emoji/a.gif",
      "/emoji/a.png",
      "/emoji/a.jpg",
      "/posters/a.webp",
    ]) {
      expect(isFilePath(p), p).toBe(true);
    }
    for (const p of ["/", "/gifs", "/gifs/a.png", "/emoji/a.webp", "/posters/a.gif", "/api/items", "/gifs/a/b.gif"]) {
      expect(isFilePath(p), p).toBe(false);
    }
  });
});
