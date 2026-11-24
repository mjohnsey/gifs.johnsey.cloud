import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./index";
import type { Env } from "./env";
import type { Item } from "../src/shared/types";
import { gifBytes, mp4Bytes, pngBytes, webpExtendedBytes, webpLossyBytes, jpgBytes } from "./fixtures";

const testEnv = env as unknown as Env & { TEST_MIGRATIONS: D1Migration[] };
const dev: Partial<Env> = { ENVIRONMENT: "development", DEV_BYPASS_ACCESS: "1", ADMIN_HOST: "stash.johnsey.cloud" };
const base = "https://stash.johnsey.cloud";
const VIDEO = "That's a video, not a gif. Try the Giphy or Tenor version, or upload a gif.";

function call(path: string, init?: RequestInit, vars: Partial<Env> = dev) {
  return app.fetch(new Request(`${base}${path}`, init), { ...testEnv, ...vars });
}

function form(fields: Record<string, string | { bytes: Uint8Array; type: string; filename: string }>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string") fd.set(k, v);
    else fd.set(k, new File([v.bytes], v.filename, { type: v.type }));
  }
  return fd;
}

const gifFile = (w = 3, h = 2) => ({ bytes: gifBytes(w, h), type: "image/gif", filename: "x.gif" });

function post(fields: Parameters<typeof form>[0]) {
  return call("/api/admin/items", { method: "POST", body: form(fields) });
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await testEnv.DB.prepare("DELETE FROM items").run();
  const { objects } = await testEnv.MEDIA.list();
  await testEnv.MEDIA.delete(objects.map((o) => o.key));
});

afterEach(() => vi.restoreAllMocks());

describe("items", () => {
  it("is locked without access", async () => {
    const res = await call("/api/admin/recent", undefined, { ENVIRONMENT: "production" });
    expect(res.status).toBe(401);
  });

  it("saves gif and serves it", async () => {
    const res = await post({ file: gifFile(), shelf: "gifs", name: "robot" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { item: Item; url: string };
    expect(body.url).toBe("https://stash.johnsey.cloud/gifs/robot.gif");
    expect(body.item).toMatchObject({ shelf: "gifs", name: "robot", ext: "gif", width: 3, height: 2 });
    const served = await call("/gifs/robot.gif");
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/gif");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(gifBytes(3, 2));
  });

  it("saves emoji png and jpg", async () => {
    const png = await post({
      file: { bytes: pngBytes(4, 4), type: "image/png", filename: "a.png" },
      shelf: "emoji",
      name: "party",
    });
    expect(png.status).toBe(201);
    expect(((await png.json()) as { url: string }).url).toBe(`${base}/emoji/party.png`);
    const jpg = await post({
      file: { bytes: jpgBytes(4, 4), type: "image/jpeg", filename: "a.jpg" },
      shelf: "emoji",
      name: "cheers",
    });
    expect(((await jpg.json()) as { url: string }).url).toBe(`${base}/emoji/cheers.jpg`);
  });

  it("rejects png on gifs shelf", async () => {
    const res = await post({
      file: { bytes: pngBytes(4, 4), type: "image/png", filename: "a.png" },
      shelf: "gifs",
      name: "nope",
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Only GIFs can go on the gifs shelf." });
  });

  it("rejects webp on gifs shelf with the gifs-only copy", async () => {
    const res = await post({
      file: { bytes: webpLossyBytes(4, 4), type: "image/webp", filename: "a.webp" },
      shelf: "gifs",
      name: "nope",
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Only GIFs can go on the gifs shelf." });
  });

  it("rejects webp for emoji (Slack accepts JPG, PNG, GIF)", async () => {
    const res = await post({
      file: { bytes: webpLossyBytes(4, 4), type: "image/webp", filename: "a.webp" },
      shelf: "emoji",
      name: "nope",
    });
    expect(res.status).toBe(422);
  });

  it("rejects mp4 with exact copy", async () => {
    const res = await post({
      file: { bytes: mp4Bytes(), type: "video/mp4", filename: "a.mp4" },
      shelf: "gifs",
      name: "clip",
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: VIDEO });
    expect((await testEnv.MEDIA.list()).objects).toHaveLength(0);
  });

  it("rejects unknown bytes", async () => {
    const res = await post({
      file: { bytes: Uint8Array.from([1, 2, 3, 4]), type: "image/gif", filename: "a.gif" },
      shelf: "gifs",
      name: "junk",
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "That isn't an image I can use." });
  });

  it("400 on an invalid name", async () => {
    const res = await post({ file: gifFile(), shelf: "gifs", name: "Robot" });
    expect(res.status).toBe(400);
  });

  it("400 on a missing file or bad shelf", async () => {
    expect((await post({ shelf: "gifs", name: "robot" })).status).toBe(400);
    expect((await post({ file: gifFile(), shelf: "nope", name: "robot" })).status).toBe(400);
  });

  it("413 over 25 MB", async () => {
    const big = new Uint8Array(26_214_401);
    big.set(gifBytes(1, 1));
    const res = await post({
      file: { bytes: big, type: "image/gif", filename: "big.gif" },
      shelf: "gifs",
      name: "big",
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "That file is over 25 MB." });
  });

  it("409 on taken name or alias", async () => {
    await post({ file: gifFile(), shelf: "gifs", name: "bunk-smh", aliases: "smh" });
    const name = await post({ file: gifFile(), shelf: "gifs", name: "bunk-smh" });
    expect(name.status).toBe(409);
    expect(await name.json()).toEqual({ error: "bunk-smh is already taken." });
    const asName = await post({ file: gifFile(), shelf: "gifs", name: "smh" });
    expect(asName.status).toBe(409);
    const asAlias = await post({ file: gifFile(), shelf: "gifs", name: "other", aliases: "fine,smh" });
    expect(asAlias.status).toBe(409);
    expect(await asAlias.json()).toEqual({ error: "smh is already taken." });
    // Pre-check means nothing was written.
    expect((await call("/gifs/other.gif")).status).toBe(404);
    expect((await call("/gifs/fine.gif")).status).toBe(404);
  });

  it("aliases saved", async () => {
    const res = await post({ file: gifFile(), shelf: "gifs", name: "shaking", aliases: " smh , shaking-head ,," });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { item: Item };
    expect(body.item.aliases).toEqual(["shaking-head", "smh"]);
    expect((await call("/gifs/smh.gif")).status).toBe(200);
  });

  it("400 on a bad or repeated alias", async () => {
    expect((await post({ file: gifFile(), shelf: "gifs", name: "a", aliases: "Bad Name" })).status).toBe(400);
    expect((await post({ file: gifFile(), shelf: "gifs", name: "a", aliases: "x,x" })).status).toBe(400);
    expect((await post({ file: gifFile(), shelf: "gifs", name: "a", aliases: "a" })).status).toBe(400);
  });

  it("poster stored at posters/<name>.webp", async () => {
    const res = await post({
      file: gifFile(),
      shelf: "gifs",
      name: "robot",
      poster: { bytes: webpLossyBytes(3, 2), type: "image/webp", filename: "p.webp" },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { item: Item };
    expect(body.item.posterPath).toBe("/posters/robot.webp");
    expect(await testEnv.MEDIA.head("posters/robot.webp")).not.toBeNull();
    const served = await call("/posters/robot.webp");
    expect(served.status).toBe(200);
    await served.arrayBuffer();
  });

  it("accepts a jpeg poster, stores it as posters/<name>.jpg and serves it", async () => {
    const res = await post({
      file: gifFile(),
      shelf: "gifs",
      name: "robot",
      poster: { bytes: jpgBytes(3, 2), type: "image/jpeg", filename: "p.jpg" },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { item: Item };
    expect(body.item.posterPath).toBe("/posters/robot.jpg");
    const stored = await testEnv.MEDIA.head("posters/robot.jpg");
    expect(stored?.httpMetadata?.contentType).toBe("image/jpeg");
    expect(await testEnv.MEDIA.head("posters/robot.webp")).toBeNull();
    const served = await call("/posters/robot.jpg");
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(jpgBytes(3, 2));
  });

  it("deletes a jpeg poster along with the item", async () => {
    await post({
      file: gifFile(),
      shelf: "gifs",
      name: "robot",
      poster: { bytes: jpgBytes(3, 2), type: "image/jpeg", filename: "p.jpg" },
    });
    expect(await testEnv.MEDIA.head("posters/robot.jpg")).not.toBeNull();
    const res = await call("/api/admin/items/gifs/robot", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await testEnv.MEDIA.head("posters/robot.jpg")).toBeNull();
    expect(await testEnv.MEDIA.head("gifs/robot.gif")).toBeNull();
  });

  it("ignores a poster that isn't webp, and any poster on emoji", async () => {
    const bad = await post({
      file: gifFile(),
      shelf: "gifs",
      name: "robot",
      poster: { bytes: pngBytes(3, 2), type: "image/webp", filename: "p.webp" },
    });
    expect(bad.status).toBe(201);
    expect(((await bad.json()) as { item: Item }).item.posterPath).toBeNull();
    expect(await testEnv.MEDIA.head("posters/robot.webp")).toBeNull();
    const emoji = await post({
      file: { bytes: pngBytes(4, 4), type: "image/png", filename: "a.png" },
      shelf: "emoji",
      name: "party",
      poster: { bytes: webpLossyBytes(3, 2), type: "image/webp", filename: "p.webp" },
    });
    expect(((await emoji.json()) as { item: Item }).item.posterPath).toBeNull();
    expect(await testEnv.MEDIA.head("posters/party.webp")).toBeNull();
  });

  it("removes R2 objects when the D1 insert fails", async () => {
    const realPrepare = testEnv.DB.prepare.bind(testEnv.DB);
    const spy = vi.spyOn(testEnv.DB, "prepare").mockImplementation((sql: string) => {
      if (sql.trimStart().startsWith("INSERT")) throw new Error("boom");
      return realPrepare(sql);
    });
    const res = await post({
      file: gifFile(),
      shelf: "gifs",
      name: "robot",
      poster: { bytes: webpLossyBytes(3, 2), type: "image/webp", filename: "p.webp" },
    });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Something went wrong." });
    expect((await testEnv.MEDIA.list()).objects).toHaveLength(0);
  });
});

describe("create race", () => {
  it("keeps the winner's R2 object when insertItem loses the race", async () => {
    // The winner lands after our nameTaken pre-check: hide the row from that check only.
    await testEnv.MEDIA.put("gifs/robot.gif", gifBytes(9, 9));
    await testEnv.DB.prepare(
      `INSERT INTO items (shelf, name, ext, key, content_type, bytes, width, height, sha256)
       VALUES ('gifs','robot','gif','gifs/robot.gif','image/gif',1,9,9,'w')`,
    ).run();
    const realPrepare = testEnv.DB.prepare.bind(testEnv.DB);
    const spy = vi.spyOn(testEnv.DB, "prepare").mockImplementation((sql: string) => {
      if (sql.includes("AS taken")) {
        return { bind: () => ({ first: async () => null }) } as unknown as D1PreparedStatement;
      }
      return realPrepare(sql);
    });
    const res = await post({ file: gifFile(3, 2), shelf: "gifs", name: "robot" });
    spy.mockRestore();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "robot is already taken." });
    // Not deleted. (The loser's put already overwrote the bytes before the insert lost; see report.)
    expect(await testEnv.MEDIA.head("gifs/robot.gif")).not.toBeNull();
  });
});

describe("main app auth (production vars, no bypass)", () => {
  const prod: Partial<Env> = {
    ENVIRONMENT: "production",
    ADMIN_HOST: "stash.johnsey.cloud",
    ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    ACCESS_AUD: "aud-123",
  };

  it("POST items without a JWT is 401 and writes nothing", async () => {
    const res = await call(
      "/api/admin/items",
      { method: "POST", body: form({ file: gifFile(), shelf: "gifs", name: "robot" }) },
      prod,
    );
    expect(res.status).toBe(401);
    expect((await testEnv.MEDIA.list()).objects).toHaveLength(0);
    const { results } = await testEnv.DB.prepare("SELECT name FROM items").all();
    expect(results).toHaveLength(0);
  });

  it("DELETE without a JWT is 401 and the item still serves", async () => {
    await post({ file: gifFile(), shelf: "gifs", name: "robot" });
    const res = await call("/api/admin/items/gifs/robot", { method: "DELETE" }, prod);
    expect(res.status).toBe(401);
    const served = await call("/gifs/robot.gif", undefined, prod);
    expect(served.status).toBe(200);
    await served.arrayBuffer();
  });

  it("bypass flag is ignored outside development", async () => {
    for (const environment of ["production", "preview"] as const) {
      const res = await call("/api/admin/recent", undefined, {
        ...prod,
        ENVIRONMENT: environment,
        DEV_BYPASS_ACCESS: "1",
      });
      expect(res.status).toBe(401);
    }
  });

  it("a garbage Cf-Access-Jwt-Assertion is 401", async () => {
    const res = await call("/api/admin/recent", { headers: { "cf-access-jwt-assertion": "garbage" } }, prod);
    expect(res.status).toBe(401);
  });
});

describe("cross-site writes", () => {
  it("rejects a foreign Origin on POST and DELETE", async () => {
    const headers = { origin: "https://evil.example.com" };
    const p = await call("/api/admin/items", {
      method: "POST",
      headers,
      body: form({ file: gifFile(), shelf: "gifs", name: "robot" }),
    });
    expect(p.status).toBe(403);
    expect(await p.json()).toEqual({ error: "Cross-site requests aren't allowed." });
    const d = await call("/api/admin/items/gifs/robot", { method: "DELETE", headers });
    expect(d.status).toBe(403);
    expect((await testEnv.MEDIA.list()).objects).toHaveLength(0);
  });

  it("allows the same Origin and requests without Origin", async () => {
    const same = await call("/api/admin/items", {
      method: "POST",
      headers: { origin: base },
      body: form({ file: gifFile(), shelf: "gifs", name: "robot" }),
    });
    expect(same.status).toBe(201);
    await same.arrayBuffer();
    const none = await post({ file: gifFile(), shelf: "gifs", name: "robot-2" });
    expect(none.status).toBe(201);
    await none.arrayBuffer();
  });
});

describe("delete", () => {
  it("delete cascades", async () => {
    await post({
      file: gifFile(),
      shelf: "gifs",
      name: "robot",
      aliases: "bot,droid",
      poster: { bytes: webpLossyBytes(3, 2), type: "image/webp", filename: "p.webp" },
    });
    const res = await call("/api/admin/items/gifs/robot", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: "robot", aliases: ["bot", "droid"] });
    expect(await testEnv.MEDIA.head("gifs/robot.gif")).toBeNull();
    expect(await testEnv.MEDIA.head("posters/robot.webp")).toBeNull();
    for (const n of ["robot", "bot", "droid"]) {
      const r = await call(`/gifs/${n}.gif`);
      expect(r.status).toBe(404);
      await r.arrayBuffer();
    }
  });

  it("still returns 200 when the R2 delete fails after the D1 delete", async () => {
    await post({ file: gifFile(), shelf: "gifs", name: "robot", aliases: "bot" });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const del = vi.spyOn(testEnv.MEDIA, "delete").mockRejectedValue(new Error("r2 down"));
    const res = await call("/api/admin/items/gifs/robot", { method: "DELETE" });
    del.mockRestore();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: "robot", aliases: ["bot"] });
    expect(err).toHaveBeenCalled();
  });

  it("404 for a missing item", async () => {
    const res = await call("/api/admin/items/gifs/ghost", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("404 for an alias name (delete the original instead)", async () => {
    await post({ file: gifFile(), shelf: "gifs", name: "robot", aliases: "bot" });
    expect((await call("/api/admin/items/gifs/bot", { method: "DELETE" })).status).toBe(404);
  });
});

describe("recent", () => {
  it("returns newest items, at most 20", async () => {
    for (let i = 0; i < 22; i++) await post({ file: gifFile(), shelf: "gifs", name: `g${i}` });
    const res = await call("/api/admin/recent");
    const body = (await res.json()) as { items: Item[] };
    expect(body.items).toHaveLength(20);
  });
});

describe("resolve", () => {
  const pageUrl = "https://example.com/cat.gif";

  it("returns the image bytes with sniffed type and hints", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(gifBytes(5, 5), { headers: { "content-type": "image/gif" } }),
    );
    const res = await call("/api/admin/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: pageUrl }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(res.headers.get("x-suggested-name")).toBe("cat");
    expect(res.headers.get("x-source-url")).toBe(pageUrl);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(gifBytes(5, 5));
  });

  it("422 with the video copy for video", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(mp4Bytes(), { headers: { "content-type": "image/gif" } }),
    );
    const res = await call("/api/admin/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: pageUrl }),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: VIDEO });
  });

  it("422 with the video copy for an animated webp, but passes a still webp", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(webpExtendedBytes(8, 8, true), { headers: { "content-type": "image/webp" } }),
    );
    const res = await call("/api/admin/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: pageUrl }),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: VIDEO });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(webpExtendedBytes(8, 8, false), { headers: { "content-type": "image/webp" } }),
    );
    const still = await call("/api/admin/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: pageUrl }),
    });
    expect(still.status).toBe(200);
    expect(still.headers.get("content-type")).toBe("image/webp");
  });

  it("422 for unknown bytes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3, 4, 5]), { headers: { "content-type": "image/gif" } }),
    );
    const res = await call("/api/admin/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: pageUrl }),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "That isn't an image I can use." });
  });

  it("422 with the ImportError message", async () => {
    const res = await call("/api/admin/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "http://localhost/x.gif" }),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "That address isn't allowed." });
  });

  it("400 without a url", async () => {
    const res = await call("/api/admin/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });
});
