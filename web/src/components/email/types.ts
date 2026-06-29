import type { LucideIcon } from "lucide-react"
import type { EmailListFilter } from "@/api/email"
import type { EmailMsg } from "@/types"

// The list/search endpoints return a few fields the shared EmailMsg type
// doesn't model yet (folder stamp, flag/attachment markers). Augment locally
// rather than touch the shared types module.
export type EmailListItem = EmailMsg & {
  folder?: string; is_flagged?: boolean; has_attachments?: boolean; is_answered?: boolean;
  tags?: string[]; is_spam_verdict?: boolean; date_epoch?: number; to?: string; cc?: string;
}

export interface SenderFilter { address: string; label: string }

export interface Prefill { to?: string; cc?: string; bcc?: string; subject?: string; body?: string; inReplyTo?: string; references?: string; accountId?: string }

export interface EmailFilterOption { value: EmailListFilter; label: string; icon: LucideIcon }

export type BulkAction = "done" | "read" | "unread" | "delete"
export type EmailListRowAction =
  | "open-tab"
  | "remind-later"
  | "remind-tomorrow"
  | "read-toggle"
  | "favorite-toggle"
  | "done-toggle"
  | "archive"
  | "save-sender"
  | "spam"
  | "trash"
  | "permanent"
