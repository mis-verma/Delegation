import { AppError } from "./AppError.js"

export const assertChecklistsResolved = (checklists: any[], actionLabel: string) => {
    const incomplete = (checklists ?? [])
        .flatMap((cl: any) => cl.items ?? [])
        .filter((item: any) => !item.isDone && !item.remarks?.trim())

    if (incomplete.length) {
        throw AppError.badRequest(
            `Add remarks explaining why these checklist items aren't done before ${actionLabel}: ${incomplete.map((i: any) => i.label).join(", ")}`,
        )
    }
}
