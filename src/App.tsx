import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { ToastProvider } from "./components/Toast";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

/** React Router ignores trailing slashes, so send the bare form to the slash form by hand. */
function Shelf({ name }: { name: string }) {
  const { pathname, search } = useLocation();
  if (!pathname.endsWith("/")) return <Navigate to={`${pathname}/${search}`} replace />;
  // Replaced by the shelf pages in the next tasks.
  return <main className="page"><h1 className="page-title">{name}</h1></main>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/gifs" element={<Shelf name="Gifs" />} />
          <Route path="/emoji" element={<Shelf name="Emoji" />} />
          <Route path="/admin" element={<main className="page"><h1 className="page-title">Admin</h1></main>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
