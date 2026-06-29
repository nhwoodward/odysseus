import { useState } from "react"
import { Paperclip, Download, FileText } from "lucide-react"
import { IconButton } from "@/components/ui/IconButton"
import { attachmentAsDoc, attachmentDownloadUrl, type EmailAttachment } from "@/api/email"
import { canOpenAsDoc, formatSize } from "@/components/email/emailFormat"

export function AttachmentRow({ uid, folder, accountId, att }: { uid: string; folder: string; accountId?: string; att: EmailAttachment }) {
  const [busy, setBusy] = useState("")
  const [done, setDone] = useState("")
  const open = canOpenAsDoc(att.filename)
  const saveDoc = async () => {
    setBusy("doc"); setDone("")
    try {
      const r = await attachmentAsDoc(uid, att.index, folder, accountId)
      setDone(r.error ? r.error : "Saved to documents")
    } catch { setDone("Failed") } finally { setBusy("") }
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
      <Paperclip className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate" title={att.filename}>{att.filename}</span>
      {att.size ? <span className="shrink-0 text-xs text-muted-foreground">{formatSize(att.size)}</span> : null}
      {done && <span className="shrink-0 text-xs text-muted-foreground">{done}</span>}
      {open && (
        <IconButton icon={<FileText />} label="Save as document" onClick={saveDoc} disabled={!!busy} className="shrink-0 text-muted-foreground disabled:opacity-50" />
      )}
      <a href={attachmentDownloadUrl(uid, att.index, folder, accountId)} target="_blank" rel="noopener noreferrer" title="Download" aria-label="Download" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><Download className="size-4" /></a>
    </div>
  )
}
