import { describe, expect, it } from "vitest"
import { isFailedPhoto, passingPhotos } from "./photoFailure.js"

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
