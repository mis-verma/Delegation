import { describe, expect, it } from "vitest"
import { correctionRoundStart, isEarlierRoundPhoto, isFailedPhoto, passingPhotos, photoRoomError, photosInRound } from "./photoFailure.js"

describe("correction round photos", () => {
    const sentBackAt = new Date("2026-11-13T10:00:00Z")
    const before = { id: "a", createdAt: new Date("2026-11-13T09:00:00Z") }
    const after = { id: "b", createdAt: new Date("2026-11-13T11:00:00Z") }

    it("starts a round only for a question that is sent back", () => {
        expect(correctionRoundStart({ sendBackNote: "Blurry" }, { sentBackAt })).toBe(sentBackAt)
        expect(correctionRoundStart({ sendBackNote: null }, { sentBackAt })).toBeNull()
        expect(correctionRoundStart({ sendBackNote: "Blurry" }, { sentBackAt: null })).toBeNull()
    })

    it("counts only photos added after the send-back towards the limit", () => {
        expect(photosInRound([before, after], sentBackAt).map((p) => p.id)).toEqual(["b"])
        expect(photosInRound([before, after], null).map((p) => p.id)).toEqual(["a", "b"])
    })

    it("marks photos from before the send-back as earlier ones", () => {
        expect(isEarlierRoundPhoto(before, sentBackAt)).toBe(true)
        expect(isEarlierRoundPhoto(after, sentBackAt)).toBe(false)
        expect(isEarlierRoundPhoto(before, null)).toBe(false)
    })
})

describe("isFailedPhoto", () => {
    it("fails a photo the system flagged as blurry, unreadable or cropped", () => {
        expect(isFailedPhoto({ qualityFlags: "BLURRY", reviewStatus: "NONE" })).toBe(true)
        expect(isFailedPhoto({ qualityFlags: "TEXT_UNREADABLE", reviewStatus: "NONE" })).toBe(true)
        expect(isFailedPhoto({ qualityFlags: "DARK,CROPPED", reviewStatus: "NONE" })).toBe(true)
    })
    it("leaves dark and bright photos as advice only", () => {
        expect(isFailedPhoto({ qualityFlags: "DARK", reviewStatus: "NONE" })).toBe(false)
        expect(isFailedPhoto({ qualityFlags: "BRIGHT", reviewStatus: "NONE" })).toBe(false)
        expect(isFailedPhoto({ qualityFlags: null, reviewStatus: "NONE" })).toBe(false)
    })
    it("fails whatever the approver rejected, even with no flags", () => {
        expect(isFailedPhoto({ qualityFlags: null, reviewStatus: "REJECTED" })).toBe(true)
    })
    it("lets the approver accept a flagged photo", () => {
        expect(isFailedPhoto({ qualityFlags: "BLURRY", reviewStatus: "ACCEPTED" })).toBe(false)
    })
})

describe("passingPhotos", () => {
    it("drops the failed ones", () => {
        const kept = passingPhotos([
            { id: "a", qualityFlags: null, reviewStatus: "NONE" },
            { id: "b", qualityFlags: "BLURRY", reviewStatus: "NONE" },
            { id: "c", qualityFlags: null, reviewStatus: "REJECTED" },
            { id: "d", qualityFlags: "CROPPED", reviewStatus: "ACCEPTED" },
        ])
        expect(kept.map((p) => p.id)).toEqual(["a", "d"])
    })
})

const clear = (n: number) => Array.from({ length: n }, () => ({ qualityFlags: null, reviewStatus: "NONE" }))
const failed = (n: number) => Array.from({ length: n }, () => ({ qualityFlags: "BLURRY", reviewStatus: "NONE" }))

describe("photoRoomError", () => {
    it("allows up to 25 clear photos when the item sets no limit", () => {
        expect(photoRoomError(clear(20), 5, null)).toBeNull()
        expect(photoRoomError(clear(20), 6, null)).toContain("Only 5 more")
        expect(photoRoomError(clear(25), 1, null)).toContain("already has the maximum of 25")
    })
    it("uses the smaller of the item limit and 25", () => {
        expect(photoRoomError(clear(2), 1, 3)).toBeNull()
        expect(photoRoomError(clear(3), 1, 3)).toContain("maximum of 3")
        expect(photoRoomError(clear(25), 1, 40)).toContain("maximum of 25")
    })
    it("does not count failed photos against the clear limit", () => {
        expect(photoRoomError([...clear(24), ...failed(10)], 1, null)).toBeNull()
    })
    it("stops uploads once 25 photos have failed", () => {
        expect(photoRoomError(failed(25), 1, null)).toContain("did not pass the check")
    })
})
