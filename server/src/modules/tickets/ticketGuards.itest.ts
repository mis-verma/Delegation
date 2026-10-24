import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import type { Application } from "express"
import { createId } from "@paralleldrive/cuid2"
import { eq, inArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { tickets } from "../../db/schema/ticket.js"
import { bootApp, createTestUsers, PASSWORD, removeTestUsers } from "../../test/integrationHarness.js"

let app: Application
let accounts: Awaited<ReturnType<typeof createTestUsers>>
let token: string
const ticketIds: string[] = []

const authed = (req: request.Test) => req.set("Authorization", `Bearer ${token}`)

const insertTicket = async (title: string) => {
    const id = createId()
    ticketIds.push(id)
    await db.insert(tickets).values({ id, title, description: `${title} details`, userId: accounts[0]!.id, assigneeId: accounts[0]!.id })
    const [row] = await db.select().from(tickets).where(eq(tickets.id, id))
    return row!
}

beforeAll(async () => {
    app = await bootApp()
    accounts = await createTestUsers(["USER"])
    const login = await request(app).post("/auth/login").send({ email: accounts[0]!.email, password: PASSWORD })
    token = login.body.accessToken as string
})

afterAll(async () => {
    await db.delete(tickets).where(inArray(tickets.id, ticketIds))
    await removeTestUsers((accounts ?? []).map((a) => a.id))
})

describe("ticket edit guard", () => {
    it("saves an edit made on the version the person opened", async () => {
        const ticket = await insertTicket("Fresh edit")
        const res = await authed(request(app).patch(`/tickets/${ticket.id}`)).send({ title: "Fresh edit v2", expectedUpdatedAt: ticket.updatedAt.toISOString() })
        expect(res.status).toBe(200)
        expect(res.body.data.title).toBe("Fresh edit v2")
    })

    it("refuses an edit made on an older version", async () => {
        const ticket = await insertTicket("Stale edit")
        const opened = ticket.updatedAt.toISOString()
        await db.update(tickets).set({ title: "Changed by someone else", updatedAt: new Date(ticket.updatedAt.getTime() + 5_000) }).where(eq(tickets.id, ticket.id))
        const res = await authed(request(app).patch(`/tickets/${ticket.id}`)).send({ title: "My overwrite", expectedUpdatedAt: opened })
        expect(res.status).toBe(409)
        const [after] = await db.select().from(tickets).where(eq(tickets.id, ticket.id))
        expect(after!.title).toBe("Changed by someone else")
    })

    it("still accepts a quick change that carries no version", async () => {
        const ticket = await insertTicket("No version")
        const res = await authed(request(app).patch(`/tickets/${ticket.id}`)).send({ title: "No version v2" })
        expect(res.status).toBe(200)
    })
})

describe("ticket withdraw guard", () => {
    it("withdraws an untouched ticket", async () => {
        const ticket = await insertTicket("Withdraw me")
        const res = await authed(request(app).delete(`/tickets/${ticket.id}`))
        expect(res.status).toBe(200)
        const [after] = await db.select().from(tickets).where(eq(tickets.id, ticket.id))
        expect(after!.deletedAt).not.toBeNull()
    })

    it("refuses a second withdraw of the same ticket", async () => {
        const ticket = await insertTicket("Withdraw twice")
        await authed(request(app).delete(`/tickets/${ticket.id}`))
        const again = await authed(request(app).delete(`/tickets/${ticket.id}`))
        expect(again.status).toBe(404)
    })
})
