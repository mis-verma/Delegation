export const TICKET_LIST_BUCKETS = ["pending", "completed", "due", "delayed"] as const
export const TICKET_LIST_SORTS = ["tatDueAt", "priority", "createdAt", "title"] as const
export const TICKET_LIST_HANDLERS = ["assignee", "creator"] as const
export const TICKET_LIST_SLAS = ["overdue_open", "closed_late", "closed_on_time", "not_done"] as const

export type TicketListBucket = (typeof TICKET_LIST_BUCKETS)[number]
export type TicketListSort = (typeof TICKET_LIST_SORTS)[number]
export type TicketListHandler = (typeof TICKET_LIST_HANDLERS)[number]
export type TicketListSla = (typeof TICKET_LIST_SLAS)[number]
