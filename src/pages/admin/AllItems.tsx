import { useState } from "react";
import { ItemRows } from "./ItemList";
import type { ItemListProps } from "./ItemList";
import type { Item } from "../../shared/types";

/** Every space- or hyphen-separated term must appear in the name or an alias. */
function matches(item: Item, terms: string[]): boolean {
  const haystack = [item.name, ...item.aliases].join(" ").toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/** Every item on both shelves, searchable, so anything can be deleted, not only the newest. */
export function AllItems({ items, onDeleted, onSignInRequired }: ItemListProps) {
  const [query, setQuery] = useState("");
  const terms = query.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const shown = items.filter((i) => matches(i, terms)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="recent all-items" aria-label="All items">
      <h2>All items</h2>
      <input
        type="search"
        className="all-items-search"
        aria-label="Search all items"
        placeholder="Search by name or alias"
        value={query}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="queue-hint" role="status">
        {terms.length ? `${shown.length} of ${items.length} items match.` : `${items.length} items.`}
      </p>
      <ItemRows items={shown} onDeleted={onDeleted} onSignInRequired={onSignInRequired} />
    </section>
  );
}
