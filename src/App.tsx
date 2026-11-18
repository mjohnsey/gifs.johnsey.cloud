import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { ToastProvider } from "./components/Toast";
import Gifs from "./pages/Gifs";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

/** React Router ignores trailing slashes, so send the bare form to the slash form by hand. */
function Shelf({ name, children }: { name: string; children?: ReactNode }) {
  const { pathname, search } = useLocation();
  if (!pathname.endsWith("/")) return <Navigate to={`${pathname}/${search}`} replace />;
  // Emoji is replaced by its shelf page in a later task.
  return children ?? <main className="page"><h1 className="page-title">{name}</h1></main>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/gifs" element={<Shelf name="Gifs"><Gifs /></Shelf>} />
      <Route path="/emoji" element={<Shelf name="Emoji" />} />
      <Route path="/admin" element={<main className="page"><h1 className="page-title">Admin</h1></main>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </BrowserRouter>
  );
}
