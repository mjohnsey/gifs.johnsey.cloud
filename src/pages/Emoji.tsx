import { useState } from "react";
import { useSearchParams } from "react-router";
import { CopyButton } from "../components/CopyButton";
import { Masthead } from "../components/Masthead";
import { SearchBox } from "../components/SearchBox";
import { useItems } from "../lib/api";
import { useCopy } from "../lib/copy";
import { emojiCode } from "../lib/links";
import type { Item } from "../shared/types";
import "./emoji.css";

/** Every space- or hyphen-separated term must appear in the name or an alias. */
function matches(item: Item, terms: string[]): boolean {
  const haystack = [item.name, ...item.aliases].join(" ").toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

function Tile({ item }: { item: Item }) {
  const code = emojiCode(item.name);
  return (
    <li className="tile">
      <div className="swatch">
        <img src={item.path} width={64} height={64} loading="lazy" decoding="async" alt="" />
      </div>
      <span className="name">{code}</span>
      <a className="download" href={item.path} download={`${item.name}.${item.ext}`} aria-label={`Download ${code}`}>
        Download
      </a>
      <CopyButton text={code} label="Copy" ariaLabel={`Copy ${code}`} toast={`Copied ${code}`} />
    </li>
  );
}

export default function Emoji() {
  const { data, error } = useItems("emoji");
  const copyText = useCopy();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");

  const items = data?.items ?? [];
  const terms = query
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean);
  const shown = items.filter((item) => matches(item, terms));

  let hint = "Press / to search, Enter to copy the first match.";
  if (error) hint = error.message;
  else if (data) {
    hint = terms.length
      ? `${shown.length} of ${items.length} emoji match.`
      : `${items.length} emoji. Press / to search, Enter to copy the first match.`;
  }

  async function copyFirst() {
    const first = shown[0];
    if (!first) return;
    const code = emojiCode(first.name);
    await copyText(code, `Copied ${code}`);
  }

  return (
    <>
      <Masthead word="emoji" lede="Slack emoji, ready to copy or download." linkHome>
        <SearchBox value={query} onChange={setQuery} onEnter={copyFirst} label="Find an emoji" hint={hint} />
      </Masthead>
      <main className="page emoji-page">
        {data && shown.length > 0 ? (
          <ul className="shelf">
            {shown.map((item) => (
              <Tile key={item.name} item={item} />
            ))}
          </ul>
        ) : null}
        {data && items.length === 0 ? (
          <p className="empty">
            {data.adminAvailable ? (
              <>
                No emoji yet. Add some from the <a href="/admin">admin page</a>.
              </>
            ) : (
              "No emoji yet. Add some from the admin page."
            )}
          </p>
        ) : null}
        {data && items.length > 0 && shown.length === 0 ? (
          <p className="empty">{`No emoji match "${query.trim()}". Try a shorter word.`}</p>
        ) : null}
      </main>
    </>
  );
}
