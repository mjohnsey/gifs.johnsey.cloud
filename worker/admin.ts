import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import type { Ext, Shelf } from "../src/shared/types";
import { isValidName } from "../src/shared/names";
import {
  deleteItem,
  insertAlias,
  insertItem,
  listItems,
  NameTakenError,
  nameTaken,
  recentItems,
  TargetNotFoundError,
} from "./db";
import type { Env } from "./env";
import { canonicalOrigin } from "./hosts";
import { ImportError, resolveImage } from "./resolve-url";
import { isAnimatedWebp, sniff } from "./sniff";

const MAX_BYTES = 26_214_400; // 25 MB
const VIDEO_COPY = "That's a video, not a gif. Try the Giphy or Tenor version, or upload a gif.";
const NOT_AN_IMAGE = "That isn't an image I can use.";
const GIFS_ONLY = "Only GIFs can go on the gifs shelf.";
// Slack's custom emoji help page lists JPG, PNG and GIF only.
const EMOJI_EXTS: readonly string[] = ["gif", "png", "jpg"];

type Ctx = Context<{ Bindings: Env }>;

const isShelf = (s: unknown): s is Shelf => s === "gifs" || s === "emoji";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseAliases(raw: string): string[] | null {
  const aliases = raw
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a !== "");
  return aliases.every(isValidName) ? aliases : null;
}

async function handleResolve(c: Ctx) {
  const body = await c.req.json<{ url?: unknown }>().catch(() => null);
  if (!body || typeof body.url !== "string" || body.url.trim() === "") {
    return c.json({ error: "Paste a link." }, 400);
  }
  try {
    const image = await resolveImage(body.url);
    const sniffed = sniff(image.bytes);
    if (sniffed.kind === "video") return c.json({ error: VIDEO_COPY }, 422);
    if (sniffed.kind === "unknown") return c.json({ error: NOT_AN_IMAGE }, 422);
    // Giphy may serve WebP; an animated one can't go on a shelf, so say so now.
    if (isAnimatedWebp(image.bytes)) return c.json({ error: VIDEO_COPY }, 422);
    return new Response(image.bytes, {
      headers: {
        "content-type": sniffed.contentType,
        "x-suggested-name": image.suggestedName,
        "x-source-url": image.sourceUrl,
      },
    });
  } catch (err) {
    if (err instanceof ImportError) return c.json({ error: err.message }, 422);
    throw err;
  }
}

async function handleCreate(c: Ctx) {
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "Send the item as a form." }, 400);

  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "Choose a file." }, 400);
  const shelf = form.get("shelf");
  if (!isShelf(shelf)) return c.json({ error: "Pick the gifs or emoji shelf." }, 400);
  const name = form.get("name");
  if (typeof name !== "string" || !isValidName(name)) {
    return c.json({ error: "Names use lowercase letters, numbers and hyphens." }, 400);
  }
  const aliasesRaw = form.get("aliases");
  const aliases = parseAliases(typeof aliasesRaw === "string" ? aliasesRaw : "");
  if (!aliases) return c.json({ error: "Aliases use lowercase letters, numbers and hyphens." }, 400);
  if (new Set([name, ...aliases]).size !== aliases.length + 1) {
    return c.json({ error: "Each name and alias must be different." }, 400);
  }
  if (file.size > MAX_BYTES) return c.json({ error: "That file is over 25 MB." }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniff(bytes);
  if (sniffed.kind === "video") return c.json({ error: VIDEO_COPY }, 422);
  if (sniffed.kind === "unknown") return c.json({ error: NOT_AN_IMAGE }, 422);
  if (shelf === "gifs" && sniffed.ext !== "gif") return c.json({ error: GIFS_ONLY }, 422);
  if (shelf === "emoji" && !EMOJI_EXTS.includes(sniffed.ext)) {
    return c.json({ error: "Emoji can be GIF, PNG or JPG." }, 422);
  }
  const ext = sniffed.ext as Ext;

  // Pre-check every name so a collision never leaves a half-saved item behind.
  for (const n of [name, ...aliases]) {
    if (await nameTaken(c.env.DB, shelf, n)) return c.json({ error: `${n} is already taken.` }, 409);
  }

  // Posters are optional, gifs only, and must really be WebP or JPEG (Safari can't encode
  // WebP, so the browser falls back to JPEG); anything else is dropped.
  let poster: { bytes: Uint8Array; ext: "webp" | "jpg"; contentType: string } | null = null;
  const posterField = form.get("poster");
  if (shelf === "gifs" && posterField instanceof File && posterField.size <= MAX_BYTES) {
    const posterBytes = new Uint8Array(await posterField.arrayBuffer());
    const p = sniff(posterBytes);
    if (p.kind === "image" && (p.ext === "webp" || p.ext === "jpg")) {
      poster = { bytes: posterBytes, ext: p.ext, contentType: p.contentType };
    }
  }

  const key = `${shelf}/${name}.${ext}`;
  const posterKey = poster ? `posters/${name}.${poster.ext}` : null;
  const sourceUrlField = form.get("sourceUrl");
  const sourceUrl = typeof sourceUrlField === "string" && sourceUrlField !== "" ? sourceUrlField : null;

  const written = [key, ...(posterKey ? [posterKey] : [])];
  let inserted = false;
  let taken = name;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: sniffed.contentType } });
  try {
    if (poster && posterKey) {
      await c.env.MEDIA.put(posterKey, poster.bytes, { httpMetadata: { contentType: poster.contentType } });
    }
    await insertItem(c.env.DB, {
      shelf,
      name,
      ext,
      key,
      contentType: sniffed.contentType,
      bytes: bytes.byteLength,
      width: sniffed.width,
      height: sniffed.height,
      sha256: await sha256Hex(bytes),
      posterKey,
      sourceUrl,
    });
    inserted = true;
    for (const alias of aliases) {
      taken = alias;
      await insertAlias(c.env.DB, shelf, alias, name);
    }
  } catch (err) {
    // A lost race means the key now belongs to the winner: leave its objects alone.
    const lostRace = !inserted && err instanceof NameTakenError;
    if (!lostRace) await c.env.MEDIA.delete(written).catch(() => {});
    if (inserted) await deleteItem(c.env.DB, shelf, name).catch(() => {});
    if (err instanceof NameTakenError) return c.json({ error: `${taken} is already taken.` }, 409);
    if (err instanceof TargetNotFoundError) return c.json({ error: err.message }, 400);
    throw err;
  }

  const item = (await listItems(c.env.DB, shelf)).find((i) => i.name === name)!;
  return c.json({ item, url: canonicalOrigin(c.env, new URL(c.req.url)) + item.path }, 201);
}

async function handleDelete(c: Ctx) {
  const shelf = c.req.param("shelf");
  const name = c.req.param("name") ?? "";
  if (!isShelf(shelf)) return c.json({ error: "Unknown shelf" }, 400);
  const removed = await deleteItem(c.env.DB, shelf, name);
  if (!removed) return c.json({ error: `${name} doesn't exist.` }, 404);
  try {
    await c.env.MEDIA.delete(removed.keys);
  } catch (err) {
    // The row is gone, so the item is deleted; orphaned objects are only wasted space.
    console.error("R2 delete failed after D1 delete", removed.keys, err);
  }
  return c.json({ deleted: name, aliases: removed.aliases });
}

/** The admin routes, mounted at /api/admin. The guard is injected so tests can supply their own keys. */
export function makeAdminApp(guard: MiddlewareHandler<{ Bindings: Env }>) {
  const admin = new Hono<{ Bindings: Env }>();
  admin.onError((err, c) => {
    console.error("admin error", err);
    return c.json({ error: "Something went wrong." }, 500);
  });
  admin.use("*", async (c, next) => {
    // Defense in depth against cross-site writes. Requests without Origin (curl, Shortcuts) pass.
    const origin = c.req.header("origin");
    const method = c.req.method;
    if ((method === "POST" || method === "DELETE") && origin && origin !== new URL(c.req.url).origin) {
      return c.json({ error: "Cross-site requests aren't allowed." }, 403);
    }
    await next();
  });
  admin.use("*", guard);
  admin.post("/resolve", handleResolve);
  admin.post("/items", handleCreate);
  admin.delete("/items/:shelf/:name", handleDelete);
  admin.get("/recent", async (c) => c.json({ items: await recentItems(c.env.DB, 20) }));
  return admin;
}
