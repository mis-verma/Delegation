import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import type { Application } from "express"
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
    it("rotates the token and refuses the old one", async () => {
        const first = await login(accountOf("PC").email).set("X-Client-Platform", "native")
        const oldToken = first.body.refreshToken as string

        const second = await request(app).post("/auth/refresh").set("X-Client-Platform", "native").send({ refreshToken: oldToken })
        expect(second.status).toBe(200)
        expect(second.body.refreshToken).not.toBe(oldToken)

        const replay = await request(app).post("/auth/refresh").set("X-Client-Platform", "native").send({ refreshToken: oldToken })
        expect(replay.status).toBe(401)
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
