import { and, eq, isNull, ne } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/core.js"
import {
    tickets,
    tasks,
    taskAdditionalAssignees,
    categories,
    categoryAssignees,
    checklistDefinitions,
    checklistDefinitionAssignees,
    checklistDefinitionStores,
    checklistDefinitionItems,
    checklistDefinitionItemAuditUsers,
} from "../../db/schema/index.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import { generateInstanceForDefinition, loadDefinitionForGeneration, syncLiveInstances } from "../../jobs/checklistInstanceGenerator.job.js"
import { assertCanDeactivate, revokeSessions } from "./user.service.js"

// What someone still holds when they leave. Deactivating (never deleting) keeps their name on every
// old record, so this is only about work that is still OPEN and would otherwise be left with nobody:
// open tickets and tasks, the checklists they fill in, the categories that route to them. Being
// audited is removed outright (nobody is checked once they have left), no transfer needed.
export type OffboardingSummary = {
    openTickets: number
    openTasks: number
    checklists: { id: string; name: string }[]
    categories: { id: string; name: string }[]
    auditQuestions: number
    hasOpenWork: boolean
}

export const userOffboardingService = {
    async summary(userId: string): Promise<OffboardingSummary> {
        const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
        if (!user) throw AppError.notFound("User not found")

        const openTickets = await db.select({ id: tickets.id }).from(tickets)
            .where(and(eq(tickets.assigneeId, userId), ne(tickets.status, "CLOSED"), isNull(tickets.deletedAt)))

        const primaryTasks = await db.select({ id: tasks.id }).from(tasks)
            .where(and(eq(tasks.assigneeId, userId), ne(tasks.status, "done"), isNull(tasks.deletedAt)))
        const extraTasks = await db.select({ id: tasks.id }).from(taskAdditionalAssignees)
            .innerJoin(tasks, eq(tasks.id, taskAdditionalAssignees.taskId))
            .where(and(eq(taskAdditionalAssignees.userId, userId), ne(tasks.status, "done"), isNull(tasks.deletedAt)))
        const openTasks = new Set([...primaryTasks, ...extraTasks].map((t) => t.id))

        const checklists = await db.select({ id: checklistDefinitions.id, name: checklistDefinitions.name })
            .from(checklistDefinitionAssignees)
            .innerJoin(checklistDefinitions, eq(checklistDefinitions.id, checklistDefinitionAssignees.definitionId))
            .where(and(eq(checklistDefinitionAssignees.userId, userId), isNull(checklistDefinitions.deletedAt)))

        const cats = await db.select({ id: categories.id, name: categories.name }).from(categoryAssignees)
            .innerJoin(categories, eq(categories.id, categoryAssignees.categoryId))
            .where(eq(categoryAssignees.userId, userId))

        const audits = await db.select({ id: checklistDefinitionItemAuditUsers.id }).from(checklistDefinitionItemAuditUsers)
            .where(eq(checklistDefinitionItemAuditUsers.userId, userId))

        return {
            openTickets: openTickets.length,
            openTasks: openTasks.size,
            checklists,
            categories: cats,
            auditQuestions: audits.length,
            hasOpenWork: openTickets.length > 0 || openTasks.size > 0 || checklists.length > 0 || cats.length > 0,
        }
    },

    // Switch a person off properly: hand their open work to someone, take them out of checklists and
    // audits, end their sessions and mark them inactive, all or nothing. They keep their name on every
    // old ticket, task and checklist; they just can't log in or be picked any more.
    async offboard(userId: string, input: { transferToUserId?: string }, actorId: string) {
        const [user] = await db.select({ id: users.id, role: users.role, firstName: users.firstName, isActive: users.isActive })
            .from(users).where(eq(users.id, userId)).limit(1)
        if (!user) throw AppError.notFound("User not found")
        if (!user.isActive) throw AppError.badRequest("This person is already deactivated.")
        await assertCanDeactivate(userId, user.role, actorId)

        const summary = await this.summary(userId)
        if (summary.hasOpenWork && !input.transferToUserId) {
            throw AppError.badRequest("Choose who takes over their open work.")
        }

        let transferee: { id: string; storeId: string | null } | undefined
        if (input.transferToUserId) {
            if (input.transferToUserId === userId) throw AppError.badRequest("Pick someone other than the person leaving.")
            const [row] = await db.select({ id: users.id, storeId: users.storeId, isActive: users.isActive })
                .from(users).where(eq(users.id, input.transferToUserId)).limit(1)
            if (!row || !row.isActive) throw AppError.badRequest("The person taking over must be an active user.")
            transferee = { id: row.id, storeId: row.storeId }
        }

        // A checklist's people must belong to its stores. The new person can take a checklist over only
        // if they do; if not, the checklist can still lose this person as long as someone else is left.
        const checklistPlans: { id: string; name: string; addTransferee: boolean }[] = []
        for (const c of summary.checklists) {
            const stores = await db.select({ storeId: checklistDefinitionStores.storeId }).from(checklistDefinitionStores)
                .where(eq(checklistDefinitionStores.definitionId, c.id))
            const assignees = await db.select({ userId: checklistDefinitionAssignees.userId }).from(checklistDefinitionAssignees)
                .where(eq(checklistDefinitionAssignees.definitionId, c.id))
            const inStores = !!transferee?.storeId && stores.some((s) => s.storeId === transferee!.storeId)
            const alreadyOn = !!transferee && assignees.some((a) => a.userId === transferee!.id)
            const others = assignees.filter((a) => a.userId !== userId && a.userId !== transferee?.id).length
            const staysCovered = (inStores || alreadyOn) || others > 0
            if (!staysCovered) {
                throw AppError.badRequest(`"${c.name}" would be left with nobody to fill it in. Pick someone who works in that checklist's store.`)
            }
            checklistPlans.push({ id: c.id, name: c.name, addTransferee: inStores && !alreadyOn })
        }

        const auditedDefinitionIds = new Set<string>()
        if (summary.auditQuestions) {
            const rows = await db.select({ definitionId: checklistDefinitionItems.definitionId })
                .from(checklistDefinitionItemAuditUsers)
                .innerJoin(checklistDefinitionItems, eq(checklistDefinitionItems.id, checklistDefinitionItemAuditUsers.itemId))
                .where(eq(checklistDefinitionItemAuditUsers.userId, userId))
            for (const r of rows) auditedDefinitionIds.add(r.definitionId)
        }

        await db.transaction(async (tx) => {
            if (transferee) {
                await tx.update(tickets).set({ assigneeId: transferee.id, updatedAt: new Date() })
                    .where(and(eq(tickets.assigneeId, userId), ne(tickets.status, "CLOSED"), isNull(tickets.deletedAt)))
                await tx.update(tasks).set({ assigneeId: transferee.id, updatedAt: new Date() })
                    .where(and(eq(tasks.assigneeId, userId), ne(tasks.status, "done"), isNull(tasks.deletedAt)))

                // Tasks where they were an extra assignee: swap them for the new person (once).
                const extra = await tx.select({ taskId: taskAdditionalAssignees.taskId }).from(taskAdditionalAssignees)
                    .innerJoin(tasks, eq(tasks.id, taskAdditionalAssignees.taskId))
                    .where(and(eq(taskAdditionalAssignees.userId, userId), ne(tasks.status, "done"), isNull(tasks.deletedAt)))
                for (const { taskId } of extra) {
                    const [task] = await tx.select({ assigneeId: tasks.assigneeId }).from(tasks).where(eq(tasks.id, taskId)).limit(1)
                    const [already] = await tx.select({ id: taskAdditionalAssignees.id }).from(taskAdditionalAssignees)
                        .where(and(eq(taskAdditionalAssignees.taskId, taskId), eq(taskAdditionalAssignees.userId, transferee.id))).limit(1)
                    if (task?.assigneeId !== transferee.id && !already) {
                        await tx.insert(taskAdditionalAssignees).values({ taskId, userId: transferee.id })
                    }
                    await tx.delete(taskAdditionalAssignees)
                        .where(and(eq(taskAdditionalAssignees.taskId, taskId), eq(taskAdditionalAssignees.userId, userId)))
                }

                for (const c of summary.categories) {
                    const [already] = await tx.select({ id: categoryAssignees.id }).from(categoryAssignees)
                        .where(and(eq(categoryAssignees.categoryId, c.id), eq(categoryAssignees.userId, transferee.id))).limit(1)
                    if (!already) await tx.insert(categoryAssignees).values({ categoryId: c.id, userId: transferee.id })
                }
            }
            await tx.delete(categoryAssignees).where(eq(categoryAssignees.userId, userId))

            for (const plan of checklistPlans) {
                if (plan.addTransferee && transferee) {
                    await tx.insert(checklistDefinitionAssignees).values({ definitionId: plan.id, userId: transferee.id })
                }
                await tx.delete(checklistDefinitionAssignees)
                    .where(and(eq(checklistDefinitionAssignees.definitionId, plan.id), eq(checklistDefinitionAssignees.userId, userId)))
            }

            await tx.delete(checklistDefinitionItemAuditUsers).where(eq(checklistDefinitionItemAuditUsers.userId, userId))
            await tx.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, userId))
        })

        await revokeSessions(userId)

        // Today's checklists follow straight away: the person who left drops off, the new one takes over.
        const touched = new Set([...checklistPlans.map((p) => p.id), ...auditedDefinitionIds])
        for (const definitionId of touched) {
            try {
                const generation = await loadDefinitionForGeneration(definitionId)
                if (generation) {
                    const now = new Date()
                    await syncLiveInstances(generation, now)
                    // A per-person / per-department checklist gets today's run for the new assignee too.
                    await generateInstanceForDefinition(generation, now)
                }
            } catch (err) {
                console.error(`Updating today's runs after offboarding ${userId} failed for ${definitionId}:`, err)
            }
        }

        await auditService.record({
            entityType: "User",
            entityId: userId,
            action: "OFFBOARD",
            actorId,
            before: { isActive: true },
            after: {
                isActive: false,
                transferredTo: transferee?.id ?? null,
                tickets: summary.openTickets,
                tasks: summary.openTasks,
                checklists: summary.checklists.length,
                categories: summary.categories.length,
                auditQuestions: summary.auditQuestions,
            },
        })

        return { summary, transferredTo: transferee?.id ?? null }
    },
}

