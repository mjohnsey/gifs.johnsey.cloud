import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  label?: string;
  placeholder?: string;
}

function isTyping(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** A search field. "/" focuses it from anywhere; Escape clears it. */
export function SearchBox({ value, onChange, onEnter, label = "Search", placeholder = label }: Props) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
      e.preventDefault();
      input.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form className="finder" role="search" onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="q" className="visually-hidden">
        {label}
      </label>
      <input
        id="q"
        ref={input}
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          } else if (e.key === "Enter") {
            onEnter?.();
          }
        }}
      />
      <p className="hint">Press / to search, Enter to copy the first match.</p>
    </form>
  );
}
