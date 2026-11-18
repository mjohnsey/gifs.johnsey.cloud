import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertEnvAllowed, planMigration, rowToSql, sqlString } from "./migrate";

const TINY = join(import.meta.dirname, "..", "test", "fixtures", "tiny.gif");

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), "stash-plan-"));
  copyFileSync(TINY, join(dir, "bunk-smh.gif"));
  symlinkSync("./bunk-smh.gif", join(dir, "smh.gif"));
  return dir;
}

describe("planMigration", () => {
  it("gives 1 item and 1 alias sharing the same key", () => {
    const rows = planMigration(fixtureDir());
    expect(rows).toHaveLength(2);
    const item = rows.find((r) => r.name === "bunk-smh")!;
    const alias = rows.find((r) => r.name === "smh")!;
    expect(item.alias_of).toBeNull();
    expect(alias.alias_of).toBe("bunk-smh");
    expect(alias.key).toBe("gifs/bunk-smh.gif");
    expect(alias.key).toBe(item.key);
    expect(alias.poster_key).toBe("posters/bunk-smh.webp");
    for (const col of ["ext", "content_type", "bytes", "width", "height", "sha256"] as const) {
      expect(alias[col]).toBe(item[col]);
    }
    expect(item.shelf).toBe("gifs");
    expect(item.content_type).toBe("image/gif");
    expect(item.sha256).toBe(createHash("sha256").update(readFileSync(TINY)).digest("hex"));
    expect(item.width).toBeGreaterThan(0);
  });

  it("applies --limit to originals and keeps only aliases whose target is kept", () => {
    const dir = fixtureDir();
    copyFileSync(TINY, join(dir, "zzz.gif"));
    expect(planMigration(dir, { limit: 1 }).map((r) => r.name)).toEqual(["bunk-smh", "smh"]);
  });
});

describe("sql helpers", () => {
  it("escapes single quotes and renders NULLs", () => {
    expect(sqlString("o'brien")).toBe("'o''brien'");
    const [item] = planMigration(fixtureDir());
    const sql = rowToSql(item!);
    expect(sql.startsWith("INSERT OR IGNORE INTO items")).toBe(true);
    expect(sql).toContain("NULL");
  });
});

describe("assertEnvAllowed", () => {
  it("refuses remote envs unless GitHub Actions AND an API token", () => {
    expect(() => assertEnvAllowed("production", {})).toThrow(/GitHub Actions/);
    expect(() => assertEnvAllowed("preview", { CI: "true", CLOUDFLARE_API_TOKEN: "t" })).toThrow();
    expect(() => assertEnvAllowed("production", { GITHUB_ACTIONS: "true" })).toThrow();
    expect(() => assertEnvAllowed("production", { GITHUB_ACTIONS: "true", CLOUDFLARE_API_TOKEN: "" })).toThrow();
    expect(() => assertEnvAllowed("production", { GITHUB_ACTIONS: "true", CLOUDFLARE_API_TOKEN: "t" })).not.toThrow();
    expect(() => assertEnvAllowed("preview", { GITHUB_ACTIONS: "true", CLOUDFLARE_API_TOKEN: "t" })).not.toThrow();
    expect(() => assertEnvAllowed("local", {})).not.toThrow();
  });
});

describe("planMigration safety", () => {
  it("throws on a dangling alias without --limit, but prunes it with --limit", () => {
    const dir = fixtureDir();
    symlinkSync("../outside.gif", join(dir, "stray.gif"));
    expect(() => planMigration(dir)).toThrow(/stray\.gif/);
    expect(planMigration(dir, { limit: 1 }).map((r) => r.name)).toEqual(["bunk-smh", "smh"]);
  });

  it("rejects non-gif bytes on the gifs shelf, naming the file", () => {
    const dir = fixtureDir();
    copyFileSync(join(import.meta.dirname, "..", "test", "fixtures", "emoji-wave.png"), join(dir, "fake.gif"));
    expect(() => planMigration(dir)).toThrow(/fake\.gif.*png/);
  });
});
