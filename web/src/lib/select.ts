// Radix Select forbids an empty-string item value, but many callers use
// { value: "" } (or a "None"/"Default"/"Library"/placeholder option) as a
// sentinel. Map "" <-> this private token so those selects keep working
// transparently — callers still see and emit "".
//
// Usage:
//   <Select value={toSelectToken(v)} onValueChange={(t) => onChange(fromSelectToken(t))}>
//     <SelectTrigger ...><SelectValue /></SelectTrigger>
//     <SelectContent>
//       {opts.map((o) => <SelectItem key={o.value} value={toSelectToken(o.value)}>{o.label}</SelectItem>)}
//     </SelectContent>
//   </Select>
//
// Selects whose option values are ALL non-empty (e.g. ["daily","weekly"]) do
// not need the shim — use Select/SelectItem with the raw values directly.
export const EMPTY_SELECT_TOKEN = "__empty__"

export function toSelectToken(v: string): string {
  return v === "" ? EMPTY_SELECT_TOKEN : v
}

export function fromSelectToken(v: string): string {
  return v === EMPTY_SELECT_TOKEN ? "" : v
}