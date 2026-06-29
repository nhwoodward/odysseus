import * as React from "react"

const MOBILE_BREAKPOINT = 768

const isMobileNow = () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT

export function useIsMobile() {
  // Initial value computed in the initializer (not synchronously set inside the
  // effect — that trips Odysseus's no-setState-in-effect lint rule); the effect
  // only subscribes to viewport changes thereafter.
  const [isMobile, setIsMobile] = React.useState<boolean>(isMobileNow)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
