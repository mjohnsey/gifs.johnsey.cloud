import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Notify = (message: string) => void;

const ToastContext = createContext<Notify>(() => {});

/** Shows one short message at a time in a polite live region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback<Notify>((next) => {
    clearTimeout(timer.current);
    setMessage(next);
    setVisible(true);
    timer.current = setTimeout(() => setVisible(false), 2200);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <Toast message={message} visible={visible} />
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  return useContext(ToastContext);
}

export function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div className={visible ? "toast show" : "toast"} role="status" aria-live="polite">
      {message}
    </div>
  );
}
