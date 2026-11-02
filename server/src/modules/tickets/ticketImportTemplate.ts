import ExcelJS from "exceljs"
import { db } from "../../config/db.js"
import { stores } from "../../db/schema/index.js"
import { userService } from "../users/user.service.js"
import { departmentService } from "../departments/department.service.js"
import { categoryService } from "../categories/category.service.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"

const HEADERS = ["Title", "Description", "Category", "Department", "Person", "Due date", "Priority", "Store", "Labels"] as const
const FIRST_ROW = 2
const LAST_ROW = 301
const PRIORITIES = ["Low", "Medium", "High", "Critical"]

const HOW_TO_FILL: [string, string][] = [
    ["Title", "Required. One short line: what is wrong and where."],
    ["Description", "Required. What happened, when it started, who it affects."],
    ["Category", "Pick from the list. A category sends the ticket to the right team and sets the due time by itself."],
    ["Department", "Use this when there is no category. Pick the team that should handle it."],
    ["Person", "Optional with a department. Pick who should work on it."],
    ["Due date", "Optional. Type a date such as 2026-11-06 or 06/11/2026. Empty means the category's usual time."],
    ["Priority", "Optional. Low, Medium, High or Critical. Empty means Medium."],
    ["Store", "Optional. Pick the store the problem is at."],
    ["Labels", "Optional. Type several labels separated by commas."],
]

export const buildTicketImportTemplate = async (actor: AccessTokenPayload): Promise<Buffer> => {
    const [assignable, { data: departments }, allStores, allCategories] = await Promise.all([
        userService.listAssignable(actor),
        departmentService.list(),
        db.select({ name: stores.name }).from(stores),
        categoryService.list(),
    ])

    const people = assignable.map((u) => `${`${u.firstName} ${u.lastName ?? ""}`.trim()} (${u.email})`)
    const lists: string[][] = [
        allCategories.map((c) => c.name),
        departments.map((d) => d.name),
        people,
        allStores.map((s) => s.name),
        PRIORITIES,
    ]

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Tickets", { views: [{ state: "frozen", ySplit: 1 }] })
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
    const widths = [34, 46, 26, 24, 34, 14, 12, 22, 22]
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
    for (let row = FIRST_ROW; row <= LAST_ROW; row++) {
        sheet.getCell(row, 3).dataValidation = rule(0, "Category")
        sheet.getCell(row, 4).dataValidation = rule(1, "Department")
        sheet.getCell(row, 5).dataValidation = rule(2, "Person")
        sheet.getCell(row, 7).dataValidation = rule(4, "Priority")
        sheet.getCell(row, 8).dataValidation = rule(3, "Store")
        sheet.getCell(row, 6).numFmt = "yyyy-mm-dd"
    }

    how.getColumn(1).width = 18
    how.getColumn(2).width = 100
    how.addRow(["How to fill this sheet"]).font = { bold: true, size: 14 }
    how.addRow([])
    how.addRow(["Every ticket needs a Title, a Description, and either a Category or a Department. Fill the Tickets sheet from row 2, one ticket per row, then upload the file. You get a review screen before anything is created."])
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
