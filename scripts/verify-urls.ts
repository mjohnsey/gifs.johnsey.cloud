// Verifies that every gif in the live-inventory snapshot is served byte-for-byte.
//
//   tsx scripts/verify-urls.ts --base <origin> [--expect-redirect-root <url>]
//
// Plain public GETs; needs no credentials.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}

const get = (url: string) => fetch(url, { redirect: "manual" });

async function checkGif(base: string, name: string, path: string, want: string): Promise<Result> {
  try {
    const res = await get(`${base}/${path}`);
    if (res.status !== 200) return { name, ok: false, detail: `status ${res.status}` };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/gif")) return { name, ok: false, detail: `content-type ${ct}` };
    const got = sha(new Uint8Array(await res.arrayBuffer()));
    return got === want
      ? { name, ok: true, detail: "ok" }
      : { name, ok: false, detail: `sha256 ${got.slice(0, 12)} != ${want.slice(0, 12)}` };
  } catch (e) {
    return { name, ok: false, detail: String(e instanceof Error ? e.message : e) };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const baseArg = opt("--base");
  if (!baseArg) throw new Error("usage: verify-urls.ts --base <origin> [--expect-redirect-root <url>]");
  const base = baseArg.replace(/\/+$/, "");
  const expectRoot = opt("--expect-redirect-root");
  if (argv.includes("--expect-redirect-root") && !expectRoot) throw new Error("--expect-redirect-root needs a URL");

  const snapshot = JSON.parse(readFileSync(join(root, "scripts/snapshot/live-inventory.json"), "utf8")) as {
    gifs: Record<string, string>;
  };
  const hashes = JSON.parse(readFileSync(join(root, "scripts/snapshot/live-hashes.json"), "utf8")) as Record<
    string,
    string
  >;
  const entries = Object.entries(snapshot.gifs);
  const unhashed = entries.filter(([n]) => !hashes[n]).map(([n]) => n);
  if (unhashed.length) throw new Error(`live-hashes.json is missing: ${unhashed.join(", ")}`);
  const results: Result[] = [];

  // Limited concurrency: 4 workers pulling from a shared queue.
  const queue = [...entries];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let e = queue.shift(); e; e = queue.shift()) results.push(await checkGif(base, e[0], e[1], hashes[e[0]]!));
    }),
  );

  try {
    const res = await get(`${base}/inventory.json`);
    const inv = res.status === 200 ? ((await res.json()) as { gifs?: Record<string, string> }) : null;
    const missing = inv ? entries.filter(([n]) => !inv.gifs || !(n in inv.gifs)).map(([n]) => n) : [];
    results.push({
      name: "/inventory.json",
      ok: inv !== null && missing.length === 0,
      detail:
        inv === null
          ? `status ${res.status}`
          : missing.length
            ? `missing: ${missing.join(", ")}`
            : `all ${entries.length} keys present`,
    });
  } catch (e) {
    results.push({ name: "/inventory.json", ok: false, detail: String(e instanceof Error ? e.message : e) });
  }

  if (expectRoot) {
    const res = await get(`${base}/`);
    const loc = res.headers.get("location");
    results.push({
      name: "GET / redirect",
      ok: res.status === 301 && loc === expectRoot,
      detail: `status ${res.status}, location ${loc ?? "(none)"}, expected 301 to ${expectRoot}`,
    });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
