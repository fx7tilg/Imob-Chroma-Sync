import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";

interface ToastMsg {
  id: number;
  type: "success" | "error" | "info";
  message: string;
}

let toastCallback: ((type: ToastMsg["type"], msg: string) => void) | null = null;

export function showToast(type: ToastMsg["type"], message: string) {
  toastCallback?.(type, message);
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info
};

const COLORS = {
  success: "var(--green)",
  error: "var(--red)",
  info: "var(--blue)"
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  useEffect(() => {
    toastCallback = (type, message) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, type, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };
    return () => {
      toastCallback = null;
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none"
      }}
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderLeft: `3px solid ${COLORS[t.type]}`,
              borderRadius: "var(--r-md)",
              padding: "0.75rem 1rem",
              fontSize: "0.8125rem",
              color: "var(--text-0)",
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              minWidth: 260,
              maxWidth: 400,
              animation: "fadeIn 200ms var(--ease)",
              pointerEvents: "auto"
            }}
          >
            <Icon size={16} style={{ color: COLORS[t.type], flexShrink: 0 }} />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
