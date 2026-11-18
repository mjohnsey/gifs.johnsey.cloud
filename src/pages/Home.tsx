import { Link } from "react-router";
import { useItems } from "../lib/api";
import { Masthead } from "../components/Masthead";
import type { Item, Shelf } from "../shared/types";

const SAMPLES = 6;

const SHELVES: { shelf: Shelf; to: string; title: string; noun: (n: number) => string }[] = [
  { shelf: "gifs", to: "/gifs/", title: "Gifs", noun: (n) => (n === 1 ? "gif" : "gifs") },
  { shelf: "emoji", to: "/emoji/", title: "Emoji", noun: () => "emoji" },
];

function Samples({ items }: { items: Item[] }) {
  return (
    <ul className="samples" aria-hidden="true">
      {items.slice(0, SAMPLES).map((item) => (
        <li key={item.name}>
          <img src={item.posterPath ?? item.path} alt="" loading="lazy" decoding="async" />
        </li>
      ))}
    </ul>
  );
}

function ShelfLink({ spec }: { spec: (typeof SHELVES)[number] }) {
  const { data, error } = useItems(spec.shelf);
  const count = data?.items.length;
  return (
    <li>
      <Link to={spec.to} className="shelf-link">
        <span className="shelf-title">{spec.title}</span>
        <span className="shelf-count">
          {error ? "Couldn't load" : count === undefined ? " " : `${count} ${spec.noun(count)}`}
        </span>
        {data ? <Samples items={data.items} /> : null}
      </Link>
    </li>
  );
}

export default function Home() {
  return (
    <>
      <Masthead word="stash" lede="Gifs and Slack emoji I keep around, each at a link that won't change." />
      <main className="page">
        <ul className="shelf-links">
          {SHELVES.map((spec) => (
            <ShelfLink key={spec.shelf} spec={spec} />
          ))}
        </ul>
      </main>
    </>
  );
}
