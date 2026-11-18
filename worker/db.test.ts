import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isValidName } from "../src/shared/names";
import {
  deleteItem,
  findFile,
  insertAlias,
  insertItem,
  listItems,
  NameTakenError,
  recentItems,
  type NewItemRow,
} from "./db";

const testEnv = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] };
const db = testEnv.DB;

const bunk: NewItemRow = {
  shelf: "gifs",
  name: "bunk-smh",
  ext: "gif",
  key: "gifs/bunk-smh.gif",
  contentType: "image/gif",
  bytes: 1234,
  width: 320,
  height: 240,
  sha256: "abc123",
  posterKey: "posters/bunk-smh.webp",
  sourceUrl: null,
};

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await db.prepare("DELETE FROM items").run();
});

describe("db", () => {
  it("listItems folds aliases", async () => {
    await insertItem(db, bunk);
    await insertAlias(db, "gifs", "smh", "bunk-smh");
    const items = await listItems(db);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "bunk-smh",
      aliases: ["smh"],
      path: "/gifs/bunk-smh.gif",
      posterPath: "/posters/bunk-smh.webp",
    });
  });

  it("derives posterPath from poster_key, whatever its extension", async () => {
    await insertItem(db, { ...bunk, posterKey: "posters/bunk-smh.jpg" });
    expect((await listItems(db))[0]?.posterPath).toBe("/posters/bunk-smh.jpg");
  });

  it("listItems filters by shelf, sorts by name, and nulls posterPath", async () => {
    await insertItem(db, { ...bunk, name: "zed", key: "gifs/zed.gif", posterKey: null });
    await insertItem(db, bunk);
    await insertItem(db, { ...bunk, shelf: "emoji", name: "party", ext: "png", key: "emoji/party.png" });
    expect((await listItems(db, "gifs")).map((i) => i.name)).toEqual(["bunk-smh", "zed"]);
    expect((await listItems(db, "emoji")).map((i) => i.path)).toEqual(["/emoji/party.png"]);
    expect((await listItems(db)).find((i) => i.name === "zed")?.posterPath).toBeNull();
  });

  it("findFile resolves alias", async () => {
    await insertItem(db, bunk);
    await insertAlias(db, "gifs", "smh", "bunk-smh");
    expect(await findFile(db, "gifs", "smh", "gif")).toEqual({
      key: "gifs/bunk-smh.gif",
      contentType: "image/gif",
    });
  });

  it("findFile rejects wrong ext", async () => {
    await insertItem(db, bunk);
    expect(await findFile(db, "gifs", "bunk-smh", "png")).toBeNull();
  });

  it("insertItem rejects alias name", async () => {
    await insertItem(db, bunk);
    await insertAlias(db, "gifs", "smh", "bunk-smh");
    await expect(insertItem(db, { ...bunk, name: "smh", key: "gifs/smh.gif" })).rejects.toBeInstanceOf(
      NameTakenError,
    );
  });

  it("deleteItem cascades aliases", async () => {
    await insertItem(db, bunk);
    await insertAlias(db, "gifs", "smh", "bunk-smh");
    expect(await deleteItem(db, "gifs", "bunk-smh")).toEqual({
      keys: ["gifs/bunk-smh.gif", "posters/bunk-smh.webp"],
      aliases: ["smh"],
    });
    expect(await findFile(db, "gifs", "bunk-smh", "gif")).toBeNull();
    expect(await findFile(db, "gifs", "smh", "gif")).toBeNull();
    expect(await deleteItem(db, "gifs", "bunk-smh")).toBeNull();
  });

  it("recentItems returns newest originals first, limited", async () => {
    await insertItem(db, bunk);
    await insertAlias(db, "gifs", "smh", "bunk-smh");
    await insertItem(db, { ...bunk, name: "later", key: "gifs/later.gif", posterKey: null });
    await db.prepare("UPDATE items SET created_at = '2030-01-01T00:00:00.000Z' WHERE name = 'later'").run();
    const items = await recentItems(db, 1);
    expect(items.map((i) => i.name)).toEqual(["later"]);
    expect(await recentItems(db, 10)).toHaveLength(2);
  });
});

describe("isValidName", () => {
  it("accepts slugs", () => {
    expect(isValidName("a")).toBe(true);
    expect(isValidName("robot-parrot")).toBe(true);
  });
  it("rejects bad names", () => {
    for (const bad of ["Robot", "-a", "a--b", "a_b", "a".repeat(65)]) {
      expect(isValidName(bad)).toBe(false);
    }
    expect(isValidName("a".repeat(64))).toBe(true);
  });
});
