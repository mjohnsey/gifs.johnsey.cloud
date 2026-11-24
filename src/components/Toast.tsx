import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastTone = "ok" | "error";
type Notify = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<Notify>(() => {});

/** Shows one short message at a time in a polite live region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<ToastTone>("ok");
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const frame = useRef(0);

  const notify = useCallback<Notify>((next, nextTone = "ok") => {
    clearTimeout(hideTimer.current);
    cancelAnimationFrame(frame.current);
    // Clear first, then set on the next frame, so an identical message is announced again.
    setMessage("");
    setTone(nextTone);
    setVisible(true);
    frame.current = requestAnimationFrame(() => setMessage(next));
    hideTimer.current = setTimeout(() => setVisible(false), 2200);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <Toast message={message} tone={tone} visible={visible} />
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  return useContext(ToastContext);
}

export function Toast({ message, tone = "ok", visible }: { message: string; tone?: ToastTone; visible: boolean }) {
  const classes = ["toast", tone === "error" ? "toast-error" : "", visible ? "show" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes} role="status" aria-live="polite" aria-hidden={!visible}>
      {message}
    </div>
  );
}
