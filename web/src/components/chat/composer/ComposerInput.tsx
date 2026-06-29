import type { ComposerController } from "./useComposerController"

export function ComposerInput({ ctl }: { ctl: ComposerController }) {
  const { ref, text, uploading, setText, setSlashSel, setSlashDismissed, grow, onPaste, slashOpen, slashMatches, pickSlash, sel, lastSentRef, submit } = ctl
  return (
    <textarea
      data-tour="composer-input"
      ref={ref} value={text} rows={1} placeholder={uploading ? "Uploading…" : "Message Odysseus…  (/ for skills)"}
      onChange={(e) => { setText(e.target.value); setSlashSel(0); setSlashDismissed(false); grow() }}
      onPaste={onPaste}
      onKeyDown={(e) => {
        if (slashOpen) {
          if (e.key === "ArrowDown") { e.preventDefault(); setSlashSel((s) => Math.min(s + 1, slashMatches.length - 1)); return }
          if (e.key === "ArrowUp") { e.preventDefault(); setSlashSel((s) => Math.max(s - 1, 0)); return }
          if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickSlash(slashMatches[sel].name); return }
          if (e.key === "Escape") { e.preventDefault(); setSlashDismissed(true); return } // dismiss the menu, keep the text
        }
        // ArrowUp on an empty composer recalls the last sent message (parity
        // with the original composerArrowUpRecall).
        if (e.key === "ArrowUp" && !text && !e.shiftKey && !e.metaKey && lastSentRef.current) { e.preventDefault(); setText(lastSentRef.current); requestAnimationFrame(grow); return }
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() }
      }}
      className="max-h-[200px] w-full resize-none bg-transparent px-1 py-1.5 text-subhead outline-none placeholder:text-muted-foreground"
    />
  )
}
