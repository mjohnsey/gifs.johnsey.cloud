export type Shelf = "gifs" | "emoji";
export type Ext = "gif" | "png" | "jpg";

export interface Item {
  shelf: Shelf;
  name: string;
  ext: Ext;
  /** Public file path, e.g. "/gifs/bunk-smh.gif". */
  path: string;
  bytes: number;
  width: number;
  height: number;
  aliases: string[];
  /** "/posters/<name>.webp" (or ".jpg" from Safari) when a stored poster exists, otherwise null. */
  posterPath: string | null;
  createdAt: string;
}

export interface ItemsResponse {
  canonicalOrigin: string;
  adminAvailable: boolean;
  items: Item[];
}
