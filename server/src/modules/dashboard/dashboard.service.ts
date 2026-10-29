import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { taskService } from "../tasks/task.service.js"
import { ticketService } from "../tickets/ticket.service.js"
import { todoService } from "../todos/todo.service.js"
import { checklistInstanceService } from "../checklistInstances/checklistInstance.service.js"
import type { DashboardSummariesQuery } from "./dashboard.validation.js"

export const dashboardService = {
    async summaries(user: AccessTokenPayload, { scope, today }: DashboardSummariesQuery) {
        const results = await Promise.allSettled([
            taskService.summary(user, scope),
            ticketService.summary(user, scope),
            todoService.summary(user.sub),
            checklistInstanceService.summary({ userId: user.sub, hideEnded: true, includeDeleted: false, from: today, to: today }),
        ])
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
        return { tasksKpi, ticketsKpi, todos, checklistToday }
    },
}
