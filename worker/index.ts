import { Hono } from "hono";
import type { Env } from "./env";
import { handleFile } from "./files";

const app = new Hono<{ Bindings: Env }>();

app.on(["GET", "HEAD"], ["/gifs/:file", "/emoji/:file", "/posters/:file"], handleFile);

// Everything the Worker doesn't handle falls through to the React SPA.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
