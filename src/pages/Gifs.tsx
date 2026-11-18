import { useState } from "react";
import { useSearchParams } from "react-router";
import { CopyButton } from "../components/CopyButton";
import { Masthead } from "../components/Masthead";
import { SearchBox } from "../components/SearchBox";
import { useToast } from "../components/Toast";
import { useItems } from "../lib/api";
import { absoluteUrl } from "../lib/links";
import type { Item } from "../shared/types";
import "./gifs.css";

const HOVER_PLAY = "(hover: hover) and (pointer: fine)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function hoverPlays(): boolean {
  if (typeof matchMedia !== "function") return false;
  return matchMedia(HOVER_PLAY).matches && !matchMedia(REDUCED_MOTION).matches;
}

/** Every space- or hyphen-separated term must appear in the name or an alias. */
function matches(item: Item, terms: string[]): boolean {
  const haystack = [item.name, ...item.aliases].join(" ").toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

function Tile({ item, origin }: { item: Item; origin: string }) {
  const [playing, setPlaying] = useState(false);
  // Without a stored poster the image already is the gif, so there is nothing to start or stop.
  const canPlay = item.posterPath !== null;
  const src = playing || !canPlay ? item.path : (item.posterPath as string);

  return (
    <li className="tile">
      <button
        type="button"
        className="screen"
        aria-pressed={playing}
        aria-label={`${playing ? "Stop" : "Play"} ${item.name}`}
        onClick={() => canPlay && setPlaying((on) => !on)}
        onPointerEnter={() => canPlay && hoverPlays() && setPlaying(true)}
        onPointerLeave={() => canPlay && hoverPlays() && setPlaying(false)}
      >
        <img src={src} width={item.width} height={item.height} loading="lazy" decoding="async" alt="" />
      </button>
      <div className="caption">
        <a className="name" href={item.path}>
          {item.name}
        </a>
        <CopyButton
          text={absoluteUrl(origin, item.path)}
          label="Copy link"
          toast={`Copied link to ${item.name}`}
        />
        {item.aliases.length > 0 ? (
          <span className="aka">
            also{" "}
            {item.aliases.map((alias, i) => (
              <span key={alias}>
                {i > 0 ? ", " : ""}
                <a href={`/gifs/${alias}.gif`}>{alias}</a>
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export default function Gifs() {
  const { data, error } = useItems("gifs");
  const notify = useToast();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");

  const items = data?.items ?? [];
  const terms = query.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const shown = items.filter((item) => matches(item, terms));

  let hint = "Press / to search, Enter to copy the first match.";
  if (error) hint = error.message;
  else if (data) {
    hint = terms.length
      ? `${shown.length} of ${items.length} gifs match.`
      : `${items.length} gifs. Press / to search, Enter to copy the first match.`;
  }

  async function copyFirst() {
    const first = shown[0];
    if (!first || !data) return;
    const url = absoluteUrl(data.canonicalOrigin, first.path);
    try {
      await navigator.clipboard.writeText(url);
      notify(`Copied link to ${first.name}`);
    } catch {
      notify(`Couldn't copy. The link is ${url}`, "error");
    }
  }

  return (
    <>
      <Masthead word="gifs" lede="Reaction gifs, each at a link that won't change." linkHome>
        <SearchBox value={query} onChange={setQuery} onEnter={copyFirst} label="Find a gif" hint={hint} />
      </Masthead>
      <main className="page">
        {data && shown.length > 0 ? (
          <ul className="shelf">
            {shown.map((item) => (
              <Tile key={item.name} item={item} origin={data.canonicalOrigin} />
            ))}
          </ul>
        ) : null}
        {data && items.length === 0 ? <p className="empty">No gifs yet.</p> : null}
        {data && items.length > 0 && shown.length === 0 ? (
          <p className="empty">{`No gifs match "${query.trim()}". Try a shorter word.`}</p>
        ) : null}
      </main>
    </>
  );
}
