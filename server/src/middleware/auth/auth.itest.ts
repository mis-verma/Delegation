import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import type { Application } from "express"
import { eq } from "drizzle-orm"
import { db } from "../../config/db.js"
import { refreshTokens } from "../../db/schema/core.js"
import { bootApp, createTestUsers, PASSWORD, removeTestUsers } from "../../test/integrationHarness.js"

let app: Application
let accounts: Awaited<ReturnType<typeof createTestUsers>>

const accountOf = (role: string) => accounts.find((a) => a.role === role)!
const login = (email: string, password = PASSWORD) => request(app).post("/auth/login").send({ email, password })

beforeAll(async () => {
    app = await bootApp()
    accounts = await createTestUsers(["USER", "MANAGER", "PC", "OWNER"])
})

afterAll(async () => {
    await removeTestUsers(accounts.map((a) => a.id))
})

describe("signing in", () => {
    it("returns an access token and sets the refresh cookie, without the refresh token in the body", async () => {
        const res = await login(accountOf("USER").email)
        expect(res.status).toBe(200)
        expect(typeof res.body.accessToken).toBe("string")
        expect(res.body.refreshToken).toBeUndefined()
        expect(String(res.headers["set-cookie"])).toContain("refreshToken=")
        expect(String(res.headers["set-cookie"])).toContain("HttpOnly")
    })

    it("gives the native app its refresh token in the body", async () => {
        const res = await login(accountOf("MANAGER").email).set("X-Client-Platform", "native")
        expect(res.status).toBe(200)
        expect(typeof res.body.refreshToken).toBe("string")
    })

    it("rejects a wrong password with the same message as an unknown email", async () => {
        const wrong = await login(accountOf("USER").email, "not-the-password")
        const unknown = await login("nobody.here@itest.local")
        expect(wrong.status).toBe(401)
        expect(unknown.status).toBe(401)
        expect(wrong.body.message).toBe(unknown.body.message)
    })
})

describe("refreshing a session", () => {
    const refresh = (token: string) => request(app).post("/auth/refresh").set("X-Client-Platform", "native").send({ refreshToken: token })

    it("rotates the token", async () => {
        const first = await login(accountOf("PC").email).set("X-Client-Platform", "native")
        const oldToken = first.body.refreshToken as string
        const second = await refresh(oldToken)
        expect(second.status).toBe(200)
        expect(second.body.refreshToken).not.toBe(oldToken)
    })

    it("lets a retry of the same token through right after a rotation, without ending other sessions", async () => {
        const first = await login(accountOf("PC").email).set("X-Client-Platform", "native")
        const otherDevice = await login(accountOf("PC").email).set("X-Client-Platform", "native")
        const oldToken = first.body.refreshToken as string

        const rotated = await refresh(oldToken)
        expect(rotated.status).toBe(200)
        const retry = await refresh(oldToken)
        expect(retry.status).toBe(200)
        expect(typeof retry.body.accessToken).toBe("string")

        const stillSignedIn = await refresh(otherDevice.body.refreshToken as string)
        expect(stillSignedIn.status).toBe(200)
    })

    it("treats an old rotated token as theft and ends every session", async () => {
        const first = await login(accountOf("MANAGER").email).set("X-Client-Platform", "native")
        const otherDevice = await login(accountOf("MANAGER").email).set("X-Client-Platform", "native")
        const oldToken = first.body.refreshToken as string
        const rotated = await refresh(oldToken)
        expect(rotated.status).toBe(200)

        await db.update(refreshTokens)
            .set({ revokedAt: new Date(Date.now() - 120_000) })
            .where(eq(refreshTokens.userId, accountOf("MANAGER").id))
        const replay = await refresh(oldToken)
        expect(replay.status).toBe(401)
        expect((await refresh(otherDevice.body.refreshToken as string)).status).toBe(401)
        expect((await refresh(rotated.body.refreshToken as string)).status).toBe(401)
    })

    it("never accepts a token again after logout, even straight away", async () => {
        const first = await login(accountOf("USER").email).set("X-Client-Platform", "native")
        const token = first.body.refreshToken as string
        await request(app).post("/auth/logout").set("X-Client-Platform", "native").send({ refreshToken: token })
        expect((await refresh(token)).status).toBe(401)
    })

    it("sends the refresh cookie for the whole site and clears the old /auth one", async () => {
        const res = await login(accountOf("USER").email)
        const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? [])
        const live = cookies.find((c) => c.startsWith("refreshToken=") && !c.includes("Expires=Thu, 01 Jan 1970"))
        const legacy = cookies.find((c) => c.startsWith("refreshToken=") && c.includes("Path=/auth"))
        expect(live).toContain("Path=/;")
        expect(live).toContain("HttpOnly")
        expect(legacy).toContain("Expires=Thu, 01 Jan 1970")
    })

    it("ignores a refresh token sent in the body by a browser", async () => {
        const first = await login(accountOf("USER").email).set("X-Client-Platform", "native")
        const res = await request(app).post("/auth/refresh").send({ refreshToken: first.body.refreshToken })
        expect(res.status).toBe(401)
    })
})

describe("protected routes", () => {
    it("needs a token", async () => {
        expect((await request(app).get("/tasks")).status).toBe(401)
    })

    it("keeps a normal user out of admin-only routes", async () => {
        const { body } = await login(accountOf("USER").email)
        const res = await request(app).get("/users").set("Authorization", `Bearer ${body.accessToken}`)
        expect(res.status).toBe(403)
    })

    it("keeps a manager out of settings changes", async () => {
        const { body } = await login(accountOf("MANAGER").email)
        const res = await request(app).patch("/settings").set("Authorization", `Bearer ${body.accessToken}`).send({ orgName: "Nope" })
        expect(res.status).toBe(403)
    })
})

describe("the read-only owner", () => {
    it("can read organisation scores", async () => {
        const { body } = await login(accountOf("OWNER").email)
        const res = await request(app).get("/scores/org-counts").set("Authorization", `Bearer ${body.accessToken}`)
        expect(res.status).toBe(200)
    })

    it("cannot create work", async () => {
        const { body } = await login(accountOf("OWNER").email)
        const res = await request(app).post("/tasks").set("Authorization", `Bearer ${body.accessToken}`).send({ title: "Should not exist" })
        expect(res.status).toBe(403)
    })

    it("cannot change settings", async () => {
        const { body } = await login(accountOf("OWNER").email)
        const res = await request(app).patch("/settings").set("Authorization", `Bearer ${body.accessToken}`).send({ orgName: "Nope" })
        expect(res.status).toBe(403)
    })
})
