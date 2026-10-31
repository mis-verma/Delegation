import { inArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { sendMail } from "../../config/mailer.js"
import { pushSubscriptions, users } from "../../db/schema/core.js"
import { settingsService } from "../settings/settings.service.js"
import { escapeHtml } from "../../utils/escapeHtml.js"

export const URGENT_TYPE = /ESCALATION|OVERDUE|CRITICAL|FAILED/

type UrgentRow = { recipientId: string; type: string; title: string; message: string }

const emailBody = (rows: UrgentRow[]) => {
    const items = rows.slice(0, 5)
        .map((row) => `<li><strong>${escapeHtml(row.title)}</strong><br>${escapeHtml(row.message.slice(0, 240))}</li>`)
        .join("")
    const more = rows.length > 5 ? `<p>and ${rows.length - 5} more. Open KaryaOS to see them all.</p>` : ""
    return `<p>These need attention and no phone alert is set up for your account:</p><ul>${items}</ul>${more}<p><a href="${escapeHtml(env.CLIENT_URL)}">Open KaryaOS</a></p>`
}

export const emailUrgentWithoutPush = async (rows: UrgentRow[], pushConfigured: boolean) => {
    if (!env.SMTP_HOST) return
    const urgent = rows.filter((row) => URGENT_TYPE.test(row.type))
    if (!urgent.length) return

    const recipientIds = [...new Set(urgent.map((row) => row.recipientId))]
    const withPush = pushConfigured
        ? new Set((await db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(inArray(pushSubscriptions.userId, recipientIds))).map((r) => r.userId))
        : new Set<string>()
    const needEmail = recipientIds.filter((id) => !withPush.has(id))
    if (!needEmail.length) return

    const people = await db.select({ id: users.id, email: users.email, isActive: users.isActive }).from(users).where(inArray(users.id, needEmail))
    const orgName = settingsService.getCached().orgName
    for (const person of people) {
        if (!person.isActive || !person.email) continue
        const mine = urgent.filter((row) => row.recipientId === person.id)
        try {
            await sendMail({ to: person.email, subject: `${orgName}: ${mine.length === 1 ? mine[0]!.title : `${mine.length} urgent updates`}`, html: emailBody(mine) })
        } catch (err) {
            console.error(`Urgent email to user ${person.id} failed`, err)
        }
    }
}

export const hasEmailFallback = () => !!env.SMTP_HOST

