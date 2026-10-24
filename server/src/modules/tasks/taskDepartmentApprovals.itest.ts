import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import type { Application } from "express"
import { createId } from "@paralleldrive/cuid2"
import { eq, inArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { auditLogs, departments, notifications, refreshTokens, users, type Role } from "../../db/schema/core.js"
import { tasks, taskDepartmentApprovals, taskStatusUpdates } from "../../db/schema/task.js"
import { hashPassword } from "../../utils/password.js"
import { bootApp, PASSWORD } from "../../test/integrationHarness.js"

type Person = { id: string; email: string }

let app: Application
const departmentIds: Record<"a" | "b" | "c", string> = { a: createId(), b: createId(), c: createId() }
const people: Record<string, Person> = {}
const tokens: Record<string, string> = {}
const createdTaskIds: string[] = []

const SPEC: { key: string; role: Role; department: "a" | "b" | "c" | null }[] = [
    { key: "headA", role: "MANAGER", department: "a" },
    { key: "headB", role: "MANAGER", department: "b" },
    { key: "headC", role: "MANAGER", department: "c" },
    { key: "workerA", role: "USER", department: "a" },
    { key: "workerB", role: "USER", department: "b" },
    { key: "workerC", role: "USER", department: "c" },
    { key: "pc", role: "PC", department: null },
]

const as = (key: string, req: request.Test) => req.set("Authorization", `Bearer ${tokens[key]}`)

const dueIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

const createTask = async (key: string, body: Record<string, unknown>) => {
    const res = await as(key, request(app).post("/tasks")).send({ title: `Multi ${createId().slice(0, 6)}`, dueDate: dueIn(3), ...body })
    expect(res.status).toBe(201)
    createdTaskIds.push(res.body.data.id)
    return res.body.data as { id: string; awaitingHeadApproval: boolean; departmentApprovals: { departmentId: string; status: string }[] }
}

const rowsFor = (taskId: string) => db.select().from(taskDepartmentApprovals).where(eq(taskDepartmentApprovals.taskId, taskId))
const taskRow = async (taskId: string) => (await db.select().from(tasks).where(eq(tasks.id, taskId)))[0]!

beforeAll(async () => {
    app = await bootApp()
    const tag = createId().slice(0, 8)
    await db.insert(departments).values([
        { id: departmentIds.a, name: `ItestA-${tag}` },
        { id: departmentIds.b, name: `ItestB-${tag}` },
        { id: departmentIds.c, name: `ItestC-${tag}` },
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
    if (createdTaskIds.length) {
        await db.delete(taskStatusUpdates).where(inArray(taskStatusUpdates.taskId, createdTaskIds))
        await db.delete(tasks).where(inArray(tasks.id, createdTaskIds))
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

describe("delegation across departments", () => {
    it("asks every other department head, but not the creator's own", async () => {
        const task = await createTask("headA", {
            departmentId: departmentIds.a,
            assigneeId: people.workerA!.id,
            additionalAssigneeIds: [people.workerB!.id, people.workerC!.id],
        })
        expect(task.awaitingHeadApproval).toBe(true)
        expect(task.departmentApprovals.map((r) => r.departmentId).sort()).toEqual([departmentIds.b, departmentIds.c].sort())
        expect(task.departmentApprovals.every((r) => r.status === "pending")).toBe(true)
    })

    it("starts only after every department head has approved", async () => {
        const task = await createTask("headA", {
            departmentId: departmentIds.a,
            assigneeId: people.workerA!.id,
            additionalAssigneeIds: [people.workerB!.id, people.workerC!.id],
        })

        const early = await as("workerA", request(app).patch(`/tasks/${task.id}`)).send({ status: "in_progress", statusRemark: "starting" })
        expect(early.status).toBe(403)

        const first = await as("headB", request(app).post(`/tasks/${task.id}/approve-assignment`))
        expect(first.status).toBe(200)
        expect(first.body.data.awaitingHeadApproval).toBe(true)
        expect(first.body.data.departmentApprovals.filter((r: { status: string }) => r.status === "approved")).toHaveLength(1)

        const again = await as("headB", request(app).post(`/tasks/${task.id}/approve-assignment`))
        expect(again.status).toBe(403)

        const stillBlocked = await as("workerA", request(app).patch(`/tasks/${task.id}`)).send({ status: "in_progress", statusRemark: "starting" })
        expect(stillBlocked.status).toBe(403)

        const last = await as("headC", request(app).post(`/tasks/${task.id}/approve-assignment`))
        expect(last.status).toBe(200)
        expect(last.body.data.awaitingHeadApproval).toBe(false)
        expect(last.body.data.assignmentApprovedBy).toBe(people.headC!.id)

        const go = await as("workerA", request(app).patch(`/tasks/${task.id}`)).send({ status: "in_progress", statusRemark: "starting" })
        expect(go.status).toBe(200)
    })

    it("lets a head of an uninvolved department do nothing", async () => {
        const task = await createTask("headA", { departmentId: departmentIds.a, assigneeId: people.workerA!.id, additionalAssigneeIds: [people.workerB!.id] })
        const res = await as("headC", request(app).post(`/tasks/${task.id}/approve-assignment`))
        expect(res.status).toBe(403)
        const seen = await as("headC", request(app).get(`/tasks/${task.id}`))
        expect(seen.status).toBe(404)
    })

    it("shows the task to a head whose department is asked to approve", async () => {
        const task = await createTask("headA", { departmentId: departmentIds.a, assigneeId: people.workerA!.id, additionalAssigneeIds: [people.workerB!.id] })
        const res = await as("headB", request(app).get(`/tasks/${task.id}`))
        expect(res.status).toBe(200)
        expect(res.body.data.departmentApprovals).toHaveLength(1)
    })

    it("lets the PC approve every waiting department at once", async () => {
        const task = await createTask("headA", {
            departmentId: departmentIds.a,
            assigneeId: people.workerA!.id,
            additionalAssigneeIds: [people.workerB!.id, people.workerC!.id],
        })
        const res = await as("pc", request(app).post(`/tasks/${task.id}/approve-assignment`))
        expect(res.status).toBe(200)
        expect(res.body.data.awaitingHeadApproval).toBe(false)
        expect((await rowsFor(task.id)).every((r) => r.status === "approved")).toBe(true)
    })

    it("does not ask anyone when the PC hands it out", async () => {
        const task = await createTask("pc", { departmentId: departmentIds.a, assigneeId: people.workerA!.id, additionalAssigneeIds: [people.workerB!.id] })
        expect(task.awaitingHeadApproval).toBe(false)
        expect(task.departmentApprovals).toHaveLength(0)
    })

    it("lets any involved head decline, and reopening approves only that head's part", async () => {
        const task = await createTask("headA", {
            departmentId: departmentIds.a,
            assigneeId: people.workerA!.id,
            additionalAssigneeIds: [people.workerB!.id, people.workerC!.id],
        })
        const declined = await as("headB", request(app).post(`/tasks/${task.id}/decline`)).send({ reason: "No capacity this week" })
        expect(declined.status).toBe(200)
        expect((await taskRow(task.id)).declinedAt).not.toBeNull()

        const reopened = await as("headB", request(app).post(`/tasks/${task.id}/reopen-declined`))
        expect(reopened.status).toBe(200)
        expect(reopened.body.data.awaitingHeadApproval).toBe(true)
        const rows = await rowsFor(task.id)
        expect(rows.find((r) => r.departmentId === departmentIds.b)!.status).toBe("approved")
        expect(rows.find((r) => r.departmentId === departmentIds.c)!.status).toBe("pending")
    })

    it("asks the new department when someone from it is added later", async () => {
        const task = await createTask("headA", { departmentId: departmentIds.a, assigneeId: people.workerA!.id })
        expect(task.awaitingHeadApproval).toBe(false)

        const added = await as("headA", request(app).patch(`/tasks/${task.id}`)).send({ additionalAssigneeIds: [people.workerB!.id] })
        expect(added.status).toBe(200)
        expect(added.body.data.awaitingHeadApproval).toBe(true)
        expect(added.body.data.departmentApprovals.map((r: { departmentId: string }) => r.departmentId)).toEqual([departmentIds.b])

        const approved = await as("headB", request(app).post(`/tasks/${task.id}/approve-assignment`))
        expect(approved.body.data.awaitingHeadApproval).toBe(false)

        const removed = await as("headA", request(app).patch(`/tasks/${task.id}`)).send({ additionalAssigneeIds: [] })
        expect(removed.status).toBe(200)
        expect(removed.body.data.awaitingHeadApproval).toBe(false)
        expect(removed.body.data.departmentApprovals).toHaveLength(0)
    })

    it("opens the gate again when the only waiting department is removed", async () => {
        const task = await createTask("headA", { departmentId: departmentIds.a, assigneeId: people.workerA!.id, additionalAssigneeIds: [people.workerB!.id] })
        expect(task.awaitingHeadApproval).toBe(true)
        const res = await as("headA", request(app).patch(`/tasks/${task.id}`)).send({ additionalAssigneeIds: [] })
        expect(res.status).toBe(200)
        expect(res.body.data.awaitingHeadApproval).toBe(false)
        expect(await rowsFor(task.id)).toHaveLength(0)
    })
})
