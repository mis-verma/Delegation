import { describe, expect, it } from "vitest"
import { escapeLike } from "./checklistInstanceSearch.js"

describe("escaping a search term for LIKE", () => {
    it("leaves normal text alone", () => {
        expect(escapeLike("Closing check")).toBe("Closing check")
    })

    it("escapes percent, underscore and backslash so they match literally", () => {
        expect(escapeLike("100%")).toBe("100\\%")
        expect(escapeLike("store_1")).toBe("store\\_1")
        expect(escapeLike("a\\b")).toBe("a\\\\b")
    })
})
