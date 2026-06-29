import { useModels } from "@/api/models"
import { EMPTY_SEL, type Sel } from "@/components/compare/util"

export function ModelSelect({
  value,
  onChange,
  label,
  allowEmpty = false,
  emptyLabel = "Select a model...",
}: {
  value: Sel
  onChange: (s: Sel) => void
  label: string
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const { data: models } = useModels()
  const items = models?.items || []
  const onPick = (val: string) => {
    if (val === "::") {
      onChange({ ...EMPTY_SEL })
      return
    }
    const i = val.indexOf("::"); const epId = val.slice(0, i); const model = val.slice(i + 2)
    const ep = items.find((e) => e.endpoint_id === epId)
    onChange({ model, endpointId: epId, endpointUrl: ep?.url || "" })
  }
  return (
    <div className="flex-1">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <select value={value.endpointId + "::" + value.model} onChange={(e) => onPick(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring">
        {(allowEmpty || !value.model) && <option value="::">{emptyLabel}</option>}
        {items.map((ep) => (
          <optgroup key={ep.endpoint_id} label={ep.endpoint_name || ep.url}>
            {[...(ep.models || []), ...(ep.models_extra || [])].map((m) => (
              <option key={ep.endpoint_id + m} value={ep.endpoint_id + "::" + m}>{m}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
