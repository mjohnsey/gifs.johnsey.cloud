import type { ReactNode } from "react";
import { Link } from "react-router";

interface Props {
  word: string;
  lede: string;
  /** Home gets the wordmark as a plain heading; shelf pages link it back home. */
  linkHome?: boolean;
  children?: ReactNode;
}

export function Masthead({ word, lede, linkHome = false, children }: Props) {
  return (
    <header className="masthead">
      <h1>{linkHome ? <Link to="/">{word}</Link> : word}</h1>
      <div className="masthead-side">
        <p className="lede">{lede}</p>
        {children}
      </div>
    </header>
  );
}
