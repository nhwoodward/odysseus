import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect } from "vitest"
import { AgentTimeline } from "./AgentTimeline"
import type { TimelineRound } from "./AgentTimeline"

// This suite is not run with vitest globals, so React Testing Library's
// auto-cleanup isn't registered — unmount between tests so repeated renders of
// the same labels don't accumulate in the DOM.
afterEach(cleanup)

const rounds: TimelineRound[] = [{
  display: "Let me look that up.",
  tools: [
    { name: "web_search", exitCode: 0, output: "results" },
    { name: "edit_document", docId: "d1", docTitle: "Report", diff: { text: "+a\n-b" } },
  ],
}]

describe("AgentTimeline", () => {
  it("renders a run header with done/total and friendly step labels", () => {
    render(<AgentTimeline rounds={rounds} streaming={false} deliverables={[]} />)
    expect(screen.getByText(/2\/2 steps/)).toBeInTheDocument()
    expect(screen.getByText("Web Search")).toBeInTheDocument()
    expect(screen.getByText("Edit Document")).toBeInTheDocument()
    expect(screen.getByText("Let me look that up.")).toBeInTheDocument()
  })

  it("collapsing the run header hides the steps but keeps the prose", () => {
    render(<AgentTimeline rounds={rounds} streaming={false} deliverables={[]} />)
    fireEvent.click(screen.getByRole("button", { name: /agent run/i }))
    expect(screen.queryByText("Web Search")).not.toBeInTheDocument()
    expect(screen.getByText("Let me look that up.")).toBeInTheDocument()
  })

  it("renders a Deliverables strip with chips", () => {
    render(
      <AgentTimeline
        rounds={rounds}
        streaming={false}
        deliverables={[
          { kind: "doc", title: "Report", docId: "d1" },
          { kind: "sources", title: "3 sources", count: 3, sources: [] },
        ]}
      />,
    )
    expect(screen.getByText("Deliverables")).toBeInTheDocument()
    expect(screen.getByText("Report")).toBeInTheDocument()
    expect(screen.getByText("3 sources")).toBeInTheDocument()
  })

  it("renders a text-only round with no run chrome", () => {
    render(<AgentTimeline rounds={[{ display: "Just text", tools: [] }]} streaming={false} deliverables={[]} />)
    expect(screen.queryByText(/steps/)).not.toBeInTheDocument()
    expect(screen.getByText("Just text")).toBeInTheDocument()
  })
})
