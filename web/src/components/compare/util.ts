export interface Sel { model: string; endpointId: string; endpointUrl: string }
export type CompareMode = "chat" | "agent" | "search" | "research"

export interface EvalPrompt {
  sub: string
  label: string
  prompt: string
  answer?: string
}

export const EMPTY_SEL: Sel = { model: "", endpointId: "", endpointUrl: "" }

export type GradeStatus = "pass" | "fail"

export interface PaneMetrics { tokens_out?: number; tok_per_sec?: number; cost?: number; results?: number; time?: number; context_percent?: number }

export function shortName(model: string) {
  return model.split("/").pop() || model
}

export function formatElapsed(ms: number) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}
