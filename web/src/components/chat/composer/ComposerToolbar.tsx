import { useState } from "react"
import { ArrowUp, Square, Paperclip, Mic, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/IconButton"
import { ModePicker, ModelPicker, ToolsMenu, SourcesMenu } from "../ComposerControls"
import { useEscapeClose } from "@/lib/useEscapeClose"
import { cn } from "@/lib/utils"
import type { ComposerController } from "./useComposerController"

export function ComposerToolbar({ ctl }: { ctl: ComposerController }) {
  const { fileRef, onFiles, caps, toggleMic, transcribing, recording, streaming, onStop, submit, text, atts, uploading } = ctl
  // "+" reveals the tucked-away secondary controls (attach, Tools, Sources) in a
  // plain (non-Radix) floating tray. The tray is a bare <div>, NOT a Radix
  // menu/popover, so the inner Tools/Sources Popovers (portaled, side="top")
  // open without fighting an outer focus-trap. Mirrors MoreToolsMenu's icon
  // variant: fixed-inset backdrop (z-10) < tray (z-20) < Radix popover (z-50),
  // so a click inside an open Tools popover never closes the tray.
  const [moreOpen, setMoreOpen] = useState(false)
  useEscapeClose(moreOpen, () => setMoreOpen(false))
  return (
    <div className="mt-1 flex items-center gap-1">
      <div className="relative">
        <IconButton
          data-tour="tools-menu"
          icon={<Plus />}
          label="More options"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
          className={cn("text-muted-foreground", moreOpen && "bg-accent text-foreground")}
        />
        {moreOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
            <div className="absolute bottom-full left-0 z-20 mb-1.5 flex items-center gap-1 rounded-xl border bg-popover p-1 shadow-md">
              <IconButton
                data-tour="composer-attach"
                icon={<Paperclip />}
                label="Attach files"
                onClick={() => { setMoreOpen(false); fileRef.current?.click() }}
                className="text-muted-foreground"
              />
              <ToolsMenu />
              <SourcesMenu />
            </div>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      {caps?.stt && (
        <IconButton onClick={toggleMic} disabled={transcribing} label={recording ? "Stop recording" : "Dictate"} icon={transcribing ? <Loader2 className="animate-spin" /> : <Mic />} className={cn(recording ? "animate-pulse bg-destructive/15 text-destructive" : "text-muted-foreground")} />
      )}
      <div className="ml-auto flex items-center gap-2">
        <ModelPicker />
        <ModePicker />
        {streaming ? (
          <Button size="icon" variant="secondary" onClick={onStop} title="Stop" className="size-8 rounded-full"><Square className="size-4" /></Button>
        ) : (
          <Button size="icon" onClick={submit} disabled={(!text.trim() && atts.length === 0) || uploading} title="Send" className="size-8 rounded-full"><ArrowUp className="size-4" /></Button>
        )}
      </div>
    </div>
  )
}
