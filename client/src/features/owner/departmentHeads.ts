import { NO_DEPARTMENT_ROW_ID, type ExplorerRow } from '../../api/scores';
import type { AssignableUser } from '../../api/users';

const HEAD_ROLES = new Set<AssignableUser['role']>(['MANAGER', 'SENIOR']);
const ROLE_WORD: Partial<Record<AssignableUser['role'], string>> = { MANAGER: 'Manager', SENIOR: 'Senior' };
export const HEAD_LIST_SIZE = 3;

export interface HeadRow {
  key: string;
  name: string;
  role: string;
  departmentId: string;
  departmentName: string;
  score: number;
  due: number;
}

export const headRowsFor = (departments: readonly ExplorerRow[], people: readonly AssignableUser[]) => {
  const scored = new Map(
    departments
      .filter((d) => d.id !== NO_DEPARTMENT_ROW_ID && d.totalDue > 0 && d.overall !== null)
      .map((d) => [d.id, d]),
  );
  const heads = people.filter((p) => HEAD_ROLES.has(p.role) && !!p.departmentId);
  const rows: HeadRow[] = [];
  let unscored = 0;
  for (const p of heads) {
    const dept = p.departmentId ? scored.get(p.departmentId) : undefined;
    if (!dept || dept.overall === null) {
      unscored += 1;
      continue;
    }
    rows.push({
      key: `${p.id}:${dept.id}`,
      name: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email,
      role: ROLE_WORD[p.role] ?? '',
      departmentId: dept.id,
      departmentName: dept.name,
      score: dept.overall,
      due: dept.totalDue,
    });
  }
  rows.sort((a, b) => b.score - a.score || b.due - a.due || a.name.localeCompare(b.name));
  return { rows, unscored, anyHeads: heads.length > 0 };
};

export const splitBestLowest = <T>(rows: readonly T[]): { best: T[]; lowest: T[] } => {
  if (rows.length <= HEAD_LIST_SIZE) return { best: [...rows], lowest: [] };
  const lowCount = Math.min(HEAD_LIST_SIZE, Math.floor(rows.length / 2));
  const bestCount = Math.min(HEAD_LIST_SIZE, rows.length - lowCount);
  return { best: rows.slice(0, bestCount), lowest: rows.slice(rows.length - lowCount).reverse() };
};
