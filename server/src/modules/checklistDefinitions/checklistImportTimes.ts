const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/
const ISO_TIME = /T(\d{2}):(\d{2})/
const DAY_FRACTION = /^0?\.\d+$/
const SLOT_SPLIT = /\s*(?:-|–|—|\bto\b)\s*/i

const pad = (n: number) => String(n).padStart(2, "0")

export const parseClockText = (raw: string): string | null => {
    const text = raw.trim().toLowerCase().replace(/\s+/g, " ")
    if (!text) return null

    const iso = ISO_TIME.exec(raw)
    if (iso) return `${iso[1]}:${iso[2]}`

    if (DAY_FRACTION.test(text)) {
        const minutes = Math.round(Number(text) * 1440) % 1440
        return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
    }

    const match = CLOCK.exec(text.replace(".", ":").replace(/(\d)\s+(?=\d)/, "$1:"))
    if (!match) return null
    let hours = Number(match[1])
    const minutes = Number(match[2] ?? "0")
    const meridiem = match[3]?.replace(/\./g, "")
    if (minutes > 59) return null
    if (meridiem) {
        if (hours < 1 || hours > 12) return null
        hours = (hours % 12) + (meridiem === "pm" ? 12 : 0)
    }
    if (hours > 23) return null
    return `${pad(hours)}:${pad(minutes)}`
}

export const parseTimeSlot = (raw: string): { opensTime: string | null; cutoffTime: string | null } | null => {
    const parts = raw.trim().split(SLOT_SPLIT).filter(Boolean)
    if (parts.length !== 2) return null
    const [first, second] = parts as [string, string]
    const closes = parseClockText(second)
    const plain = parseClockText(first)
    if (!closes || !plain) return null
    const firstHasMeridiem = /(am|pm|a\.m\.|p\.m\.)$/i.test(first.trim())
    const secondMeridiem = /(am|pm)$/i.exec(second.trim())?.[1]
    const borrowed = !firstHasMeridiem && secondMeridiem ? parseClockText(`${first} ${secondMeridiem}`) : null
    return { opensTime: borrowed && borrowed < closes ? borrowed : plain, cutoffTime: closes }
}
