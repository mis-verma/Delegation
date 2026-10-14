import { createId } from "@paralleldrive/cuid2"
import { and, eq, inArray, isNull, ne } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users, auditLogs, projects, projectMembers } from "../../db/schema/core.js"
import {
    tickets,
    tasks,
    taskAdditionalAssignees,
    taskChecklistItems,
    checklistItems,
    checklistTemplateItems,
    categories,
    categoryAssignees,
    checklistDefinitions,
    checklistDefinitionAssignees,
    checklistDefinitionReviewers,
    checklistDefinitionStores,
    checklistDefinitionItems,
    checklistDefinitionItemAuditUsers,
} from "../../db/schema/index.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import { notificationService, notifySafely } from "../notifications/notification.service.js"
import { disconnectUserSockets } from "../../sockets/socket.js"
import { invalidateAuthUsers } from "../../middleware/auth/authCache.js"
import { assertCanDeactivate, revokeSessions } from "./userGuards.js"
import { refreshLiveChecklistsForDefinitions } from "./userChecklistSync.js"

// What someone still holds when they leave. Deactivating (never deleting) keeps their name on every
// old record, so this is only about work that is still OPEN and would otherwise be left with nobody:
// open tickets and tasks, the checklists they fill in or review, the categories that route to them,
// projects they own, open checklist items assigned to them. Being audited is removed outright
// (nobody is checked once they have left), no transfer needed.
export type OffboardingSummary = {
    openTickets: number
    openTasks: number
    checklists: { id: string; name: string }[]
    categories: { id: string; name: string }[]
    auditQuestions: number
    hasOpenWork: boolean
    // Added fields (the original ones above are unchanged).
    reviewerChecklists: { id: string; name: string }[]
    projectsOwned: { id: string; name: string }[]
    projectMemberships: number
    taskChecklistItems: number
    ticketChecklistItems: number
    templateItems: number
}

const CHUNK = 500
const chunk = <T,>(rows: T[]): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK))
    return out
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

        const reviewerChecklists = await db.select({ id: checklistDefinitions.id, name: checklistDefinitions.name })
            .from(checklistDefinitionReviewers)
            .innerJoin(checklistDefinitions, eq(checklistDefinitions.id, checklistDefinitionReviewers.definitionId))
            .where(and(eq(checklistDefinitionReviewers.userId, userId), isNull(checklistDefinitions.deletedAt)))

        const cats = await db.select({ id: categories.id, name: categories.name }).from(categoryAssignees)
            .innerJoin(categories, eq(categories.id, categoryAssignees.categoryId))
            .where(eq(categoryAssignees.userId, userId))

        const audits = await db.select({ id: checklistDefinitionItemAuditUsers.id }).from(checklistDefinitionItemAuditUsers)
            .where(eq(checklistDefinitionItemAuditUsers.userId, userId))

        const projectsOwned = await db.select({ id: projects.id, name: projects.name }).from(projects)
            .where(eq(projects.ownerId, userId))
        const memberships = await db.select({ id: projectMembers.id }).from(projectMembers)
            .where(eq(projectMembers.userId, userId))

        const taskItems = await db.select({ id: taskChecklistItems.id }).from(taskChecklistItems)
            .where(and(eq(taskChecklistItems.assigneeId, userId), eq(taskChecklistItems.isDone, false)))
        const ticketItems = await db.select({ id: checklistItems.id }).from(checklistItems)
            .where(and(eq(checklistItems.assigneeId, userId), eq(checklistItems.isDone, false)))
        const templateItems = await db.select({ id: checklistTemplateItems.id }).from(checklistTemplateItems)
            .where(eq(checklistTemplateItems.defaultAssigneeId, userId))

        return {
            openTickets: openTickets.length,
            openTasks: openTasks.size,
            checklists,
            categories: cats,
            auditQuestions: audits.length,
            // Project owner can't be left empty, and open checklist items would silently lose their
            // person, so those need someone to take over too. Reviewer roles, project memberships and
            // template defaults can simply be dropped.
            hasOpenWork: openTickets.length > 0 || openTasks.size > 0 || checklists.length > 0 || cats.length > 0
                || projectsOwned.length > 0 || taskItems.length > 0 || ticketItems.length > 0,
            reviewerChecklists,
            projectsOwned,
            projectMemberships: memberships.length,
            taskChecklistItems: taskItems.length,
            ticketChecklistItems: ticketItems.length,
            templateItems: templateItems.length,
        }
    },

    // Switch a person off properly: hand their open work to someone, take them out of checklists and
    // audits, end their sessions and mark them inactive, all or nothing. They keep their name on every
    // old ticket, task and checklist; they just can't log in or be picked any more.
    async offboard(userId: string, input: { transferToUserId?: string }, actorId: string) {
        const [user] = await db.select({ id: users.id, role: users.role, firstName: users.firstName, lastName: users.lastName, isActive: users.isActive })
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

        const leaverName = `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
        const reviewerDefinitionIds = new Set<string>()

        // What really moved, counted from the database's own affected-row counts inside the
        // transaction rather than from the earlier read (which could be stale by now).
        const moved = { tickets: 0, tasks: 0, taskChecklistItems: 0, ticketChecklistItems: 0, projects: 0, reviewerSwaps: 0 }

        await db.transaction(async (tx) => {
            // Re-check the last-admin rule under a lock, then switch the person off FIRST: from here
            // on nothing new can be handed to them, and a second offboard of the same person fails.
            await assertCanDeactivate(userId, user.role, actorId, tx)
            const now = new Date()
            const [off] = await tx.update(users)
                .set({ isActive: false, deactivatedAt: now, updatedAt: now })
                .where(and(eq(users.id, userId), eq(users.isActive, true)))
            if (off.affectedRows !== 1) throw AppError.badRequest("This person is already deactivated.")
            await revokeSessions(userId, tx)

            if (transferee) {
                const [t] = await tx.select({ isActive: users.isActive }).from(users).where(eq(users.id, transferee.id)).limit(1)
                if (!t?.isActive) throw AppError.badRequest("The person taking over must be an active user.")
            } else {
                // Nobody to hand to: make sure nothing that needs a new owner appeared since the check above.
                const [stillTicket] = await tx.select({ id: tickets.id }).from(tickets)
                    .where(and(eq(tickets.assigneeId, userId), ne(tickets.status, "CLOSED"), isNull(tickets.deletedAt))).limit(1)
                const [stillTask] = await tx.select({ id: tasks.id }).from(tasks)
                    .where(and(eq(tasks.assigneeId, userId), ne(tasks.status, "done"), isNull(tasks.deletedAt))).limit(1)
                const [stillProject] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, userId)).limit(1)
                if (stillTicket || stillTask || stillProject) throw AppError.badRequest("Choose who takes over their open work.")
            }

            const newOwner = transferee?.id ?? null
            const [actorRow] = await tx.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, actorId)).limit(1)
            const actorName = actorRow ? `${actorRow.firstName}${actorRow.lastName ? ` ${actorRow.lastName}` : ""}` : actorId.slice(0, 191)
            const handoverAudit = (entityType: string, entityId: string) => ({
                id: createId(),
                entityType,
                entityId,
                action: "REASSIGN",
                actorId,
                actorName,
                source: "APP",
                before: { assigneeId: userId },
                after: { assigneeId: transferee!.id, reason: "offboarding" },
            })

            if (transferee) {
                // Tickets and delegations: one audit row each, so the history shows who took it over.
                const ticketIds = (await tx.select({ id: tickets.id }).from(tickets)
                    .where(and(eq(tickets.assigneeId, userId), ne(tickets.status, "CLOSED"), isNull(tickets.deletedAt)))).map((r) => r.id)
                for (const ids of chunk(ticketIds)) {
                    const [res] = await tx.update(tickets).set({ assigneeId: transferee.id, updatedAt: now })
                        .where(and(inArray(tickets.id, ids), eq(tickets.assigneeId, userId)))
                    moved.tickets += res.affectedRows
                    await tx.insert(auditLogs).values(ids.map((id) => handoverAudit("Ticket", id)))
                }

                const taskIds = (await tx.select({ id: tasks.id }).from(tasks)
                    .where(and(eq(tasks.assigneeId, userId), ne(tasks.status, "done"), isNull(tasks.deletedAt)))).map((r) => r.id)
                for (const ids of chunk(taskIds)) {
                    const [res] = await tx.update(tasks).set({ assigneeId: transferee.id, updatedAt: now })
                        .where(and(inArray(tasks.id, ids), eq(tasks.assigneeId, userId)))
                    moved.tasks += res.affectedRows
                    await tx.insert(auditLogs).values(ids.map((id) => handoverAudit("Task", id)))
                }

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
                    moved.tasks += 1
                    await tx.insert(auditLogs).values(handoverAudit("Task", taskId))
                }

                for (const c of summary.categories) {
                    const [already] = await tx.select({ id: categoryAssignees.id }).from(categoryAssignees)
                        .where(and(eq(categoryAssignees.categoryId, c.id), eq(categoryAssignees.userId, transferee.id))).limit(1)
                    if (!already) await tx.insert(categoryAssignees).values({ categoryId: c.id, userId: transferee.id })
                }

                // Projects they own go to the new person (an owner can't be empty).
                const [ownedRes] = await tx.update(projects).set({ ownerId: transferee.id, updatedAt: now }).where(eq(projects.ownerId, userId))
                moved.projects = ownedRes.affectedRows
            }
            await tx.delete(categoryAssignees).where(eq(categoryAssignees.userId, userId))

            // Open checklist lines assigned to them go to the new person, or are left unassigned.
            const [taskItemRes] = await tx.update(taskChecklistItems).set({ assigneeId: newOwner, updatedAt: now })
                .where(and(eq(taskChecklistItems.assigneeId, userId), eq(taskChecklistItems.isDone, false)))
            moved.taskChecklistItems = taskItemRes.affectedRows
            const [ticketItemRes] = await tx.update(checklistItems).set({ assigneeId: newOwner, updatedAt: now })
                .where(and(eq(checklistItems.assigneeId, userId), eq(checklistItems.isDone, false)))
            moved.ticketChecklistItems = ticketItemRes.affectedRows
            // Templates keep working: the default person is swapped, or cleared.
            await tx.update(checklistTemplateItems).set({ defaultAssigneeId: newOwner, updatedAt: now })
                .where(eq(checklistTemplateItems.defaultAssigneeId, userId))

            // Project membership: swap for the new person (once), or just drop the leaver.
            const memberships = await tx.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId))
            for (const { projectId } of memberships) {
                if (!transferee) break
                const [already] = await tx.select({ id: projectMembers.id }).from(projectMembers)
                    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, transferee.id))).limit(1)
                const [owned] = await tx.select({ id: projects.id }).from(projects)
                    .where(and(eq(projects.id, projectId), eq(projects.ownerId, transferee.id))).limit(1)
                if (!already && !owned) await tx.insert(projectMembers).values({ projectId, userId: transferee.id })
            }
            await tx.delete(projectMembers).where(eq(projectMembers.userId, userId))

            // Checklists they review: the new person takes the seat (once), or the seat is dropped.
            const reviewerRows = await tx.select({ definitionId: checklistDefinitionReviewers.definitionId }).from(checklistDefinitionReviewers)
                .where(eq(checklistDefinitionReviewers.userId, userId))
            for (const { definitionId } of reviewerRows) {
                reviewerDefinitionIds.add(definitionId)
                if (!transferee) continue
                const [already] = await tx.select({ id: checklistDefinitionReviewers.id }).from(checklistDefinitionReviewers)
                    .where(and(eq(checklistDefinitionReviewers.definitionId, definitionId), eq(checklistDefinitionReviewers.userId, transferee.id))).limit(1)
                if (!already) await tx.insert(checklistDefinitionReviewers).values({ definitionId, userId: transferee.id })
            }
            moved.reviewerSwaps = reviewerRows.length
            await tx.delete(checklistDefinitionReviewers).where(eq(checklistDefinitionReviewers.userId, userId))

            for (const plan of checklistPlans) {
                if (plan.addTransferee && transferee) {
                    await tx.insert(checklistDefinitionAssignees).values({ definitionId: plan.id, userId: transferee.id })
                }
                await tx.delete(checklistDefinitionAssignees)
                    .where(and(eq(checklistDefinitionAssignees.definitionId, plan.id), eq(checklistDefinitionAssignees.userId, userId)))
            }

            await tx.delete(checklistDefinitionItemAuditUsers).where(eq(checklistDefinitionItemAuditUsers.userId, userId))

            await auditService.recordInTx(tx, {
                entityType: "User",
                entityId: userId,
                action: "OFFBOARD",
                actorId,
                before: { isActive: true },
                after: {
                    isActive: false,
                    transferredTo: transferee?.id ?? null,
                    tickets: moved.tickets,
                    tasks: moved.tasks,
                    checklists: summary.checklists.length,
                    categories: summary.categories.length,
                    auditQuestions: summary.auditQuestions,
                    reviewerChecklists: moved.reviewerSwaps,
                    projectsOwned: moved.projects,
                    taskChecklistItems: moved.taskChecklistItems,
                    ticketChecklistItems: moved.ticketChecklistItems,
                },
            })
        })

        // Open sockets of the person who left drop now (they can't reconnect: they're inactive).
        await invalidateAuthUsers(userId)
        disconnectUserSockets(userId)

        // Today's checklists follow straight away: the person who left drops off, the new one takes over.
        await refreshLiveChecklistsForDefinitions(
            [...checklistPlans.map((p) => p.id), ...auditedDefinitionIds, ...reviewerDefinitionIds],
            `offboarding ${userId}`,
        )

        // One heads-up to the person who took over, instead of one per item.
        if (transferee) {
            const items = moved.tickets + moved.tasks + moved.projects + summary.checklists.length + summary.categories.length
            if (items > 0) {
                await notifySafely(() => notificationService.notifyMany([transferee.id], {
                    type: "WORK_HANDED_OVER",
                    title: "Work handed over to you",
                    message: `${items} item${items === 1 ? " was" : "s were"} handed over to you from ${leaverName}.`,
                }))
            }
        }

        return {
            summary: {
                ...summary,
                openTickets: transferee ? moved.tickets : summary.openTickets,
                openTasks: transferee ? moved.tasks : summary.openTasks,
                taskChecklistItems: moved.taskChecklistItems,
                ticketChecklistItems: moved.ticketChecklistItems,
            },
            transferredTo: transferee?.id ?? null,
        }
    },
}
