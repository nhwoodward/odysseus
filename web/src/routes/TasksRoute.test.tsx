import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"
import { TasksRoute } from "./TasksRoute"
import type { Task } from "@/types"

const stub = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false })
const tasks: Task[] = [
  { id: "1", name: "Morning brief", task_type: "llm", status: "active", schedule: "daily", scheduled_time: "13:00", crew_member_id: "x" },
  { id: "2", name: "Summarize inbox", task_type: "action", action: "summarize_emails", status: "paused" },
  { id: "3", name: "Weekly research", task_type: "research", status: "active", schedule: "weekly", scheduled_day: 0, scheduled_time: "14:00" },
]

vi.mock("@/api/tasks", () => ({
  useTasks: () => ({ data: tasks }),
  useTaskMutations: () => ({
    run: stub(), stop: stub(), pause: stub(), resume: stub(), revert: stub(), clearCache: stub(), remove: stub(),
    create: stub(), update: stub(), parse: stub(), markOnboarding: stub(), saveUrgentEmailSettings: stub(),
  }),
  useTasksOnboarding: () => ({ data: { opened: true } }),
  useTaskRuns: () => ({ data: [] }),
  useRecentTaskRuns: () => ({ data: [] }),
  useTaskActions: () => ({ data: [] }),
  useTaskEvents: () => ({ data: [] }),
  useTaskOutputTargets: () => ({ data: [] }),
  useUrgentEmailSettings: () => ({ data: null }),
}))
vi.mock("@/api/models", () => ({ useModels: () => ({ data: { items: [] } }) }))

afterEach(cleanup)

const renderRoute = () => render(<QueryClientProvider client={new QueryClient()}><TasksRoute /></QueryClientProvider>)

describe("TasksRoute data table", () => {
  it("renders each task as a row", () => {
    renderRoute()
    expect(screen.getByText("Morning brief")).toBeInTheDocument()
    expect(screen.getByText("Summarize inbox")).toBeInTheDocument()
    expect(screen.getByText("Weekly research")).toBeInTheDocument()
  })

  it("filters by search query", () => {
    renderRoute()
    fireEvent.change(screen.getByLabelText("Search tasks"), { target: { value: "inbox" } })
    expect(screen.getByText("Summarize inbox")).toBeInTheDocument()
    expect(screen.queryByText("Morning brief")).toBeNull()
  })

  it("reveals a bulk-delete bar once rows are selected", () => {
    renderRoute()
    fireEvent.click(screen.getByLabelText("Select all"))
    expect(screen.getByText("3 selected")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument()
  })

  it("expands a row to show its detail panel", () => {
    renderRoute()
    fireEvent.click(screen.getAllByLabelText("Expand details")[0])
    expect(screen.getByText(/Output:/)).toBeInTheDocument()
    expect(screen.getByText(/Run History/i)).toBeInTheDocument()
  })
})
