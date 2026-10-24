import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { taskService } from "../tasks/task.service.js"
import { ticketService } from "../tickets/ticket.service.js"
import { todoService } from "../todos/todo.service.js"
import { checklistInstanceService } from "../checklistInstances/checklistInstance.service.js"
import type { DashboardSummariesQuery } from "./dashboard.validation.js"
import { isAdminOrPc } from "../../utils/roles.js"

export const dashboardService = {
    async summaries(user: AccessTokenPayload, { scope, today, readyFrom }: DashboardSummariesQuery) {
        const isOrgWide = isAdminOrPc(user.role)
        const mineChecklist = { userId: user.sub, hideEnded: !isOrgWide, includeDeleted: false }
        const [tasksKpi, ticketsKpi, tasksMine, ticketsMine, todos, checklist, checklistToday, checklistReady] = await Promise.all([
            taskService.summary(user, scope),
            ticketService.summary(user, scope),
            scope === "mine" ? null : taskService.summary(user, "mine"),
            scope === "mine" ? null : ticketService.summary(user, "mine"),
            todoService.summary(user.sub),
            checklistInstanceService.summary({ ...mineChecklist }),
            checklistInstanceService.summary({ ...mineChecklist, from: today, to: today }),
            checklistInstanceService.summary({ ...mineChecklist, verificationStatus: "NOT_SUBMITTED", from: readyFrom, to: today }),
        ])
        return {
            tasksKpi, ticketsKpi,
            tasksMine: tasksMine ?? tasksKpi,
            ticketsMine: ticketsMine ?? ticketsKpi,
            todos, checklist, checklistToday, checklistReady,
        }
    },
}
