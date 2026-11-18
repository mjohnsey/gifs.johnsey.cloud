import { useEffect, useRef } from "react";
import { CopyButton } from "../../components/CopyButton";
import type { Shelf } from "../../shared/types";

export interface QueuedItem {
  id: number;
  file: File;
  preview: string;
  ext: "gif" | "png" | "jpg" | null;
  width: number;
  height: number;
  shelf: Shelf;
  name: string;
  aliases: string;
  sourceUrl: string | null;
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
  link?: string;
}

interface Props {
  row: QueuedItem;
  problem: string | null;
  /** True when the row can't be saved even without a name problem, e.g. a png on the gifs shelf. */
  blocked: boolean;
  warnings: string[];
  busy: boolean;
  onChange: (patch: Partial<QueuedItem>) => void;
  onSave: () => void;
  onRemove: () => void;
}

export function QueueRow({ row, problem, blocked, warnings, busy, onChange, onSave, onRemove }: Props) {
  const saved = row.status === "saved";
  const actions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (saved) actions.current?.querySelector("button")?.focus();
  }, [saved]);
  const locked = saved || row.status === "saving";
  return (
    <li className={`queue-row${saved ? " is-saved" : ""}`}>
      <div className="queue-preview">
        <img src={row.preview} alt="" />
      </div>
      <div className="queue-fields">
        <div className="queue-shelf" role="radiogroup" aria-label="Shelf">
          {(["gifs", "emoji"] as const).map((s) => (
            <label key={s} className={row.shelf === s ? "on" : ""}>
              <input
                type="radio"
                name={`shelf-${row.id}`}
                checked={row.shelf === s}
                disabled={locked}
                onChange={() => onChange({ shelf: s })}
              />
              {s === "gifs" ? "Gifs" : "Emoji"}
            </label>
          ))}
        </div>
        <label className="queue-field">
          <span>Name</span>
          <input
            value={row.name}
            disabled={locked}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={problem ? true : undefined}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </label>
        <label className="queue-field">
          <span>Aliases</span>
          <input
            value={row.aliases}
            disabled={locked}
            placeholder="Optional, comma separated"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => onChange({ aliases: e.target.value })}
          />
        </label>
        {problem ? <p className="queue-problem">{problem}</p> : null}
        {warnings.map((w) => (
          <p key={w} className="queue-warning">
            {w}
          </p>
        ))}
        {row.status === "error" && row.error ? <p className="queue-problem" role="alert">{row.error}</p> : null}
        <div className="queue-actions" ref={actions}>
          {saved ? (
            <>
              <span className="queue-saved">Saved</span>
              <CopyButton text={row.link ?? ""} label="Copy link" toast={`Copied link to ${row.name}`} />
              <a className="queue-view" href={`/${row.shelf}/?q=${encodeURIComponent(row.name.trim())}`}>
                View on shelf
              </a>
            </>
          ) : (
            <button type="button" className="queue-save" disabled={busy || locked || problem !== null || blocked} onClick={onSave}>
              Save
            </button>
          )}
        </div>
      </div>
      <button type="button" className="queue-remove" aria-label={`Remove ${row.name || "this file"}`} disabled={row.status === "saving"} onClick={onRemove}>
        ✕
      </button>
    </li>
  );
}
