import { ItemRows } from "./ItemList";
import type { ItemListProps } from "./ItemList";

export { confirmText } from "./ItemList";

export function RecentList(props: ItemListProps) {
  return (
    <section className="recent" aria-label="Recently added">
      <h2>Recently added</h2>
      {props.items.length === 0 ? <p className="queue-hint">Nothing here yet.</p> : null}
      <ItemRows {...props} />
    </section>
  );
}
