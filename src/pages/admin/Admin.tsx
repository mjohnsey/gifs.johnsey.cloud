import { useCallback, useEffect, useState } from "react";
import { Masthead } from "../../components/Masthead";
import { fetchItems } from "../../lib/api";
import type { Item } from "../../shared/types";
import { AddQueue } from "./AddQueue";
import { RecentList } from "./RecentList";
import "./admin.css";

const SIGN_IN = "Sign in required. Open this page on stash.johnsey.cloud.";
const DEFAULT_ORIGIN = "https://stash.johnsey.cloud";

export default function Admin() {
  const [items, setItems] = useState<Item[]>([]);
  const [recent, setRecent] = useState<Item[]>([]);
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN);
  const [signedOut, setSignedOut] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const requireSignIn = useCallback(() => setSignedOut(true), []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([fetchItems("gifs", signal), fetchItems("emoji", signal)]).then(
      ([gifs, emoji]) => {
        setItems([...gifs.items, ...emoji.items]);
        setOrigin(gifs.canonicalOrigin);
      },
      () => {},
    );
    (async () => {
      try {
        const res = await fetch("/api/admin/recent", { signal });
        if (res.status === 401 || res.status === 403) return setSignedOut(true);
        if (res.ok) setRecent(((await res.json()) as { items: Item[] }).items);
      } catch {
        // Aborted by a refresh or unmount, or offline: keep what we have.
      }
    })();
    return () => controller.abort();
  }, [version]);

  return (
    <>
      <Masthead word="admin" lede="Add gifs and emoji to the stash." linkHome />
      <main className="page admin-page">
        {signedOut ? (
          <p className="admin-signin" role="alert">{SIGN_IN}</p>
        ) : (
          <>
            <AddQueue items={items} canonicalOrigin={origin} onSaved={refresh} onSignInRequired={requireSignIn} />
            <RecentList items={recent} onDeleted={refresh} onSignInRequired={requireSignIn} />
          </>
        )}
      </main>
    </>
  );
}
