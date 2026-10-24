import { AppError } from "./AppError.js"

type GatedItem = { isDone: boolean; remarks?: string | null; label: string }
type GatedChecklist = { items?: GatedItem[] | null }

export const assertChecklistsResolved = (checklists: GatedChecklist[] | null | undefined, actionLabel: string) => {
    const incomplete = (checklists ?? [])
        .flatMap((checklist) => checklist.items ?? [])
        .filter((item) => !item.isDone && !item.remarks?.trim())

    if (incomplete.length) {
        throw AppError.badRequest(
            `Add remarks explaining why these checklist items aren't done before ${actionLabel}: ${incomplete.map((item) => item.label).join(", ")}`,
        )
    }
}
