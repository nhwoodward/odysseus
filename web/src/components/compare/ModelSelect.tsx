import { useModels } from "@/api/models"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from "@/components/ui/select"
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
      <Select value={value.endpointId + "::" + value.model} onValueChange={onPick}>
        <SelectTrigger className="h-9 w-full px-2"><SelectValue placeholder={emptyLabel} /></SelectTrigger>
        <SelectContent>
          {(allowEmpty || !value.model) && <SelectItem value="::">{emptyLabel}</SelectItem>}
          {items.map((ep) => (
            <SelectGroup key={ep.endpoint_id}>
              <SelectLabel>{ep.endpoint_name || ep.url}</SelectLabel>
              {[...(ep.models || []), ...(ep.models_extra || [])].map((m) => (
                <SelectItem key={ep.endpoint_id + m} value={ep.endpoint_id + "::" + m}>{m}</SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
