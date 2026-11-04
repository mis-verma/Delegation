import { describe, expect, it } from "vitest"
import { peopleAtStore } from "./checklistInstanceGenerator.job.js"

const people = [
    { id: "rohru", storeId: "R" },
    { id: "solan", storeId: "S" },
    { id: "floating", storeId: null },
    { id: "head-office", storeId: "HQ" },
]

describe("peopleAtStore", () => {
    it("keeps everyone when the checklist has one store", () => {
        expect(peopleAtStore(people, "R", ["R"]).map((p) => p.id)).toEqual(["rohru", "solan", "floating", "head-office"])
    })
    it("gives each store only its own staff when the checklist covers several stores", () => {
        expect(peopleAtStore(people, "R", ["R", "S"]).map((p) => p.id)).toEqual(["rohru", "floating", "head-office"])
        expect(peopleAtStore(people, "S", ["R", "S"]).map((p) => p.id)).toEqual(["solan", "floating", "head-office"])
    })
})
