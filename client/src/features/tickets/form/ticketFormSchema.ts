import { z } from 'zod';

const baseTicketSchema = z.object({
  title: z.string().trim().min(5, 'Add a short title (at least 5 characters)'),
  description: z.string().trim().min(10, 'Say a bit more about it (at least 10 characters)'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  assignmentMode: z.enum(['AUTO', 'MANUAL']),
  categoryId: z.string().optional().or(z.literal('')),
  departmentId: z.string().optional().or(z.literal('')),
  assigneeId: z.string().optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
  dueTime: z.string().optional().or(z.literal('')),
  // First day of a start-to-due range (YYYY-MM-DD). Optional: a single due date works as before.
  startDate: z.string().optional().or(z.literal('')),
  tagIds: z.array(z.string()).max(12).optional(),
});

/**
 * Every part of "where it goes" is required, so no ticket is created half-routed:
 *  - By category (AUTO): a category, which brings its own department, person and due time.
 *  - To a person (MANUAL): a department, then (unless this user only sends to a department) the
 *    person, plus a due date and time. Choosing a category here fills department and person in.
 * `requirePerson` is false for front-line staff, who send to a department or a category and don't
 * pick a named person.
 */
export const buildTicketSchema = ({ requirePerson }: { requirePerson: boolean }) =>
  baseTicketSchema
    .refine(
      (data) => data.assignmentMode !== 'AUTO' || !!data.categoryId,
      { message: 'Choose a category', path: ['categoryId'] },
    )
    .refine(
      (data) => data.assignmentMode !== 'MANUAL' || !!data.categoryId || !!data.departmentId,
      { message: 'Choose a department', path: ['departmentId'] },
    )
    .refine(
      (data) => !requirePerson || data.assignmentMode !== 'MANUAL' || !!data.categoryId || !!data.assigneeId,
      { message: 'Pick who should handle it', path: ['assigneeId'] },
    )
    .refine(
      (data) => data.assignmentMode !== 'MANUAL' || (!!data.dueDate && !!data.dueTime),
      { message: 'Pick a due date and time', path: ['dueDate'] },
    )
    .refine(
      (data) => {
        if (data.assignmentMode !== 'MANUAL' || !data.dueDate || !data.dueTime) return true;
        return new Date(`${data.dueDate}T${data.dueTime}`).getTime() > Date.now();
      },
      { message: 'Due date/time must be in the future', path: ['dueTime'] },
    );

export type TicketFields = z.infer<typeof baseTicketSchema>;
