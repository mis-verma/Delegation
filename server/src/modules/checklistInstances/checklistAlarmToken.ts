import { createHmac, timingSafeEqual } from "node:crypto"

const PURPOSE = "checklist-alarm-snooze"

const signatureOf = (body: string, secret: string) => createHmac("sha256", secret).update(`${PURPOSE}:${body}`).digest("base64url")

export const signAlarmSnoozeToken = (instanceId: string, userId: string, expiresAtMs: number, secret: string): string => {
    const body = `${instanceId}.${userId}.${Math.floor(expiresAtMs)}`
    return `${body}.${signatureOf(body, secret)}`
}

export const readAlarmSnoozeToken = (token: string, secret: string, now = Date.now()): { instanceId: string; userId: string } | null => {
    const parts = token.split(".")
    if (parts.length !== 4) return null
    const [instanceId, userId, expiresRaw, signature] = parts as [string, string, string, string]
    if (!instanceId || !userId || !/^\d+$/.test(expiresRaw)) return null
    const expected = Buffer.from(signatureOf(`${instanceId}.${userId}.${expiresRaw}`, secret))
    const given = Buffer.from(signature)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
    if (Number(expiresRaw) <= now) return null
    return { instanceId, userId }
}
