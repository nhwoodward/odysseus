import { toast as sonnerToast } from "sonner"

export type ToastKind = "error" | "info" | "success"

// Thin shim over sonner (the shadcn <Toaster/>). Keeps the existing
// `toast("message", "error")` call-sites across the app working unchanged after
// migrating off the bespoke Zustand toast store. The old third positional arg
// (durationMs) maps to sonner's { duration } option.
export function toast(message: string, kind: ToastKind = "error", durationMs?: number) {
  const opts = durationMs ? { duration: durationMs } : undefined
  if (kind === "success") return sonnerToast.success(message, opts)
  if (kind === "info") return sonnerToast.info(message, opts)
  return sonnerToast.error(message, opts)
}

// Back-compat for the few call-sites that used the store hook / push API.
export const push = toast
export function useToast() {
  return { push: toast, dismiss: (id?: string | number) => sonnerToast.dismiss(id) }
}
