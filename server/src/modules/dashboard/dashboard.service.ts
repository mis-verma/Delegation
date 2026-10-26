import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { taskService } from "../tasks/task.service.js"
import { ticketService } from "../tickets/ticket.service.js"
import { todoService } from "../todos/todo.service.js"
import { checklistInstanceService } from "../checklistInstances/checklistInstance.service.js"
import type { DashboardSummariesQuery } from "./dashboard.validation.js"

export const dashboardService = {
    async summaries(user: AccessTokenPayload, { scope, today }: DashboardSummariesQuery) {
        const [tasksKpi, ticketsKpi, todos, checklistToday] = await Promise.all([
            taskService.summary(user, scope),
            ticketService.summary(user, scope),
            todoService.summary(user.sub),
            checklistInstanceService.summary({ userId: user.sub, hideEnded: true, includeDeleted: false, from: today, to: today }),
        ])
        return { tasksKpi, ticketsKpi, todos, checklistToday }
    },
}
