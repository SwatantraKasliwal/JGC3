import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { onError } from "../lib/errorBus.js";
import { errorText } from "../components/ui/index.jsx";

/* Short confirmations — "Order 03540 added", "Invoice created". They say what
   happened after a save so the user never has to hunt for proof. A failed
   save says so too (`tone: "error"`), and stays up long enough to be read. */
const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, { tone } = {}) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3200);
  }, []);

  // Saves that failed with no form of their own to say so (lib/errorBus.js).
  useEffect(() => onError((e) => {
    const t = errorText(e);
    toast(e?.status && e.status < 500 ? t.text : `${t.title} — ${t.text}`, { tone: "error" });
  }), [toast]);

  const value = useMemo(() => toast, [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-wrap">
          {toasts.map((t) => (
            <div key={t.id} className={`toast${t.tone === "error" ? " toast-err" : ""}`} role={t.tone === "error" ? "alert" : "status"}>
              {t.tone === "error"
                ? <AlertTriangle size={16} className="ti" strokeWidth={2.4} />
                : <Check size={16} className="ti" strokeWidth={2.6} />}
              {t.msg}
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
