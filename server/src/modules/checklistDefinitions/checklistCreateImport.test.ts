import { describe, expect, it } from "vitest"
import { buildGroupPreviews, groupKeyOf, parseRecurrenceText, readRowTimes, scheduleTimesFor, type CreateImportMatchedRow } from "./checklistCreateImport.service.js"

const row = (over: Partial<CreateImportMatchedRow["raw"]> & { rowIndex: number; personId?: string | null; storeId?: string | null }): CreateImportMatchedRow => ({
    rowIndex: over.rowIndex,
    raw: {
        checklistName: over.checklistName ?? "Stock & Tagging",
        recurrenceText: over.recurrenceText ?? "Daily",
        question: over.question ?? "In-transit stock age checked",
        photoRequired: over.photoRequired ?? false,
        personName: over.personName ?? "Sandeep Rahi",
        storeName: over.storeName ?? "Solan",
    },
    recurrence: parseRecurrenceText(over.recurrenceText ?? "Daily"),
    personId: over.personId === undefined ? "u1" : over.personId,
    personMatchConfidence: over.personId === null ? "none" : "exact",
    storeId: over.storeId === undefined ? "s1" : over.storeId,
    storeMatchConfidence: over.storeId === null ? "none" : "exact",
})

describe("reading the Type column", () => {
    it("reads the plain recurrence words, any case", () => {
        expect(parseRecurrenceText("Daily")).toBe("DAILY")
        expect(parseRecurrenceText("weekly")).toBe("WEEKLY")
        expect(parseRecurrenceText("MONTHLY")).toBe("MONTHLY")
    })

    it("reads the enum's own names too", () => {
        expect(parseRecurrenceText("TWICE_WEEKLY")).toBe("TWICE_WEEKLY")
        expect(parseRecurrenceText("one_time")).toBe("ONE_TIME")
    })

    it("reads the friendlier aliases", () => {
        expect(parseRecurrenceText("Twice a week")).toBe("TWICE_WEEKLY")
        expect(parseRecurrenceText("Annual")).toBe("YEARLY")
        expect(parseRecurrenceText("Once")).toBe("ONE_TIME")
    })

    it("gives up on nonsense or blank text", () => {
        expect(parseRecurrenceText("")).toBeNull()
        expect(parseRecurrenceText("Fortnightly")).toBeNull()
    })
})

describe("grouping rows into checklists", () => {
    it("keeps one checklist name under one type as a single group", () => {
        const rows = [row({ rowIndex: 1 }), row({ rowIndex: 2, question: "Daily counting of HO locations done" })]
        const groups = buildGroupPreviews(rows)
        expect(groups).toHaveLength(1)
        expect(groups[0]!.items.map((i) => i.label)).toEqual(["In-transit stock age checked", "Daily counting of HO locations done"])
    })

    it("splits the same checklist name into separate groups per type", () => {
        const rows = [row({ rowIndex: 1, recurrenceText: "Daily" }), row({ rowIndex: 2, recurrenceText: "Weekly" })]
        expect(buildGroupPreviews(rows)).toHaveLength(2)
    })

    it("treats checklist names as the same group regardless of case or spacing", () => {
        const rows = [row({ rowIndex: 1, checklistName: "Stock & Tagging" }), row({ rowIndex: 2, checklistName: "  stock & tagging  " })]
        expect(buildGroupPreviews(rows)).toHaveLength(1)
    })

    it("shares one checklist across several people and stores", () => {
        const rows = [
            row({ rowIndex: 1, personName: "Sandeep Rahi", personId: "u1", storeName: "Solan", storeId: "s1" }),
            row({ rowIndex: 2, personName: "Ranveer", personId: "u2", storeName: "Rohru", storeId: "s2" }),
        ]
        const [group] = buildGroupPreviews(rows)
        expect(group!.personIds.sort()).toEqual(["u1", "u2"])
        expect(group!.storeIds.sort()).toEqual(["s1", "s2"])
    })

    it("dedupes the exact same question appearing on more than one row", () => {
        const rows = [row({ rowIndex: 1, question: "Same task" }), row({ rowIndex: 2, question: "same task", personId: "u2" })]
        const [group] = buildGroupPreviews(rows)
        expect(group!.items).toHaveLength(1)
    })

    it("flags a question whose photo requirement disagrees between rows", () => {
        const rows = [row({ rowIndex: 1, question: "Same task", photoRequired: true }), row({ rowIndex: 2, question: "Same task", photoRequired: false })]
        const [group] = buildGroupPreviews(rows)
        expect(group!.items).toHaveLength(1)
        expect(group!.items[0]!.conflict).toBe(true)
    })

    it("lists a person or store it could not match by name, without losing the row", () => {
        const rows = [row({ rowIndex: 1, personName: "Someone New", personId: null, storeName: "Nowhere", storeId: null })]
        const [group] = buildGroupPreviews(rows)
        expect(group!.personIds).toEqual([])
        expect(group!.unmatchedPeople).toEqual(["Someone New"])
        expect(group!.unmatchedStores).toEqual(["Nowhere"])
    })

    it("keeps checklists with no recognised type as their own group, not merged with a typed one", () => {
        const rows = [row({ rowIndex: 1, recurrenceText: "Daily" }), row({ rowIndex: 2, recurrenceText: "Not a real type" })]
        expect(buildGroupPreviews(rows)).toHaveLength(2)
        expect(groupKeyOf("Stock & Tagging", null)).not.toBe(groupKeyOf("Stock & Tagging", "DAILY"))
    })
})

describe("times from the sheet", () => {
    it("reads Opens/Closes columns and a time slot column", () => {
        expect(readRowTimes({ opensText: "9:30 AM", closesText: "6:30 PM", lateText: "9 PM", slotText: "" }))
            .toEqual({ opensTime: "09:30", cutoffTime: "18:30", lateUntilTime: "21:00", problems: [] })
        expect(readRowTimes({ opensText: "", closesText: "", lateText: "", slotText: "9:30 AM – 6:30 PM" }))
            .toEqual({ opensTime: "09:30", cutoffTime: "18:30", lateUntilTime: null, problems: [] })
    })

    it("lists a time it could not read instead of guessing", () => {
        expect(readRowTimes({ opensText: "", closesText: "evening", lateText: "", slotText: "" }).problems).toEqual(['Closes "evening"'])
    })

    it("flags rows of one checklist that disagree on time", () => {
        const a = { ...row({ rowIndex: 1 }), times: { opensTime: "09:30", cutoffTime: "18:30", lateUntilTime: null, problems: [] } }
        const b = { ...row({ rowIndex: 2, question: "Other" }), times: { opensTime: "09:30", cutoffTime: "17:00", lateUntilTime: null, problems: [] } }
        const [group] = buildGroupPreviews([a, b])
        expect(group!.cutoffTime).toBe("18:30")
        expect(group!.timeConflict).toBe(true)
    })
})

describe("times used when creating", () => {
    it("falls back to 9:30, 6:30 PM and late till 9 PM for daily checklists", () => {
        expect(scheduleTimesFor({ recurrence: "DAILY" }, {})).toEqual({ opensTime: "09:30", cutoffTime: "18:30", lateUntilTime: "21:00" })
    })

    it("lets the sheet beat the batch and the batch beat the default", () => {
        expect(scheduleTimesFor({ recurrence: "DAILY", cutoffTime: "17:00" }, { opensTime: "10:00", cutoffTime: "19:00" }))
            .toEqual({ opensTime: "10:00", cutoffTime: "17:00", lateUntilTime: "21:00" })
    })

    it("drops a late window that would not be valid instead of failing", () => {
        expect(scheduleTimesFor({ recurrence: "DAILY", opensTime: "18:00", cutoffTime: "23:00" }, {}).lateUntilTime).toBeUndefined()
    })

    it("never sets times on weekly or monthly checklists", () => {
        expect(scheduleTimesFor({ recurrence: "WEEKLY", cutoffTime: "17:00" }, {})).toEqual({ opensTime: undefined, cutoffTime: undefined, lateUntilTime: undefined })
    })
})
