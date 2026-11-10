import { describe, expect, it } from "vitest"
import { ticketOptionConditions } from "./ticketListQuery.js"

describe("ticketOptionConditions category filters", () => {
    it("adds nothing when no category or subcategory is chosen", () => {
        expect(ticketOptionConditions({})).toHaveLength(0)
    })

    it("adds one condition per chosen filter", () => {
        expect(ticketOptionConditions({ categoryId: "c1" })).toHaveLength(1)
        expect(ticketOptionConditions({ categoryId: "c1", subcategoryId: "s1" })).toHaveLength(2)
        expect(ticketOptionConditions({ subcategoryId: "s1", priority: ["HIGH"] })).toHaveLength(2)
    })
})
