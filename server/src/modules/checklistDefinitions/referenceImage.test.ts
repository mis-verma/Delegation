import { describe, expect, it } from "vitest"
import { createChecklistDefinitionSchema } from "./checklistDefinition.validation.js"

const base = (item: Record<string, unknown>) => ({
    name: "Opening check",
    storeIds: ["store1"],
    recurrence: "DAILY",
    startDate: "2026-10-01",
    assigneeIds: [],
    items: [{ label: "Is the counter clean?", ...item }],
})

const stored = "/uploads/checklist-references/0123456789abcdef0123456789abcdef.jpg"

describe("checklist example photo", () => {
    it("accepts a photo uploaded to the references folder", () => {
        const parsed = createChecklistDefinitionSchema.safeParse(base({ referenceImageUrl: stored }))
        expect(parsed.success).toBe(true)
        expect(parsed.success && parsed.data.items[0]!.referenceImageUrl).toBe(stored)
    })

    it("drops the signature query when a saved checklist is saved again", () => {
        const parsed = createChecklistDefinitionSchema.safeParse(base({ referenceImageUrl: `${stored}?exp=123&sig=abc` }))
        expect(parsed.success).toBe(true)
        expect(parsed.success && parsed.data.items[0]!.referenceImageUrl).toBe(stored)
    })

    it("allows no photo or clearing it", () => {
        expect(createChecklistDefinitionSchema.safeParse(base({})).success).toBe(true)
        expect(createChecklistDefinitionSchema.safeParse(base({ referenceImageUrl: null })).success).toBe(true)
    })

    it("refuses a link that was not uploaded here", () => {
        expect(createChecklistDefinitionSchema.safeParse(base({ referenceImageUrl: "https://example.com/a.jpg" })).success).toBe(false)
        expect(createChecklistDefinitionSchema.safeParse(base({ referenceImageUrl: "/uploads/avatars/0123456789abcdef0123456789abcdef.jpg" })).success).toBe(false)
        expect(createChecklistDefinitionSchema.safeParse(base({ referenceImageUrl: "/uploads/checklist-references/../secret.jpg" })).success).toBe(false)
    })
})
