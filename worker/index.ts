import { Hono } from "hono";
import type { Env } from "./env";
import { handleFile } from "./files";
import { canonicalOrigin, oldHostRedirect } from "./hosts";
import { requireAdmin } from "./access";
import { makeAdminApp } from "./admin";
import { listItems } from "./db";
import type { ItemsResponse, Shelf } from "../src/shared/types";

const app = new Hono<{ Bindings: Env }>();

app.use("*", oldHostRedirect);

app.get("/api/items", async (c) => {
  const url = new URL(c.req.url);
  const shelf = url.searchParams.get("shelf");
  if (shelf !== null && shelf !== "gifs" && shelf !== "emoji") {
    return c.json({ error: "Unknown shelf" }, 400);
  }
  const body: ItemsResponse = {
    canonicalOrigin: canonicalOrigin(c.env, url),
    adminAvailable: c.env.ADMIN_HOST === "" || c.env.ADMIN_HOST === url.host,
    items: await listItems(c.env.DB, (shelf as Shelf | null) ?? undefined),
  };
  return c.json(body);
});

app.route("/api/admin", makeAdminApp(requireAdmin));

app.get("/inventory.json", async (c) => {
  const gifs: Record<string, string> = {};
  for (const item of await listItems(c.env.DB, "gifs")) {
    // Aliases map to their own path, matching the live inventory file.
    for (const name of [item.name, ...item.aliases]) gifs[name] = `gifs/${name}.gif`;
  }
  const sorted = Object.fromEntries(Object.entries(gifs).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return c.newResponse(JSON.stringify({ gifs: sorted }, null, 2) + "\n", 200, {
    "content-type": "application/json",
    "cache-control": "public, max-age=300",
  });
});

app.on(["GET", "HEAD"], ["/gifs/:file", "/emoji/:file", "/posters/:file"], handleFile);

// Everything the Worker doesn't handle falls through to the React SPA.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
