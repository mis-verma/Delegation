import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import type { Application } from "express"
import { createId } from "@paralleldrive/cuid2"
import { eq, inArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { auditLogs, departments, notifications, refreshTokens, users, type Role } from "../../db/schema/core.js"
import { tickets, ticketStatusUpdates } from "../../db/schema/ticket.js"
import { hashPassword } from "../../utils/password.js"
import { bootApp, PASSWORD } from "../../test/integrationHarness.js"

type Person = { id: string; email: string }

let app: Application
const departmentIds: Record<"a" | "b" | "c", string> = { a: createId(), b: createId(), c: createId() }
const people: Record<string, Person> = {}
const tokens: Record<string, string> = {}
const createdTicketIds: string[] = []

const SPEC: { key: string; role: Role; department: "a" | "b" | "c" | null }[] = [
    { key: "headA", role: "MANAGER", department: "a" },
    { key: "headB", role: "MANAGER", department: "b" },
    { key: "headC", role: "MANAGER", department: "c" },
    { key: "seniorB", role: "SENIOR", department: "b" },
    { key: "workerA", role: "USER", department: "a" },
    { key: "workerB", role: "USER", department: "b" },
    { key: "workerC", role: "USER", department: "c" },
    { key: "pc", role: "PC", department: null },
]

const as = (key: string, req: request.Test) => req.set("Authorization", `Bearer ${tokens[key]}`)

const raise = async (key: string, body: Record<string, unknown>, expected = 201) => {
    const res = await as(key, request(app).post("/tickets")).send({
        title: `Gate ${createId().slice(0, 6)}`,
        description: "Gate test",
        assignmentMode: "MANUAL",
        tatHours: 24,
        ...body,
    })
    expect(res.status).toBe(expected)
    if (res.status === 201) createdTicketIds.push(res.body.data.id)
    return res
}

const start = (key: string, ticketId: string) =>
    as(key, request(app).post(`/tickets/${ticketId}/status-updates`)).send({ status: "IN_PROGRESS", remark: "starting" })

beforeAll(async () => {
    app = await bootApp()
    const tag = createId().slice(0, 8)
    await db.insert(departments).values([
        { id: departmentIds.a, name: `GateA-${tag}` },
        { id: departmentIds.b, name: `GateB-${tag}` },
        { id: departmentIds.c, name: `GateC-${tag}` },
    ])
    const passwordHash = await hashPassword(PASSWORD)
    for (const spec of SPEC) {
        const id = createId()
        const email = `${spec.key.toLowerCase()}.${tag}@itest.local`
        await db.insert(users).values({
            id, email, passwordHash, firstName: spec.key, role: spec.role, isActive: true, mustChangePassword: false,
            departmentId: spec.department ? departmentIds[spec.department] : null,
        })
        people[spec.key] = { id, email }
        const login = await request(app).post("/auth/login").send({ email, password: PASSWORD })
        tokens[spec.key] = login.body.accessToken as string
    }
})

afterAll(async () => {
    if (createdTicketIds.length) {
        await db.delete(ticketStatusUpdates).where(inArray(ticketStatusUpdates.ticketId, createdTicketIds))
        await db.delete(tickets).where(inArray(tickets.id, createdTicketIds))
    }
    const userIds = Object.values(people).map((p) => p.id)
    if (userIds.length) {
        await db.delete(refreshTokens).where(inArray(refreshTokens.userId, userIds))
        await db.delete(notifications).where(inArray(notifications.recipientId, userIds))
        await db.delete(auditLogs).where(inArray(auditLogs.actorId, userIds))
        await db.delete(users).where(inArray(users.id, userIds))
    }
    await db.delete(departments).where(inArray(departments.id, Object.values(departmentIds)))
})

describe("ticket raised to a department user", () => {
    it("waits for that person's head even when no department is sent", async () => {
        const res = await raise("headA", { assigneeId: people.workerB!.id })
        expect(res.body.data.departmentId).toBe(departmentIds.b)
        expect(res.body.data.awaitingHeadApproval).toBe(true)
    })

    it("blocks work until the head approves, then lets it start", async () => {
        const res = await raise("headA", { assigneeId: people.workerB!.id, departmentId: departmentIds.b })
        const id = res.body.data.id as string

        expect((await start("workerB", id)).status).toBe(403)
        expect((await as("headC", request(app).post(`/tickets/${id}/approve-assignment`))).status).toBe(403)
        expect((await as("headA", request(app).post(`/tickets/${id}/approve-assignment`))).status).toBe(403)

        const approved = await as("headB", request(app).post(`/tickets/${id}/approve-assignment`))
        expect(approved.status).toBe(200)
        expect(approved.body.data.awaitingHeadApproval).toBe(false)
        expect(approved.body.data.assignmentApprovedBy).toBe(people.headB!.id)

        expect((await start("workerB", id)).status).toBe(200)
    })

    it("lets the head decline with a reason, and nobody can work a declined ticket", async () => {
        const res = await raise("headA", { assigneeId: people.workerB!.id, departmentId: departmentIds.b })
        const id = res.body.data.id as string

        expect((await as("headB", request(app).post(`/tickets/${id}/decline`)).send({})).status).toBe(400)
        const declined = await as("headB", request(app).post(`/tickets/${id}/decline`)).send({ reason: "Not our work" })
        expect(declined.status).toBe(200)
        expect(declined.body.data.declinedAt).not.toBeNull()
        expect(declined.body.data.status).toBe("CLOSED")
        expect((await start("workerB", id)).status).toBe(400)

        const reopened = await as("headB", request(app).post(`/tickets/${id}/reopen-declined`))
        expect(reopened.status).toBe(200)
        expect(reopened.body.data.declinedAt).toBeNull()
    })

    it("does not let the raiser or an outsider decline it", async () => {
        const res = await raise("headA", { assigneeId: people.workerB!.id, departmentId: departmentIds.b })
        const id = res.body.data.id as string
        expect((await as("headA", request(app).post(`/tickets/${id}/decline`)).send({ reason: "Changed my mind" })).status).toBe(403)
        expect((await as("headC", request(app).post(`/tickets/${id}/decline`)).send({ reason: "Not mine" })).status).toBe(403)
    })

    it("refuses a person who is not in the chosen department", async () => {
        const res = await raise("headA", { assigneeId: people.workerB!.id, departmentId: departmentIds.c }, 400)
        expect(res.body.message ?? res.body.error).toMatch(/not in the selected department/i)
    })

    it("asks the head even when the PC or an admin raises it", async () => {
        const res = await raise("pc", { assigneeId: people.workerB!.id, departmentId: departmentIds.b })
        expect(res.body.data.awaitingHeadApproval).toBe(true)
        expect((await start("workerB", res.body.data.id as string)).status).toBe(403)
        const approved = await as("headB", request(app).post(`/tickets/${res.body.data.id as string}/approve-assignment`))
        expect(approved.status).toBe(200)
        expect((await start("workerB", res.body.data.id as string)).status).toBe(200)
    })

    it("lets the PC approve on the head's behalf", async () => {
        const res = await raise("headA", { assigneeId: people.workerB!.id })
        const approved = await as("pc", request(app).post(`/tickets/${res.body.data.id as string}/approve-assignment`))
        expect(approved.status).toBe(200)
        expect(approved.body.data.awaitingHeadApproval).toBe(false)
    })

    it("refuses a mismatched department even from the PC", async () => {
        await raise("pc", { assigneeId: people.workerB!.id, departmentId: departmentIds.c }, 400)
    })

    it("asks no one when a head raises it inside their own department", async () => {
        const res = await raise("headB", { assigneeId: people.workerB!.id })
        expect(res.body.data.awaitingHeadApproval).toBe(false)
    })

    it("asks the new head again when a running ticket is moved to another department", async () => {
        const res = await raise("headB", { assigneeId: people.workerB!.id })
        const id = res.body.data.id as string
        expect((await start("workerB", id)).status).toBe(200)

        const moved = await as("headB", request(app).patch(`/tickets/${id}`)).send({ assigneeId: people.workerC!.id })
        expect(moved.status).toBe(200)
        expect(moved.body.data.departmentId).toBe(departmentIds.c)
        expect(moved.body.data.awaitingHeadApproval).toBe(true)
        expect((await start("workerC", id)).status).toBe(403)

        const approved = await as("headC", request(app).post(`/tickets/${id}/approve-assignment`))
        expect(approved.body.data.awaitingHeadApproval).toBe(false)
    })

    it("stores the head approval as the ticket state, not a client flag", async () => {
        const res = await raise("headA", { assigneeId: people.workerB!.id })
        const [row] = await db.select().from(tickets).where(eq(tickets.id, res.body.data.id as string))
        expect(row!.awaitingHeadApproval).toBe(true)
        expect(row!.departmentId).toBe(departmentIds.b)
    })

    it("shows a senior the requests raised for their department, but not its other tickets", async () => {
        const gated = await raise("headA", { assigneeId: people.workerB!.id, departmentId: departmentIds.b })
        const other = await raise("headA", { assigneeId: people.workerB!.id, departmentId: departmentIds.b })
        await as("headB", request(app).post(`/tickets/${other.body.data.id}/approve-assignment`))
        expect((await as("seniorB", request(app).get(`/tickets/${gated.body.data.id}`))).status).toBe(200)
        expect((await as("seniorB", request(app).get(`/tickets/${other.body.data.id}`))).status).toBe(403)
    })

    it("lists only the tickets still waiting for the head when asked", async () => {
        const waiting = await raise("headA", { assigneeId: people.workerB!.id, departmentId: departmentIds.b })
        const approved = await raise("headA", { assigneeId: people.workerB!.id, departmentId: departmentIds.b })
        await as("headB", request(app).post(`/tickets/${approved.body.data.id}/approve-assignment`))
        const res = await as("headB", request(app).get("/tickets?awaitingHead=true&limit=100"))
        expect(res.status).toBe(200)
        const ids = (res.body.data as { id: string }[]).map((t) => t.id)
        expect(ids).toContain(waiting.body.data.id)
        expect(ids).not.toContain(approved.body.data.id)
    })

    it("leaves declined tickets out of the summary counts", async () => {
        const before = await as("headB", request(app).get("/tickets/summary?scope=visible"))
        const res = await raise("headA", { assigneeId: people.workerB!.id, departmentId: departmentIds.b })
        const declined = await as("headB", request(app).post(`/tickets/${res.body.data.id}/decline`)).send({ reason: "Not our work" })
        expect(declined.status).toBe(200)
        const after = await as("headB", request(app).get("/tickets/summary?scope=visible"))
        expect(after.body.data.total).toBe(before.body.data.total)
        expect(after.body.data.completed).toBe(before.body.data.completed)
    })
})
