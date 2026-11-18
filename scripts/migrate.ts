// Seeds R2 + D1 from the gifs/ directory (plus emoji fixtures in preview).
//
//   tsx scripts/migrate.ts --env production|preview|local [--limit N]
//
// production/preview talk to Cloudflare (--remote) and run ONLY in GitHub Actions.
// local uses --local against .wrangler/state, the same state `npm run dev` reads.
// Re-running is safe: R2 puts overwrite with identical bytes and rows are INSERT OR IGNORE.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sniff } from "../worker/sniff";

export type Env = "production" | "preview" | "local";

export interface Row {
  shelf: "gifs" | "emoji";
  name: string;
  ext: string;
  key: string;
  content_type: string;
  bytes: number;
  width: number;
  height: number;
  sha256: string;
  alias_of: string | null;
  poster_key: string | null;
  source_url: string | null;
}

/** A planned row plus the local file that backs its R2 object (not part of the SQL). */
export interface PlannedRow extends Row {
  file: string;
}

const COLUMNS = [
  "shelf", "name", "ext", "key", "content_type", "bytes", "width", "height",
  "sha256", "alias_of", "poster_key", "source_url",
] as const;

export function assertEnvAllowed(env: string, vars: Record<string, string | undefined>): asserts env is Env {
  if (env !== "production" && env !== "preview" && env !== "local") {
    throw new Error(`--env must be production, preview or local (got "${env}")`);
  }
  if (env !== "local" && (vars.GITHUB_ACTIONS !== "true" || !vars.CLOUDFLARE_API_TOKEN)) {
    throw new Error(
      `Refusing --env ${env}: remote migrations run only in GitHub Actions (GITHUB_ACTIONS=true) with CLOUDFLARE_API_TOKEN set, never with a local wrangler login. Use --env local on this machine.`,
    );
  }
}

export function sqlString(v: string): string {
  return `'${v.replaceAll("'", "''")}'`;
}

const sqlValue = (v: string | number | null) =>
  v === null ? "NULL" : typeof v === "number" ? String(Math.trunc(v)) : sqlString(v);

export function rowToSql(row: Row): string {
  const vals = COLUMNS.map((c) => sqlValue(row[c]));
  return `INSERT OR IGNORE INTO items (${COLUMNS.join(", ")}) VALUES (${vals.join(", ")});`;
}

function describeFile(file: string, shelf: "gifs" | "emoji", name: string) {
  const bytes = readFileSync(file);
  const s = sniff(bytes);
  if (s.kind !== "image" || s.ext === "webp") throw new Error(`${file}: not a gif/png/jpg image`);
  if (shelf === "gifs" && s.ext !== "gif") throw new Error(`${file}: on the gifs shelf but the bytes are ${s.ext}, not gif`);
  return {
    shelf, name, ext: s.ext, key: `${shelf}/${name}.${s.ext}`, content_type: s.contentType,
    bytes: bytes.length, width: s.width, height: s.height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    alias_of: null, poster_key: shelf === "gifs" ? `posters/${name}.webp` : null, source_url: null,
  };
}

/** Pure over the filesystem: reads dir with lstat; symlinks become aliases of their resolved target. */
export function planMigration(dir: string, opts: { limit?: number } = {}): PlannedRow[] {
  const entries = readdirSync(dir).filter((f) => extname(f) === ".gif").sort();
  const originals: PlannedRow[] = [];
  const aliases: { name: string; target: string }[] = [];
  for (const f of entries) {
    const path = join(dir, f);
    const name = basename(f, ".gif");
    if (lstatSync(path).isSymbolicLink()) {
      let resolved: string;
      try {
        resolved = realpathSync(path);
      } catch {
        resolved = readlinkSync(path); // dangling: keep the link text so the error names it
      }
      aliases.push({ name, target: basename(resolved, ".gif") });
    } else {
      originals.push({ ...describeFile(path, "gifs", name), file: path });
    }
  }
  const kept = opts.limit === undefined ? originals : originals.slice(0, opts.limit);
  const byName = new Map(kept.map((r) => [r.name, r]));
  const aliasRows: PlannedRow[] = [];
  for (const a of aliases) {
    const t = byName.get(a.target);
    if (t) aliasRows.push({ ...t, name: a.name, alias_of: a.target });
    else if (opts.limit === undefined) {
      throw new Error(`alias ${a.name}.gif points to "${a.target}", which is not a gif in ${dir} (dangling or outside the directory)`);
    }
  }
  return [...kept, ...aliasRows];
}

export function planEmoji(fixturesDir: string): PlannedRow[] {
  return readdirSync(fixturesDir)
    .filter((f) => /^emoji-.+\.png$/.test(f))
    .sort()
    .map((f) => {
      const name = basename(f, ".png").replace(/^emoji-/, "");
      return { ...describeFile(join(fixturesDir, f), "emoji", name), file: join(fixturesDir, f) };
    });
}

const TARGETS = {
  production: { db: "stash", bucket: "stash-media", flags: ["--remote"] },
  preview: { db: "stash-preview", bucket: "stash-preview-media", flags: ["--env", "preview", "--remote"] },
  local: { db: "stash", bucket: "stash-media", flags: ["--local"] },
} as const;

const FFMPEG_BASE = ["-v", "error", "-y", "-i"];
const FFMPEG_SCALE = ["-frames:v", "1", "-vf", "scale=480:-2"];

/** First frame as a 480px-wide webp. Some ffmpeg builds (e.g. Homebrew's) lack libwebp; fall back to a PNG frame + cwebp. */
function makePoster(gif: string, out: string) {
  try {
    execFileSync("ffmpeg", [...FFMPEG_BASE, gif, ...FFMPEG_SCALE, "-q:v", "80", out], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const stderr = String((e as { stderr?: Buffer }).stderr ?? "").trim().split("\n")[0] ?? "";
    console.log(`  ffmpeg webp failed (${stderr || (e instanceof Error ? e.message : e)}); using png frame + cwebp`);
    const png = `${out}.png`;
    execFileSync("ffmpeg", [...FFMPEG_BASE, gif, ...FFMPEG_SCALE, png]);
    execFileSync("cwebp", ["-quiet", "-q", "80", png, "-o", out]);
  }
}

function main() {
  const { values } = parseArgs(process.argv.slice(2));
  const envName = values.env ?? "";
  assertEnvAllowed(envName, process.env);
  const env: Env = envName;
  const root = resolve(fileURLToPath(import.meta.url), "..", "..");
  const limit = values.limit !== undefined ? Number(values.limit) : env === "preview" ? 6 : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) throw new Error("--limit must be a non-negative integer");

  const target = TARGETS[env];
  const wrangler = (args: string[]) =>
    execFileSync("npx", ["wrangler", ...args], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const r2Put = (key: string, file: string, contentType: string) =>
    wrangler(["r2", "object", "put", `${target.bucket}/${key}`, "--file", file, "--content-type", contentType, "--config", "wrangler.jsonc", ...target.flags]);

  const rows = planMigration(join(root, "gifs"), { limit });
  if (env === "preview") rows.push(...planEmoji(join(root, "test", "fixtures")));

  const work = mkdtempSync(join(tmpdir(), "stash-migrate-"));
  try {
    const uploaded = new Set<string>();
    for (const row of rows) {
      if (row.alias_of === null && !uploaded.has(row.key)) {
        uploaded.add(row.key);
        console.log(`upload ${row.key}`);
        r2Put(row.key, row.file, row.content_type);
      }
      if (row.alias_of === null && row.poster_key) {
        const out = join(work, `${row.name}.webp`);
        makePoster(row.file, out);
        console.log(`upload ${row.poster_key}`);
        r2Put(row.poster_key, out, "image/webp");
      }
    }
    const sqlFile = join(work, "seed.sql");
    writeFileSync(sqlFile, rows.map(rowToSql).join("\n") + "\n");
    console.log(`insert ${rows.length} rows into ${target.db}`);
    wrangler(["d1", "execute", target.db, "--file", sqlFile, "--config", "wrangler.jsonc", ...target.flags]);
    console.log(`done: ${rows.filter((r) => r.alias_of === null).length} items, ${rows.filter((r) => r.alias_of !== null).length} aliases`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function parseArgs(argv: string[]) {
  const values: { env?: string; limit?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--env") values.env = argv[++i];
    else if (a === "--limit") values.limit = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return { values };
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
