import { z } from 'zod';

export const ticketSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  assignmentMode: z.enum(['AUTO', 'MANUAL']),
  categoryId: z.string().optional().or(z.literal('')),
  departmentId: z.string().optional().or(z.literal('')),
  assigneeId: z.string().optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
  dueTime: z.string().optional().or(z.literal('')),
  tagIds: z.array(z.string()).max(12).optional(),
}).refine(
  (data) => data.assignmentMode !== 'MANUAL' || (!!data.dueDate && !!data.dueTime),
  { message: 'Pick a due date and time', path: ['dueDate'] },
).refine(
  (data) => {
    if (data.assignmentMode !== 'MANUAL' || !data.dueDate || !data.dueTime) return true;
    return new Date(`${data.dueDate}T${data.dueTime}`).getTime() > Date.now();
  },
  { message: 'Due date/time must be in the future', path: ['dueTime'] },
);

export type TicketFields = z.infer<typeof ticketSchema>;
