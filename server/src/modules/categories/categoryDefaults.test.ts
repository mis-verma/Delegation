import { describe, expect, it } from "vitest"
import { mergeTagIds } from "./categoryDefaults.js"

describe("mergeTagIds", () => {
    it("adds the category labels to the ones picked", () => {
        expect(mergeTagIds(["a"], ["b", "c"])).toEqual(["a", "b", "c"])
    })

    it("does not repeat a label", () => {
        expect(mergeTagIds(["a", "b"], ["b"])).toEqual(["a", "b"])
    })

    it("works when nothing was picked or nothing is set", () => {
        expect(mergeTagIds(undefined, ["x"])).toEqual(["x"])
        expect(mergeTagIds(["y"], [])).toEqual(["y"])
        expect(mergeTagIds(undefined, [])).toEqual([])
    })
})
