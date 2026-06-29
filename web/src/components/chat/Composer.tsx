import { cn } from "@/lib/utils"
import type { ChatAttachment } from "@/types"
import { useComposerController } from "./composer/useComposerController"
import { SlashMenu } from "./composer/SlashMenu"
import { AttachmentTray } from "./composer/AttachmentTray"
import { ComposerInput } from "./composer/ComposerInput"
import { ComposerToolbar } from "./composer/ComposerToolbar"

export function Composer(props: {
  onSend: (t: string, ids?: string[], sendAs?: string, opts?: { forceWeb?: boolean; attachments?: ChatAttachment[] }) => void
  onLocalReply: (display: string, reply: string) => void
  onClearMessages: (reply?: string) => void
  onStop: () => void
  streaming: boolean
  sessionId?: string
}) {
  const ctl = useComposerController(props)
  const { dragging, setDragging, onFiles } = ctl
  return (
    <div className="mx-auto w-full max-w-[768px] px-4 pb-4" data-tour="composer">
      <div
        data-tour="composer-dropzone"
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files) }}
        className={cn("relative rounded-2xl border bg-card p-2 pl-3 shadow-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/35", dragging && "border-ring ring-[3px] ring-ring/35")}>
        {dragging && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/80 text-sm font-medium text-muted-foreground">Drop files to attach</div>}
        <SlashMenu ctl={ctl} />
        <AttachmentTray ctl={ctl} />
        <ComposerInput ctl={ctl} />
        <ComposerToolbar ctl={ctl} />
      </div>
      <p className="mt-2 text-center text-label text-muted-foreground">Odysseus can make mistakes. Verify important info.</p>
    </div>
  )
}
