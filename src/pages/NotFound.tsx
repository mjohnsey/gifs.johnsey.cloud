import { Link } from "react-router";

export default function NotFound() {
  return (
    <main className="page">
      <h1 className="not-found">
        Nothing here. Try <Link to="/gifs/">the gifs</Link> or <Link to="/emoji/">the emoji</Link>.
      </h1>
    </main>
  );
}
