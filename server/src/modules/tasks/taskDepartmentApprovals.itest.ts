import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import type { Application } from "express"
import { createId } from "@paralleldrive/cuid2"
import { eq, inArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { auditLogs, departments, notifications, refreshTokens, users, type Role } from "../../db/schema/core.js"
import { tasks, taskDepartmentApprovals, taskStatusUpdates, taskComments } from "../../db/schema/task.js"
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
        await db.delete(taskComments).where(inArray(taskComments.taskId, createdTaskIds))
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

    it("asks every head even when the PC hands it out", async () => {
        const task = await createTask("pc", { departmentId: departmentIds.a, assigneeId: people.workerA!.id, additionalAssigneeIds: [people.workerB!.id] })
        expect(task.awaitingHeadApproval).toBe(true)
        expect(task.departmentApprovals.map((r) => r.departmentId).sort()).toEqual([departmentIds.a, departmentIds.b].sort())
        const approvedA = await as("headA", request(app).post(`/tasks/${task.id}/approve-assignment`))
        expect(approvedA.body.data.awaitingHeadApproval).toBe(true)
        const approvedB = await as("headB", request(app).post(`/tasks/${task.id}/approve-assignment`))
        expect(approvedB.body.data.awaitingHeadApproval).toBe(false)
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

describe("completion across departments", () => {
    const liveAndSubmitted = async () => {
        const task = await createTask("headA", {
            departmentId: departmentIds.a,
            assigneeId: people.workerA!.id,
            additionalAssigneeIds: [people.workerB!.id, people.workerC!.id],
        })
        expect((await as("pc", request(app).post(`/tasks/${task.id}/approve-assignment`))).status).toBe(200)
        const started = await as("workerA", request(app).patch(`/tasks/${task.id}`)).send({ status: "in_progress", statusRemark: "starting" })
        expect(started.status).toBe(200)
        const submitted = await as("workerA", request(app).patch(`/tasks/${task.id}`)).send({ status: "pending_approval" })
        expect(submitted.status).toBe(200)
        return { id: task.id, submitted: submitted.body.data }
    }
    const verify = (key: string, id: string, body: Record<string, unknown>) => as(key, request(app).patch(`/tasks/${id}/verify`)).send(body)
    const pendingIds = async (key: string) => ((await as(key, request(app).get("/tasks/pending-approval"))).body.data as { id: string }[]).map((r) => r.id)

    it("asks the head of every involved department before the PC", async () => {
        const { id, submitted } = await liveAndSubmitted()
        expect(submitted.approvalStage).toBe("HOD")
        const pending = (submitted.departmentApprovals as { departmentId: string; completion: string }[]).filter((r) => r.completion === "pending").map((r) => r.departmentId).sort()
        expect(pending).toEqual([departmentIds.b, departmentIds.c].sort())
        expect(await pendingIds("headB")).toContain(id)
        expect(await pendingIds("headC")).toContain(id)
        expect(await pendingIds("headA")).not.toContain(id)
    })

    it("hands over to the PC only after the last head approves", async () => {
        const { id } = await liveAndSubmitted()
        expect((await verify("headA", id, { action: "APPROVE" })).status).toBe(403)

        const first = await verify("headB", id, { action: "APPROVE" })
        expect(first.status).toBe(200)
        expect(first.body.data.status).toBe("pending_approval")
        expect(first.body.data.approvalStage).toBe("HOD")
        expect(await pendingIds("headB")).not.toContain(id)
        expect(await pendingIds("headC")).toContain(id)
        expect((await verify("headB", id, { action: "APPROVE" })).status).toBe(403)
        expect((await verify("pc", id, { action: "APPROVE" })).status).toBe(403)

        const last = await verify("headC", id, { action: "APPROVE" })
        expect(last.status).toBe(200)
        expect(last.body.data.approvalStage).toBe("PC")
        expect(await pendingIds("pc")).toContain(id)

        const done = await verify("pc", id, { action: "APPROVE" })
        expect(done.status).toBe(200)
        expect(done.body.data.status).toBe("done")
    })

    it("sends it back to work when any head rejects, and asks everyone again next time", async () => {
        const { id } = await liveAndSubmitted()
        expect((await verify("headB", id, { action: "REJECT" })).status).toBe(400)
        const rejected = await verify("headB", id, { action: "REJECT", note: "Photos missing" })
        expect(rejected.status).toBe(200)
        expect(rejected.body.data.status).toBe("in_progress")
        const rows = await rowsFor(id)
        expect(rows.every((r) => r.completionStatus === "none")).toBe(true)

        const again = await as("workerA", request(app).patch(`/tasks/${id}`)).send({ status: "pending_approval" })
        expect(again.status).toBe(200)
        expect(again.body.data.departmentApprovals.filter((r: { completion: string }) => r.completion === "pending")).toHaveLength(2)
    })

    it("keeps the PC out until the heads are done", async () => {
        const { id } = await liveAndSubmitted()
        expect((await verify("pc", id, { action: "APPROVE" })).status).toBe(403)
    })
})

describe("following a delegation from another department", () => {
    it("lets an involved head read the activity and comment, but not an outsider", async () => {
        const task = await createTask("headA", { departmentId: departmentIds.a, assigneeId: people.workerA!.id, additionalAssigneeIds: [people.workerB!.id] })

        const seen = await as("headB", request(app).get("/activity").query({ entityType: "Task", entityId: task.id }))
        expect(seen.status).toBe(200)
        const commented = await as("headB", request(app).post(`/tasks/${task.id}/comments`)).send({ body: "We can take this on Monday" })
        expect(commented.status).toBe(201)

        const outsider = await as("headC", request(app).get("/activity").query({ entityType: "Task", entityId: task.id }))
        expect(outsider.status).toBe(403)
        const blocked = await as("headC", request(app).post(`/tasks/${task.id}/comments`)).send({ body: "Hello" })
        expect(blocked.status).toBeGreaterThanOrEqual(400)
    })
})
