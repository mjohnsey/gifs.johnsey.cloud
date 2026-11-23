import type { Context } from "hono";
import type { Ext } from "../src/shared/types";
import { isValidName } from "../src/shared/names";
import { findFile } from "./db";
import type { Env } from "./env";
import { parseFilePath } from "./hosts";

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400";

type ParsedRange = { start: number | null; end: number | null };

/** Parses a single `bytes=` range. Anything else (malformed, multi-range) is ignored: serve it whole. */
function parseRange(header: string | null): ParsedRange | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!m || (m[1] === "" && m[2] === "")) return null;
  const start = m[1] === "" ? null : Number(m[1]);
  const end = m[2] === "" ? null : Number(m[2]);
  if (start !== null && end !== null && end < start) return null;
  return { start, end };
}

/** Resolves a parsed range against the object size, or null when it's unsatisfiable. */
function resolveRange(r: ParsedRange, size: number): { start: number; end: number } | null {
  if (r.start === null) {
    if (!r.end) return null;
    return { start: Math.max(size - r.end, 0), end: size - 1 };
  }
  if (r.start >= size) return null;
  return { start: r.start, end: Math.min(r.end ?? size - 1, size - 1) };
}

export async function serveObject(req: Request, bucket: R2Bucket, key: string, contentType: string): Promise<Response> {
  const wanted = parseRange(req.headers.get("range"));
  let object: R2Object | R2ObjectBody | null;
  try {
    object = await bucket.get(key, {
      onlyIf: req.headers,
      range: wanted
        ? wanted.start === null
          ? { suffix: wanted.end! }
          : {
              offset: wanted.start,
              ...(wanted.end !== null && {
                length: wanted.end - wanted.start + 1,
              }),
            }
        : undefined,
    });
  } catch (err) {
    // R2 rejects a range past the end of the object (error 10039).
    if (!String(err).includes("10039")) throw err;
    const head = await bucket.head(key);
    if (!head) return new Response("Not found", { status: 404 });
    return new Response(null, {
      status: 416,
      headers: {
        "content-range": `bytes */${head.size}`,
        "accept-ranges": "bytes",
      },
    });
  }
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", contentType);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", CACHE_CONTROL);

  if (!("body" in object)) {
    // A conditional request failed: 304 for the cache validators, 412 for If-Match.
    const validator = req.headers.has("if-none-match") || req.headers.has("if-modified-since");
    return new Response(null, { status: validator ? 304 : 412, headers });
  }

  const resolved = wanted ? resolveRange(wanted, object.size) : null;
  if (wanted && !resolved) {
    await object.body.cancel();
    headers.set("content-range", `bytes */${object.size}`);
    return new Response(null, { status: 416, headers });
  }

  const start = resolved?.start ?? 0;
  const end = resolved?.end ?? object.size - 1;
  headers.set("content-length", String(end - start + 1));
  if (resolved) headers.set("content-range", `bytes ${start}-${end}/${object.size}`);

  const body = req.method === "HEAD" ? null : object.body;
  if (!body) await object.body.cancel();
  return new Response(body, { status: resolved ? 206 : 200, headers });
}

export async function handleFile(c: Context<{ Bindings: Env }>): Promise<Response> {
  const url = new URL(c.req.url);
  const parts = parseFilePath(url.pathname);
  if (!parts || !isValidName(parts.name)) return c.notFound();

  if (parts.shelf === "posters") {
    return serveObject(
      c.req.raw,
      c.env.MEDIA,
      `posters/${parts.name}.${parts.ext}`,
      parts.ext === "jpg" ? "image/jpeg" : "image/webp",
    );
  }
  const file = await findFile(c.env.DB, parts.shelf, parts.name, parts.ext as Ext);
  if (!file) return c.notFound();
  return serveObject(c.req.raw, c.env.MEDIA, file.key, file.contentType);
}
