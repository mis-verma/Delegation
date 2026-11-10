
import type { Ticket } from '../../../api/ticket';

export interface TicketFilters {
  status:       Ticket['status'] | 'all';
  priority:     Ticket['priority'][];
  departmentId: string;
  categoryId:   string;
  subcategoryId: string;
  assigneeIds:  string[];
  raisedByIds:  string[];
  labelIds:     string[];
}
