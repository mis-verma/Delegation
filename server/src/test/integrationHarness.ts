import http from "node:http"
import { createId } from "@paralleldrive/cuid2"
import { inArray } from "drizzle-orm"
import { db } from "../config/db.js"
import { refreshTokens, users, type Role } from "../db/schema/core.js"
import { settingsService } from "../modules/settings/settings.service.js"
import { initSocket } from "../sockets/socket.js"
import { hashPassword } from "../utils/password.js"
import App from "../app.js"

export const PASSWORD = "Integration-Pass-1"

export const assertThrowawayDatabase = () => {
    if (!process.env.DB_NAME_OVERRIDE) throw new Error("Integration tests only run against a throwaway database. Set DB_NAME_OVERRIDE.")
}

export const bootApp = async () => {
    assertThrowawayDatabase()
    await settingsService.init()
    const app = new App()
    await initSocket(http.createServer(app.app), false)
    return app.app
}

export const createTestUsers = async (roles: Role[]) => {
    const tag = createId().slice(0, 8)
    const passwordHash = await hashPassword(PASSWORD)
    const rows = roles.map((role) => ({
        id: createId(),
        email: `${role.toLowerCase()}.${tag}@itest.local`,
        passwordHash,
        firstName: role,
        role,
        isActive: true,
        mustChangePassword: false,
    }))
    await db.insert(users).values(rows)
    return rows
}

export const removeTestUsers = async (ids: string[]) => {
    if (!ids.length) return
    await db.delete(refreshTokens).where(inArray(refreshTokens.userId, ids))
    await db.delete(users).where(inArray(users.id, ids))
}
