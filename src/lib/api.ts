import { useEffect, useState } from "react";
import type { ItemsResponse, Shelf } from "../shared/types";

export interface ItemsState {
  data?: ItemsResponse;
  error?: Error;
  loading: boolean;
}

export async function fetchItems(shelf: Shelf, signal?: AbortSignal): Promise<ItemsResponse> {
  const res = await fetch(`/api/items?shelf=${shelf}`, { signal });
  if (!res.ok) throw new Error(`Couldn't load the ${shelf} (${res.status}).`);
  return (await res.json()) as ItemsResponse;
}

export function useItems(shelf: Shelf): ItemsState {
  const [state, setState] = useState<ItemsState>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    // oxlint-disable-next-line react/set-state-in-effect -- reset to loading when the shelf changes, before the fetch below.
    setState({ loading: true });
    fetchItems(shelf, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, loading: false });
      },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        setState({ error: e instanceof Error ? e : new Error(String(e)), loading: false });
      },
    );
    return () => controller.abort();
  }, [shelf]);

  return state;
}
