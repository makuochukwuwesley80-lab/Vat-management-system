"use client";

import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; message: string; kind: "success" | "error" | "info" };
const ToastContext = createContext<{
  toast: (message: string, kind?: Toast["kind"]) => void;
}>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`glass-strong pointer-events-auto flex items-start gap-2.5 rounded-2xl p-4 text-sm shadow-glass-lg animate-fade-up ${
              t.kind === "error"
                ? "border-red-400/40"
                : t.kind === "success"
                ? "border-emerald-400/40"
                : "border-blue-400/40"
            }`}
          >
            <span aria-hidden className="mt-0.5 shrink-0">
              {t.kind === "error" ? "⚠️" : t.kind === "success" ? "✅" : "ℹ️"}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}
