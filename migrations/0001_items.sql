-- One row per original file, plus one row per alias (alias_of set).
-- An alias copies its target's file columns so lookups never need a join.
CREATE TABLE items (
  shelf TEXT NOT NULL CHECK (shelf IN ('gifs','emoji')),
  name TEXT NOT NULL,
  ext TEXT NOT NULL,
  key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  alias_of TEXT,
  poster_key TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (shelf, name)
);

CREATE INDEX items_created_at ON items (created_at);
