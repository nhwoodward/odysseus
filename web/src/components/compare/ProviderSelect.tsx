import { type SearchProviderInfo } from "@/api/compare"
import { type Sel } from "@/components/compare/util"

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
      <select
        value={value.model}
        onChange={(e) => onPick(e.target.value)}
        disabled={disabled || loading || providers.length === 0}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring disabled:opacity-50"
      >
        {!value.model && <option value="">{loading ? "Loading providers..." : "Select a provider..."}</option>}
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>{provider.label}</option>
        ))}
      </select>
    </div>
  )
}
