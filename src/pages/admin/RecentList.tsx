import { useState } from "react";
import { adminFetch, signInRequired } from "./adminFetch";
import { useToast } from "../../components/Toast";
import type { Item } from "../../shared/types";

interface Props {
  items: Item[];
  onDeleted: () => void;
  onSignInRequired: () => void;
}

export function confirmText(item: Item): string {
  const base = `Delete ${item.name}? Its link will stop working everywhere it's been shared.`;
  return item.aliases.length ? `${base} Its aliases (${item.aliases.join(", ")}) go too.` : base;
}

export function RecentList({ items, onDeleted, onSignInRequired }: Props) {
  const notify = useToast();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(item: Item) {
    if (!window.confirm(confirmText(item))) return;
    const key = `${item.shelf}/${item.name}`;
    setDeleting(key);
    try {
      const res = await adminFetch(`/api/admin/items/${item.shelf}/${encodeURIComponent(item.name)}`, { method: "DELETE" });
      if (signInRequired(res)) return onSignInRequired();
      if (!res.ok && res.status !== 404) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        notify(typeof body.error === "string" ? body.error : `Couldn't delete ${item.name}.`, "error");
        return;
      }
      onDeleted();
    } catch {
      notify(`Couldn't delete ${item.name}. Try again.`, "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="recent" aria-label="Recently added">
      <h2>Recently added</h2>
      {items.length === 0 ? <p className="queue-hint">Nothing here yet.</p> : null}
      <ul className="recent-list">
        {items.map((item) => (
          <li key={`${item.shelf}/${item.name}`}>
            <img src={item.path} alt="" width={40} height={40} loading="lazy" />
            <span className="recent-name">
              {item.name}
              <small>{item.shelf}</small>
            </span>
            <button
              type="button"
              className="recent-delete"
              aria-label={`Delete ${item.name}`}
              disabled={deleting === `${item.shelf}/${item.name}`}
              onClick={() => void remove(item)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
