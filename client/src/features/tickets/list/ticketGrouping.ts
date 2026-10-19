import type { Ticket } from '../../../api/ticket';

export const groupByDepartment = (tickets: Ticket[], departmentNames: Map<string, string>) => {
  const groups = new Map<string, { departmentId: string | null; departmentName: string; tickets: Ticket[] }>();

  for (const ticket of tickets) {
    const key = ticket.departmentId ?? '__none__';
    if (!groups.has(key)) {
      groups.set(key, {
        departmentId: ticket.departmentId,
        departmentName: ticket.departmentId ? (departmentNames.get(ticket.departmentId) ?? 'Unknown Department') : 'General / Unassigned',
        tickets: [],
      });
    }
    groups.get(key)!.tickets.push(ticket);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.departmentId === null) return 1;
    if (b.departmentId === null) return -1;
    return a.departmentName.localeCompare(b.departmentName);
  });
};

export const groupByAssignee = (tickets: Ticket[]) => {
  const groups = new Map<string, { assigneeId: string | null; assigneeName: string; tickets: Ticket[] }>();

  for (const ticket of tickets) {
    const key = ticket.assigneeId ?? '__unassigned__';

    if (!groups.has(key)) {
      groups.set(key, {
        assigneeId: ticket.assigneeId,
        assigneeName: ticket.assignee ? ticket.assignee.firstName : "Unassigned",
        tickets: [],
      })
    }
    groups.get(key)!.tickets.push(ticket)
  }

  return [...groups.values()].sort((a, b) => {
    if (a.assigneeId === null) return 1;
    if (b.assigneeId === null) return -1;
    return a.assigneeName.localeCompare(b.assigneeName);
  })
}

export const groupChecklistStats = (tickets: Ticket[]) => {
  let total = 0;
  let done = 0;
  for (const t of tickets) {
    for (const cl of t.checklists ?? []) {
      total += (cl.items ?? []).length;
      done += (cl.items ?? []).filter(i => i.isDone).length;
    }
  }

  return { total, done };
}
