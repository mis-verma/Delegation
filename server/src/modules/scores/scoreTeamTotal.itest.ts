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
import { scoreService } from "./score.service.js"

type Person = { id: string; email: string }

let app: Application
const departmentIds = { a: createId(), b: createId() }
const people: Record<string, Person> = {}
const tokens: Record<string, string> = {}
const ticketIds: string[] = []

const SPEC: { key: string; role: Role; department: "a" | "b" }[] = [
    { key: "headA", role: "MANAGER", department: "a" },
    { key: "workerA1", role: "USER", department: "a" },
    { key: "workerA2", role: "USER", department: "a" },
]

const raiseFor = async (assignee: string) => {
    const res = await request(app).post("/tickets").set("Authorization", `Bearer ${tokens.headA}`).send({
        title: `Team total ${createId().slice(0, 6)}`,
        description: "Team total test",
        assignmentMode: "MANUAL",
        tatHours: 24,
        assigneeId: people[assignee]!.id,
    })
    expect(res.status).toBe(201)
    ticketIds.push(res.body.data.id as string)
    return res.body.data.id as string
}

beforeAll(async () => {
    app = await bootApp()
    const tag = createId().slice(0, 8)
    await db.insert(departments).values([
        { id: departmentIds.a, name: `TotalA-${tag}` },
        { id: departmentIds.b, name: `TotalB-${tag}` },
    ])
    const passwordHash = await hashPassword(PASSWORD)
    for (const spec of SPEC) {
        const id = createId()
        const email = `${spec.key.toLowerCase()}.${tag}@itest.local`
        await db.insert(users).values({
            id, email, passwordHash, firstName: spec.key, role: spec.role, isActive: true, mustChangePassword: false,
            departmentId: departmentIds[spec.department],
        })
        people[spec.key] = { id, email }
        const login = await request(app).post("/auth/login").send({ email, password: PASSWORD })
        tokens[spec.key] = login.body.accessToken as string
    }
})

afterAll(async () => {
    if (ticketIds.length) {
        await db.delete(ticketStatusUpdates).where(inArray(ticketStatusUpdates.ticketId, ticketIds))
        await db.delete(tickets).where(inArray(tickets.id, ticketIds))
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

describe("department head team score", () => {
    it("counts the same tickets in the team total as in the people rows", async () => {
        await raiseFor("workerA1")
        const moved = await raiseFor("workerA2")
        await db.update(tickets).set({ departmentId: departmentIds.b }).where(eq(tickets.id, moved))
        await db.update(tickets).set({ tatDueAt: new Date(Date.now() - 3_600_000) }).where(inArray(tickets.id, ticketIds))

        const today = new Date().toISOString().slice(0, 10)
        const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
        const viewer = { sub: people.headA!.id, role: "MANAGER" as const, departmentId: departmentIds.a }
        const collected = await scoreService.collect(viewer, today, tomorrow, false)

        const mine = new Set([people.workerA1!.id, people.workerA2!.id])
        const peopleDue = collected.people.filter((p) => mine.has(p.id)).reduce((n, p) => n + p.ticket.due, 0)
        expect(peopleDue).toBe(2)
        expect(collected.total.ticket.due).toBe(peopleDue)
    })
})
