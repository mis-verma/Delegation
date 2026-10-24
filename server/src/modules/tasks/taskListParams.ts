export const TASK_LIST_BUCKETS = ["pending", "completed", "due", "delayed"] as const
export const TASK_LIST_SORTS = ["dueDate", "priority", "createdAt", "title"] as const
export const TASK_LIST_CATEGORIES = ["issue", "delegation", "task", "work"] as const
export const TASK_LIST_SLAS = ["not_done", "done_late"] as const

export type TaskListBucket = (typeof TASK_LIST_BUCKETS)[number]
export type TaskListSort = (typeof TASK_LIST_SORTS)[number]
export type TaskListCategory = (typeof TASK_LIST_CATEGORIES)[number]
export type TaskListSla = (typeof TASK_LIST_SLAS)[number]
