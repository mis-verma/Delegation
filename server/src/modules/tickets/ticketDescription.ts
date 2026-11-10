export type DescriptionParts = {
    description: string | undefined
    title: string
    assignmentMode: "AUTO" | "MANUAL" | undefined
    categoryName?: string | null
    subcategoryName?: string | null
}

export type DescriptionResult = { ok: true; text: string } | { ok: false; message: string }

export const resolveDescription = (parts: DescriptionParts): DescriptionResult => {
    const given = parts.description?.trim() ?? ""
    if (given) return { ok: true, text: given }
    if (parts.assignmentMode !== "AUTO") return { ok: false, message: "Add a description." }
    const where = [parts.categoryName, parts.subcategoryName].filter((v): v is string => !!v && !!v.trim()).join(" / ")
    return { ok: true, text: where ? `${where}: ${parts.title}` : parts.title }
}
