import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { slugify, isValidName } from "../../shared/names";
import { slackWarnings } from "../../shared/slack";
import type { Ext, Item, Shelf } from "../../shared/types";
import { useToast } from "../../components/Toast";
import { guessShelf } from "./guess";
import { makePoster, measureImage } from "./poster";
import { QueueRow, type QueuedItem } from "./QueueRow";

const GIFS_ONLY = "Only GIFs can go on the gifs shelf.";
const ALIAS_COPY = "Aliases use lowercase letters, numbers and hyphens.";
const SIGN_IN_STATUSES = [401, 403];

interface Props {
  /** Everything already saved, both shelves, for the taken-name check. */
  items: Item[];
  canonicalOrigin: string;
  onSaved: () => void;
  onSignInRequired: () => void;
}

function extOf(file: Blob & { name?: string }): Ext | null {
  if (file.type === "image/gif") return "gif";
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  const m = /\.(gif|png|jpe?g)$/i.exec(file.name ?? "");
  if (!m) return null;
  const e = m[1].toLowerCase();
  return e === "gif" || e === "png" ? e : "jpg";
}

function parseAliases(raw: string): string[] {
  return raw.split(",").map((a) => a.trim()).filter((a) => a !== "");
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // fall through
  }
  return `Something went wrong (${res.status}).`;
}

export function AddQueue({ items, canonicalOrigin, onSaved, onSignInRequired }: Props) {
  const notify = useToast();
  const [rows, setRows] = useState<QueuedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState("");
  const [resolving, setResolving] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [dragging, setDragging] = useState(false);
  const nextId = useRef(1);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      for (const r of rowsRef.current) URL.revokeObjectURL(r.preview);
    },
    [],
  );

  const taken = useMemo(() => {
    const byShelf: Record<Shelf, Set<string>> = { gifs: new Set(), emoji: new Set() };
    for (const i of items) {
      byShelf[i.shelf].add(i.name);
      for (const a of i.aliases) byShelf[i.shelf].add(a);
    }
    return byShelf;
  }, [items]);

  function patch(id: number, p: Partial<QueuedItem>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p, ...("name" in p || "aliases" in p || "shelf" in p ? { status: "idle" as const, error: undefined } : {}) } : r)));
  }

  async function addBlobs(files: File[], sourceUrl: string | null = null) {
    const added: QueuedItem[] = [];
    for (const file of files) {
      const ext = extOf(file);
      if (!ext && file.type && !file.type.startsWith("image/")) continue;
      const size = (await measureImage(file)) ?? { width: 0, height: 0 };
      added.push({
        id: nextId.current++,
        file,
        preview: URL.createObjectURL(file),
        ext,
        width: size.width,
        height: size.height,
        shelf: ext ? guessShelf({ ext, bytes: file.size, ...size }) : "emoji",
        name: slugify(file.name),
        aliases: "",
        sourceUrl,
        status: "idle",
      });
    }
    if (added.length) setRows((rs) => [...rs, ...added]);
  }

  async function addFromLink() {
    const url = link.trim();
    if (!url || resolving) return;
    setResolving(true);
    setLinkError("");
    try {
      const res = await fetch("/api/admin/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (SIGN_IN_STATUSES.includes(res.status)) return onSignInRequired();
      if (!res.ok) {
        const message = await errorMessage(res);
        setLinkError(message);
        notify(message, "error");
        return;
      }
      const blob = await res.blob();
      const suggested = res.headers.get("x-suggested-name") || "image";
      await addBlobs([new File([blob], suggested, { type: blob.type || res.headers.get("content-type") || "" })], res.headers.get("x-source-url") || url);
      setLink("");
    } catch {
      const message = "Couldn't reach the server. Try again.";
      setLinkError(message);
      notify(message, "error");
    } finally {
      setResolving(false);
    }
  }

  // Paste an image straight from the clipboard on desktop.
  const addBlobsRef = useRef(addBlobs);
  addBlobsRef.current = addBlobs;
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        void addBlobsRef.current(files);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void addBlobs([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  }

  function remove(id: number) {
    const row = rows.find((r) => r.id === id);
    if (row) URL.revokeObjectURL(row.preview);
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  /** Name and alias problems for one row, checked against saved items and the other queued rows. */
  function problemFor(row: QueuedItem): string | null {
    const name = row.name.trim();
    if (!isValidName(name)) return "Use lowercase letters, numbers and hyphens, up to 64 characters.";
    const others = rows.filter((r) => r.id !== row.id && r.shelf === row.shelf && r.status !== "saved");
    const claimed = (n: string) => taken[row.shelf].has(n) || others.some((r) => r.name.trim() === n || parseAliases(r.aliases).includes(n));
    if (claimed(name)) return `${name} is already taken.`;
    const aliases = parseAliases(row.aliases);
    if (!aliases.every(isValidName)) return ALIAS_COPY;
    if (new Set([name, ...aliases]).size !== aliases.length + 1) return "Each name and alias must be different.";
    const clash = aliases.find(claimed);
    return clash ? `${clash} is already taken.` : null;
  }

  function warningsFor(row: QueuedItem): string[] {
    const out: string[] = [];
    if (row.ext === null) out.push("That file type isn't supported. Use a GIF, PNG or JPG.");
    else if (row.shelf === "gifs" && row.ext !== "gif") out.push(GIFS_ONLY);
    else if (row.shelf === "emoji") out.push(...slackWarnings({ bytes: row.file.size, width: row.width, height: row.height, ext: row.ext }));
    return out;
  }

  const isBlocked = (row: QueuedItem) => row.ext === null || (row.shelf === "gifs" && row.ext !== "gif");

  async function saveRow(row: QueuedItem): Promise<"ok" | "failed" | "sign-in"> {
    patch(row.id, { status: "saving" });
    const name = row.name.trim();
    try {
      const form = new FormData();
      form.set("file", row.file, row.file.name);
      form.set("shelf", row.shelf);
      form.set("name", name);
      form.set("aliases", parseAliases(row.aliases).join(","));
      if (row.sourceUrl) form.set("sourceUrl", row.sourceUrl);
      if (row.shelf === "gifs") {
        const poster = await makePoster(row.file);
        if (poster) form.set("poster", poster, `${name}.webp`);
      }
      const res = await fetch("/api/admin/items", { method: "POST", body: form });
      if (SIGN_IN_STATUSES.includes(res.status)) {
        patch(row.id, { status: "idle" });
        onSignInRequired();
        return "sign-in";
      }
      if (!res.ok) {
        const message = await errorMessage(res);
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: "error", error: message } : r)));
        notify(message, "error");
        return "failed";
      }
      const body = (await res.json()) as { url?: string; item?: Item };
      const url = body.url ?? `${canonicalOrigin}${body.item?.path ?? ""}`;
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: "saved", link: url, error: undefined } : r)));
      notify(`Saved ${name}`);
      onSaved();
      return "ok";
    } catch {
      const message = "Couldn't reach the server. Try again.";
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: "error", error: message } : r)));
      notify(message, "error");
      return "failed";
    }
  }

  async function save(ids: number[]) {
    if (saving) return;
    setSaving(true);
    try {
      for (const id of ids) {
        const row = rowsRef.current.find((r) => r.id === id);
        if (!row || row.status === "saved" || problemFor(row) !== null || isBlocked(row)) continue;
        if ((await saveRow(row)) === "sign-in") break;
      }
    } finally {
      setSaving(false);
    }
  }

  const savable = rows.filter((r) => r.status !== "saved" && problemFor(r) === null && !isBlocked(r));

  return (
    <section className="add-queue" aria-label="Add to the stash">
      <form
        className="link-form"
        onSubmit={(e) => {
          e.preventDefault();
          void addFromLink();
        }}
      >
        <input
          type="url"
          inputMode="url"
          aria-label="Link to a gif or image"
          placeholder="Paste a link to a gif or image"
          value={link}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" disabled={resolving || link.trim() === ""}>
          {resolving ? "Adding" : "Add"}
        </button>
      </form>
      {linkError ? <p className="queue-problem" role="alert">{linkError}</p> : null}

      <label
        className={`drop${dragging ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="drop-title">Choose files</span>
        <span className="drop-hint">GIF, PNG or JPG. You can also drop or paste them.</span>
        <input
          ref={fileInput}
          type="file"
          accept="image/gif,image/png,image/jpeg"
          multiple
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void addBlobs(files);
          }}
        />
      </label>

      {rows.length > 0 ? (
        <>
          <ul className="queue">
            {rows.map((row) => (
              <QueueRow
                key={row.id}
                row={row}
                problem={row.status === "saved" ? null : problemFor(row)}
                blocked={isBlocked(row)}
                warnings={row.status === "saved" ? [] : warningsFor(row)}
                busy={saving}
                onChange={(p) => patch(row.id, p)}
                onSave={() => void save([row.id])}
                onRemove={() => remove(row.id)}
              />
            ))}
          </ul>
          <div className="queue-footer">
            <button type="button" className="save-all" disabled={saving || savable.length === 0} onClick={() => void save(rows.map((r) => r.id))}>
              Save all
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
