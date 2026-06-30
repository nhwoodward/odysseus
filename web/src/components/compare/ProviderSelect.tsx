import { type SearchProviderInfo } from "@/api/compare"
import { type Sel } from "@/components/compare/util"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { toSelectToken, fromSelectToken } from "@/lib/select"

export function ProviderSelect({
  value,
  onChange,
  label,
  providers,
  loading,
  disabled,
}: {
  value: Sel
  onChange: (s: Sel) => void
  label: string
  providers: SearchProviderInfo[]
  loading: boolean
  disabled: boolean
}) {
  const onPick = (providerId: string) => {
    onChange({ model: providerId, endpointId: "", endpointUrl: "" })
  }
  return (
    <div className="flex-1">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <Select
        value={toSelectToken(value.model)}
        onValueChange={(v) => onPick(fromSelectToken(v))}
        disabled={disabled || loading || providers.length === 0}
      >
        <SelectTrigger className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring disabled:opacity-50"><SelectValue /></SelectTrigger>
        <SelectContent>
          {!value.model && <SelectItem value={toSelectToken("")}>{loading ? "Loading providers..." : "Select a provider..."}</SelectItem>}
          {providers.map((provider) => (
            <SelectItem key={provider.id} value={toSelectToken(provider.id)}>{provider.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
