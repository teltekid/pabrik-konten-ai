import * as React from 'react'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { cn } from '../../lib/utils'

type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastOptions {
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: number
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void
  success: (description: string, title?: string) => void
  error: (description: string, title?: string) => void
  info: (description: string, title?: string) => void
  warning: (description: string, title?: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

let counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const remove = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback((opts: ToastOptions) => {
    const id = ++counter
    const item: ToastItem = { id, variant: 'info', duration: 4000, ...opts }
    setItems((prev) => [...prev, item])
    if (item.duration && item.duration > 0) {
      setTimeout(() => remove(id), item.duration)
    }
  }, [remove])

  const api = React.useMemo<ToastContextValue>(() => ({
    toast,
    success: (description, title) => toast({ description, title, variant: 'success' }),
    error: (description, title) => toast({ description, title, variant: 'error', duration: 6000 }),
    info: (description, title) => toast({ description, title, variant: 'info' }),
    warning: (description, title) => toast({ description, title, variant: 'warning' }),
  }), [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster items={items} remove={remove} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    // fallback no-op agar tidak crash bila dipakai di luar provider
    const noop = () => {}
    return { toast: noop, success: noop, error: noop, info: noop, warning: noop }
  }
  return ctx
}

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5" />,
  error: <XCircle className="h-5 w-5" />,
  info: <Info className="h-5 w-5" />,
  warning: <AlertTriangle className="h-5 w-5" />,
}

const STYLES: Record<ToastVariant, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-accent/30 bg-accent/10 text-accent',
  warning: 'border-warning/30 bg-warning/10 text-warning',
}

const DEFAULT_TITLE: Record<ToastVariant, string> = {
  success: 'Berhasil',
  error: 'Gagal',
  info: 'Info',
  warning: 'Perhatian',
}

function Toaster({ items, remove }: { items: ToastItem[]; remove: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {items.map((t) => {
        const variant = t.variant || 'info'
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-soft animate-in slide-in-from-bottom-2 fade-in-0',
              STYLES[variant],
            )}
          >
            <div className="mt-0.5 shrink-0">{ICONS[variant]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{t.title || DEFAULT_TITLE[variant]}</p>
              {t.description && <p className="mt-0.5 text-sm text-muted-foreground break-words">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="shrink-0 rounded-sm opacity-60 transition-opacity hover:opacity-100"
              aria-label="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}