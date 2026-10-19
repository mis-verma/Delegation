
export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

const IN_DAYS_PATTERN = /\bin\s+(\d+)\s+days?\b/

export const daysUntilWeekday = (currentDay: number, targetDay: number): number =>
    (targetDay + 7 - currentDay) % 7 || 7

export const matchInDays = (text: string): number | null => {
    const match = text.toLowerCase().match(IN_DAYS_PATTERN)
    return match ? Number(match[1]) : null
}
