import { AppliedFilters, type AppliedFilter } from '../../components';
import { STATUS_CONFIG, PRIORITY_CONFIG } from './ticketDisplay';
import type { useTicketOrganizer } from './useTicketOrganizer';
import type { Ticket } from '../../api/ticket';

interface TicketActiveTagsProps {
  organizer: ReturnType<typeof useTicketOrganizer>;
  allTickets: Ticket[];
  departmentNames: Map<string, string>;
  personNames: Map<string, string>;
  labelNames: Map<string, string>;
  categoryNames: Map<string, string>;
  subcategoryNames: Map<string, string>;
}

const listLabel = (prefix: string, ids: string[], names: Map<string, string>, fallback: string) => {
  const first = names.get(ids[0]) ?? fallback;
  return ids.length === 1 ? `${prefix}: ${first}` : `${prefix}: ${first} +${ids.length - 1}`;
};

export const TicketActiveTags = ({ organizer, allTickets, departmentNames, personNames, labelNames, categoryNames, subcategoryNames }: TicketActiveTagsProps) => {
  const { filters, search } = organizer;
  const patch = (next: Partial<typeof filters>) => {
    organizer.setFilters((prev) => ({ ...prev, ...next }));
    organizer.setPage(1);
  };
  const clearPersonLink = () =>
    organizer.setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('assigneeIds'); return p; });

  const items: AppliedFilter[] = [];
  if (organizer.assigneeIdFilter) {
    items.push({ key: 'person-link', label: `Tickets for ${allTickets[0]?.assignee?.firstName ?? 'this person'}`, onRemove: clearPersonLink });
  }
  if (search.trim()) {
    items.push({ key: 'search', label: `Search: ${search.trim()}`, onRemove: () => { organizer.setSearch(''); organizer.setPage(1); } });
  }
  if (filters.status !== 'all') {
    items.push({ key: 'status', label: STATUS_CONFIG[filters.status].label, onRemove: () => patch({ status: 'all' }) });
  }
  if (filters.priority.length > 0) {
    items.push({
      key: 'priority',
      label: filters.priority.map((p) => PRIORITY_CONFIG[p].label).join(', '),
      onRemove: () => patch({ priority: [] }),
    });
  }
  if (filters.departmentId) {
    items.push({ key: 'department', label: departmentNames.get(filters.departmentId) ?? 'Department', onRemove: () => patch({ departmentId: '' }) });
  }
  if (filters.categoryId) {
    items.push({ key: 'category', label: categoryNames.get(filters.categoryId) ?? 'Category', onRemove: () => patch({ categoryId: '', subcategoryId: '' }) });
  }
  if (filters.categoryId && filters.subcategoryId) {
    items.push({ key: 'subcategory', label: subcategoryNames.get(filters.subcategoryId) ?? 'Subcategory', onRemove: () => patch({ subcategoryId: '' }) });
  }
  if (filters.assigneeIds.length > 0) {
    items.push({ key: 'assignees', label: listLabel('Assigned to', filters.assigneeIds, personNames, 'Person'), onRemove: () => patch({ assigneeIds: [] }) });
  }
  if (filters.raisedByIds.length > 0) {
    items.push({ key: 'raisedBy', label: listLabel('Sent by', filters.raisedByIds, personNames, 'Person'), onRemove: () => patch({ raisedByIds: [] }) });
  }
  if (filters.labelIds.length > 0) {
    items.push({ key: 'labels', label: listLabel('Label', filters.labelIds, labelNames, 'Label'), onRemove: () => patch({ labelIds: [] }) });
  }

  const clearAll = () => {
    organizer.setSearch('');
    organizer.setFilters((prev) => ({ ...prev, status: 'all', priority: [], departmentId: '', categoryId: '', subcategoryId: '', assigneeIds: [], raisedByIds: [], labelIds: [] }));
    organizer.setPage(1);
    if (organizer.assigneeIdFilter) clearPersonLink();
  };

  return <AppliedFilters items={items} onClearAll={clearAll} />;
};
