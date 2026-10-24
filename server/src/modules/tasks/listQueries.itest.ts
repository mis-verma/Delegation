import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import type { Application } from "express"
import { createId } from "@paralleldrive/cuid2"
import { inArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { tasks } from "../../db/schema/task.js"
import { tickets } from "../../db/schema/ticket.js"
import { bootApp, createTestUsers, PASSWORD, removeTestUsers } from "../../test/integrationHarness.js"

type Account = Awaited<ReturnType<typeof createTestUsers>>[number]

let app: Application
let accounts: Account[]
let owner: Account
let teammate: Account
let token: string
const taskIds: string[] = []
const ticketIds: string[] = []

const HOUR = 3_600_000
const at = (hours: number) => new Date(Date.now() + hours * HOUR)

const get = (path: string) => request(app).get(path).set("Authorization", `Bearer ${token}`)

beforeAll(async () => {
    app = await bootApp()
    accounts = await createTestUsers(["USER", "AGENT"])
    owner = accounts[0]!
    teammate = accounts[1]!
    const login = await request(app).post("/auth/login").send({ email: owner.email, password: PASSWORD })
    token = login.body.accessToken as string

    const task = (values: Partial<typeof tasks.$inferInsert> & { title: string }) => {
        const id = createId()
        taskIds.push(id)
        return { id, userId: owner.id, assigneeId: owner.id, ...values }
    }
    await db.insert(tasks).values([
        task({ title: "Open late", status: "todo", priority: "high", dueDate: at(-48) }),
        task({ title: "Open later", status: "in_progress", priority: "low", dueDate: at(48) }),
        task({ title: "Open no date", status: "todo", priority: "medium" }),
        task({ title: "Finished", status: "done", priority: "medium", dueDate: at(-24) }),
        task({ title: "Waiting", status: "pending_approval", priority: "high", dueDate: at(24) }),
        task({ title: "Issue", status: "todo", priority: "low", category: "issue", dueDate: at(72) }),
        task({ title: "Teammate work", status: "todo", priority: "medium", userId: teammate.id, assigneeId: owner.id, dueDate: at(96) }),
        task({ title: "Held back", status: "todo", priority: "medium", awaitingHeadApproval: true, dueDate: at(-12) }),
    ])

    const ticket = (values: Partial<typeof tickets.$inferInsert> & { title: string }) => {
        const id = createId()
        ticketIds.push(id)
        return { id, description: `${values.title} details`, userId: owner.id, assigneeId: owner.id, ...values }
    }
    await db.insert(tickets).values([
        ticket({ title: "Printer jam", status: "OPEN", priority: "HIGH", tatDueAt: at(-5), isOverdue: true }),
        ticket({ title: "Router reset", status: "IN_PROGRESS", priority: "LOW", tatDueAt: at(20) }),
        ticket({ title: "Badge request", status: "OPEN", priority: "CRITICAL" }),
        ticket({ title: "Shelf repair", status: "CLOSED", priority: "MEDIUM", tatDueAt: at(-30), closedAt: at(-40) }),
        ticket({ title: "Light bulbs 100%", status: "PENDING_APPROVAL", priority: "MEDIUM", tatDueAt: at(10), submittedAt: at(-1) }),
        ticket({ title: "Raised by mate", status: "OPEN", priority: "MEDIUM", userId: teammate.id, tatDueAt: at(40) }),
    ])
})

afterAll(async () => {
    await db.delete(tasks).where(inArray(tasks.id, taskIds))
    await db.delete(tickets).where(inArray(tickets.id, ticketIds))
    await removeTestUsers((accounts ?? []).map((a) => a.id))
})

const titles = (res: request.Response) => (res.body.data as { title: string }[]).map((t) => t.title)

describe("delegation list", () => {
    it("pages with the same totals a full load would give", async () => {
        const first = await get("/tasks?page=1&limit=3&sort=createdAt")
        const second = await get("/tasks?page=2&limit=3&sort=createdAt")
        expect(first.status).toBe(200)
        expect(first.body.meta.total).toBe(8)
        expect(first.body.meta.totalPages).toBe(3)
        expect(first.body.meta.hasNext).toBe(true)
        const seen = [...titles(first), ...titles(second)]
        expect(new Set(seen).size).toBe(6)
    })

    it("counts the quick buckets over the filtered set", async () => {
        const res = await get("/tasks?limit=50")
        expect(res.body.meta.counts).toEqual({ scope: 8, options: 8, pending: 5, completed: 2, due: 4, delayed: 1 })
    })

    it("narrows by bucket without changing the bucket counts", async () => {
        const res = await get("/tasks?bucket=delayed")
        expect(titles(res)).toEqual(["Open late"])
        expect(res.body.meta.total).toBe(1)
        expect(res.body.meta.counts.pending).toBe(5)
    })

    it("filters by priority, category and person", async () => {
        expect(titles(await get("/tasks?priority=high")).sort()).toEqual(["Open late", "Waiting"])
        expect(titles(await get("/tasks?category=issue"))).toEqual(["Issue"])
        expect(titles(await get(`/tasks?raisedByIds=${teammate.id}`))).toEqual(["Teammate work"])
        const mine = await get("/tasks?handledBy=creator")
        expect(titles(mine)).not.toContain("Teammate work")
    })

    it("sorts by due date with undated work last, and by priority", async () => {
        const byDue = titles(await get("/tasks?sort=dueDate&category=work"))
        expect(byDue[0]).toBe("Open late")
        expect(byDue.at(-1)).toBe("Open no date")
        const byPriority = titles(await get("/tasks?sort=priority"))
        expect(["Open late", "Waiting"]).toContain(byPriority[0])
        expect(["Open later", "Issue"]).toContain(byPriority.at(-1))
    })

    it("applies a due range and the not-done rule together", async () => {
        const from = at(-60).toISOString()
        const to = at(0).toISOString()
        const res = await get(`/tasks?dueFrom=${from}&dueTo=${to}&sla=not_done`)
        expect(titles(res).sort()).toEqual(["Held back", "Open late"])
    })

    it("filters by status and keeps the scope count unchanged", async () => {
        const res = await get("/tasks?filterStatus=done")
        expect(titles(res)).toEqual(["Finished"])
        expect(res.body.meta.counts.scope).toBe(8)
        expect(res.body.meta.counts.options).toBe(1)
    })

    it("rejects an unknown sort instead of ignoring it", async () => {
        const res = await get("/tasks?sort=nonsense")
        expect(res.status).toBe(400)
    })
})

describe("ticket list", () => {
    it("pages and reports totals", async () => {
        const res = await get("/tickets?page=1&limit=4&sort=createdAt")
        expect(res.status).toBe(200)
        expect(res.body.meta.total).toBe(6)
        expect(res.body.meta.totalPages).toBe(2)
        expect(res.body.data).toHaveLength(4)
    })

    it("counts buckets over the scope only, not the other filters", async () => {
        const res = await get("/tickets?filterStatus=OPEN&limit=50")
        expect(res.body.meta.total).toBe(3)
        expect(res.body.meta.counts).toEqual({ scope: 6, pending: 4, completed: 2, due: 2, delayed: 1 })
    })

    it("filters by bucket, priority, person and scope", async () => {
        expect(titles(await get("/tickets?bucket=delayed"))).toEqual(["Printer jam"])
        expect(titles(await get("/tickets?bucket=completed")).sort()).toEqual(["Light bulbs 100%", "Shelf repair"])
        expect(titles(await get("/tickets?priority=CRITICAL,LOW")).sort()).toEqual(["Badge request", "Router reset"])
        expect(titles(await get(`/tickets?raisedByIds=${teammate.id}`))).toEqual(["Raised by mate"])
        expect(titles(await get("/tickets?handledBy=creator"))).not.toContain("Raised by mate")
    })

    it("searches title and description, treating percent signs literally", async () => {
        expect(titles(await get("/tickets?q=printer"))).toEqual(["Printer jam"])
        expect(titles(await get("/tickets?q=details&limit=50"))).toHaveLength(6)
        expect(titles(await get("/tickets?q=100%25"))).toEqual(["Light bulbs 100%"])
        expect(titles(await get("/tickets?q=%25"))).toEqual(["Light bulbs 100%"])
    })

    it("sorts by priority with the most urgent first and by due time with undated last", async () => {
        const byPriority = titles(await get("/tickets?sort=priority"))
        expect(byPriority[0]).toBe("Badge request")
        const byDue = titles(await get("/tickets?sort=tatDueAt"))
        expect(byDue[0]).toBe("Shelf repair")
        expect(byDue.at(-1)).toBe("Badge request")
    })

    it("applies the not-done rule", async () => {
        const res = await get("/tickets?sla=not_done")
        expect(titles(res).sort()).toEqual(["Badge request", "Printer jam", "Raised by mate", "Router reset"])
    })
})
