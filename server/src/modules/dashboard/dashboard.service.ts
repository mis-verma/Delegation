import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { taskService } from "../tasks/task.service.js"
import { ticketService } from "../tickets/ticket.service.js"
import { todoService } from "../todos/todo.service.js"
import { checklistInstanceService } from "../checklistInstances/checklistInstance.service.js"
import type { DashboardSummariesQuery } from "./dashboard.validation.js"
import { isAdminOrPc } from "../../utils/roles.js"

const isDepartmentHead = (role: string) => role === "MANAGER" || role === "SENIOR"

export const dashboardService = {
    async summaries(user: AccessTokenPayload, { scope, today }: DashboardSummariesQuery) {
        const teamView = scope === "visible"
        const orgChecklistPromise = teamView && isAdminOrPc(user.role)
            ? checklistInstanceService.summary({ hideEnded: true, includeDeleted: false, from: today, to: today }).catch((err: unknown) => {
                console.error("Dashboard summary (organisation checklists) failed:", err)
                return undefined
            })
            : Promise.resolve(undefined)
        const scopeChecklistPromise = !teamView
            ? Promise.resolve(undefined)
            : isAdminOrPc(user.role)
            ? orgChecklistPromise
            : isDepartmentHead(user.role) && user.departmentId
                ? checklistInstanceService.summary({ departmentId: user.departmentId, hideEnded: true, includeDeleted: false, from: today, to: today }).catch((err: unknown) => {
                    console.error("Dashboard summary (department checklists) failed:", err)
                    return undefined
                })
                : Promise.resolve(undefined)
        const results = await Promise.allSettled([
            taskService.summary(user, scope),
            ticketService.summary(user, scope),
            todoService.summary(user.sub),
            checklistInstanceService.summary({ userId: user.sub, hideEnded: true, includeDeleted: false, from: today, to: today }),
        ])
        const orgChecklistToday = await orgChecklistPromise
        const scopeChecklistToday = await scopeChecklistPromise
        const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
        if (failed.length === results.length) throw failed[0]!.reason
        const names = ["tasks", "tickets", "to-dos", "checklists"]
        results.forEach((result, index) => {
            if (result.status === "rejected") console.error(`Dashboard summary (${names[index]}) failed:`, result.reason)
        })
        const [tasksKpi, ticketsKpi, todos, checklistToday] = results.map((result) => (result.status === "fulfilled" ? result.value : undefined)) as [
            Awaited<ReturnType<typeof taskService.summary>> | undefined,
            Awaited<ReturnType<typeof ticketService.summary>> | undefined,
            Awaited<ReturnType<typeof todoService.summary>> | undefined,
            Awaited<ReturnType<typeof checklistInstanceService.summary>> | undefined,
        ]
        return { tasksKpi, ticketsKpi, todos, checklistToday, orgChecklistToday, scopeChecklistToday }
    },
}
