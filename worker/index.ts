import { Hono } from "hono";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

// Everything the Worker doesn't handle falls through to the React SPA.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
