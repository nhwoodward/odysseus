import { Star } from "lucide-react"
import { useEmailAccountMutations, type EmailAccount } from "@/api/accounts"
import { cn } from "@/lib/utils"

function accountLabel(account: EmailAccount): string {
  return account.name || account.from_address || account.imap_user || "Account"
}

export function AccountStrip({ accounts, current, onPick }: { accounts: EmailAccount[]; current?: string; onPick: (id: string) => void }) {
  const { setDefault } = useEmailAccountMutations()
  if (accounts.length === 0) return null
  return (
    <div className="shrink-0 border-b px-4 py-2">
      <div className="flex gap-1.5 overflow-x-auto">
        {accounts.map((account) => {
          const active = account.id === current
          const label = accountLabel(account)
          return (
            <span key={account.id} className="relative inline-flex shrink-0 items-center">
              <button
                type="button"
                disabled={account.enabled === false}
                onClick={() => onPick(account.id)}
                title={account.from_address || account.imap_user || label}
                className={cn(
                  "max-w-48 truncate rounded-md border py-1 pl-2.5 pr-7 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  active ? "border-foreground bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {label}
              </button>
              <button
                type="button"
                disabled={setDefault.isPending}
                onClick={(e) => { e.stopPropagation(); setDefault.mutate(account.id) }}
                title={account.is_default ? "Default account" : "Set as default"}
                aria-label={account.is_default ? "Default account" : "Set as default"}
                className={cn("absolute right-1.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50", account.is_default && "text-foreground")}
              >
                <Star className={cn("size-3", account.is_default && "fill-current")} />
              </button>
            </span>
          )
        })}
      </div>
    </div>
  )
}
