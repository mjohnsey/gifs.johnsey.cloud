import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const snapshot = JSON.parse(readFileSync(join(root, "scripts/snapshot/live-inventory.json"), "utf8")) as { gifs: Record<string, string> };
const hashes = JSON.parse(readFileSync(join(root, "scripts/snapshot/live-hashes.json"), "utf8")) as Record<string, string>;

describe("live-hashes.json", () => {
  it("covers exactly the snapshot entries", () => {
    expect(Object.keys(hashes).sort()).toEqual(Object.keys(snapshot.gifs).sort());
  });
  // gifs/ is removed by the cleanup PR; the stored hashes then stand on their own.
  it.skipIf(!existsSync(join(root, "gifs")))("equals the current gifs/ file hashes (symlinks dereferenced)", () => {
    for (const [name, path] of Object.entries(snapshot.gifs)) {
      const sha = createHash("sha256").update(readFileSync(realpathSync(join(root, path)))).digest("hex");
      expect(hashes[name], name).toBe(sha);
    }
  });
});
