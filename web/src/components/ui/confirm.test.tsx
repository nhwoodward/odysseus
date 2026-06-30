import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"
import { ConfirmProvider, useConfirm, type ConfirmOptions } from "@/components/ui/confirm"

afterEach(cleanup)

function Harness({ onResult, opts }: { onResult: (v: boolean) => void; opts?: ConfirmOptions }) {
  const confirm = useConfirm()
  return <button onClick={async () => onResult(await confirm(opts ?? { title: "Sure?" }))}>go</button>
}

describe("useConfirm", () => {
  it("opens the dialog and resolves true on confirm", async () => {
    const onResult = vi.fn()
    render(<ConfirmProvider><Harness onResult={onResult} /></ConfirmProvider>)
    fireEvent.click(screen.getByText("go"))
    expect(await screen.findByText("Sure?")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true))
  })

  it("resolves false on cancel", async () => {
    const onResult = vi.fn()
    render(<ConfirmProvider><Harness onResult={onResult} opts={{ title: "Delete?", destructive: true, confirmText: "Delete" }} /></ConfirmProvider>)
    fireEvent.click(screen.getByText("go"))
    await screen.findByText("Delete?")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false))
  })
})
