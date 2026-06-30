/* eslint-disable react-refresh/only-export-components -- provider + hook co-located by design */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export type ConfirmOptions = {
  title?: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}
type ConfirmFn = (opts?: ConfirmOptions) => Promise<boolean>

// Fallback if useConfirm() is called outside the provider (e.g. an isolated
// unit test) — degrades to native confirm instead of throwing.
const ConfirmContext = createContext<ConfirmFn>((o) =>
  Promise.resolve(window.confirm(o?.title || "Are you sure?")))

export function useConfirm() {
  return useContext(ConfirmContext)
}

// Promise-based replacement for native confirm()/window.confirm — one shared
// shadcn AlertDialog driven by context, so confirmations match the custom look
// instead of the OS dialog. Usage: `if (await confirm({ title, destructive })) …`.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions>({})
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((o = {}) => {
    setOpts(o)
    setOpen(true)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  const settle = useCallback((value: boolean) => {
    setOpen(false)
    resolver.current?.(value)
    resolver.current = null
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => { if (!next) settle(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title || "Are you sure?"}</AlertDialogTitle>
            {opts.description != null && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>{opts.cancelText || "Cancel"}</AlertDialogCancel>
            <AlertDialogAction variant={opts.destructive ? "destructive" : "default"} onClick={() => settle(true)}>
              {opts.confirmText || "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
