import { describe, expect, it } from "vitest"
import { conditionalPhotoOwed } from "./checklistItemValidators.js"

const live = { captureMethod: "LIVE", reviewStatus: null, qualityFlags: null }
const gallery = { captureMethod: "GALLERY", reviewStatus: null, qualityFlags: null }

describe("conditionalPhotoOwed", () => {
    it("owes nothing when no answer is saved", () => {
        expect(conditionalPhotoOwed({ booleanAnswer: null, yesActions: ["REQUIRE_PHOTO"], noActions: [], requiresLivePhoto: false }, [])).toBe(false)
    })

    it("owes nothing when the answered rule doesn't ask for a photo", () => {
        expect(conditionalPhotoOwed({ booleanAnswer: "YES", yesActions: ["ASK_REASON"], noActions: [], requiresLivePhoto: false }, [])).toBe(false)
    })

    it("owes a photo when Yes triggers REQUIRE_PHOTO and none is there", () => {
        expect(conditionalPhotoOwed({ booleanAnswer: "YES", yesActions: ["REQUIRE_PHOTO"], noActions: [], requiresLivePhoto: false }, [])).toBe(true)
    })

    it("clears once a clear photo is there", () => {
        expect(conditionalPhotoOwed({ booleanAnswer: "YES", yesActions: ["REQUIRE_PHOTO"], noActions: [], requiresLivePhoto: false }, [live])).toBe(false)
    })

    it("does not count a gallery photo where a live one is required", () => {
        expect(conditionalPhotoOwed({ booleanAnswer: "YES", yesActions: ["REQUIRE_PHOTO"], noActions: [], requiresLivePhoto: true }, [gallery])).toBe(true)
        expect(conditionalPhotoOwed({ booleanAnswer: "YES", yesActions: ["REQUIRE_PHOTO"], noActions: [], requiresLivePhoto: true }, [live])).toBe(false)
    })

    it("applies a No-only photo rule to Yes too", () => {
        expect(conditionalPhotoOwed({ booleanAnswer: "YES", yesActions: [], noActions: ["REQUIRE_PHOTO"], requiresLivePhoto: false }, [])).toBe(true)
        expect(conditionalPhotoOwed({ booleanAnswer: "YES", yesActions: [], noActions: ["REQUIRE_PHOTO"], requiresLivePhoto: false }, [live])).toBe(false)
    })

    it("does not count a rejected or failed photo", () => {
        expect(conditionalPhotoOwed({ booleanAnswer: "NO", yesActions: [], noActions: ["REQUIRE_PHOTO"], requiresLivePhoto: false }, [{ ...live, reviewStatus: "REJECTED" }])).toBe(true)
        expect(conditionalPhotoOwed({ booleanAnswer: "NO", yesActions: [], noActions: ["REQUIRE_PHOTO"], requiresLivePhoto: false }, [{ ...live, qualityFlags: "BLURRY" }])).toBe(true)
    })
})
