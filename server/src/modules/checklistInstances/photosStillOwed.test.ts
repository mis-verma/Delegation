import { describe, expect, it } from "vitest"
import { photosStillOwed } from "./checklistItemValidators.js"

const live = { captureMethod: "LIVE", reviewStatus: null, qualityFlags: null }
const gallery = { captureMethod: "GALLERY", reviewStatus: null, qualityFlags: null }

describe("photosStillOwed", () => {
    it("owes nothing when the question asks for no photo", () => {
        expect(photosStillOwed({ requiredImageCount: 0, requiresLivePhoto: false }, [])).toBe(0)
    })

    it("owes the full count when nothing has been uploaded", () => {
        expect(photosStillOwed({ requiredImageCount: 2, requiresLivePhoto: false }, [])).toBe(2)
    })

    it("counts down as clear photos arrive", () => {
        expect(photosStillOwed({ requiredImageCount: 2, requiresLivePhoto: false }, [live])).toBe(1)
        expect(photosStillOwed({ requiredImageCount: 2, requiresLivePhoto: false }, [live, gallery])).toBe(0)
    })

    it("does not accept a gallery photo where a live one is required", () => {
        expect(photosStillOwed({ requiredImageCount: 1, requiresLivePhoto: true }, [gallery])).toBe(1)
        expect(photosStillOwed({ requiredImageCount: 1, requiresLivePhoto: true }, [live])).toBe(0)
    })

    it("does not count a rejected photo", () => {
        expect(photosStillOwed({ requiredImageCount: 1, requiresLivePhoto: false }, [{ ...live, reviewStatus: "REJECTED" }])).toBe(1)
    })

    it("does not count a photo that failed the quality check", () => {
        expect(photosStillOwed({ requiredImageCount: 1, requiresLivePhoto: false }, [{ ...live, qualityFlags: "BLURRY" }])).toBe(1)
    })

    it("counts a flagged photo a reviewer accepted anyway", () => {
        expect(photosStillOwed({ requiredImageCount: 1, requiresLivePhoto: false }, [{ ...live, qualityFlags: "BLURRY", reviewStatus: "ACCEPTED" }])).toBe(0)
    })

    it("never reads below zero when there are more photos than asked for", () => {
        expect(photosStillOwed({ requiredImageCount: 1, requiresLivePhoto: false }, [live, live, live])).toBe(0)
    })
})
