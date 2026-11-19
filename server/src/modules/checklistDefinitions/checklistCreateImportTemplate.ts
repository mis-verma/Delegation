import ExcelJS from "exceljs"
import { db } from "../../config/db.js"
import { stores, users } from "../../db/schema/index.js"

const HEADERS = ["Checklist Name", "Type", "Question", "Photos Required", "Person", "Store"] as const
const RECURRENCES = ["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"]
const PHOTO_CHOICES = ["Yes", "No"]

const HOW_TO_FILL: [string, string][] = [
    ["Checklist Name", "Required. Rows with the same Checklist Name and Type become one checklist. Give several people the same name to share one checklist between them."],
    ["Type", "Required. How often it runs: Daily, Weekly, Monthly, Quarterly or Yearly."],
    ["Question", "Required. One task or question per row, exactly as it should appear on the checklist."],
    ["Photos Required", "Optional. Yes if this question needs a photo, otherwise No."],
    ["Person", "Required. Who should fill it in. Type their email or full name. Add more rows with the same Checklist Name to add more people."],
    ["Store", "Required. The store this checklist runs at. Add more rows with the same Checklist Name to add more stores."],
]

export const buildChecklistCreateImportTemplate = async (): Promise<Buffer> => {
    const [allStores, allUsers] = await Promise.all([
        db.select({ name: stores.name }).from(stores),
        db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users),
    ])

    const people = allUsers.map((u) => `${`${u.firstName} ${u.lastName ?? ""}`.trim()} (${u.email})`)
    const lists: string[][] = [
        RECURRENCES,
        PHOTO_CHOICES,
        people,
        allStores.map((s) => s.name),
    ]

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Checklists", { views: [{ state: "frozen", ySplit: 1 }] })
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
    const widths = [28, 12, 46, 16, 34, 20]
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
    const LAST_ROW = 601
    for (let row = FIRST_ROW; row <= LAST_ROW; row++) {
        sheet.getCell(row, 2).dataValidation = rule(0, "Type")
        sheet.getCell(row, 4).dataValidation = rule(1, "Photos Required")
        sheet.getCell(row, 5).dataValidation = rule(2, "Person")
        sheet.getCell(row, 6).dataValidation = rule(3, "Store")
    }

    how.getColumn(1).width = 18
    how.getColumn(2).width = 100
    how.addRow(["How to fill this sheet"]).font = { bold: true, size: 14 }
    how.addRow([])
    how.addRow(["One row per question per person. To share one checklist between several people, repeat the same Checklist Name and Type on each of their rows. Fill the Checklists sheet from row 2, then upload the file. You get a review screen before anything is created."])
    how.addRow([])
    for (const [name, help] of HOW_TO_FILL) {
        const row = how.addRow([name, help])
        row.getCell(1).font = { bold: true }
    }
    how.getRow(3).getCell(1).alignment = { wrapText: true }
    how.mergeCells("A3:B3")
    how.getRow(3).height = 48

    return Buffer.from(await workbook.xlsx.writeBuffer())
}
