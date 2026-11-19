import ExcelJS from "exceljs"
import { db } from "../../config/db.js"
import { stores, users } from "../../db/schema/index.js"
import { listAllChecklistDefinitions } from "./checklistDefinitionSupport.js"

const HEADERS = ["Checklist Name", "Store", "Person", "Department"] as const

const HOW_TO_FILL: [string, string][] = [
    ["Checklist Name", "Required. Pick an existing recurring checklist from the list."],
    ["Store", "Required. The store this checklist should run at."],
    ["Person", "Required. Who should fill it in. Type their email or full name."],
    ["Department", "Optional. Just for reference — it is not matched to anything."],
]

export const buildChecklistImportTemplate = async (): Promise<Buffer> => {
    const [definitions, allStores, allUsers] = await Promise.all([
        listAllChecklistDefinitions(),
        db.select({ name: stores.name }).from(stores),
        db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users),
    ])

    const people = allUsers.map((u) => `${`${u.firstName} ${u.lastName ?? ""}`.trim()} (${u.email})`)
    const lists: string[][] = [
        definitions.map((d) => d.name),
        allStores.map((s) => s.name),
        people,
    ]

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Assignments", { views: [{ state: "frozen", ySplit: 1 }] })
    const how = workbook.addWorksheet("How to fill")
    const listSheet = workbook.addWorksheet("Lists", { state: "hidden" })

    sheet.addRow([...HEADERS])
    const header = sheet.getRow(1)
    header.height = 24
    header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003860" } }
        cell.alignment = { vertical: "middle" }
    })
    const widths = [34, 24, 34, 22]
    widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w })

    lists.forEach((values, col) => {
        values.forEach((v, row) => { listSheet.getCell(row + 2, col + 1).value = v })
    })

    const rule = (listIndex: number, title: string) => {
        const letter = String.fromCharCode("A".charCodeAt(0) + listIndex)
        const end = Math.max((lists[listIndex]?.length ?? 0) + 1, 2)
        return {
            type: "list" as const,
            allowBlank: true,
            formulae: [`Lists!$${letter}$2:$${letter}$${end}`],
            showErrorMessage: true,
            errorStyle: "warning" as const,
            errorTitle: title,
            error: "That is not on the list. It will be matched to the closest name, so please check it in the review step.",
        }
    }
    const FIRST_ROW = 2
    const LAST_ROW = 301
    for (let row = FIRST_ROW; row <= LAST_ROW; row++) {
        sheet.getCell(row, 1).dataValidation = rule(0, "Checklist Name")
        sheet.getCell(row, 2).dataValidation = rule(1, "Store")
        sheet.getCell(row, 3).dataValidation = rule(2, "Person")
    }

    how.getColumn(1).width = 18
    how.getColumn(2).width = 100
    how.addRow(["How to fill this sheet"]).font = { bold: true, size: 14 }
    how.addRow([])
    how.addRow(["One row per assignment: pick a checklist, a store, and a person. Fill the Assignments sheet from row 2, then upload the file. You get a review screen before anything is applied."])
    how.addRow([])
    for (const [name, help] of HOW_TO_FILL) {
        const row = how.addRow([name, help])
        row.getCell(1).font = { bold: true }
    }
    how.getRow(3).getCell(1).alignment = { wrapText: true }
    how.mergeCells("A3:B3")
    how.getRow(3).height = 34

    return Buffer.from(await workbook.xlsx.writeBuffer())
}
