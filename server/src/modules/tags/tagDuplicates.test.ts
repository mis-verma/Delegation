import { describe, expect, it } from "vitest"
import { duplicateGroups, labelKey, unusedTags, type TagLike } from "./tagDuplicates.js"

const tag = (id: string, name: string, tickets = 0, tasks = 0): TagLike => ({ id, name, tickets, tasks })

describe("label clean-up", () => {
    it("treats spacing, case and punctuation as the same label", () => {
        expect(labelKey("Wi-Fi")).toBe(labelKey("wifi"))
        expect(labelKey("  Network  Issue ")).toBe(labelKey("network_issue"))
        expect(labelKey("Urgent!")).toBe("urgent")
        expect(labelKey("   ")).toBe("")
    })

    it("keeps apart labels that really are different", () => {
        expect(labelKey("Network")).not.toBe(labelKey("Networking"))
        expect(duplicateGroups([tag("1", "Network"), tag("2", "Networking")])).toEqual([])
    })

    it("groups duplicates and keeps the one most tickets already use", () => {
        const groups = duplicateGroups([tag("a", "networking", 2), tag("b", "Networking", 40), tag("c", "NETWORKING", 1)])
        expect(groups).toHaveLength(1)
        expect(groups[0]!.keep.id).toBe("b")
        expect(groups[0]!.merge.map((t) => t.id).sort()).toEqual(["a", "c"])
    })

    it("falls back to the fullest spelling when nothing is used yet", () => {
        const groups = duplicateGroups([tag("a", "it"), tag("b", "I.T.")])
        expect(groups[0]!.keep.name).toBe("I.T.")
    })

    it("counts delegations as use, not just tickets", () => {
        const groups = duplicateGroups([tag("a", "Repair", 0, 9), tag("b", "repair", 1)])
        expect(groups[0]!.keep.id).toBe("a")
    })

    it("lists only the labels nothing points at", () => {
        expect(unusedTags([tag("a", "Used", 1), tag("b", "Spare"), tag("c", "Old", 0, 2)]).map((t) => t.id)).toEqual(["b"])
    })

    it("has nothing to say about a clean list", () => {
        expect(duplicateGroups([tag("a", "Urgent"), tag("b", "Repair")])).toEqual([])
        expect(duplicateGroups([])).toEqual([])
    })
})
