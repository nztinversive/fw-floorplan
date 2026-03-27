"use client"

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { CheckCircle, AlertTriangle, Info, X, XCircle } from "lucide-react"

type ToastType = "success" | "error" | "warning" | "info"

type Toast = {
  id: number
  message: string
  type: ToastType
  exiting?: boolean
}

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {}
})

export function useToast() {
  return useContext(ToastContext)
}

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
}

const TYPE_CLASS: Record<ToastType, string> = {
  success: "is-success",
  error: "is-error",
  warning: "is-warning",
  info: ""
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const dismissToast = useCallback((id: number) => {
    setToasts((current) =>
      current.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    )
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, 240)
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = ++counterRef.current
      setToasts((current) => [...current, { id, message, type }])
      setTimeout(() => dismissToast(id), 3800)
    },
    [dismissToast]
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <div key={t.id} className={`toast ${TYPE_CLASS[t.type]}${t.exiting ? " is-exiting" : ""}`}>
              <Icon size={16} className="toast-icon" />
              <span>{t.message}</span>
              <button
                type="button"
                className="toast-dismiss"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
