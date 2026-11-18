import type { MiddlewareHandler } from "hono";
import type { Env } from "./env";

export type FileShelf = "gifs" | "emoji" | "posters";

export interface FilePathParts {
  shelf: FileShelf;
  name: string;
  ext: string;
}

const EXTS: Record<FileShelf, readonly string[]> = {
  gifs: ["gif"],
  emoji: ["gif", "png", "jpg"],
  posters: ["webp"],
};

/** Splits `/<shelf>/<name>.<ext>` into parts, or null when the shape doesn't match. */
export function parseFilePath(pathname: string): FilePathParts | null {
  const m = /^\/(gifs|emoji|posters)\/([^/.]+)\.([a-z]+)$/.exec(pathname);
  if (!m) return null;
  const shelf = m[1] as FileShelf;
  if (!EXTS[shelf].includes(m[3])) return null;
  return { shelf, name: m[2], ext: m[3] };
}

/** True for paths that are files rather than pages: stays served on the old domain. */
export function isFilePath(pathname: string): boolean {
  return pathname === "/inventory.json" || parseFilePath(pathname) !== null;
}

/** The origin shared links use: the configured one, or the request's own (previews). */
export function canonicalOrigin(env: Env, url: URL): string {
  return env.CANONICAL_ORIGIN || url.origin;
}

/**
 * Old-domain rule: files are served as-is, every other path 301s to the same
 * path and query on the canonical origin. Must be registered before all routes.
 */
export const oldHostRedirect: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const url = new URL(c.req.url);
  if (url.host === c.env.OLD_HOST && !isFilePath(url.pathname)) {
    const origin = canonicalOrigin(c.env, url);
    // An empty CANONICAL_ORIGIN would point back at this host: never redirect in a loop.
    if (new URL(origin).host !== url.host) {
      return c.redirect(`${origin}${url.pathname}${url.search}`, 301);
    }
  }
  await next();
};
