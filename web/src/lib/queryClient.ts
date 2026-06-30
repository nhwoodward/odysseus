import { QueryClient, MutationCache, QueryCache } from "@tanstack/react-query"
import { toast } from "@/stores/toast"

// Global safety net: any mutation that throws (e.g. an API call that checks
// res.ok) surfaces a toast, so failures are never silent. A mutation can opt
// out with meta: { silent: true } when it renders its own inline error.
export const queryClient = new QueryClient({
  // Same net for failed GETs — a rejected query used to be globally silent, so
  // a failed list load rendered the same "No X yet" empty state as genuinely
  // empty data (audit T3). A query opts out with meta: { silent: true } when it
  // shows its own inline error (e.g. a route's LoadError/retry card).
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (query.meta?.silent) return
      toast(err instanceof Error && err.message ? err.message : "Couldn't load — please retry.")
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return
      toast(err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.")
    },
  }),
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
})
