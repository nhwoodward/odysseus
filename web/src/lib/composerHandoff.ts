import { useCallback } from "react"
import { useNavigate } from "react-router-dom"

// Durable handoff into the chat composer. A question is stashed in sessionStorage
// (consumed by the Composer when it mounts — this covers navigating in from
// another route, e.g. /finance, BEFORE the composer exists to hear the event)
// AND dispatched as an event (for a composer that is already mounted). Whichever
// path applies first clears the key, so the prefill never re-fires on a later
// mount. Don't replace this with a one-shot rAF/timeout: it would race the route
// transition and silently no-op.
export const PENDING_COMPOSER_KEY = "odysseus:pending-composer"

export function useAskAssistant() {
  const navigate = useNavigate()
  return useCallback((question?: string) => {
    if (question) {
      try {
        sessionStorage.setItem(PENDING_COMPOSER_KEY, question)
      } catch {
        /* sessionStorage unavailable (private mode / disabled) — event path still works */
      }
      window.dispatchEvent(new CustomEvent("odysseus:set-composer", { detail: question }))
    } else {
      window.dispatchEvent(new CustomEvent("odysseus:focus-composer"))
    }
    navigate("/chat")
  }, [navigate])
}
