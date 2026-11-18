import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Env } from "./env";

export type KeySetGetter = (env: Env) => JWTVerifyGetKey;

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

/** Cloudflare Access's signing keys, fetched once per team domain and cached for the isolate's life. */
export const remoteKeySet: KeySetGetter = (env) => {
  let keys = remoteKeySets.get(env.ACCESS_TEAM_DOMAIN);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    remoteKeySets.set(env.ACCESS_TEAM_DOMAIN, keys);
  }
  return keys;
};

/**
 * Admin writes need the right host (ADMIN_HOST, or any host when it is empty, as in
 * previews) and a valid Cloudflare Access JWT. The dev bypass skips only the JWT, and
 * only in the development environment.
 */
export function makeRequireAdmin(getKeySet: KeySetGetter): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const env = c.env;
    const host = new URL(c.req.url).host;
    if (env.ADMIN_HOST !== "" && host !== env.ADMIN_HOST) {
      return c.json({ error: "Admin is only available on stash.johnsey.cloud." }, 403);
    }
    const bypass = env.ENVIRONMENT === "development" && env.DEV_BYPASS_ACCESS === "1";
    if (!bypass) {
      const token = c.req.header("cf-access-jwt-assertion");
      if (!token) return c.json({ error: "Sign in required." }, 401);
      try {
        await jwtVerify(token, getKeySet(env), {
          audience: env.ACCESS_AUD,
          issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
          algorithms: ["RS256"],
        });
      } catch {
        return c.json({ error: "Sign in required." }, 401);
      }
    }
    await next();
  };
}

export const requireAdmin = makeRequireAdmin(remoteKeySet);
