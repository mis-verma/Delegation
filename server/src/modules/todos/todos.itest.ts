import { afterAll, beforeAll, describe, expect, it } from "vitest"
import request from "supertest"
import type { Application } from "express"
import { eq, inArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { todos } from "../../db/schema/task.js"
import { bootApp, createTestUsers, PASSWORD, removeTestUsers } from "../../test/integrationHarness.js"

let app: Application
let accounts: Awaited<ReturnType<typeof createTestUsers>>
let token: string
let otherToken: string

const authed = (req: request.Test, as = token) => req.set("Authorization", `Bearer ${as}`)

const signIn = async (email: string) => {
    const res = await request(app).post("/auth/login").send({ email, password: PASSWORD })
    return res.body.accessToken as string
}

const addTodo = async (text: string, completed = false, as = token) => {
    const created = await authed(request(app).post("/todos"), as).send({ text, priority: "high" })
    const id = created.body.data.id as string
    if (completed) await authed(request(app).patch(`/todos/${id}`), as).send({ completed: true })
    return id
}

beforeAll(async () => {
    app = await bootApp()
    accounts = await createTestUsers(["USER", "AGENT"])
    token = await signIn(accounts[0]!.email)
    otherToken = await signIn(accounts[1]!.email)
})

afterAll(async () => {
    const ids = (accounts ?? []).map((a) => a.id)
    if (ids.length) await db.delete(todos).where(inArray(todos.userId, ids))
    await removeTestUsers(ids)
})

describe("clearing completed to-dos", () => {
    it("removes only the completed ones that were asked for", async () => {
        const doneA = await addTodo("Done A", true)
        const doneB = await addTodo("Done B", true)
        const open = await addTodo("Still open")
        const res = await authed(request(app).post("/todos/clear-completed")).send({ ids: [doneA, open] })
        expect(res.status).toBe(200)
        expect(res.body.data.deleted).toBe(1)
        const left = await db.select({ id: todos.id }).from(todos).where(inArray(todos.id, [doneA, doneB, open]))
        expect(left.map((r) => r.id).sort()).toEqual([doneB, open].sort())
    })

    it("never touches another person's to-dos", async () => {
        const theirs = await addTodo("Their done item", true, otherToken)
        const res = await authed(request(app).post("/todos/clear-completed")).send({ ids: [theirs] })
        expect(res.body.data.deleted).toBe(0)
        const [row] = await db.select().from(todos).where(eq(todos.id, theirs))
        expect(row).toBeDefined()
    })

    it("rejects an empty list", async () => {
        const res = await authed(request(app).post("/todos/clear-completed")).send({ ids: [] })
        expect(res.status).toBe(400)
    })
})

describe("restoring to-dos", () => {
    it("brings back text, priority, due date, done state and original creation time", async () => {
        const createdAt = new Date(Date.now() - 5 * 86_400_000).toISOString()
        const dueDate = new Date(Date.now() + 86_400_000).toISOString()
        const res = await authed(request(app).post("/todos/restore")).send({
            todos: [{ text: "Restored one", completed: true, priority: "low", dueDate, createdAt }],
        })
        expect(res.status).toBe(201)
        expect(res.body.data.restored).toBe(1)
        const list = await authed(request(app).get("/todos"))
        const back = (list.body.data as { text: string; completed: boolean; priority: string; createdAt: string }[]).find((t) => t.text === "Restored one")
        expect(back).toMatchObject({ completed: true, priority: "low" })
        expect(Math.abs(new Date(back!.createdAt).getTime() - new Date(createdAt).getTime())).toBeLessThan(1000)
    })
})
