import type { AdminUser } from '../../../api/admin';
import { MONTH_LABELS } from '../../dashboard/dashboardDisplay';

export const fullName = (u: Pick<AdminUser, 'firstName' | 'lastName'>) => `${u.firstName} ${u.lastName ?? ''}`.trim();

const formatShortDate = (iso: string) => {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
};

export const deactivatedLabel = (u: Pick<AdminUser, 'deactivatedAt'>) =>
  u.deactivatedAt ? `Deactivated ${formatShortDate(u.deactivatedAt)}` : 'Deactivated';

export const peopleCount = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
