const ORG_UTC_OFFSET = "+05:30"
const DEFAULT_TIME = "18:00"
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const pad2 = (n: number) => String(n).padStart(2, "0")

export const parseImportDate = (text: string, time: string = DEFAULT_TIME): Date | null => {
    const t = text.trim()
    let year = 0
    let month = 0
    let day = 0
    const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
    if (iso) {
        year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3])
    } else if (dmy) {
        day = Number(dmy[1]); month = Number(dmy[2]); year = Number(dmy[3])
        if (year < 100) year += 2000
    } else {
        const dayFirst = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s*(\d{4})?$/)
        const monthFirst = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/)
        const parts = dayFirst ? { d: dayFirst[1], m: dayFirst[2], y: dayFirst[3] } : monthFirst ? { d: monthFirst[2], m: monthFirst[1], y: monthFirst[3] } : null
        const monthIndex = parts ? MONTHS.indexOf(parts.m!.slice(0, 3).toLowerCase()) : -1
        if (!parts || monthIndex < 0) return null
        day = Number(parts.d)
        month = monthIndex + 1
        year = parts.y ? Number(parts.y) : new Date().getFullYear()
    }
    const calendar = new Date(Date.UTC(year, month - 1, day))
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day) return null
    return new Date(`${year}-${pad2(month)}-${pad2(day)}T${time}:00${ORG_UTC_OFFSET}`)
}
