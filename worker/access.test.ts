import { env } from "cloudflare:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { makeRequireAdmin } from "./access";
import type { Env } from "./env";

const TEAM = "team.cloudflareaccess.com";
const AUD = "aud-123";
const vars: Partial<Env> = {
  ADMIN_HOST: "stash.johnsey.cloud",
  ACCESS_TEAM_DOMAIN: TEAM,
  ACCESS_AUD: AUD,
  ENVIRONMENT: "production",
};

let privateKey: CryptoKey;
let app: Hono<{ Bindings: Env }>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  app = new Hono<{ Bindings: Env }>();
  app.use("*", makeRequireAdmin(() => keys));
  app.get("/ok", (c) => c.json({ ok: true }));
});

function sign(opts: { aud?: string; iss?: string } = {}) {
  return new SignJWT({ email: "me@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setAudience(opts.aud ?? AUD)
    .setIssuer(opts.iss ?? `https://${TEAM}`)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

function call(host: string, v: Partial<Env>, jwt?: string) {
  const headers: Record<string, string> = jwt ? { "cf-access-jwt-assertion": jwt } : {};
  return app.fetch(new Request(`https://${host}/ok`, { headers }), { ...env, ...v } as unknown as Env);
}

describe("access", () => {
  it("wrong host 403", async () => {
    const res = await call("evil.example.com", vars, await sign());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin is only available on stash.johnsey.cloud." });
  });

  it("missing jwt 401", async () => {
    const res = await call("stash.johnsey.cloud", vars);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in required." });
  });

  it("garbage jwt 401", async () => {
    expect((await call("stash.johnsey.cloud", vars, "not.a.jwt")).status).toBe(401);
  });

  it("bad aud 401", async () => {
    expect((await call("stash.johnsey.cloud", vars, await sign({ aud: "other" }))).status).toBe(401);
  });

  it("bad issuer 401", async () => {
    expect((await call("stash.johnsey.cloud", vars, await sign({ iss: "https://evil.example.com" }))).status).toBe(401);
  });

  it("valid jwt passes", async () => {
    const res = await call("stash.johnsey.cloud", vars, await sign());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("preview env allows its own host but still requires the JWT", async () => {
    const preview = { ...vars, ADMIN_HOST: "", ENVIRONMENT: "preview" as const };
    expect((await call("stash-preview.workers.dev", preview)).status).toBe(401);
    expect((await call("stash-preview.workers.dev", preview, await sign())).status).toBe(200);
  });

  it("dev bypass only in development", async () => {
    const bypass = { ...vars, DEV_BYPASS_ACCESS: "1" };
    expect((await call("stash.johnsey.cloud", { ...bypass, ENVIRONMENT: "development" })).status).toBe(200);
    expect((await call("stash.johnsey.cloud", { ...bypass, ENVIRONMENT: "production" })).status).toBe(401);
    expect((await call("stash.johnsey.cloud", { ...bypass, ENVIRONMENT: "preview" })).status).toBe(401);
  });

  it("dev bypass still checks the host", async () => {
    const res = await call("evil.example.com", { ...vars, ENVIRONMENT: "development", DEV_BYPASS_ACCESS: "1" });
    expect(res.status).toBe(403);
  });
});
