import { ArrowUp, Square, Paperclip, Mic, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/IconButton"
import { ModePicker, ModelPicker, ToolsMenu, SourcesMenu } from "../ComposerControls"
import { cn } from "@/lib/utils"
import type { ComposerController } from "./useComposerController"

export function ComposerToolbar({ ctl }: { ctl: ComposerController }) {
  const { fileRef, onFiles, caps, toggleMic, transcribing, recording, streaming, onStop, submit, text, atts, uploading } = ctl
  return (
    <div className="mt-1 flex items-center gap-1">
      <IconButton data-tour="composer-attach" icon={<Paperclip />} label="Attach files" onClick={() => fileRef.current?.click()} className="text-muted-foreground" />
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      {caps?.stt && (
        <IconButton onClick={toggleMic} disabled={transcribing} label={recording ? "Stop recording" : "Dictate"} icon={transcribing ? <Loader2 className="animate-spin" /> : <Mic />} className={cn(recording ? "animate-pulse bg-destructive/15 text-destructive" : "text-muted-foreground")} />
      )}
      <ToolsMenu />
      <SourcesMenu />
      <div className="ml-auto flex items-center gap-2">
        <ModelPicker />
        <ModePicker />
        {streaming ? (
          <Button size="icon" variant="secondary" onClick={onStop} title="Stop" className="size-8 rounded-lg"><Square className="size-4" /></Button>
        ) : (
          <Button size="icon" onClick={submit} disabled={(!text.trim() && atts.length === 0) || uploading} title="Send" className="size-8 rounded-lg"><ArrowUp className="size-4" /></Button>
        )}
      </div>
    </div>
  )
}
