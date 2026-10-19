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
  startDate: z.string().optional().or(z.literal('')),
  tagIds: z.array(z.string()).max(12).optional(),
});

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
      { message: 'Pick a due time that is still ahead', path: ['dueDate'] },
    )
    .refine(
      (data) => data.assignmentMode !== 'MANUAL' || !data.startDate || !data.dueDate
        || new Date(data.startDate.includes('T') ? data.startDate : `${data.startDate}T00:00`).getTime() <= new Date(`${data.dueDate}T${data.dueTime || '23:59'}`).getTime(),
      { message: 'The start has to be before the due time', path: ['startDate'] },
    );

export type TicketFields = z.infer<typeof baseTicketSchema>;
