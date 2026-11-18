import type { Ext, Item, Shelf } from "../src/shared/types";

export interface NewItemRow {
  shelf: Shelf;
  name: string;
  ext: Ext;
  key: string;
  contentType: string;
  bytes: number;
  width: number;
  height: number;
  sha256: string;
  posterKey: string | null;
  sourceUrl: string | null;
}

export class NameTakenError extends Error {
  constructor(shelf: Shelf, name: string) {
    super(`The name "${name}" is already taken on the ${shelf} shelf.`);
    this.name = "NameTakenError";
  }
}

interface ItemRow {
  shelf: Shelf;
  name: string;
  ext: Ext;
  bytes: number;
  width: number;
  height: number;
  poster_key: string | null;
  created_at: string;
  aliases: string | null;
}

const ITEM_SELECT = `
  SELECT i.shelf, i.name, i.ext, i.bytes, i.width, i.height, i.poster_key, i.created_at,
    (SELECT group_concat(a.name, char(10)) FROM
       (SELECT name FROM items WHERE shelf = i.shelf AND alias_of = i.name ORDER BY name) a
    ) AS aliases
  FROM items i
  WHERE i.alias_of IS NULL`;

function toItem(r: ItemRow): Item {
  return {
    shelf: r.shelf,
    name: r.name,
    ext: r.ext,
    path: `/${r.shelf}/${r.name}.${r.ext}`,
    bytes: r.bytes,
    width: r.width,
    height: r.height,
    aliases: r.aliases ? r.aliases.split("\n") : [],
    posterPath: r.poster_key ? `/posters/${r.name}.webp` : null,
    createdAt: r.created_at,
  };
}

export async function listItems(db: D1Database, shelf?: Shelf): Promise<Item[]> {
  const stmt = shelf
    ? db.prepare(`${ITEM_SELECT} AND i.shelf = ?1 ORDER BY i.name`).bind(shelf)
    : db.prepare(`${ITEM_SELECT} ORDER BY i.name`);
  const { results } = await stmt.all<ItemRow>();
  return results.map(toItem);
}

export async function recentItems(db: D1Database, limit: number): Promise<Item[]> {
  const { results } = await db
    .prepare(`${ITEM_SELECT} ORDER BY i.created_at DESC, i.name LIMIT ?1`)
    .bind(limit)
    .all<ItemRow>();
  return results.map(toItem);
}

export async function findFile(
  db: D1Database,
  shelf: Shelf,
  name: string,
  ext: Ext,
): Promise<{ key: string; contentType: string } | null> {
  // Alias rows copy their target's ext/key/content_type, so no join is needed.
  const row = await db
    .prepare("SELECT key, content_type FROM items WHERE shelf = ?1 AND name = ?2 AND ext = ?3")
    .bind(shelf, name, ext)
    .first<{ key: string; content_type: string }>();
  return row ? { key: row.key, contentType: row.content_type } : null;
}

export async function nameTaken(db: D1Database, shelf: Shelf, name: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS taken FROM items WHERE shelf = ?1 AND name = ?2")
    .bind(shelf, name)
    .first();
  return row !== null;
}

export async function insertItem(db: D1Database, row: NewItemRow): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO items (shelf, name, ext, key, content_type, bytes, width, height, sha256, poster_key, source_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      )
      .bind(
        row.shelf,
        row.name,
        row.ext,
        row.key,
        row.contentType,
        row.bytes,
        row.width,
        row.height,
        row.sha256,
        row.posterKey,
        row.sourceUrl,
      )
      .run();
  } catch (err) {
    // The (shelf, name) primary key covers originals and aliases alike.
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      throw new NameTakenError(row.shelf, row.name);
    }
    throw err;
  }
}

export async function insertAlias(
  db: D1Database,
  shelf: Shelf,
  alias: string,
  target: string,
): Promise<void> {
  try {
    const res = await db
      .prepare(
        `INSERT INTO items (shelf, name, ext, key, content_type, bytes, width, height, sha256, alias_of)
         SELECT shelf, ?2, ext, key, content_type, bytes, width, height, sha256, name
         FROM items WHERE shelf = ?1 AND name = ?3 AND alias_of IS NULL`,
      )
      .bind(shelf, alias, target)
      .run();
    if (res.meta.changes === 0) throw new Error(`Alias target "${target}" not found on ${shelf}`);
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      throw new NameTakenError(shelf, alias);
    }
    throw err;
  }
}

export async function deleteItem(
  db: D1Database,
  shelf: Shelf,
  name: string,
): Promise<{ keys: string[]; aliases: string[] } | null> {
  const original = await db
    .prepare("SELECT key, poster_key FROM items WHERE shelf = ?1 AND name = ?2 AND alias_of IS NULL")
    .bind(shelf, name)
    .first<{ key: string; poster_key: string | null }>();
  if (!original) return null;

  const { results } = await db
    .prepare("SELECT name FROM items WHERE shelf = ?1 AND alias_of = ?2 ORDER BY name")
    .bind(shelf, name)
    .all<{ name: string }>();

  await db.batch([
    db.prepare("DELETE FROM items WHERE shelf = ?1 AND alias_of = ?2").bind(shelf, name),
    db.prepare("DELETE FROM items WHERE shelf = ?1 AND name = ?2").bind(shelf, name),
  ]);

  return {
    keys: original.poster_key ? [original.key, original.poster_key] : [original.key],
    aliases: results.map((r) => r.name),
  };
}
